# -*- coding: utf-8 -*-
"""uk_probe.py — 【英国探针·无界面】只启探针 Flask(:8781)+ 采样 worker，不跑 Tkinter，
适合服务器后台/无桌面会话稳定运行。采样列表与网站一致(channels_global.json，GREENTV_GLOBAL=1)。"""
import time
import uk_gui

if __name__ == "__main__":
    uk_gui.start_services()
    while True:
        time.sleep(3600)
