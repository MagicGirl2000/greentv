# -*- coding: utf-8 -*-
"""
sz_fetch_uk.py — 【深圳端·加密拉取英国源码】(深圳⇄英国加密通道)

发一条加密指令给英国 uk_pack_serve → 英国打包源码并加密回传 → 深圳解密、校验
SHA-256、落盘到数据中心。一条命令全自动，完成后打印结果。

用法（深圳本机）：
    set GREENTV_KEY=<两端同口令>
    python sz_fetch_uk.py
环境：GREENTV_UKSRC_URL(默认 http://8.208.127.130:8796)
      GREENTV_UKSRC_DEST(默认 D:\ballbs\英国源码备份)
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass
import time
import base64
import hashlib
import urllib.request

_H = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [_H, os.path.dirname(_H)]
import link

UK = os.environ.get("GREENTV_UKSRC_URL", "http://8.208.127.130:8796").rstrip("/")
DEST = os.environ.get("GREENTV_UKSRC_DEST", r"D:\ballbs\英国源码备份")


def _post(path, obj, timeout=300):
    data = link.seal(obj).encode("ascii")
    req = urllib.request.Request(UK + path, data=data, headers={"content-type": "text/plain"})
    return link.unseal(urllib.request.urlopen(req, timeout=timeout).read().decode("ascii"))


def main():
    print("深圳→英国 加密拉取源码  目标=%s  口令指纹=%s" % (UK, link.key_fingerprint()))
    # 1) ping 确认通+口令一致
    try:
        png = link.unseal(urllib.request.urlopen(UK + "/uksrc/ping", timeout=15).read().decode("ascii"))
        if png.get("fingerprint") != link.key_fingerprint():
            print("✗ 口令指纹不一致，两端口令必须相同。本端=%s 英国=%s"
                  % (link.key_fingerprint(), png.get("fingerprint"))); return
        print("✓ 英国在线，源目录=%s 加密=%s" % (png.get("src"), png.get("enc")))
    except Exception as e:
        print("✗ 连不上英国(检查 uk_pack_serve 是否启动 / 8796 是否放行):", str(e)[:120]); return

    # 2) 发加密指令 → 拉回加密源码包
    print("发送加密打包指令，等待英国打包并回传…")
    t0 = time.time()
    try:
        r = _post("/uksrc/pull", {"action": "pack", "ts": int(time.time())})
    except Exception as e:
        print("✗ 拉取失败:", str(e)[:150]); return

    # 3) 解码 + 校验 SHA-256
    blob = base64.b64decode(r["zip_b64"])
    got = hashlib.sha256(blob).hexdigest()
    if got != r.get("sha256"):
        print("✗ SHA-256 校验不符，包可能损坏。期望 %s 实得 %s" % (r.get("sha256"), got)); return

    # 4) 落盘深圳数据中心
    os.makedirs(DEST, exist_ok=True)
    out = os.path.join(DEST, r.get("name", "uk_src_%d.zip" % int(time.time())))
    with open(out, "wb") as f:
        f.write(blob)
    print("\n========== ✅ 完成 ==========")
    print("英国源码已加密回传深圳数据中心：")
    print("  文件: %s" % out)
    print("  大小: %.1f KB   文件数: %s" % (len(blob) / 1024, r.get("files")))
    print("  SHA-256: %s ✓校验通过" % got)
    print("  zip 密码保护: %s" % ("是(AES, 需密码打开)" if r.get("zip_encrypted") else "否"))
    print("  用时: %.1fs   传输全程 link(Fernet) 加密" % (time.time() - t0))
    print("============================ 哈哈")


if __name__ == "__main__":
    main()
