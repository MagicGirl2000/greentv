# -*- coding: utf-8 -*-
"""
server.py — 绿太阳指数 GreenIndex 服务端（1s 持续连流版）。
每个有源频道一条持久 ffmpeg 连接，每秒算一次维度；无源→演示；连不上→断连(不计指数)。
指数：全球综合 GREEN + 各洲 IDXT_* + 各国 IDXC_*，均为成员频道维度均值。
【不可交易·私下涉赌违法·虚构仅供检测·切勿当真】
"""
import os
import time
import sqlite3
import threading
import subprocess
import collections
import numpy as np
from flask import Flask, jsonify, request, send_from_directory, Response
import imageio_ffmpeg

import channels as ch_cfg
import dimension as dim
import weather as wx
import satellite as sat
import analysis as ana
import link
import datetime as _dt

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
_NOWIN = 0x08000000 if os.name == "nt" else 0   # CREATE_NO_WINDOW：不弹 ffmpeg 控制台窗口
HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="")

CHANS = ch_cfg.all_channels()
# 只跑央视(国际频道暂时停盘)：GREENTV_CN_ONLY=1(默认)。要全量设为 0。
if os.environ.get("GREENTV_CN_ONLY", "1") == "1":
    CHANS = [c for c in CHANS if c.get("country") == "中国"]
TICK_CN = float(os.environ.get("GREENTV_TICK_CN", "18"))      # 中国CCTV：每18秒采样
TICK_INTL = float(os.environ.get("GREENTV_TICK_INTL", "15"))  # 全球/国际：每15秒采样
VIDEO = os.environ.get("GREENTV_VIDEO") == "1"                # 1=视频+音频联合分析(深圳引擎)
PROXY = os.environ.get("GREENTV_PROXY", "")                   # 深圳用：国际源经【伦敦HTTP代理(英国IP)】下载，绕开对华地域限制
PROXY_TO = float(os.environ.get("GREENTV_PROXY_TO", "28"))    # 走代理时的抓取超时(跨境+代理一跳，给足时间)
VIDEO_EVERY = float(os.environ.get("GREENTV_VIDEO_EVERY", "19"))   # 每19秒抓一帧画面
SR = 11025
DB_PATH = os.path.join(os.environ.get("GREENTV_DATA", HERE), "greentv.db")

_state = {}            # id -> {dim, mode, name, tip, [count]}  合并后(对外)
_local = {}            # id -> 深圳本地直连读数
_uk = {}               # id -> 英国探针回报读数(只有数字)
_sz = {}               # id -> 深圳客户端上报的【全量真实读数】(英国聚合网页用)
_raw = {}              # id -> {"a":音频int16字节, "f":帧uint8字节, "ts"}：伦敦采的【原始样本】，供深圳拉取分析
_raw_lock = threading.Lock()
RAW_SAMPLE = os.environ.get("GREENTV_RAW_SAMPLE") == "1"   # 1=伦敦并发采原始样本(国际源)，交深圳显卡分析
_initial = {}
_lock = threading.Lock()
_started = time.time()
_last_wlog = None
UK_AGENT = os.environ.get("GREENTV_UK", "http://8.208.127.130:8781")

_db = sqlite3.connect(DB_PATH, check_same_thread=False)
_db.execute("PRAGMA journal_mode=WAL")        # 读写并发，查K线不被写入阻塞
_db.execute("PRAGMA synchronous=NORMAL")
_db.execute("CREATE TABLE IF NOT EXISTS ticks(series TEXT, ts INTEGER, val REAL)")
_db.execute("CREATE INDEX IF NOT EXISTS ix_series_ts ON ticks(series, ts)")
_db.commit()
try:
    _db.execute("ANALYZE")        # 更新查询计划统计，确保走索引
    _db.commit()
except Exception:
    pass
# 独立只读连接读K线：WAL下读不被写阻塞，查询不抢 _lock
_db_ro = sqlite3.connect(DB_PATH, check_same_thread=False)
_db_ro.execute("PRAGMA query_only=1")
_db_ro.execute("PRAGMA mmap_size=268435456")   # 256MB 内存映射，热页常驻
_db_ro.execute("PRAGMA cache_size=-65536")      # 64MB 页缓存

_series_cache = {}        # (sid,tf) -> (ts, candles)，短TTL缓存，挡住2秒轮询
_SERIES_TTL = 2.5
for (sid,) in _db.execute("SELECT DISTINCT series FROM ticks").fetchall():
    row = _db.execute("SELECT val FROM ticks WHERE series=? ORDER BY ts LIMIT 1", (sid,)).fetchone()
    if row:
        _initial[sid] = row[0]

# 分组
BY_COUNTRY, BY_CONT = {}, {}
for ch in CHANS:
    BY_COUNTRY.setdefault(ch["country"], []).append(ch["id"])
    BY_CONT.setdefault(ch["continent"], []).append(ch["id"])


def _append(sid, ts, val):
    _db.execute("INSERT INTO ticks(series, ts, val) VALUES(?,?,?)", (sid, int(ts), val))
    if sid not in _initial:
        _initial[sid] = val


# ---------------- 每频道采集线程 ----------------
def reader_demo(cid):
    while True:
        d = dim.demo_dim(cid)
        n, t = dim.advice(d)
        _local[cid] = {"dim": d, "mode": "demo", "name": n, "tip": t}
        time.sleep(3)            # 演示读取放慢，降低后台CPU(采样仍按ticker的15/18s)


def reader_live(cid, url):
    while True:
        proc = None
        try:
            proc = subprocess.Popen(
                [FFMPEG, "-loglevel", "quiet", "-rw_timeout", "8000000", "-i", url,
                 "-ar", str(SR), "-ac", "1", "-f", "f32le", "pipe:1"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=_NOWIN)
            buf = collections.deque(maxlen=SR * 2)
            last = last_frame = 0.0
            frame = None
            meta = next((c for c in CHANS if c["id"] == cid), {})
            while True:
                raw = proc.stdout.read(8192)
                if not raw:
                    break
                buf.extend(np.frombuffer(raw, dtype=np.float32))
                now = time.time()
                if VIDEO and now - last_frame >= VIDEO_EVERY:        # 每19s抓一帧画面
                    frame = dim.grab_frame(url, meta.get("ua"), meta.get("referrer"))
                    last_frame = now
                if now - last >= 1.0 and len(buf) >= SR:
                    arr = np.array(buf, dtype=np.float32)
                    r = dim.analyze_av(arr, frame) if VIDEO else dim.analyze_audio(arr)
                    if r is not None:
                        n, t = dim.advice(r[0])
                        _local[cid] = {"dim": r[0], "mode": "live", "name": n, "tip": t,
                                       "av": bool(VIDEO and frame is not None)}
                    last = now
        except Exception:
            pass
        finally:
            try:
                proc.kill()
            except Exception:
                pass
        _local[cid] = {"dim": None, "mode": "down", "name": "断连", "tip": "深圳直连不上"}
        time.sleep(30)     # 断连后 30s 重试


def _rotating_reader():
    """轮转采样器(深圳全球用)：每次并发抓 N 路(音频+可选视频)，循环遍历全部有源频道，
    避免几百上千路持久 ffmpeg 把机器压垮。GREENTV_ROTATE=1 启用。"""
    from concurrent.futures import ThreadPoolExecutor
    group = int(os.environ.get("GREENTV_GROUP", "50"))       # 每组50台并发采
    streamed = [c for c in CHANS if c.get("stream")]
    if not streamed:
        return

    def sample(ch):
        try:
            cn = ch.get("country") == "中国"
            # ① 先直连(中国源/对华可达的国际源，最快)
            x = dim.grab_audio(ch["stream"], ua=ch.get("ua"), referrer=ch.get("referrer"))
            used_px = None
            # ② 直连失败的国际源 → 改走【伦敦HTTP代理(英国IP)】，绕开对华封锁/慢路由
            if x is None and not cn and PROXY:
                x = dim.grab_audio(ch["stream"], ua=ch.get("ua"), referrer=ch.get("referrer"),
                                   to=PROXY_TO, proxy=PROXY)
                if x is not None:
                    used_px = PROXY
            frame = None
            if VIDEO and x is not None:
                frame = dim.grab_frame(ch["stream"], ch.get("ua"), ch.get("referrer"),
                                       to=(PROXY_TO if used_px else None), proxy=used_px)
            r = dim.analyze_av(x, frame) if VIDEO else dim.analyze_audio(x)
            if r is not None:
                nm, tp = dim.advice(r[0])
                _local[ch["id"]] = {"dim": r[0], "mode": "live", "name": nm, "tip": tp,
                                    "av": bool(VIDEO and frame is not None), "via": "伦敦代理" if used_px else "直连"}
            else:
                _local[ch["id"]] = {"dim": None, "mode": "down", "name": "断连", "tip": "采样无数据(直连+代理均失败)"}
        except Exception:
            _local[ch["id"]] = {"dim": None, "mode": "down", "name": "断连", "tip": "采样异常"}

    pool = ThreadPoolExecutor(max_workers=group)
    while True:
        for i in range(0, len(streamed), group):          # 分块：每组50台并发采，等本组完成再下一组
            try:
                list(pool.map(sample, streamed[i:i + group]))
            except Exception:
                time.sleep(0.3)
        time.sleep(0.5)                                    # 一轮全部采完 → sleep 500ms → 开下一轮


def uk_poller():
    """拉英国探针的维度数字（仅数字），存入 _uk，供合并时回填深圳连不上的频道。"""
    import urllib.request
    import json as _json
    while True:
        try:
            with urllib.request.urlopen(UK_AGENT + "/dims", timeout=8) as resp:
                data = _json.load(resp)
            now = int(time.time())
            for cid, d in data.get("dims", {}).items():
                _uk[cid] = {"dim": d.get("dim"), "ts": now}
        except Exception:
            pass
        time.sleep(5)


def _raw_sampler():
    """【伦敦原始采样器】并发 N 路抓【原始音频+画面】(不分析)，存入 _raw，供深圳拉取做显卡高并发分析。
    伦敦国际连通好但CPU弱→只采不算；深圳GPU强但被墙→拉原始来算。仅采国际源(中国源由本机READ_CN直读)。"""
    from concurrent.futures import ThreadPoolExecutor
    group = int(os.environ.get("GREENTV_GROUP", "50"))
    streamed = [c for c in CHANS if c.get("stream") and c.get("country") != "中国"]
    if not streamed:
        return

    def grab(ch):
        try:
            x = dim.grab_audio(ch["stream"], ua=ch.get("ua"), referrer=ch.get("referrer"))
            # 仅当音频拉到了，才抓画面(死源不浪费第二次长超时)
            fr = dim.grab_frame(ch["stream"], ua=ch.get("ua"), referrer=ch.get("referrer")) if (VIDEO and x is not None) else None
            ab = (np.clip(x, -1.0, 1.0) * 32767).astype(np.int16).tobytes() if x is not None else b""
            fb = fr.astype(np.uint8).tobytes() if fr is not None else b""
            if ab or fb:
                with _raw_lock:
                    _raw[ch["id"]] = {"a": ab, "f": fb, "ts": time.time()}
        except Exception:
            pass

    i = 0
    while True:
        batch = streamed[i:i + group]
        if batch:
            try:
                with ThreadPoolExecutor(max_workers=group) as ex:
                    list(ex.map(grab, batch))
            except Exception:
                pass
        i += group
        if i >= len(streamed):
            i = 0
        time.sleep(0.5)


def _merge():
    """合并 深圳上报(全量真实) + 本地直连 + 英国探针 → _state。
       优先级：深圳上报真实 > 本地live直连 > 英国探针(国际) > 深圳上报断连 > 本地演示/断连。"""
    now = time.time()
    for ch in CHANS:
        cid = ch["id"]
        sz = _sz.get(cid)
        uk = _uk.get(cid)
        lo = _local.get(cid)
        sz_fresh = sz and sz.get("ts", 0) > now - 60          # 60s 内的深圳上报才算数
        if sz_fresh and sz.get("dim") is not None and sz.get("mode") != "down":
            _state[cid] = {"dim": sz["dim"], "mode": sz.get("mode", "live"), "src": "sz",
                           "name": sz.get("name"), "tip": sz.get("tip")}
        elif lo and lo.get("mode") == "live" and lo.get("dim") is not None:
            _state[cid] = lo                                   # 本地真实直连
        elif uk and uk.get("dim") is not None:
            n, t = dim.advice(uk["dim"])
            _state[cid] = {"dim": uk["dim"], "mode": "live", "src": "uk", "name": n, "tip": t}
        elif sz_fresh and sz.get("mode") == "down":
            _state[cid] = {"dim": None, "mode": "down", "src": "sz",
                           "name": sz.get("name"), "tip": sz.get("tip")}
        elif lo and lo.get("dim") is not None:
            _state[cid] = lo                                   # 本地演示
        elif lo:
            _state[cid] = lo
        else:
            _state[cid] = {"dim": None, "mode": "down", "name": "断连", "tip": "无数据"}


def _valid(cid):
    st = _state.get(cid)
    if st and st.get("dim") is not None and st.get("mode") != "down":
        return st["dim"]
    return None


def _mean(ids):
    vs = [_valid(i) for i in ids]
    vs = [v for v in vs if v is not None]
    return (round(sum(vs) / len(vs), 2), len(vs)) if vs else (None, 0)


def _is_cn(ch):
    return ch.get("country") == "中国"


def _set_index(sid, ts, ids):
    ci, cc = _mean(ids)
    if ci is not None:
        _append(sid, ts, ci)
        n, t = dim.advice(ci)
        _state[sid] = {"dim": ci, "mode": "index", "name": n, "tip": t, "count": cc}


def _write_group(ts, cn):
    """cn=True：中国CCTV频道 + 中国国家指数(18s)；
       cn=False：国际频道 + 各洲/各国(除中国) + GREEN全球指数(15s) + 天气/卫星。"""
    global _last_wlog
    with _lock:
        for ch in CHANS:
            if _is_cn(ch) == cn:
                v = _valid(ch["id"])
                if v is not None:
                    _append(ch["id"], ts, v)
        if cn:
            _set_index("IDXC_中国", ts, BY_COUNTRY.get("中国", []))
        else:
            gi, gc = _mean([c["id"] for c in CHANS])     # 全球综合(含中国最新值)
            if gi is not None:
                _append("GREEN", ts, gi)
                n, t = dim.advice(gi)
                _state["GREEN"] = {"dim": gi, "mode": "index", "name": n, "tip": t, "count": gc}
                today = _dt.date.today().isoformat()
                if _last_wlog != today:
                    _last_wlog = today
                    try:
                        wx.log_daily(gi)
                    except Exception:
                        pass
                try:
                    sat.tick(gi)
                except Exception:
                    pass
            for cty, ids in BY_COUNTRY.items():
                if cty != "中国":
                    _set_index("IDXC_" + cty, ts, ids)
            for con, ids in BY_CONT.items():
                _set_index("IDXT_" + con, ts, ids)
        _db.commit()


def ticker():
    last_cn = last_intl = 0.0
    while True:
        now = time.time()
        _merge()                              # 每秒合并深圳直连 + 英国回报
        if now - last_intl >= TICK_INTL:      # 全球/国际：15s
            _write_group(now, cn=False); last_intl = now
        if now - last_cn >= TICK_CN:          # 中国CCTV：18s
            _write_group(now, cn=True); last_cn = now
        time.sleep(2)            # 合并节流到2s，降低后台CPU、让Flask更快响应


def _candles(sid, tf, limit=600):
    cutoff = int(time.time()) - limit * tf - tf
    # 只读连接 + 限制最多取最近 N 行(够拼 limit 根蜡烛)，避免大序列全扫/冷盘慢读
    maxrows = min(6000, limit * max(2, tf // 8) + 200)
    arr = _db_ro.execute(
        "SELECT ts, val FROM ticks INDEXED BY ix_series_ts "
        "WHERE series=? AND ts>=? ORDER BY ts DESC LIMIT ?",
        (sid, cutoff, maxrows)).fetchall()
    arr.reverse()
    if not arr:
        return []
    buckets, order = {}, []
    for tsv, val in arr:
        b = (tsv // tf) * tf
        if b not in buckets:
            buckets[b] = [val, val, val, val]; order.append(b)
        else:
            k = buckets[b]; k[1] = max(k[1], val); k[2] = min(k[2], val); k[3] = val
    order = order[-limit:]
    return [{"t": b, "o": buckets[b][0], "h": buckets[b][1],
             "l": buckets[b][2], "c": buckets[b][3]} for b in order]


def _idx_entry(sid, name):
    st = _state.get(sid, {})
    return {"id": sid, "name": name, "dim": st.get("dim"),
            "count": st.get("count"), "initial": _initial.get(sid),
            "name_realm": st.get("name"), "tip": st.get("tip")}


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/channels")
def api_channels():
    chans = []
    for ch in CHANS:
        st = _state.get(ch["id"], {})
        chans.append({"id": ch["id"], "name": ch["name"], "country": ch["country"],
                      "continent": ch["continent"], "dim": st.get("dim"),
                      "mode": st.get("mode"), "name_realm": st.get("name"),
                      "tip": st.get("tip"), "initial": _initial.get(ch["id"])})
    # 断连沉底：live/demo 在前，down/未知在后
    rank = {"live": 0, "demo": 1, None: 2, "down": 3}
    chans.sort(key=lambda c: (rank.get(c["mode"], 2), c["continent"], c["country"]))
    continents = [_idx_entry("IDXT_" + con, con + " 指数") for con in BY_CONT]
    countries = [_idx_entry("IDXC_" + cty, cty + " 指数") for cty in BY_COUNTRY]
    return jsonify({
        "green": _idx_entry("GREEN", "绿太阳综合指数（全球）"),
        "continents": continents,
        "countries": countries,
        "channels": chans,
        "total": len(CHANS),
        "uptime": int(time.time() - _started),
    })


@app.route("/sz_ingest", methods=["POST"])
def sz_ingest():
    """接收深圳客户端推送的【全量真实频道数据】(加密)，存入 _sz，英国聚合网页据此展示。"""
    try:
        obj = link.unseal(request.get_data(as_text=True))
    except link.InvalidToken:
        return ("key mismatch", 400)
    except Exception as e:
        return ("bad payload: %s" % e, 400)
    now = int(time.time())
    n = 0
    for c in obj.get("channels", []):
        cid = c.get("id")
        if not cid:
            continue
        _sz[cid] = {"dim": c.get("dim"), "mode": c.get("mode") or "live",
                    "name": c.get("name_realm") or c.get("name"), "tip": c.get("tip"),
                    "ts": now}
        n += 1
    return jsonify({"ok": True, "received": n, "ts": now})


@app.route("/raw_pull")
def raw_pull():
    """深圳拉取伦敦【原始样本】做分析：返回 ts>after 的一批(音频int16+帧uint8，base64)。
    深圳用返回的 max_ts 作为下次 after，实现增量持续拉取。"""
    import base64
    after = float(request.args.get("after", "0") or 0)
    limit = int(request.args.get("limit", "80") or 80)
    with _raw_lock:
        items = [(cid, r) for cid, r in _raw.items() if r["ts"] > after]
    items.sort(key=lambda kv: kv[1]["ts"])
    items = items[:limit]
    out, maxts = [], after
    for cid, r in items:
        out.append({"id": cid, "ts": r["ts"],
                    "a": base64.b64encode(r["a"]).decode() if r["a"] else "",
                    "f": base64.b64encode(r["f"]).decode() if r["f"] else ""})
        if r["ts"] > maxts:
            maxts = r["ts"]
    return jsonify({"items": out, "max_ts": maxts, "sr": SR, "pending": len(_raw)})


@app.route("/raw_stats")
def raw_stats():
    now = time.time()
    with _raw_lock:
        fresh = sum(1 for r in _raw.values() if r["ts"] > now - 120)
        total = len(_raw)
    return jsonify({"raw_total": total, "raw_fresh_120s": fresh, "sampling": RAW_SAMPLE})


@app.route("/api/weather")
def api_weather():
    gi = _state.get("GREEN", {}).get("dim")
    return jsonify(wx.snapshot(gi))


@app.route("/api/satellite")
def api_satellite():
    gi = _state.get("GREEN", {}).get("dim")
    return jsonify(sat.snapshot(gi))


@app.route("/api/analysis")
def api_analysis():
    return jsonify(ana.snapshot())


@app.route("/api/analysis_prov")
def api_analysis_prov():
    return jsonify(ana.snapshot_prov())


_CH_BY_ID = {c["id"]: c for c in CHANS}


@app.route("/watch")
def watch():
    """按需视频点播：把某频道源流用 ffmpeg 重封装成 http-flv 边转边发给浏览器(flv.js播放)。
    点哪个才开一路，不点不耗带宽。支持 iptv-org 流的 user_agent/referrer。"""
    cid = request.args.get("ch", "")
    ch = _CH_BY_ID.get(cid)
    if not ch or not ch.get("stream"):
        return ("该频道无可点播源", 404)
    url = ch["stream"]
    args = [FFMPEG, "-loglevel", "quiet", "-fflags", "nobuffer"]
    if ch.get("referrer"):
        args += ["-headers", "Referer: %s\r\n" % ch["referrer"]]
    if ch.get("ua"):
        args += ["-user_agent", ch["ua"]]
    args += ["-i", url, "-c", "copy", "-f", "flv", "-"]
    try:
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                creationflags=_NOWIN)
    except Exception as e:
        return ("转码启动失败: %s" % e, 500)

    def gen():
        try:
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        except (GeneratorExit, Exception):
            pass
        finally:
            try:
                proc.kill()
            except Exception:
                pass
    return Response(gen(), mimetype="video/x-flv",
                    headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"})


@app.route("/sz_status")
def sz_status():
    """诊断：英国收到的深圳上报状态(是否在推、CCTV是否有数据)。"""
    now = int(time.time())
    cctv = [{"id": k, "dim": v.get("dim"), "mode": v.get("mode"), "age_s": now - v.get("ts", now)}
            for k, v in _sz.items() if str(k).startswith("CCTV")]
    cctv.sort(key=lambda x: x["id"])
    return jsonify({
        "已收到上报的频道数": len(_sz),
        "其中有维度的": sum(1 for v in _sz.values() if v.get("dim") is not None),
        "60秒内新鲜的": sum(1 for v in _sz.values() if now - v.get("ts", now) < 60),
        "CCTV明细": cctv,
    })


@app.route("/api/series")
def api_series():
    sid = request.args.get("id", "GREEN")
    tf = int(request.args.get("tf", "1"))
    now = time.time()
    key = (sid, tf)
    c = _series_cache.get(key)
    if c and now - c[0] < _SERIES_TTL:
        candles = c[1]
    else:
        candles = _candles(sid, tf)
        _series_cache[key] = (now, candles)
    return jsonify({"id": sid, "tf": tf, "initial": _initial.get(sid), "candles": candles})


def _start_readers():
    demo_only = os.environ.get("GREENTV_DEMO_ONLY") == "1"   # 1=不开ffmpeg
    no_demo = os.environ.get("GREENTV_NO_DEMO") == "1"        # 1=不造演示数据，无源即断连
    read_cn = os.environ.get("GREENTV_READ_CN") == "1"        # 1=本机直读中国频道(全球可达，英国也能读)
    rotate = os.environ.get("GREENTV_ROTATE") == "1"          # 1=轮转采样(深圳全球，几百路也扛得住)
    if rotate:
        threading.Thread(target=_rotating_reader, daemon=True).start()   # 全部有源频道轮转采
        # 无源频道仍可演示(除非 no_demo)
        if not no_demo:
            for ch in CHANS:
                if not ch.get("stream"):
                    threading.Thread(target=reader_demo, args=(ch["id"],), daemon=True).start()
    else:
        for ch in CHANS:
            cn = ch.get("country") == "中国"
            if ch.get("stream") and (not demo_only or (read_cn and cn)):
                threading.Thread(target=reader_live, args=(ch["id"], ch["stream"]), daemon=True).start()
            elif not no_demo:
                threading.Thread(target=reader_demo, args=(ch["id"],), daemon=True).start()
            # no_demo 且无直连源 → 不启动任何读取，靠 深圳上报/英国探针，否则断连
            time.sleep(0.02)
    if os.environ.get("GREENTV_PROXY_SERVE") == "1":
        try:
            import london_proxy
            london_proxy.start()                                     # 伦敦HTTP代理：深圳国际源经此(英国IP)下载
        except Exception as e:
            print("london_proxy 启动失败:", e)
    if os.environ.get("GREENTV_HTTPS") == "1":                       # 同站 HTTPS(默认8443)，证书 cert.pem/key.pem
        _cdir = os.environ.get("GREENTV_DATA", HERE)                  # 优先 数据目录(可替换为正式证书)，否则 HERE
        cpath = os.path.join(_cdir, "cert.pem"); kpath = os.path.join(_cdir, "key.pem")
        if not (os.path.exists(cpath) and os.path.exists(kpath)):
            cpath = os.path.join(HERE, "cert.pem"); kpath = os.path.join(HERE, "key.pem")
        if os.path.exists(cpath) and os.path.exists(kpath):
            hport = int(os.environ.get("GREENTV_HTTPS_PORT", "8443"))
            def _serve_https():
                try:
                    app.run(host="0.0.0.0", port=hport, threaded=True, use_reloader=False,
                            ssl_context=(cpath, kpath))
                except Exception as e:
                    print("HTTPS 启动失败:", e)
            threading.Thread(target=_serve_https, daemon=True).start()
    if RAW_SAMPLE:
        threading.Thread(target=_raw_sampler, daemon=True).start()   # (备用)伦敦并发采原始样本
    threading.Thread(target=uk_poller, daemon=True).start()   # 拉英国探针
    wx.start()                                                # 启动天气预报刷新
    sat.start()                                               # 启动卫星云图
    ana.start()                                               # 启动各国(地区)指数×卫星×天气比对
    threading.Thread(target=lambda: wx.mine_history(7), daemon=True).start()   # 挖掘过去一周实际降水
    threading.Thread(target=ticker, daemon=True).start()
    threading.Thread(target=_warmup, daemon=True).start()                      # 预热常用序列的索引页


def _warmup():
    time.sleep(10)
    sids = ["GREEN"] + ["IDXT_" + c for c in BY_CONT] + ["IDXC_" + c for c in BY_COUNTRY]
    for sid in sids:
        for tf in (30, 60, 300, 900, 3600):
            try:
                _candles(sid, tf)
            except Exception:
                pass
        time.sleep(0.05)


if __name__ == "__main__":
    threading.Thread(target=_start_readers, daemon=True).start()
    app.run(host="0.0.0.0", port=8780, threaded=True)
