# -*- coding: utf-8 -*-
"""
sz_agent.py — 【深圳一体机·后台代理】出站轮询英国中枢(:8780)，干两件事：
  ① Adam 客服：取访客提问 → 本地 Ollama 小七生成 → 加密回传英国。
  ② 训练调试：取网吧指令(start/pause/stop) → 控制本地 train_loop → 回传进度。
深圳只出站，穿 NAT；全程 link 加密。由 shenzhen_app 在启动时调 start()。

启用：深圳端设 GREENTV_HUB_URL=http://8.208.127.130:8780
环境：GREENTV_OLLAMA_URL(默认127.0.0.1:11434) GREENTV_ADAM_MODEL(默认qwen2.5-coder:7b)
"""
import os
import sys
import json
import time
import threading
import subprocess
import urllib.request

import link

UK = (os.environ.get("GREENTV_HUB_URL", "")).rstrip("/")
OLLAMA = os.environ.get("GREENTV_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
MODEL = os.environ.get("GREENTV_ADAM_MODEL", "qwen2.5-coder:7b")
_HERE = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, "frozen", False):
    _HERE = os.path.dirname(sys.executable)
_TRAIN = os.path.join(_HERE, "train")
_loop_proc = [None]


def _post(path, obj, timeout):
    data = link.seal(obj).encode("ascii")
    req = urllib.request.Request(UK + path, data=data, headers={"content-type": "text/plain"})
    return link.unseal(urllib.request.urlopen(req, timeout=timeout).read().decode("ascii"))


def _ask_xiaoqi(messages):
    body = json.dumps({"model": MODEL, "messages": messages, "stream": False,
                       "keep_alive": "10m", "options": {"num_predict": 320, "temperature": 0.6}}).encode("utf-8")
    req = urllib.request.Request(OLLAMA + "/api/chat", data=body, headers={"content-type": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=180).read())
    return (j.get("message") or {}).get("content", "").strip()


def _adam_loop():
    while True:
        try:
            r = _post("/adam/pull", {"who": "sz"}, 35)
        except Exception:
            time.sleep(3); continue
        req = r.get("req")
        if not req:
            continue
        try:
            reply = _ask_xiaoqi(req.get("messages") or []) or "(小七没接上话，再说一句试试～)"
        except Exception as e:
            reply = "(小七出错了: %s)" % str(e)[:70]
        try:
            _post("/adam/answer", {"req_id": req.get("req_id"), "reply": reply}, 20)
        except Exception:
            pass


def _set_ctrl(state):
    try:
        os.makedirs(_TRAIN, exist_ok=True)
        json.dump({"state": state}, open(os.path.join(_TRAIN, "control.json"), "w", encoding="utf-8"))
    except Exception:
        pass


def _train_status():
    s = {}
    try:
        s = json.load(open(os.path.join(_TRAIN, "status.json"), encoding="utf-8"))
    except Exception:
        pass
    s["loop_alive"] = bool(_loop_proc[0] and _loop_proc[0].poll() is None)
    return s


def _train_py():
    """训练要用带 torch 的 trainenv python(打包成exe后 sys.executable 是exe，跑不了训练)。"""
    p = os.environ.get("GREENTV_TRAIN_PY", r"D:\ballbs\trainenv\Scripts\python.exe")
    if os.path.exists(p):
        return p
    return sys.executable if not getattr(sys, "frozen", False) else p


def _start_train(steps, refresh):
    if _loop_proc[0] and _loop_proc[0].poll() is None:
        return
    if not os.path.isdir(_TRAIN):
        return
    _set_ctrl("run")
    try:
        _loop_proc[0] = subprocess.Popen(
            [_train_py(), "train_loop.py", "--steps", str(steps), "--refresh-every", str(refresh)],
            cwd=_TRAIN)
    except Exception:
        pass


def _tm_loop():
    while True:
        try:
            r = _post("/tm/pull", {"who": "sz"}, 20)
            for cmd in r.get("cmds", []):
                a = (cmd.get("action") or "").lower()
                if a == "start":
                    _start_train(int(cmd.get("steps", 60)), int(cmd.get("refresh_every", 5)))
                elif a in ("pause", "stop"):
                    _set_ctrl(a)
                elif a == "resume":
                    _set_ctrl("run")
            _post("/tm/report", {"status": _train_status()}, 15)
        except Exception:
            pass
        time.sleep(4)


def start():
    """shenzhen_app 启动时调用。后台两条轮询线程，不阻塞。"""
    if not UK:
        print("[agent] 未设 GREENTV_HUB_URL，深圳代理不启动")
        return
    print("[agent] 深圳代理启动 → 英国中枢 %s  小七=%s  口令指纹=%s" % (UK, MODEL, link.key_fingerprint()))
    threading.Thread(target=_adam_loop, daemon=True).start()
    threading.Thread(target=_tm_loop, daemon=True).start()
