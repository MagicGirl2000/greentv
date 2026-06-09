# -*- coding: utf-8 -*-
"""
agent.py — 英国探针。只做一件事：抓【国内连不上的国际频道】，在英国本地算出维度，
暴露 GET /dims 给深圳主服务器来拉。【跨境只回维度数字，不回任何直播内容】。
低带宽轮转，适配 3Mbps 小带宽。
"""
import os
import time
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, jsonify

import dimension as dim

HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

PORT = int(os.environ.get("GREENTV_AGENT_PORT", "8781"))
CONCURRENT = int(os.environ.get("GREENTV_CONCURRENT", "2"))   # 同时抓几路（3M下建议1~2）

with open(os.path.join(HERE, "channels_intl.json"), encoding="utf-8") as f:
    CHANS = json.load(f)

_adims = {}        # id -> {dim, mode, ts}
_lock = threading.Lock()
_round = 0


def _sample(ch):
    x = dim.grab_audio(ch.get("stream", ""), seconds=3)
    r = dim.analyze_audio(x)
    ts = int(time.time())
    with _lock:
        if r is not None:
            _adims[ch["id"]] = {"dim": r[0], "sim": round(r[1], 3), "mode": "live", "ts": ts}
        else:
            _adims[ch["id"]] = {"dim": None, "mode": "down", "ts": ts}


def _worker():
    global _round
    pool = ThreadPoolExecutor(max_workers=CONCURRENT)
    n = len(CHANS)
    ptr = 0
    while True:
        batch = [CHANS[(ptr + i) % n] for i in range(min(CONCURRENT, n))]
        ptr = (ptr + CONCURRENT) % n
        if ptr < CONCURRENT:
            _round += 1
        try:
            list(pool.map(_sample, batch))
        except Exception:
            time.sleep(1)


@app.route("/dims")
def dims():
    with _lock:
        live = sum(1 for v in _adims.values() if v.get("mode") == "live")
        return jsonify({"dims": dict(_adims), "total": len(CHANS),
                        "live": live, "round": _round, "ts": int(time.time())})


@app.route("/")
def home():
    return "GreenTV UK probe · 只回维度数字不回内容 · GET /dims"


if __name__ == "__main__":
    threading.Thread(target=_worker, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, threaded=True)
