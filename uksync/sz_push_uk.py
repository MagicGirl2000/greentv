# -*- coding: utf-8 -*-
"""
sz_push_uk.py — 【深圳→英国 加密推送代码】(深圳⇄英国加密通道·反向)

深圳打包最新代码 → Fernet 加密 → 推到英国 uk_pack_serve 的 /uksrc/recv →
英国校验 SHA-256 后解压进自己的 greentv，**自动保留英国本地密钥/证书/数据库**(不覆盖)。
与 sz_fetch_uk(拉)对称，一条命令把英国升到深圳最新版。

· 只推“代码”，绝不推密钥/证书/数据库/feat_db(打包阶段已排除)。
· 英国端不执行任意命令，只把代码写进文件(非 RCE)。

用法(深圳本机，确保 link_key.txt 在 greentv 目录，勿用 shell 设 GREENTV_KEY)：
    python sz_push_uk.py
环境：GREENTV_PUSH_SRC(默认 D:\ballbs\greentv-latest 干净源)  GREENTV_UKSRC_URL(默认 http://8.208.127.130:8796)
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass
import io
import time
import base64
import hashlib
import zipfile
import urllib.request

_H = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [_H, os.path.dirname(_H)]
import link

UK = os.environ.get("GREENTV_UKSRC_URL", "http://8.208.127.130:8796").rstrip("/")
SRC = os.environ.get("GREENTV_PUSH_SRC", r"D:\ballbs\greentv-latest")

SKIP_DIRS = {".git", "__pycache__", "dist", "build", "node_modules", "hf_cache",
             "trainenv", ".venv", "out", "_extract", "_backup"}
SKIP_EXT = {".db", ".db-wal", ".db-shm", ".rar", ".zip", ".crdownload", ".pyc",
            ".npz", ".gguf", ".safetensors", ".log"}
# 绝不推送的敏感物（即便源里有也排除）
SKIP_NAMES = {"link_key.txt", "proxy_token.txt", "users.json", "users.json.bak",
              "smtp_config.json", "chatlog.jsonl", "portraits.jsonl", "zip_pwd.txt"}
SKIP_EXT2 = {".pem"}


def build_code_zip():
    buf = io.BytesIO(); n = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(SRC):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fn in files:
                ext = os.path.splitext(fn)[1].lower()
                if fn in SKIP_NAMES or ext in SKIP_EXT or ext in SKIP_EXT2:
                    continue
                full = os.path.join(root, fn)
                try:
                    if os.path.getsize(full) > 30 * 1024 * 1024:
                        continue
                    z.write(full, os.path.relpath(full, SRC)); n += 1
                except Exception:
                    pass
    return buf.getvalue(), n


def post(path, obj, timeout=600):
    data = link.seal(obj).encode("ascii")
    req = urllib.request.Request(UK + path, data=data, headers={"content-type": "text/plain"})
    return link.unseal(urllib.request.urlopen(req, timeout=timeout).read().decode("ascii"))


def main():
    print("深圳→英国 加密推送代码  源=%s  目标=%s  口令指纹=%s" % (SRC, UK, link.key_fingerprint()))
    if not os.path.isdir(SRC):
        print("✗ 源目录不存在:", SRC); return
    # 1) ping 验指纹
    try:
        png = link.unseal(urllib.request.urlopen(UK + "/uksrc/ping", timeout=15).read().decode("ascii"))
        if png.get("fingerprint") != link.key_fingerprint():
            print("✗ 口令指纹不一致 本端=%s 英国=%s" % (link.key_fingerprint(), png.get("fingerprint"))); return
        print("✓ 英国在线，目标目录=%s" % png.get("src"))
    except Exception as e:
        print("✗ 连不上英国(检查 uk_pack_serve 是否启动/8796 放行):", str(e)[:120]); return
    # 2) 打包 + 推送
    data, n = build_code_zip()
    sha = hashlib.sha256(data).hexdigest()
    print("打包 %d 文件 %.1f KB，加密推送中…" % (n, len(data) / 1024))
    t0 = time.time()
    try:
        r = post("/uksrc/recv", {"name": "sz_push_%d.zip" % int(time.time()),
                                 "sha256": sha, "zip_b64": base64.b64encode(data).decode("ascii")})
    except Exception as e:
        print("✗ 推送失败:", str(e)[:150]); return
    if not r.get("ok"):
        print("✗ 英国侧拒绝:", r); return
    print("\n========== ✅ 完成 ==========")
    print("英国已升级到深圳最新代码：")
    print("  写入文件: %s" % r.get("written"))
    print("  保留本地敏感文件(未覆盖): %s 个" % r.get("skipped"))
    print("  英国目录: %s" % r.get("dest"))
    print("  用时: %.1fs   全程 link(Fernet) 加密" % (time.time() - t0))
    print("提示：英国重启 server.py / 一体机 exe 后新代码即生效。")
    print("============================ 哈哈")


if __name__ == "__main__":
    main()
