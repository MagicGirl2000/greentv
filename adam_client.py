# -*- coding: utf-8 -*-
"""
adam_client.py — 英国端：经 link 加密调用深圳的 Adam(7b)。
把它 import 进 server.py 即可让三魔女群聊/任意功能用上深圳的本地 Adam。
环境变量 ADAM_SZ = 深圳网关地址（公网IP/隧道域名），如 http://1.2.3.4:8790
"""
import os, urllib.request
import link  # 与深圳共用 link_key.txt

SZ = os.environ.get("ADAM_SZ", "http://127.0.0.1:8790")


def ask_adam(messages, options=None, timeout=180):
    """messages: [{'role':'user','content':'...'}] → 返回 Adam 的回复字符串。"""
    payload = link.seal({"messages": messages, "options": options or {"num_predict": 400}})
    req = urllib.request.Request(SZ + "/adam", data=payload.encode("ascii"),
                                 headers={"content-type": "text/plain"})
    enc = urllib.request.urlopen(req, timeout=timeout).read().decode("ascii")
    return link.unseal(enc).get("reply", "")


def check():
    """确认两端密钥一致（指纹相同才能互通）。"""
    enc = urllib.request.urlopen(SZ + "/adam/ping", timeout=10).read().decode("ascii")
    info = link.unseal(enc)
    print("深圳 Adam 在线 ✅  对端密钥指纹:", info.get("fingerprint"),
          " 本端:", link.key_fingerprint(),
          " →", "一致✓" if info.get("fingerprint") == link.key_fingerprint() else "不一致✗(口令要两端相同)")


if __name__ == "__main__":
    check()
    print("Adam 回复:", ask_adam([{"role": "user", "content": "你好 Adam，自我介绍一下"}]))
