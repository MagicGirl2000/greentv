# -*- coding: utf-8 -*-
"""sz_analyze.py — 【深圳分析引擎】拉取伦敦采集的【原始样本】，本机高并发(显卡/CPU)分析成维度，推回伦敦。
数据流：伦敦(国际连通好)并发采原始音频+画面 → 深圳 GET /raw_pull 增量拉取 → analyze_av 高并发分析
        → POST /sz_ingest 把维度推回伦敦 → 伦敦网页展示(_merge: 深圳实时 > 本地 > 探针 > 断连)。
解决「深圳被墙拉不到国际源、伦敦CPU弱算不动」的矛盾：伦敦当眼睛，深圳当大脑。
"""
import time
import base64
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests

import dimension as dim
import link


def _decode(it):
    """还原原始样本 → (audio float32, frame float32|None)。"""
    a = it.get("a") or ""
    f = it.get("f") or ""
    x = None
    fr = None
    try:
        if a:
            x = np.frombuffer(base64.b64decode(a), dtype=np.int16).astype(np.float32) / 32767.0
        if f:
            fr = np.frombuffer(base64.b64decode(f), dtype=np.uint8).reshape(36, 64, 3).astype(np.float32)
    except Exception:
        pass
    return x, fr


def _analyze_one(it):
    x, fr = _decode(it)
    try:
        res = dim.analyze_av(x, fr)
    except Exception:
        res = None
    if res is not None:
        nm, tp = dim.advice(res[0])
        return {"id": it["id"], "dim": res[0], "mode": "live", "name": nm, "tip": tp}
    return {"id": it["id"], "dim": None, "mode": "down"}


def analyze_loop(uk_web, running, logfn=None, statfn=None, workers=32, limit=80):
    """持续：拉伦敦原始 → 高并发分析 → 推回伦敦。
    uk_web: 伦敦网页根(如 http://8.208.127.130:8780)；running: ()->bool；logfn/statfn: 可选回调。"""
    def _log(m):
        if logfn:
            try: logfn(m)
            except Exception: pass

    uk_web = uk_web.rstrip("/")
    sess = requests.Session()
    after = 0.0
    while running():
        try:
            r = sess.get(uk_web + "/raw_pull", params={"after": after, "limit": limit}, timeout=20)
            if r.status_code != 200:
                _log("拉取原始失败 HTTP %s" % r.status_code); time.sleep(2); continue
            data = r.json()
        except Exception as e:
            _log("拉取原始异常：%s" % e); time.sleep(2); continue
        items = data.get("items", [])
        if not items:
            time.sleep(1); continue
        try:
            with ThreadPoolExecutor(max_workers=workers) as ex:
                results = list(ex.map(_analyze_one, items))
        except Exception as e:
            _log("分析异常：%s" % e); continue
        after = data.get("max_ts", after)
        live = sum(1 for x in results if x.get("dim") is not None)
        try:
            sess.post(uk_web + "/sz_ingest", data=link.seal({"channels": results}).encode("utf-8"),
                      headers={"Content-Type": "text/plain; charset=utf-8"}, timeout=12)
            _log("🧠 分析 %d 路(在线 %d) → 推回伦敦 OK | 待拉取 %s" % (len(results), live, data.get("pending")))
        except Exception as e:
            _log("推回伦敦异常：%s" % e)
        if statfn:
            try: statfn(len(results), live)
            except Exception: pass


def start(uk_web, running, logfn=None, statfn=None):
    t = threading.Thread(target=analyze_loop, args=(uk_web, running, logfn, statfn), daemon=True)
    t.start()
    return t
