# -*- coding: utf-8 -*-
"""flagbar.py — GUI 国旗条 + 致谢说明。英国/中国/绿黑红(3.4Pszm)/美国 四旗 + 三行说明。
供 uk_gui / shenzhen_gui 共用；打包后从 _MEIPASS/static 取图。"""
import os
import sys

CREDITS = ("英国伦敦 提供场地与互联网服务商 · 中国 提供创意与技术支持 · 3.4小组 提供便利研究服务\n"
           "GitHub 作者 MagicGirl2000 创意 · 美国 Claude Code CLI 终极技术支持\n"
           "全球提供电视频道视/音频数据 · 腾讯 提供可能的技术测试与上报 · 阿里巴巴 提供基础服务器 · "
           "Microsoft 提供基础操作系统服务 · 北京奇虎360 提供终极安全防火墙与涉密项目保护\n"
           "作者因 Amélie Poulain（2001）电影受到无限启发")


def _base():
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def attach(parent, bg="#0f1620"):
    import tkinter as tk
    wrap = tk.Frame(parent, bg=bg)
    row = tk.Frame(wrap, bg=bg)
    row.pack()
    imgs = []
    for fn in ("uk_flag.png", "cn_flag.png", "gbr_flag.png", "us_flag.png", "fr_flag.png"):
        p = os.path.join(_base(), "static", fn)
        if not os.path.exists(p):
            p = os.path.join(_base(), fn)
        if os.path.exists(p):
            try:
                im = tk.PhotoImage(file=p)
                lbl = tk.Label(row, image=im, bg=bg)
                lbl.image = im
                lbl.pack(side="left", padx=6)
                imgs.append(im)
            except Exception:
                pass
    tk.Label(wrap, text=CREDITS, bg=bg, fg="#8b97a6", font=("Microsoft YaHei", 8),
             justify="center", wraplength=940).pack(pady=(3, 2))
    wrap._imgs = imgs
    return wrap
