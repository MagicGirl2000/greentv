# -*- coding: utf-8 -*-
"""
shenzhen_gui.py — 【深圳】GUI 可视化客户端（改进版）。
职责：
  ① 持续把「全球数据」（深圳能直连看到的各频道维度，取自本机 greentv 网站 :8780）
     加密后上报给英国服务器  POST /ingest
  ② 持续拉取英国探针「解除限制」后回报的加密维度数据  GET /dims_enc，解密展示
改进：配置持久化(地址/周期/密钥) · 界面内改密钥并显示指纹 · 测试连接 · 上报内容预览 · 打包 exe 路径自适应。
三色灯：🟢已连通 / 🟡上报中 / 🔴断连或出错。轻依赖：requests + cryptography + tkinter。
跨境只传维度数字与元数据，不传输任何直播内容。
"""
import os
import sys
import json
import time
import socket
import threading
import queue
import tkinter as tk
from tkinter import ttk, messagebox

import requests

import link   # 共享加密层


# ---------------- 路径/配置 ----------------
def _base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


CONFIG_PATH = os.path.join(_base_dir(), "sz_config.json")
HOSTNAME = socket.gethostname()

DEFAULTS = {
    "uk_url": os.environ.get("GREENTV_UK", "http://8.208.127.130:8781"),
    "local_green": os.environ.get("GREENTV_LOCAL", "http://127.0.0.1:8780"),
    "interval": 5.0,
    "key": "",          # 空=用 link.py 的默认/环境/文件来源
}


def load_config():
    cfg = dict(DEFAULTS)
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except Exception:
        pass
    if cfg.get("key"):
        link.set_passphrase(cfg["key"])
    return cfg


def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


CFG = load_config()

_q = queue.Queue()            # 后台线程 → GUI
_running = {"on": False}
_stat = {"uk": {}, "sent": 0, "recv": 0, "last_ok": 0, "last_up": None}


def log(msg):
    _q.put(("log", time.strftime("%H:%M:%S ") + msg))


def collect_global_data():
    """采集要上报给英国的『全球数据』= 深圳直连可见的各频道维度。
    优先读本机 greentv 网站 /api/channels；读不到则退化为心跳。"""
    try:
        r = requests.get(CFG["local_green"].rstrip("/") + "/api/channels", timeout=4)
        js = r.json()
        chans = []
        for c in js.get("channels", []):
            if c.get("dim") is not None and c.get("mode") in ("live", "demo"):
                chans.append({"id": c["id"], "dim": c["dim"], "mode": c["mode"],
                              "country": c.get("country")})
        return {"src": "shenzhen", "host": HOSTNAME, "ts": int(time.time()),
                "green": js.get("green", {}).get("dim"), "count": len(chans),
                "channels": chans}
    except Exception:
        return {"src": "shenzhen", "host": HOSTNAME, "ts": int(time.time()),
                "green": None, "count": 0, "channels": [], "note": "heartbeat"}


def _uk_web(url):
    """由英国探针地址(:8781)推出英国网页地址(:8780)。"""
    base = url.rstrip("/")
    if base.count(":") >= 2:
        base = base.rsplit(":", 1)[0]
    return base + ":8780"


def push_full_web(sess, url):
    """把本机网页 /api/channels 全量真实数据，加密推到英国网页 8780/sz_ingest，供英国对外展示。"""
    full = requests.get(CFG["local_green"].rstrip("/") + "/api/channels", timeout=4).json()
    sess.post(_uk_web(url) + "/sz_ingest", data=link.seal(full).encode("utf-8"),
              headers={"Content-Type": "text/plain; charset=utf-8"}, timeout=10)
    return len(full.get("channels", []))


def test_connection(url):
    """一次性测试：能否拉到并解密英国维度。"""
    try:
        r = requests.get(url.rstrip("/") + "/dims_enc", timeout=8)
        if r.status_code != 200:
            return False, "HTTP %s" % r.status_code
        d = link.unseal(r.text)
        return True, "在线 %d / 共 %d (round %s)" % (
            d.get("live", 0), d.get("total", 0), d.get("round"))
    except link.InvalidToken:
        return False, "解密失败：密钥不一致(指纹 %s)" % link.key_fingerprint()
    except Exception as e:
        return False, str(e)


def worker():
    sess = requests.Session()
    url = CFG["uk_url"].rstrip("/")
    interval = CFG["interval"]
    while _running["on"]:
        cycle_ok = False
        try:
            _q.put(("light", "yellow"))
            payload = collect_global_data()
            _stat["last_up"] = payload
            _q.put(("up", payload))
            token = link.seal(payload)
            r = sess.post(url + "/ingest", data=token.encode("utf-8"),
                          headers={"Content-Type": "text/plain; charset=utf-8"}, timeout=8)
            if r.status_code == 200:
                _stat["sent"] += 1
                log("⬆ 上报全球数据 %d 频道 (green=%s) → 英国 OK" %
                    (payload["count"], payload.get("green")))
                cycle_ok = True
            else:
                log("⬆ 上报失败 HTTP %s" % r.status_code)
        except Exception as e:
            log("⬆ 上报异常：%s" % e)

        # ①.5 推全量真实数据 → 英国网页(8780)，供任何人访问深圳真实数据
        try:
            n = push_full_web(sess, url)
            log("🌐 推全量 %d 频道 → 英国网页 8780 OK" % n)
            cycle_ok = True
        except Exception as e:
            log("🌐 全量推送异常：%s" % e)

        try:
            r = sess.get(url + "/dims_enc", timeout=8)
            if r.status_code == 200:
                data = link.unseal(r.text)
                _stat["uk"] = data
                _stat["recv"] += 1
                _q.put(("dims", data))
                log("⬇ 收到英国加密维度：%d 路在线 / 共 %d (round %s)" %
                    (data.get("live", 0), data.get("total", 0), data.get("round")))
                cycle_ok = True
            else:
                log("⬇ 拉取失败 HTTP %s" % r.status_code)
        except link.InvalidToken:
            log("⬇ 解密失败：两端密钥不一致！指纹=%s" % link.key_fingerprint())
        except Exception as e:
            log("⬇ 拉取异常：%s" % e)

        if cycle_ok:
            _stat["last_ok"] = time.time()
            _q.put(("light", "green"))
        else:
            _q.put(("light", "red"))

        for _ in range(int(max(1.0, interval) * 10)):
            if not _running["on"]:
                break
            time.sleep(0.1)
    _q.put(("light", "red"))
    log("已断开。")


# ---------------- GUI ----------------
class App:
    def __init__(self, root):
        self.root = root
        root.title("绿太阳 · 深圳客户端 ⇄ 英国")
        root.configure(bg="#0f1620")
        root.geometry("1000x720")

        top = tk.Frame(root, bg="#0f1620"); top.pack(fill="x", padx=14, pady=(12, 4))
        tk.Label(top, text="🛰 深圳 GUI 客户端", font=("Microsoft YaHei", 15, "bold"),
                 bg="#0f1620", fg="#7fd1ff").pack(side="left")
        self.lights = {}
        lf = tk.Frame(top, bg="#0f1620"); lf.pack(side="right")
        for k, c in (("red", "#ff4d4f"), ("yellow", "#ffc53d"), ("green", "#2ebd6b")):
            cv = tk.Canvas(lf, width=22, height=22, bg="#0f1620", highlightthickness=0)
            cv.pack(side="left", padx=3)
            self.lights[k] = (cv, cv.create_oval(3, 3, 19, 19, fill="#333", outline=""), c)

        try:
            import flagbar
            flagbar.attach(root, "#0f1620").pack(pady=(2, 4))
        except Exception:
            pass

        # 配置行 1：服务器 + 周期 + 连接/测试
        cfg1 = tk.Frame(root, bg="#0f1620"); cfg1.pack(fill="x", padx=14, pady=(6, 2))
        tk.Label(cfg1, text="英国服务器", bg="#0f1620", fg="#9fb3c8").pack(side="left")
        self.url_var = tk.StringVar(value=CFG["uk_url"])
        tk.Entry(cfg1, textvariable=self.url_var, width=30, bg="#1b2330", fg="#e6e6e6",
                 insertbackground="#fff").pack(side="left", padx=6)
        tk.Label(cfg1, text="周期s", bg="#0f1620", fg="#9fb3c8").pack(side="left")
        self.iv_var = tk.StringVar(value=str(CFG["interval"]))
        tk.Entry(cfg1, textvariable=self.iv_var, width=5, bg="#1b2330", fg="#e6e6e6",
                 insertbackground="#fff").pack(side="left", padx=6)
        self.btn = tk.Button(cfg1, text="▶ 连接", bg="#2ebd6b", fg="white", relief="flat",
                             font=("Microsoft YaHei", 10, "bold"), command=self.toggle)
        self.btn.pack(side="left", padx=8)
        tk.Button(cfg1, text="测试连接", bg="#3a6ea5", fg="white", relief="flat",
                  command=self.do_test).pack(side="left")

        # 配置行 2：密钥 + 指纹 + 保存
        cfg2 = tk.Frame(root, bg="#0f1620"); cfg2.pack(fill="x", padx=14, pady=(2, 6))
        tk.Label(cfg2, text="共享密钥", bg="#0f1620", fg="#9fb3c8").pack(side="left")
        self.key_var = tk.StringVar(value=CFG.get("key", ""))
        self.key_entry = tk.Entry(cfg2, textvariable=self.key_var, width=30, show="•",
                                  bg="#1b2330", fg="#e6e6e6", insertbackground="#fff")
        self.key_entry.pack(side="left", padx=6)
        self.show_var = tk.IntVar(value=0)
        tk.Checkbutton(cfg2, text="显示", variable=self.show_var, command=self.toggle_show,
                       bg="#0f1620", fg="#9fb3c8", selectcolor="#1b2330",
                       activebackground="#0f1620").pack(side="left")
        tk.Button(cfg2, text="应用并保存配置", bg="#7a5cff", fg="white", relief="flat",
                  command=self.apply_save).pack(side="left", padx=8)
        self.fp_lbl = tk.Label(cfg2, text="", bg="#0f1620", fg="#6c7a89")
        self.fp_lbl.pack(side="left", padx=8)
        self.update_fp()

        self.summary = tk.Label(root, text="未连接", font=("Consolas", 11),
                                bg="#0f1620", fg="#cfe8ff", anchor="w", justify="left")
        self.summary.pack(fill="x", padx=14, pady=4)

        # 英国维度表
        mid = tk.Frame(root, bg="#0f1620"); mid.pack(fill="both", expand=True, padx=14, pady=4)
        cols = ("id", "name", "country", "dim", "mode", "age")
        self.tree = ttk.Treeview(mid, columns=cols, show="headings", height=12)
        for c, w in zip(cols, (90, 220, 70, 70, 80, 70)):
            self.tree.heading(c, text={"id": "频道", "name": "界名", "country": "国家",
                                        "dim": "维度", "mode": "状态", "age": "时延s"}[c])
            self.tree.column(c, width=w, anchor="center")
        self.tree.pack(side="left", fill="both", expand=True)
        sb = ttk.Scrollbar(mid, command=self.tree.yview); sb.pack(side="right", fill="y")
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.tag_configure("live", foreground="#9fd3a0")
        self.tree.tag_configure("down", foreground="#e08a8a")

        # 底部：上报预览 + 日志
        bottom = tk.Frame(root, bg="#0f1620"); bottom.pack(fill="x", padx=14, pady=4)
        lfb = tk.Frame(bottom, bg="#0f1620"); lfb.pack(side="left", fill="both", expand=True)
        tk.Label(lfb, text="本次上报英国的全球数据", bg="#0f1620", fg="#9fb3c8", anchor="w").pack(fill="x")
        self.up_box = tk.Text(lfb, height=7, bg="#0a0f15", fg="#9fd3c8",
                              font=("Consolas", 9), wrap="none")
        self.up_box.pack(fill="both", expand=True)
        rfb = tk.Frame(bottom, bg="#0f1620"); rfb.pack(side="right", fill="both", expand=True)
        tk.Label(rfb, text="日志", bg="#0f1620", fg="#9fb3c8", anchor="w").pack(fill="x")
        self.logbox = tk.Text(rfb, height=7, bg="#0a0f15", fg="#9fd3a0",
                              font=("Consolas", 9), wrap="none")
        self.logbox.pack(fill="both", expand=True)

        self.set_light("red")
        self.root.after(300, self.pump)

    # --- 小工具 ---
    def update_fp(self):
        enc = "加密 ✓" if link.encryption_on() else "明文(未装cryptography)"
        self.fp_lbl.config(text="🔑 %s 指纹 %s" % (enc, link.key_fingerprint()))

    def toggle_show(self):
        self.key_entry.config(show="" if self.show_var.get() else "•")

    def set_light(self, on):
        for k, (cv, oid, c) in self.lights.items():
            cv.itemconfig(oid, fill=c if k == on else "#333")

    def _gather_cfg(self):
        try:
            iv = max(1.0, float(self.iv_var.get()))
        except Exception:
            iv = 5.0
        return {"uk_url": self.url_var.get().strip().rstrip("/"),
                "local_green": CFG.get("local_green", DEFAULTS["local_green"]),
                "interval": iv, "key": self.key_var.get().strip()}

    def apply_save(self):
        global CFG
        CFG = self._gather_cfg()
        link.set_passphrase(CFG["key"])
        self.update_fp()
        ok = save_config(CFG)
        messagebox.showinfo("配置", ("已保存到 %s\n密钥指纹 %s\n\n请确保英国端用相同密钥(相同指纹)。"
                            % (CONFIG_PATH, link.key_fingerprint())) if ok
                            else "保存失败（目录不可写）。配置仍在本次运行生效。")
        log("配置已应用：%s 周期%ss 指纹%s" % (CFG["uk_url"], CFG["interval"], link.key_fingerprint()))

    def do_test(self):
        global CFG
        CFG = self._gather_cfg()
        link.set_passphrase(CFG["key"])
        self.update_fp()
        ok, msg = test_connection(CFG["uk_url"])
        (messagebox.showinfo if ok else messagebox.showwarning)("测试连接",
            ("✓ 成功：" if ok else "✗ 失败：") + msg)

    def toggle(self):
        global CFG
        if _running["on"]:
            _running["on"] = False
            self.btn.config(text="▶ 连接", bg="#2ebd6b")
        else:
            CFG = self._gather_cfg()
            link.set_passphrase(CFG["key"])
            self.update_fp()
            _running["on"] = True
            self.btn.config(text="⏸ 断开", bg="#d9534f")
            threading.Thread(target=worker, daemon=True).start()
            log("连接英国 %s，周期 %ss，指纹 %s" % (CFG["uk_url"], CFG["interval"], link.key_fingerprint()))

    def pump(self):
        try:
            while True:
                kind, val = _q.get_nowait()
                if kind == "log":
                    self.logbox.insert("end", val + "\n"); self.logbox.see("end")
                    if int(self.logbox.index("end-1c").split(".")[0]) > 500:
                        self.logbox.delete("1.0", "100.0")
                elif kind == "light":
                    self.set_light(val)
                elif kind == "dims":
                    self.render(val)
                elif kind == "up":
                    self.render_up(val)
        except queue.Empty:
            pass
        self.root.after(300, self.pump)

    def render_up(self, p):
        self.up_box.delete("1.0", "end")
        lines = ["主机 %s   时间 %s" % (p.get("host"), time.strftime("%H:%M:%S", time.localtime(p.get("ts", 0)))),
                 "综合 green = %s   上报频道数 = %s" % (p.get("green"), p.get("count"))]
        if p.get("note") == "heartbeat":
            lines.append("(本机 greentv :8780 未开 → 仅发心跳)")
        for c in p.get("channels", [])[:12]:
            lines.append("  %-8s dim=%-6s %s %s" % (c.get("id"), c.get("dim"),
                                                    c.get("mode"), c.get("country") or ""))
        self.up_box.insert("end", "\n".join(lines))

    def render(self, data):
        dims = data.get("dims", {})
        now = int(time.time())
        self.summary.config(text=(
            "英国探针：在线 %d / 共 %d   轮次 %s   更新于 %ds 前   "
            "已上报 %d 次 · 已接收 %d 次" % (
                data.get("live", 0), data.get("total", 0), data.get("round", "?"),
                max(0, now - data.get("ts", now)), _stat["sent"], _stat["recv"])))
        self.tree.delete(*self.tree.get_children())
        rows = sorted(dims.items(), key=lambda kv: (kv[1].get("mode") != "live", kv[0]))
        for cid, d in rows:
            age = max(0, now - d.get("ts", now))
            tag = "live" if d.get("mode") == "live" else "down"
            self.tree.insert("", "end", tags=(tag,), values=(
                cid, d.get("name", ""), d.get("country", ""),
                d.get("dim") if d.get("dim") is not None else "—", d.get("mode", "?"), age))


def main():
    root = tk.Tk()
    try:
        style = ttk.Style(); style.theme_use("clam")
        style.configure("Treeview", background="#121a24", fieldbackground="#121a24",
                        foreground="#e6e6e6", rowheight=22)
        style.configure("Treeview.Heading", background="#1b2330", foreground="#7fd1ff")
    except Exception:
        pass
    App(root)
    try:
        import tray
        tray.attach(root, "绿太阳·深圳客户端",
                    os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo_sz.ico"))
    except Exception:
        pass
    root.mainloop()


if __name__ == "__main__":
    main()
