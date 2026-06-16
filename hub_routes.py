# -*- coding: utf-8 -*-
"""
hub_routes.py — 【英国一体机·中枢】把两条加密信道焊进主站(:8780)：
  ① Adam 客服中继：访客提问入队 → 深圳一体机轮询取走 → 小七答 → 回传 → 返回访客。
  ② 训练调试信道：网吧 push 指令 → 深圳一体机轮询取走、控训练 → report 进度 → 网吧 status 读。
全程 link(Fernet) 加密；解不开=403。挂在 server.app 上，复用 :8780，不新增端口。

启用：英国端设环境变量 GREENTV_HUB=1（uk_app 已默认开）。server.py 会调 register(app)。
"""
import os
import time
import uuid
import json
import queue
import threading
from flask import request, Response

import link

# —— Adam 客服中继 ——
_adam_q = queue.Queue()
_adam_ans = {}
_adam_ev = {}
_alock = threading.Lock()
ASK_TIMEOUT = float(os.environ.get("GREENTV_ADAM_ASK_TIMEOUT", "45"))
PULL_TIMEOUT = float(os.environ.get("GREENTV_PULL_TIMEOUT", "25"))

# —— 训练调试信道 ——
_tm_q = queue.Queue()
_tm_status = {"state": "-"}
_tm_status_ts = 0


def enqueue_adam(messages):
    """英国 server.py 的 /api/chat 调它：入队等深圳小七答。返回字符串或 None(超时)。"""
    rid = uuid.uuid4().hex
    ev = threading.Event()
    with _alock:
        _adam_ev[rid] = ev
    _adam_q.put({"req_id": rid, "messages": messages})
    ok = ev.wait(timeout=ASK_TIMEOUT)
    with _alock:
        reply = _adam_ans.pop(rid, None); _adam_ev.pop(rid, None)
    return reply if (ok and reply is not None) else None


def register(app):
    def _open():
        return link.unseal(request.get_data(as_text=True))

    def _guard():
        try:
            _open(); return None
        except link.InvalidToken:
            return Response("key mismatch", status=403)
        except Exception as e:
            return Response("bad payload: %s" % e, status=400)

    @app.route("/adam/pull", methods=["POST"])
    def adam_pull():
        g = _guard()
        if g: return g
        try:
            req = _adam_q.get(timeout=PULL_TIMEOUT)
        except queue.Empty:
            return Response(link.seal({"req": None}), mimetype="text/plain")
        return Response(link.seal({"req": req}), mimetype="text/plain")

    @app.route("/adam/answer", methods=["POST"])
    def adam_answer():
        try:
            o = _open()
        except link.InvalidToken:
            return Response("key mismatch", status=403)
        except Exception as e:
            return Response("bad payload: %s" % e, status=400)
        rid = o.get("req_id")
        with _alock:
            ev = _adam_ev.get(rid)
            if ev:
                _adam_ans[rid] = o.get("reply", ""); ev.set()
        return Response(link.seal({"ok": bool(rid)}), mimetype="text/plain")

    @app.route("/tm/push", methods=["POST"])
    def tm_push():
        try:
            cmd = _open()
        except link.InvalidToken:
            return Response("key mismatch", status=403)
        except Exception as e:
            return Response("bad payload: %s" % e, status=400)
        cmd["_ts"] = int(time.time()); _tm_q.put(cmd)
        return Response(link.seal({"ok": True, "queued": _tm_q.qsize()}), mimetype="text/plain")

    @app.route("/tm/pull", methods=["POST"])
    def tm_pull():
        g = _guard()
        if g: return g
        cmds = []
        try:
            while True:
                cmds.append(_tm_q.get_nowait())
        except queue.Empty:
            pass
        return Response(link.seal({"cmds": cmds}), mimetype="text/plain")

    @app.route("/tm/report", methods=["POST"])
    def tm_report():
        global _tm_status, _tm_status_ts
        try:
            o = _open()
        except link.InvalidToken:
            return Response("key mismatch", status=403)
        except Exception as e:
            return Response("bad payload: %s" % e, status=400)
        _tm_status = o.get("status", o); _tm_status_ts = int(time.time())
        return Response(link.seal({"ok": True}), mimetype="text/plain")

    @app.route("/tm/status", methods=["POST"])
    def tm_status():
        g = _guard()
        if g: return g
        return Response(link.seal({"status": _tm_status, "status_ts": _tm_status_ts,
                                  "pending": _tm_q.qsize()}), mimetype="text/plain")

    @app.route("/hub/ping")
    def hub_ping():
        return Response(link.seal({"ok": True, "fingerprint": link.key_fingerprint(),
                                  "enc": link.encryption_on()}), mimetype="text/plain")

    print("[hub] 中枢已挂载: /adam/* (客服) + /tm/* (训练信道) + /hub/ping  口令指纹", link.key_fingerprint())
