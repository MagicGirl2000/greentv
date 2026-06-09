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
from flask import Flask, jsonify, request, send_from_directory
import imageio_ffmpeg

import channels as ch_cfg
import dimension as dim

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="")

CHANS = ch_cfg.all_channels()
TICK = 1.0
SR = 11025
DB_PATH = os.path.join(HERE, "greentv.db")

_state = {}            # id -> {dim, mode, name, tip, [count]}  合并后(对外)
_local = {}            # id -> 深圳本地直连读数
_uk = {}               # id -> 英国探针回报读数(只有数字)
_initial = {}
_lock = threading.Lock()
_started = time.time()
UK_AGENT = os.environ.get("GREENTV_UK", "http://8.208.127.130:8781")

_db = sqlite3.connect(DB_PATH, check_same_thread=False)
_db.execute("CREATE TABLE IF NOT EXISTS ticks(series TEXT, ts INTEGER, val REAL)")
_db.execute("CREATE INDEX IF NOT EXISTS ix_series_ts ON ticks(series, ts)")
_db.commit()
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
        time.sleep(1)


def reader_live(cid, url):
    while True:
        proc = None
        try:
            proc = subprocess.Popen(
                [FFMPEG, "-loglevel", "quiet", "-rw_timeout", "8000000", "-i", url,
                 "-ar", str(SR), "-ac", "1", "-f", "f32le", "pipe:1"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            buf = collections.deque(maxlen=SR * 2)
            last = 0.0
            while True:
                raw = proc.stdout.read(8192)
                if not raw:
                    break
                buf.extend(np.frombuffer(raw, dtype=np.float32))
                now = time.time()
                if now - last >= 1.0 and len(buf) >= SR:
                    r = dim.analyze_audio(np.array(buf, dtype=np.float32))
                    if r is not None:
                        n, t = dim.advice(r[0])
                        _local[cid] = {"dim": r[0], "mode": "live", "name": n, "tip": t}
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


def _merge():
    """合并深圳直连 + 英国回报 → _state。深圳直连优先，连不上的用英国数字。"""
    for ch in CHANS:
        cid = ch["id"]
        lo = _local.get(cid)
        uk = _uk.get(cid)
        if lo and lo.get("dim") is not None and lo.get("mode") != "down":
            _state[cid] = lo                                   # 深圳直连
        elif uk and uk.get("dim") is not None:
            n, t = dim.advice(uk["dim"])
            _state[cid] = {"dim": uk["dim"], "mode": "live", "src": "uk", "name": n, "tip": t}
        elif lo:
            _state[cid] = lo                                   # 深圳的 down 状态
        else:
            _state[cid] = {"dim": None, "mode": None, "name": None, "tip": None}


def _valid(cid):
    st = _state.get(cid)
    if st and st.get("dim") is not None and st.get("mode") != "down":
        return st["dim"]
    return None


def _mean(ids):
    vs = [_valid(i) for i in ids]
    vs = [v for v in vs if v is not None]
    return (round(sum(vs) / len(vs), 2), len(vs)) if vs else (None, 0)


def ticker():
    while True:
        ts = time.time()
        _merge()                         # 先合并深圳直连 + 英国回报
        with _lock:
            for ch in CHANS:
                v = _valid(ch["id"])
                if v is not None:
                    _append(ch["id"], ts, v)
            gi, gc = _mean([c["id"] for c in CHANS])
            if gi is not None:
                _append("GREEN", ts, gi)
                n, t = dim.advice(gi)
                _state["GREEN"] = {"dim": gi, "mode": "index", "name": n, "tip": t, "count": gc}
            for cty, ids in BY_COUNTRY.items():
                ci, cc = _mean(ids)
                if ci is not None:
                    _append("IDXC_" + cty, ts, ci)
                    n, t = dim.advice(ci)
                    _state["IDXC_" + cty] = {"dim": ci, "mode": "index", "name": n, "tip": t, "count": cc}
            for con, ids in BY_CONT.items():
                ci, cc = _mean(ids)
                if ci is not None:
                    _append("IDXT_" + con, ts, ci)
                    n, t = dim.advice(ci)
                    _state["IDXT_" + con] = {"dim": ci, "mode": "index", "name": n, "tip": t, "count": cc}
            _db.commit()
        time.sleep(TICK)


def _candles(sid, tf, limit=600):
    cutoff = int(time.time()) - limit * tf - tf
    with _lock:
        arr = _db.execute("SELECT ts, val FROM ticks WHERE series=? AND ts>=? ORDER BY ts",
                          (sid, cutoff)).fetchall()
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


@app.route("/api/series")
def api_series():
    sid = request.args.get("id", "GREEN")
    tf = int(request.args.get("tf", "1"))
    return jsonify({"id": sid, "tf": tf, "initial": _initial.get(sid), "candles": _candles(sid, tf)})


def _start_readers():
    for ch in CHANS:
        if ch.get("stream"):
            threading.Thread(target=reader_live, args=(ch["id"], ch["stream"]), daemon=True).start()
        else:
            threading.Thread(target=reader_demo, args=(ch["id"],), daemon=True).start()
        time.sleep(0.04)     # 错峰启动，避免瞬时几百个 ffmpeg
    threading.Thread(target=uk_poller, daemon=True).start()   # 拉英国探针
    threading.Thread(target=ticker, daemon=True).start()


if __name__ == "__main__":
    threading.Thread(target=_start_readers, daemon=True).start()
    app.run(host="0.0.0.0", port=8780, threaded=True)
