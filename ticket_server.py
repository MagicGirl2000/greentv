# -*- coding: utf-8 -*-
"""
ticket_server.py — 绿太阳·人工客服工单系统（后端）。
访客提交问题 → 生成工单(48h 承诺) → 管理员 Admin 登录查看并回复 → 访客凭工单号查进度。
不实时、人工回复。工单存 tickets.jsonl。
  访客页:   http://<host>:8795/kefu.html
  管理页:   http://<host>:8795/admin.html   （账号 Admin / 密码 Amelie2009）
"""
import os, json, time, hashlib, hmac
from flask import Flask, request, jsonify, send_from_directory

HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="")
TICKETS = os.path.join(HERE, "tickets.jsonl")
PORT = int(os.environ.get("KEFU_PORT", "8795"))

ADMIN_USER = "Admin"
ADMIN_PWD = os.environ.get("KEFU_ADMIN_PWD", "Amelie2009")
_SECRET = hashlib.sha256(("greensun-kefu-" + ADMIN_PWD).encode()).hexdigest()


def _token():
    return hmac.new(_SECRET.encode(), b"admin", hashlib.sha256).hexdigest()[:32]


def _ok_token(t):
    return hmac.compare_digest((t or ""), _token())


def _load():
    out = []
    try:
        for ln in open(TICKETS, encoding="utf-8"):
            ln = ln.strip()
            if ln:
                try: out.append(json.loads(ln))
                except Exception: pass
    except Exception:
        pass
    return out


def _save(rows):
    with open(TICKETS, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


# ---------- 访客 ----------
@app.route("/api/ticket", methods=["POST"])
def create_ticket():
    o = request.get_json(force=True, silent=True) or {}
    name = str(o.get("name", "访客"))[:40]
    q = str(o.get("question", "")).strip()[:2000]
    if not q:
        return jsonify({"ok": False, "msg": "请填写问题"}), 400
    rows = _load()
    tid = "T%d" % (int(time.time()) % 1000000 * 10 + len(rows) % 10)
    rows.append({"id": tid, "name": name, "question": q, "status": "待回复",
                 "reply": "", "created": int(time.time()), "replied": 0})
    _save(rows)
    return jsonify({"ok": True, "id": tid,
                    "msg": "工单已提交，我们承诺 48 小时内人工回复。请保存工单号查进度。"})


@app.route("/api/ticket")
def get_ticket():
    tid = request.args.get("id", "")
    for r in _load():
        if r["id"] == tid:
            return jsonify({"ok": True, "ticket": r})
    return jsonify({"ok": False, "msg": "查无此工单号"}), 404


# ---------- 管理员 ----------
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    o = request.get_json(force=True, silent=True) or {}
    if o.get("user") == ADMIN_USER and o.get("pwd") == ADMIN_PWD:
        return jsonify({"ok": True, "token": _token()})
    return jsonify({"ok": False, "msg": "账号或密码错误"}), 403


@app.route("/api/admin/tickets")
def admin_tickets():
    if not _ok_token(request.args.get("token")):
        return jsonify({"ok": False, "msg": "未登录"}), 403
    rows = sorted(_load(), key=lambda r: (r["replied"] != 0, -r["created"]))
    return jsonify({"ok": True, "tickets": rows})


@app.route("/api/admin/reply", methods=["POST"])
def admin_reply():
    o = request.get_json(force=True, silent=True) or {}
    if not _ok_token(o.get("token")):
        return jsonify({"ok": False, "msg": "未登录"}), 403
    tid, reply = o.get("id"), str(o.get("reply", "")).strip()[:4000]
    rows = _load()
    for r in rows:
        if r["id"] == tid:
            r["reply"] = reply
            r["status"] = "已回复"
            r["replied"] = int(time.time())
            _save(rows)
            return jsonify({"ok": True})
    return jsonify({"ok": False, "msg": "工单不存在"}), 404


@app.route("/")
def home():
    return '<a href="/kefu.html">访客客服</a> ｜ <a href="/admin.html">管理员后台</a>'


if __name__ == "__main__":
    print("🟢 绿太阳客服工单系统 :%d  ｜ 管理员 %s / %s" % (PORT, ADMIN_USER, ADMIN_PWD))
    app.run(host="0.0.0.0", port=PORT, threaded=True)
