# -*- coding: utf-8 -*-
"""
uk_gui.py — 【英国服务器】GUI 可视化程序（探针 + 加密回传 + 深圳上报接收）。
服务：
  · 探针活动：抓【国内连不上的国际频道】(channels_intl.json)，本地算维度，低带宽轮转。
  · 解除限制：对深圳「断连」的电视节目在英国本地重试探针，拿到维度。
  · GET /dims_enc ：把维度数字【加密】回传给深圳（含界名/国家，深圳端免装重依赖）。
  · GET /dims     ：明文 JSON，兼容现有 server.py 的 uk_poller（不破坏旧网站）。
  · POST /ingest  ：接收深圳持续上报的【全球数据】（加密），解密后展示。
【跨境只传维度数字与元数据，绝不传输任何直播内容。】
"""
import os
import json
import time
import threading
import collections
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, jsonify, request, Response

import link

# 维度引擎（numpy + feat_db）。装不全时降级：探针只能标 down，但 GUI/链路照常。
try:
    import dimension as dim
    _ENGINE = True
    _ENGINE_ERR = ""
except Exception as e:
    _ENGINE = False
    _ENGINE_ERR = str(e)

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("GREENTV_AGENT_PORT", "8781"))
CONCURRENT = int(os.environ.get("GREENTV_CONCURRENT", "2"))   # 3M 小带宽建议 1~2

try:
    with open(os.path.join(HERE, "channels_intl.json"), encoding="utf-8") as f:
        CHANS = json.load(f)
except Exception:
    CHANS = []

app = Flask(__name__)

_adims = {}                       # id -> {dim, mode, sim, ts, name, country, name_zh}
_lock = threading.Lock()
_round = 0
_probe_on = {"v": True}
_ingest = {"count": 0, "last": None, "log": collections.deque(maxlen=200)}
_sent = {"enc": 0, "plain": 0}
_events = collections.deque(maxlen=400)   # 探针事件日志（供 GUI）


def _ev(msg):
    _events.append(time.strftime("%H:%M:%S ") + msg)


def _name_for(d):
    if not _ENGINE or d is None:
        return None
    try:
        return dim.advice(d)[0]
    except Exception:
        return None


def _sample(ch):
    cid = ch["id"]
    if not _ENGINE:
        with _lock:
            _adims[cid] = {"dim": None, "mode": "down", "ts": int(time.time()),
                           "country": ch.get("country"), "name": "引擎未就绪"}
        return
    x = dim.grab_audio(ch.get("stream", ""), seconds=3)
    r = dim.analyze_audio(x)
    ts = int(time.time())
    with _lock:
        if r is not None:
            _adims[cid] = {"dim": r[0], "sim": round(r[1], 3), "mode": "live", "ts": ts,
                           "country": ch.get("country"), "name": _name_for(r[0]),
                           "ch_name": ch.get("name")}
        else:
            _adims[cid] = {"dim": None, "mode": "down", "ts": ts,
                           "country": ch.get("country"), "name": "断连",
                           "ch_name": ch.get("name")}


def worker():
    global _round
    pool = ThreadPoolExecutor(max_workers=CONCURRENT)
    n = len(CHANS)
    if n == 0:
        _ev("⚠ channels_intl.json 为空，无频道可探。")
        return
    ptr = 0
    while True:
        if not _probe_on["v"]:
            time.sleep(0.5); continue
        batch = [CHANS[(ptr + i) % n] for i in range(min(CONCURRENT, n))]
        ptr = (ptr + CONCURRENT) % n
        if ptr < CONCURRENT:
            _round += 1
            with _lock:
                live = sum(1 for v in _adims.values() if v.get("mode") == "live")
            _ev("探针轮次 %d 完成：在线 %d / 共 %d" % (_round, live, n))
        try:
            list(pool.map(_sample, batch))
        except Exception as e:
            _ev("探针异常：%s" % e)
            time.sleep(1)


def _payload():
    with _lock:
        live = sum(1 for v in _adims.values() if v.get("mode") == "live")
        return {"dims": dict(_adims), "total": len(CHANS),
                "live": live, "round": _round, "ts": int(time.time())}


@app.route("/dims_enc")
def dims_enc():
    """加密回传给深圳。"""
    _sent["enc"] += 1
    return Response(link.seal(_payload()), mimetype="text/plain; charset=utf-8")


@app.route("/dims")
def dims():
    """明文，兼容旧 server.py。"""
    _sent["plain"] += 1
    return jsonify(_payload())


@app.route("/ingest", methods=["POST"])
def ingest():
    """接收深圳上报的全球数据（加密 body）。"""
    raw = request.get_data(as_text=True)
    try:
        obj = link.unseal(raw)
    except link.InvalidToken:
        return ("decrypt failed: key mismatch (fp=%s)" % link.key_fingerprint(), 400)
    except Exception as e:
        return ("bad payload: %s" % e, 400)
    _ingest["count"] += 1
    _ingest["last"] = obj
    host = obj.get("host", "?")
    cnt = obj.get("count", 0)
    green = obj.get("green")
    _ingest["log"].append(time.strftime("%H:%M:%S ") +
                          "深圳[%s] 上报 %d 频道 green=%s" % (host, cnt, green))
    return jsonify({"ok": True, "received": cnt, "ts": int(time.time())})


@app.route("/")
def home():
    return ("GreenTV UK probe GUI · 探针/解除限制/加密回传 · "
            "GET /dims_enc(加密) /dims(明文) · POST /ingest")


# ---------------- GUI ----------------
def build_gui():
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("绿太阳 · 英国服务器（探针 + 加密回传）")
    root.configure(bg="#0f1620")
    root.geometry("1040x720")

    top = tk.Frame(root, bg="#0f1620"); top.pack(fill="x", padx=14, pady=(12, 4))
    tk.Label(top, text="🇬🇧 英国服务器 GUI", font=("Microsoft YaHei", 15, "bold"),
             bg="#0f1620", fg="#7fd1ff").pack(side="left")
    state_lbl = tk.Label(top, text="", font=("Microsoft YaHei", 10),
                         bg="#0f1620", fg="#9fb3c8"); state_lbl.pack(side="right")

    try:
        import flagbar
        flagbar.attach(root, "#0f1620").pack(pady=(2, 4))
    except Exception:
        pass

    bar = tk.Frame(root, bg="#0f1620"); bar.pack(fill="x", padx=14)
    probe_btn = tk.Button(bar, text="⏸ 暂停探针", bg="#d9534f", fg="white", relief="flat",
                          font=("Microsoft YaHei", 10, "bold"))
    probe_btn.pack(side="left")

    def toggle_probe():
        _probe_on["v"] = not _probe_on["v"]
        probe_btn.config(text="⏸ 暂停探针" if _probe_on["v"] else "▶ 继续探针",
                         bg="#d9534f" if _probe_on["v"] else "#2ebd6b")
        _ev("探针" + ("继续" if _probe_on["v"] else "暂停"))
    probe_btn.config(command=toggle_probe)

    eng = "维度引擎 ✓" if _ENGINE else "维度引擎 ✗(%s)" % _ENGINE_ERR[:40]
    enc = "加密 ✓" if link.encryption_on() else "明文"
    tk.Label(bar, text="  本机 :%d   %s   🔑 %s 指纹%s   并发%d" %
             (PORT, eng, enc, link.key_fingerprint(), CONCURRENT),
             bg="#0f1620", fg="#6c7a89").pack(side="left", padx=10)

    summary = tk.Label(root, text="启动中…", font=("Consolas", 11),
                       bg="#0f1620", fg="#cfe8ff", anchor="w"); summary.pack(fill="x", padx=14, pady=6)

    mid = tk.Frame(root, bg="#0f1620"); mid.pack(fill="both", expand=True, padx=14)
    cols = ("id", "ch", "country", "dim", "name", "mode", "age")
    tree = ttk.Treeview(mid, columns=cols, show="headings", height=14)
    heads = {"id": "频道ID", "ch": "频道", "country": "国家", "dim": "维度",
             "name": "界名", "mode": "状态", "age": "时延s"}
    for c, w in zip(cols, (90, 200, 70, 60, 150, 70, 60)):
        tree.heading(c, text=heads[c]); tree.column(c, width=w, anchor="center")
    tree.pack(side="left", fill="both", expand=True)
    sb = ttk.Scrollbar(mid, command=tree.yview); sb.pack(side="right", fill="y")
    tree.configure(yscrollcommand=sb.set)
    tree.tag_configure("live", foreground="#9fd3a0")
    tree.tag_configure("down", foreground="#e08a8a")

    bottom = tk.Frame(root, bg="#0f1620"); bottom.pack(fill="x", padx=14, pady=6)
    lf = tk.Frame(bottom, bg="#0f1620"); lf.pack(side="left", fill="both", expand=True)
    tk.Label(lf, text="探针活动日志", bg="#0f1620", fg="#9fb3c8", anchor="w").pack(fill="x")
    ev_box = tk.Text(lf, height=8, bg="#0a0f15", fg="#9fd3a0", font=("Consolas", 9), wrap="none")
    ev_box.pack(fill="both", expand=True)
    rf = tk.Frame(bottom, bg="#0f1620"); rf.pack(side="right", fill="both", expand=True)
    tk.Label(rf, text="深圳上报（全球数据）", bg="#0f1620", fg="#9fb3c8", anchor="w").pack(fill="x")
    in_box = tk.Text(rf, height=8, bg="#0a0f15", fg="#9fd3c8", font=("Consolas", 9), wrap="none")
    in_box.pack(fill="both", expand=True)

    def refresh():
        p = _payload()
        now = p["ts"]
        last = _ingest["last"] or {}
        state_lbl.config(text="探针%s" % ("运行中" if _probe_on["v"] else "已暂停"))
        summary.config(text=(
            "探针 在线 %d / 共 %d   轮次 %d   |   加密回传 %d 次 · 明文 %d 次   |   "
            "深圳上报 %d 次  最近: %s green=%s" % (
                p["live"], p["total"], p["round"], _sent["enc"], _sent["plain"],
                _ingest["count"], last.get("host", "—"), last.get("green"))))
        tree.delete(*tree.get_children())
        rows = sorted(p["dims"].items(), key=lambda kv: (kv[1].get("mode") != "live", kv[0]))
        for cid, d in rows:
            age = max(0, now - d.get("ts", now))
            tag = "live" if d.get("mode") == "live" else "down"
            tree.insert("", "end", tags=(tag,), values=(
                cid, d.get("ch_name", ""), d.get("country", ""),
                d.get("dim") if d.get("dim") is not None else "—",
                d.get("name", ""), d.get("mode", "?"), age))
        ev_box.delete("1.0", "end")
        ev_box.insert("end", "\n".join(list(_events)[-200:]))
        ev_box.see("end")
        in_box.delete("1.0", "end")
        in_box.insert("end", "\n".join(list(_ingest["log"])[-200:]))
        in_box.see("end")
        root.after(1000, refresh)

    try:
        import tray
        tray.attach(root, "绿太阳·英国探针 :%d" % PORT, os.path.join(HERE, "logo_uk.ico"))
    except Exception:
        pass
    root.after(500, refresh)
    root.mainloop()


def start_services():
    threading.Thread(target=worker, daemon=True).start()
    threading.Thread(
        target=lambda: app.run(host="0.0.0.0", port=PORT, threaded=True,
                               debug=False, use_reloader=False),
        daemon=True).start()
    _ev("英国服务已启动：探针 + Flask :%d（/dims_enc /dims /ingest）" % PORT)


def main():
    start_services()
    build_gui()


if __name__ == "__main__":
    main()
