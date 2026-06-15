# -*- coding: utf-8 -*-
"""
adam_gateway.py — 深圳·Adam 加密 API 网关。
英国服务器经 link.py(Fernet 共享密钥) 加密访问本地 Ollama 上的 Adam(7b)。
· 只暴露 :8790，不裸暴露 Ollama :11434
· 请求/回复全程 link 加密；口令(link_key.txt)不对 → 403
部署：在深圳 3070 机器上 `python adam_gateway.py`（需先 ollama 跑起 7b）。
"""
import os, json, urllib.request
from flask import Flask, request, Response
import link  # greentv 跨境加密（与英国共用 link_key.txt）

app = Flask(__name__)
OLLAMA = os.environ.get("ADAM_OLLAMA", "http://127.0.0.1:11434/api/chat")
MODEL  = os.environ.get("ADAM_MODEL", "qwen2.5-coder:7b")
PORT   = int(os.environ.get("ADAM_PORT", "8790"))


@app.route("/adam", methods=["POST"])
def adam():
    # ① 解密英国发来的请求（口令不对/被篡改 → 拒）
    try:
        obj = link.unseal(request.get_data(as_text=True))
    except link.InvalidToken:
        return Response("key mismatch", status=403)
    except Exception as e:
        return Response("bad payload: %s" % e, status=400)
    # ② 调本地 Ollama 上的 Adam
    msgs = obj.get("messages") or [{"role": "user", "content": obj.get("text", "你好")}]
    body = json.dumps({"model": MODEL, "messages": msgs, "stream": False,
                       "keep_alive": -1,
                       "options": obj.get("options", {"num_predict": 400, "temperature": 0.6})}).encode("utf-8")
    try:
        j = json.loads(urllib.request.urlopen(urllib.request.Request(
            OLLAMA, data=body, headers={"content-type": "application/json"}), timeout=180).read())
        reply = (j.get("message") or {}).get("content", "")
    except Exception as e:
        reply = "(Adam 调用失败: %s)" % str(e)[:120]
    # ③ 加密回复给英国
    return Response(link.seal({"reply": reply, "model": MODEL}), mimetype="text/plain")


@app.route("/adam/ping")
def ping():
    # 英国可用它确认密钥指纹是否一致（不泄露口令）
    return Response(link.seal({"ok": True, "fingerprint": link.key_fingerprint()}),
                    mimetype="text/plain")


if __name__ == "__main__":
    print("🟢 Adam 加密网关启动  http://0.0.0.0:%d/adam  ｜ 密钥指纹 %s  ｜ 加密:%s"
          % (PORT, link.key_fingerprint(), link.encryption_on()))
    app.run(host="0.0.0.0", port=PORT, threaded=True)
