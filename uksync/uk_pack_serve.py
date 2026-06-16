# -*- coding: utf-8 -*-
"""
uk_pack_serve.py — 【英国端·源码打包服务】(深圳⇄英国加密通道)

只做一件事：收到深圳发来的**加密指令**后，把英国服务器的源码目录打成 zip，
算 SHA-256，整包用 link(Fernet) 加密后回传。**不执行任何上传脚本、不跑任意命令**
（避免变成远程执行后门——口令泄露也只能下载源码，无法在英国机器上跑东西）。

部署（英国 Windows Server，RDP 一次）：
    把 link.py / link_key.txt / uk_pack_serve.py 放英国 greentv 目录
    python uk_pack_serve.py            # 默认 :8796，打包当前 greentv 目录
    安全组放行 TCP 8796
环境：GREENTV_UKSRC_PORT(默认8796)  GREENTV_SRC_DIR(默认=本脚本上级目录)
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
from flask import Flask, request, Response

# 目录定位：打包成 exe(frozen)时按 exe 所在目录；源码运行时按脚本目录
if getattr(sys, "frozen", False):
    _BASE = os.path.dirname(sys.executable)     # exe 所在目录（把 exe 放进英国 greentv）
    _SRC_DEFAULT = _BASE                         # 默认打包 exe 同目录
else:
    _BASE = os.path.dirname(os.path.abspath(__file__))
    _SRC_DEFAULT = os.path.dirname(_BASE)        # uksync 的上级 = greentv
sys.path[:0] = [_BASE, os.path.dirname(_BASE)]   # link.py 在同目录或父目录均可
import link

app = Flask(__name__)
PORT = int(os.environ.get("GREENTV_UKSRC_PORT", "8796"))
SRC_DIR = os.environ.get("GREENTV_SRC_DIR", _SRC_DEFAULT)

# 不打进包的（体积大/运行时/无意义）。源码、配置、证书、密钥都会包含（自己备份到自己机器）。
SKIP_DIRS = {".git", "__pycache__", "dist", "build", "node_modules", "hf_cache",
             "trainenv", ".venv", "out", "_extract", "_backup"}
SKIP_EXT = {".db", ".db-wal", ".db-shm", ".rar", ".zip", ".exe", ".log", ".crdownload",
            ".pyc", ".npz", ".glb", ".gguf", ".safetensors"}
SKIP_FILES = {"zip_pwd.txt"}   # 密码文件本身绝不打进包


def _zip_pwd():
    """zip 加密密码：环境变量 GREENTV_ZIP_PWD > 同目录 zip_pwd.txt（gitignored）> 无。
    不硬编码进源码，避免随脚本泄露。"""
    p = os.environ.get("GREENTV_ZIP_PWD")
    if p:
        return p.strip()
    f = os.path.join(_BASE, "zip_pwd.txt")
    if os.path.exists(f):
        try:
            v = open(f, encoding="utf-8").read().strip()
            if v:
                return v
        except Exception:
            pass
    return None


def _iter_files():
    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if fn in SKIP_FILES or os.path.splitext(fn)[1].lower() in SKIP_EXT:
                continue
            full = os.path.join(root, fn)
            try:
                if os.path.getsize(full) > 25 * 1024 * 1024:   # 跳过 >25MB 大文件
                    continue
            except Exception:
                continue
            yield full, os.path.relpath(full, SRC_DIR)


def build_zip():
    """把 SRC_DIR 打成内存 zip，返回 (bytes, 文件数, 是否加密)。
    有密码 → 用 pyzipper 做 AES-256 加密 zip（密码打开）；无密码 → 普通 zip。"""
    pwd = _zip_pwd()
    buf = io.BytesIO()
    n = 0
    if pwd:
        import pyzipper
        z = pyzipper.AESZipFile(buf, "w", compression=pyzipper.ZIP_DEFLATED,
                                encryption=pyzipper.WZ_AES)
        z.setpassword(pwd.encode("utf-8"))
    else:
        z = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)
    with z:
        for full, arc in _iter_files():
            try:
                z.write(full, arc); n += 1
            except Exception:
                pass
    return buf.getvalue(), n, bool(pwd)


@app.route("/uksrc/ping")
def ping():
    return Response(link.seal({"ok": True, "fingerprint": link.key_fingerprint(),
                              "src": SRC_DIR, "enc": link.encryption_on()}), mimetype="text/plain")


@app.route("/uksrc/pull", methods=["POST"])
def pull():
    # 验签：解不开=口令不对=拒
    try:
        link.unseal(request.get_data(as_text=True))
    except link.InvalidToken:
        return Response("key mismatch", status=403)
    except Exception as e:
        return Response("bad payload: %s" % e, status=400)
    try:
        data, n, enc = build_zip()
    except ImportError:
        return Response("需要 pyzipper 做密码加密 zip：pip install pyzipper", status=500)
    payload = {
        "name": "uk_src_%d.zip" % int(time.time()),
        "size": len(data),
        "files": n,
        "zip_encrypted": enc,                 # zip 是否带密码(AES)
        "sha256": hashlib.sha256(data).hexdigest(),
        "zip_b64": base64.b64encode(data).decode("ascii"),
    }
    print("打包完成: %d 文件 %.1fKB  密码加密=%s → link 加密回传深圳" % (n, len(data) / 1024, enc))
    return Response(link.seal(payload), mimetype="text/plain")


# —— 接收深圳推送的代码包时，绝不覆盖这些（英国本地密钥/证书/数据/运行时）——
PROTECT_NAMES = {"link_key.txt", "proxy_token.txt", "users.json", "users.json.bak",
                 "smtp_config.json", "chatlog.jsonl", "portraits.jsonl", "feat_db.npz", "zip_pwd.txt"}
PROTECT_EXT = {".pem", ".db", ".db-wal", ".db-shm", ".log"}


def unpack_into_src(data):
    """解压代码包进 SRC_DIR，跳过英国本地密钥/证书/数据(不覆盖)；防 zip-slip。返回(写入数, 跳过列表)。"""
    written, skipped = 0, []
    root = os.path.normpath(SRC_DIR)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            base = os.path.basename(info.filename)
            if base in PROTECT_NAMES or os.path.splitext(base)[1].lower() in PROTECT_EXT:
                skipped.append(info.filename); continue
            dest = os.path.normpath(os.path.join(root, info.filename))
            if dest != root and not dest.startswith(root + os.sep):
                skipped.append("(unsafe)" + info.filename); continue        # 防越界
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with z.open(info) as s, open(dest, "wb") as o:
                o.write(s.read())
            written += 1
    return written, skipped


@app.route("/uksrc/recv", methods=["POST"])
def recv():
    """接收深圳推来的代码包(link加密)，校验SHA-256→解压进英国greentv，保留本地密钥/证书/数据。"""
    try:
        obj = link.unseal(request.get_data(as_text=True))
    except link.InvalidToken:
        return Response("key mismatch", status=403)
    except Exception as e:
        return Response("bad payload: %s" % e, status=400)
    try:
        data = base64.b64decode(obj["zip_b64"])
    except Exception as e:
        return Response("bad zip: %s" % e, status=400)
    if hashlib.sha256(data).hexdigest() != obj.get("sha256"):
        return Response(link.seal({"ok": False, "err": "sha256 mismatch"}), mimetype="text/plain")
    written, skipped = unpack_into_src(data)
    print("收到深圳代码包: 写入 %d 文件，保留 %d 个本地敏感文件 → %s" % (written, len(skipped), SRC_DIR))
    return Response(link.seal({"ok": True, "written": written, "skipped": len(skipped),
                              "protected": skipped[:20], "dest": SRC_DIR}), mimetype="text/plain")


if __name__ == "__main__":
    print("🟢 英国源码打包/接收服务  :%d  源目录=%s  口令指纹=%s  加密:%s"
          % (PORT, SRC_DIR, link.key_fingerprint(), link.encryption_on()))
    print("   /uksrc/pull = 回传英国源码到深圳   /uksrc/recv = 接收深圳推送的代码更新")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
