# -*- coding: utf-8 -*-
"""
cafe_gui.py — 【网吧调小七大模型】GUI 遥控器。
在任意网吧电脑上，经英国一体机 :8780 加密中枢：
  · 训练遥控：启动/暂停/恢复/停止深圳 3070 上小七的训练，实时看进度;
  · 小七调试：直接跟深圳本地小七加密对话，验证客服效果。
全程 link(Fernet) 加密；口令在密码框输入、不落地、离开网吧不留痕。
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import json
import threading
import urllib.request
import tkinter as tk
from tkinter import scrolledtext

_H = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, "frozen", False):
    _H = os.path.dirname(sys.executable)
sys.path[:0] = [_H, os.path.dirname(_H)]
import link

DEFAULT_URL = os.environ.get("GREENTV_TM_URL", "http://8.208.127.130:8780")


class App:
    def __init__(self, root):
        self.root = root
        self.connected = False
        self.url = DEFAULT_URL
        root.title("网吧调小七大模型 · 绿太阳遥控器")
        root.geometry("760x560")

        # —— 连接栏 ——
        top = tk.Frame(root, pady=6); top.pack(fill="x", padx=8)
        tk.Label(top, text="英国中枢").pack(side="left")
        self.url_e = tk.Entry(top, width=30); self.url_e.insert(0, DEFAULT_URL); self.url_e.pack(side="left", padx=4)
        tk.Label(top, text="口令").pack(side="left")
        self.pw_e = tk.Entry(top, width=16, show="*"); self.pw_e.pack(side="left", padx=4)
        tk.Button(top, text="连接", command=self.connect, width=8).pack(side="left", padx=4)
        self.status_lbl = tk.Label(top, text="未连接", fg="#888"); self.status_lbl.pack(side="left", padx=8)

        # —— 训练遥控面板 ——
        tf = tk.LabelFrame(root, text=" 训练遥控（深圳 3070 · 小七 ）", padx=8, pady=6); tf.pack(fill="x", padx=8, pady=4)
        r1 = tk.Frame(tf); r1.pack(fill="x")
        tk.Label(r1, text="每轮步数").pack(side="left")
        self.steps = tk.Spinbox(r1, from_=10, to=2000, width=6); self.steps.delete(0, "end"); self.steps.insert(0, "60"); self.steps.pack(side="left", padx=4)
        tk.Label(r1, text="几轮刷新数据").pack(side="left")
        self.refresh = tk.Spinbox(r1, from_=1, to=50, width=5); self.refresh.delete(0, "end"); self.refresh.insert(0, "5"); self.refresh.pack(side="left", padx=4)
        tk.Button(r1, text="▶ 启动训练", command=lambda: self.cmd("start", steps=int(self.steps.get()), refresh_every=int(self.refresh.get())), bg="#dff5e1").pack(side="left", padx=6)
        tk.Button(r1, text="⏸ 暂停", command=lambda: self.cmd("pause")).pack(side="left", padx=2)
        tk.Button(r1, text="⏵ 恢复", command=lambda: self.cmd("resume")).pack(side="left", padx=2)
        tk.Button(r1, text="⏹ 停止", command=lambda: self.cmd("stop")).pack(side="left", padx=2)
        self.train_lbl = tk.Label(tf, text="（连接后显示训练状态）", anchor="w", justify="left", font=("Consolas", 10))
        self.train_lbl.pack(fill="x", pady=4)
        self.log_t = scrolledtext.ScrolledText(tf, height=6, font=("Consolas", 9)); self.log_t.pack(fill="x")

        # —— 小七调试对话 ——
        cf = tk.LabelFrame(root, text=" 小七调试对话（验证客服效果）", padx=8, pady=6); cf.pack(fill="both", expand=True, padx=8, pady=4)
        self.chat_t = scrolledtext.ScrolledText(cf, height=8, font=("Microsoft YaHei", 10)); self.chat_t.pack(fill="both", expand=True)
        cr = tk.Frame(cf); cr.pack(fill="x", pady=4)
        self.chat_in = tk.Entry(cr); self.chat_in.pack(side="left", fill="x", expand=True)
        self.chat_in.bind("<Return>", lambda e: self.send_chat())
        tk.Button(cr, text="发送", command=self.send_chat, width=8).pack(side="left", padx=4)

    # —— 加密请求 ——
    def _post(self, path, obj, timeout=60):
        data = link.seal(obj).encode("ascii")
        req = urllib.request.Request(self.url + path, data=data, headers={"content-type": "text/plain"})
        return link.unseal(urllib.request.urlopen(req, timeout=timeout).read().decode("ascii"))

    def connect(self):
        link.set_passphrase(self.pw_e.get())
        self.url = self.url_e.get().strip().rstrip("/")
        try:
            r = link.unseal(urllib.request.urlopen(self.url + "/hub/ping", timeout=10).read().decode("ascii"))
            self.connected = True
            self.status_lbl.config(text="已连接 · 指纹 %s · 加密 %s" % (r.get("fingerprint"), r.get("enc")), fg="#1a8f3c")
            self._loop_status()
        except Exception as e:
            self.connected = False
            self.status_lbl.config(text="连接失败: " + str(e)[:50], fg="#c0392b")

    def cmd(self, action, **kw):
        if not self.connected:
            self.status_lbl.config(text="请先连接", fg="#c0392b"); return
        def run():
            try:
                self._post("/tm/push", dict(action=action, **kw), timeout=15)
            except Exception as e:
                self.root.after(0, lambda: self.status_lbl.config(text="指令失败: " + str(e)[:40], fg="#c0392b"))
        threading.Thread(target=run, daemon=True).start()

    def _loop_status(self):
        if not self.connected:
            return
        def run():
            try:
                r = self._post("/tm/status", {"who": "cafe"}, timeout=15)
                s = r.get("status", {}) or {}
                line = "状态:%-10s 轮:%-3s 步:%-4s loss:%-7s eval_loss:%-7s 循环:%s  待办:%s" % (
                    s.get("state", "-"), s.get("round", "-"), s.get("step", "-"),
                    s.get("loss", "-"), s.get("eval_loss", "-"), s.get("loop_alive", "-"), r.get("pending", 0))
                tail = s.get("log_tail", "") or s.get("msg", "")
                self.root.after(0, lambda: self._set_train(line, tail))
            except Exception:
                pass
        threading.Thread(target=run, daemon=True).start()
        self.root.after(3000, self._loop_status)

    def _set_train(self, line, tail):
        self.train_lbl.config(text=line)
        if tail:
            self.log_t.delete("1.0", "end"); self.log_t.insert("end", tail); self.log_t.see("end")

    def send_chat(self):
        if not self.connected:
            self.status_lbl.config(text="请先连接", fg="#c0392b"); return
        msg = self.chat_in.get().strip()
        if not msg:
            return
        self.chat_in.delete(0, "end")
        self.chat_t.insert("end", "你: %s\n" % msg); self.chat_t.see("end")
        def run():
            try:
                body = json.dumps({"who": "group", "text": msg, "history": []}).encode("utf-8")
                req = urllib.request.Request(self.url + "/api/chat", data=body, headers={"content-type": "application/json"})
                j = json.loads(urllib.request.urlopen(req, timeout=90).read())
                reply = j.get("reply") or ("(无回复 %s)" % (j.get("error") or j.get("nokey", "")))
            except Exception as e:
                reply = "(出错: %s)" % str(e)[:80]
            self.root.after(0, lambda: (self.chat_t.insert("end", "小七: %s\n\n" % reply), self.chat_t.see("end")))
        threading.Thread(target=run, daemon=True).start()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
