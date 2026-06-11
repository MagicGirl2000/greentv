# -*- coding: utf-8 -*-
"""stop_server.py — 停止绿太阳服务器：杀掉占用 8780/8781 的进程(连同子进程ffmpeg)。
用 pythonw 运行无控制台窗口；结束后弹一个小提示框(无cmd弹窗)。"""
import os
import subprocess

_NOWIN = 0x08000000 if os.name == "nt" else 0


def pids_on(ports):
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True,
                             creationflags=_NOWIN, timeout=10).stdout
    except Exception:
        return set()
    pids = set()
    for line in out.splitlines():
        if "LISTENING" not in line:
            continue
        for p in ports:
            if (":%d " % p) in line or line.rstrip().endswith(":%d" % p) or (":%d\t" % p) in line:
                parts = line.split()
                if parts and parts[-1].isdigit():
                    pids.add(parts[-1])
    return pids


def main():
    killed = []
    for pid in pids_on([8780, 8781]):
        r = subprocess.run(["taskkill", "/F", "/T", "/PID", pid], creationflags=_NOWIN,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode == 0:
            killed.append(pid)
    subprocess.run(["taskkill", "/F", "/IM", "ffmpeg.exe"], creationflags=_NOWIN,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        import tkinter as tk
        from tkinter import messagebox
        r = tk.Tk(); r.withdraw()
        messagebox.showinfo("绿太阳", "服务器已停止。\n结束进程：%s" % (", ".join(killed) or "无(未在运行)"))
        r.destroy()
    except Exception:
        pass


if __name__ == "__main__":
    main()
