# -*- coding: utf-8 -*-
"""users.py — 绿太阳用户系统：邮箱验证码注册 + 登录 + 会话。
密码用 PBKDF2-HMAC-SHA256 加盐哈希(不存明文)。验证码6位、10分钟过期、按邮箱限频。
邮件发送：读 smtp_config.json(或环境变量) 用 SMTP 发送；未配置则【演示模式】把验证码回传到页面(仅测试流程)。
用户库 users.json、smtp_config.json 均 gitignored，含邮箱与口令哈希，切勿公开。
"""
import os
import re
import json
import time
import hashlib
import secrets
import smtplib
import threading
from email.mime.text import MIMEText
from email.header import Header

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("GREENTV_DATA", HERE)
UDB = os.path.join(DATA, "users.json")
_lock = threading.Lock()
_codes = {}        # email -> {"code":..., "exp":..., "last":...}
_sessions = {}     # token -> {"user":..., "ts":...}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _load():
    try:
        with open(UDB, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(d):
    try:
        with open(UDB, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
    except Exception:
        pass


def _hash(pw, salt=None):
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode(), 120000).hex()
    return salt + "$" + h


def _check(pw, stored):
    try:
        salt, _ = stored.split("$", 1)
        return secrets.compare_digest(_hash(pw, salt), stored)
    except Exception:
        return False


def _smtp_cfg():
    c = {}
    p = os.path.join(DATA, "smtp_config.json")
    if not os.path.exists(p):
        p = os.path.join(HERE, "smtp_config.json")
    try:
        if os.path.exists(p):
            c = json.load(open(p, encoding="utf-8"))
    except Exception:
        c = {}
    for k, ev in (("host", "GREENTV_SMTP_HOST"), ("port", "GREENTV_SMTP_PORT"), ("user", "GREENTV_SMTP_USER"),
                  ("pass", "GREENTV_SMTP_PASS"), ("from", "GREENTV_SMTP_FROM")):
        if os.environ.get(ev):
            c[k] = os.environ[ev]
    return c


def _send_mail(to, code):
    """返回 True=已发送真实邮件；False=未配置(走演示)。"""
    c = _smtp_cfg()
    if not c.get("host") or not c.get("user"):
        return False
    try:
        body = "您的【绿太阳 GreenIndex】注册验证码是：%s\n\n10 分钟内有效。若非本人操作请忽略。\n（本站为虚构演绎·仅供娱乐）" % code
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = Header("绿太阳 注册验证码 %s" % code, "utf-8")
        msg["From"] = c.get("from") or c["user"]
        msg["To"] = to
        port = int(c.get("port", 465))
        if port == 465:
            s = smtplib.SMTP_SSL(c["host"], port, timeout=15)
        else:
            s = smtplib.SMTP(c["host"], port, timeout=15); s.starttls()
        s.login(c["user"], c.get("pass", ""))
        s.sendmail(msg["From"], [to], msg.as_string())
        s.quit()
        return True
    except Exception as e:
        print("SMTP 发送失败:", e)
        return False


def request_code(email):
    email = (email or "").strip().lower()
    if not _EMAIL_RE.match(email):
        return {"ok": False, "msg": "邮箱格式不正确"}
    now = time.time()
    with _lock:
        c = _codes.get(email)
        if c and now - c["last"] < 50:
            return {"ok": False, "msg": "发送过于频繁，请 %d 秒后再试" % int(50 - (now - c["last"]))}
        code = "%06d" % secrets.randbelow(1000000)
        _codes[email] = {"code": code, "exp": now + 600, "last": now}
    sent = _send_mail(email, code)
    out = {"ok": True, "sent": sent}
    if not sent:
        out["demo_code"] = code          # 演示模式：未配置SMTP，把码回传页面
        out["msg"] = "演示模式（未配置邮件发送）：验证码 " + code
    else:
        out["msg"] = "验证码已发送至 " + email + "，10分钟内有效"
    return out


def register(username, email, pw, code):
    username = (username or "").strip()
    email = (email or "").strip().lower()
    if not (2 <= len(username) <= 16):
        return {"ok": False, "msg": "用户名需 2-16 字符"}
    if not _EMAIL_RE.match(email):
        return {"ok": False, "msg": "邮箱格式不正确"}
    if len(pw or "") < 6:
        return {"ok": False, "msg": "密码至少 6 位"}
    with _lock:
        c = _codes.get(email)
        if not c or time.time() > c["exp"]:
            return {"ok": False, "msg": "验证码不存在或已过期，请重新获取"}
        if (code or "").strip() != c["code"]:
            return {"ok": False, "msg": "验证码错误"}
        users = _load()
        if username in users:
            return {"ok": False, "msg": "用户名已被注册"}
        if any(u.get("email") == email for u in users.values()):
            return {"ok": False, "msg": "该邮箱已注册"}
        users[username] = {"email": email, "pw": _hash(pw), "verified": True, "ts": int(time.time())}
        _save(users)
        _codes.pop(email, None)
    return {"ok": True, "msg": "注册成功", "token": _new_session(username), "user": username}


def login(login_id, pw):
    login_id = (login_id or "").strip()
    with _lock:
        users = _load()
        uname = None
        if login_id in users:
            uname = login_id
        else:
            for k, v in users.items():
                if v.get("email") == login_id.lower():
                    uname = k; break
        if not uname or not _check(pw, users[uname]["pw"]):
            return {"ok": False, "msg": "用户名/邮箱或密码错误"}
    return {"ok": True, "msg": "登录成功", "token": _new_session(uname), "user": uname}


def _new_session(uname):
    t = secrets.token_urlsafe(24)
    _sessions[t] = {"user": uname, "ts": time.time()}
    return t


def whoami(token):
    s = _sessions.get(token or "")
    if not s or time.time() - s["ts"] > 86400 * 14:
        return None
    return s["user"]


def logout(token):
    _sessions.pop(token or "", None)
    return {"ok": True}
