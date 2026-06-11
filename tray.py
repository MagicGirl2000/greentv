# -*- coding: utf-8 -*-
"""tray.py — 右下角系统托盘驻留 + 右键『退出=全盘退出』。供 uk_gui / shenzhen_gui 共用。
关闭窗口(X)= 收进托盘后台继续运行；托盘左键/『打开界面』= 还原窗口；『退出』= 连子进程一起杀。"""
import os
import sys
import threading
import subprocess

_NOWIN = 0x08000000 if os.name == "nt" else 0


def _find_icon(icon_file):
    cands = [icon_file,
             os.path.join(getattr(sys, "_MEIPASS", "."), os.path.basename(icon_file)),
             os.path.join(os.path.dirname(os.path.abspath(__file__)), os.path.basename(icon_file))]
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


def full_exit():
    """全盘退出：taskkill /T 连同 ffmpeg 等子进程一起结束，再 os._exit。"""
    try:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(os.getpid())],
                       creationflags=_NOWIN,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
    except Exception:
        pass
    os._exit(0)


def attach(root, title, icon_file):
    """给 tkinter root 挂托盘。失败(无pystray)则退化为：关闭窗口即全盘退出。"""
    try:
        import pystray
        from PIL import Image
    except Exception:
        root.protocol("WM_DELETE_WINDOW", full_exit)
        return None

    p = _find_icon(icon_file)
    try:
        img = Image.open(p) if p else Image.new("RGB", (64, 64), (46, 189, 107))
    except Exception:
        img = Image.new("RGB", (64, 64), (46, 189, 107))

    def show(icon=None, item=None):
        try:
            root.after(0, lambda: (root.deiconify(), root.lift(), root.focus_force()))
        except Exception:
            pass

    def quit_all(icon=None, item=None):
        try:
            icon.stop()
        except Exception:
            pass
        full_exit()

    menu = pystray.Menu(
        pystray.MenuItem("打开界面", show, default=True),
        pystray.MenuItem("退出（全盘退出）", quit_all),
    )
    icon = pystray.Icon(title, img, title, menu)
    threading.Thread(target=icon.run, daemon=True).start()
    root.protocol("WM_DELETE_WINDOW", lambda: root.withdraw())   # 关闭=收进托盘
    return icon
