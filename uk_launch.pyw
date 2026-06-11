# -*- coding: utf-8 -*-
"""
uk_launch.pyw — 英国服务【一键启动】：同时拉起 探针(uk_gui:8781) + 网页服务(server:8780)。
用 pythonw 运行，无控制台窗口；已在跑的端口会自动跳过(不重复启动)。
网页在英国走轻量演示模式(GREENTV_DEMO_ONLY=1)，不开 ffmpeg，避免 2G 小内存被拖垮。
"""
import os
import sys
import socket
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
PYW = sys.executable                      # 本身就是 pythonw.exe
NOWIN = 0x08000000 if os.name == "nt" else 0


def busy(port):
    s = socket.socket(); s.settimeout(0.4)
    try:
        s.connect(("127.0.0.1", port)); s.close(); return True
    except Exception:
        return False


def main():
    started = []
    # 探针 8781（带界面+托盘）
    if not busy(8781):
        subprocess.Popen([PYW, "uk_gui.py"], cwd=HERE, creationflags=NOWIN)
        started.append("探针 :8781")
    # 网页 8780（轻量演示模式）
    if not busy(8780):
        env = dict(os.environ, GREENTV_CN_ONLY="0", GREENTV_DEMO_ONLY="1", GREENTV_NO_DEMO="1",
                   GREENTV_READ_CN="1",                  # 英国本机直读中国频道(全球可达)
                   GREENTV_GLOBAL="1",                   # 全球820台列表(供浏览+点播)；英国不本地分析(无ROTATE/VIDEO)
                   GREENTV_PROXY_SERVE="1",              # 英国HTTP代理:8782(深圳国际源经此英国IP下载，绕开对华封锁)
                   GREENTV_HTTPS="1",                    # 同站HTTPS:8443(证书 cert.pem/key.pem)
                   GREENTV_UK="http://127.0.0.1:8781")   # 同机探针走本地回环(公网EIP hairpin不通)
        subprocess.Popen([PYW, "server.py"], cwd=HERE, creationflags=NOWIN, env=env)
        started.append("网页 :8780")

    try:
        import tkinter as tk
        from tkinter import messagebox
        r = tk.Tk(); r.withdraw()
        msg = ("英国服务已启动：\n\n  网页  http://本机IP:8780/\n  探针  http://本机IP:8781/dims_enc\n\n"
               "本次启动：%s" % ("、".join(started) if started else "无(都已在运行)"))
        messagebox.showinfo("绿太阳 · 英国服务", msg)
        r.destroy()
    except Exception:
        pass


if __name__ == "__main__":
    main()
