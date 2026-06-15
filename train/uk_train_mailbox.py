# -*- coding: utf-8 -*-
"""
uk_train_mailbox.py — 【英国·训练遥控信箱】(绿太阳深圳一体端 3.5109 加密通讯升级)

深圳在 NAT 后面、不可被公网直连，所以用英国公网服务器(8.208.127.130)做加密集合点：
  · 网吧端  → push 指令(加密) 进信箱、status 读最新进度
  · 深圳端  → pull 指令(加密) 执行、report 进度回传
全程 link.py(Fernet 共享口令)加密；解不开 = 没带对口令 = 403，公网开放也无妨。

部署(英国 Windows Server，RDP 登入)：
    把 link.py / link_key.txt / uk_train_mailbox.py 放同目录
    python uk_train_mailbox.py            # 默认 :8795
    安全组放行 TCP 8795
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass
import json
import time
import threading
from flask import Flask, request, Response

_H = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [_H, os.path.dirname(_H)]   # link.py 在本目录或父目录均可
import link

app = Flask(__name__)
PORT = int(os.environ.get("GREENTV_TM_PORT", "8795"))
STORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mailbox_store.json")
_lock = threading.Lock()
_state = {"queue": [], "status": {}, "status_ts": 0}

if os.path.exists(STORE):
    try:
        _state.update(json.load(open(STORE, encoding="utf-8")))
    except Exception:
        pass


def _persist():
    try:
        json.dump(_state, open(STORE, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass


def _open(req):
    """解密请求体 → 对象；口令不对抛 InvalidToken。"""
    return link.unseal(req.get_data(as_text=True))


@app.route("/tm/ping")
def ping():
    return Response(link.seal({"ok": True, "fingerprint": link.key_fingerprint(),
                              "enc": link.encryption_on()}), mimetype="text/plain")


@app.route("/tm/push", methods=["POST"])
def push():
    """网吧端投递指令：{action: start|pause|resume|stop|status|set, ...}"""
    try:
        cmd = _open(request)
    except link.InvalidToken:
        return Response("key mismatch", status=403)
    except Exception as e:
        return Response("bad payload: %s" % e, status=400)
    cmd["_ts"] = int(time.time())
    with _lock:
        _state["queue"].append(cmd); _persist()
    return Response(link.seal({"ok": True, "queued": len(_state["queue"])}), mimetype="text/plain")


@app.route("/tm/pull", methods=["POST"])
def pull():
    """深圳端拉取并清空待办指令。"""
    try:
        _open(request)
    except link.InvalidToken:
        return Response("key mismatch", status=403)
    except Exception as e:
        return Response("bad payload: %s" % e, status=400)
    with _lock:
        cmds = _state["queue"]; _state["queue"] = []; _persist()
    return Response(link.seal({"cmds": cmds}), mimetype="text/plain")


@app.route("/tm/report", methods=["POST"])
def report():
    """深圳端回传训练进度。"""
    try:
        obj = _open(request)
    except link.InvalidToken:
        return Response("key mismatch", status=403)
    except Exception as e:
        return Response("bad payload: %s" % e, status=400)
    with _lock:
        _state["status"] = obj.get("status", obj); _state["status_ts"] = int(time.time()); _persist()
    return Response(link.seal({"ok": True}), mimetype="text/plain")


@app.route("/tm/status", methods=["POST"])
def status():
    """网吧端读取最新进度。"""
    try:
        _open(request)
    except link.InvalidToken:
        return Response("key mismatch", status=403)
    except Exception as e:
        return Response("bad payload: %s" % e, status=400)
    with _lock:
        out = {"status": _state["status"], "status_ts": _state["status_ts"],
               "pending": len(_state["queue"])}
    return Response(link.seal(out), mimetype="text/plain")


if __name__ == "__main__":
    print("🟢 训练遥控信箱  :%d  口令指纹 %s  加密:%s"
          % (PORT, link.key_fingerprint(), link.encryption_on()))
    app.run(host="0.0.0.0", port=PORT, threaded=True)
