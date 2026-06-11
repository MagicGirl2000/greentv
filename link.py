# -*- coding: utf-8 -*-
"""
link.py — 深圳 ⇄ 英国 跨境加密链路（共享密钥对称加密）。
两端共用同一个口令派生出的 Fernet 密钥；只加密「维度数字 / 全球数据」这类元数据，
不传输任何直播内容。口令来源优先级：环境变量 GREENTV_KEY > 同目录 link_key.txt > 内置默认。
"""
import os
import sys
import json
import base64
import hashlib

try:
    from cryptography.fernet import Fernet, InvalidToken
    _HAVE = True
except Exception:                       # 没装 cryptography 时降级（明文，仅供本地调试）
    _HAVE = False
    InvalidToken = Exception

# 打包成 exe(frozen)时，密钥文件放 exe 同目录；否则放脚本同目录。
if getattr(sys, "frozen", False):
    _HERE = os.path.dirname(sys.executable)
else:
    _HERE = os.path.dirname(os.path.abspath(__file__))
_KEY_FILE = os.path.join(_HERE, "link_key.txt")
# 真实口令放 gitignored 的 link_key.txt（或环境变量 GREENTV_KEY），不进公开仓库。
# 两端口令必须一致；克隆者请在两端各自设置相同口令。
_DEFAULT_PASS = "CHANGE_ME-set-link_key.txt-or-GREENTV_KEY"   # 占位符默认（务必改掉）

_OVERRIDE = None        # 运行时由 GUI 设置的口令（最高优先级）


def set_passphrase(p):
    """GUI 里填写/保存密钥后调用，立即生效（不写环境变量）。传空恢复默认来源。"""
    global _OVERRIDE
    _OVERRIDE = (p or "").strip() or None


def _passphrase():
    if _OVERRIDE:
        return _OVERRIDE
    p = os.environ.get("GREENTV_KEY")
    if p:
        return p.strip()
    if os.path.exists(_KEY_FILE):
        try:
            with open(_KEY_FILE, encoding="utf-8") as f:
                t = f.read().strip()
            if t:
                return t
        except Exception:
            pass
    return _DEFAULT_PASS


def _fernet():
    raw = hashlib.sha256(_passphrase().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def key_fingerprint():
    """口令指纹（前8位 hex），两端比对是否用了同一把钥匙，不泄露口令本身。"""
    return hashlib.sha256(_passphrase().encode("utf-8")).hexdigest()[:8]


def encryption_on():
    return _HAVE


def seal(obj) -> str:
    """对象 → JSON → 加密 token（ascii 文本，可放进 HTTP body）。"""
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    if not _HAVE:
        return "PLAIN:" + base64.b64encode(data).decode("ascii")
    return _fernet().encrypt(data).decode("ascii")


def unseal(token: str):
    """加密 token → 对象。口令不对 / 内容被改 → 抛 InvalidToken。"""
    token = (token or "").strip()
    if token.startswith("PLAIN:"):
        return json.loads(base64.b64decode(token[6:]).decode("utf-8"))
    if not _HAVE:
        raise InvalidToken("本机未安装 cryptography，无法解密")
    return json.loads(_fernet().decrypt(token.encode("ascii")).decode("utf-8"))
