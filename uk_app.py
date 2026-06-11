# -*- coding: utf-8 -*-
"""
uk_app.py — 【英国一体机】单一入口，单进程同时启动：
  ① 网页服务 GreenIndex（server.py：HTTP :8780 + 伦敦HTTP代理 :8782 + HTTPS :8443）
  ② 探针服务 + GUI（uk_gui.py：:8781 /dims_enc /dims /ingest，加密回传 + 接收深圳上报）
打包成单 exe 双击即用；数据库、卫星云图写在 exe 同目录（GREENTV_DATA）。
内置：HTTPS 证书 cert.pem/key.pem、跨境口令 link_key.txt、代理令牌 proxy_token.txt。
"""
import os
import sys
import shutil
import threading
import time


def _res_dir():
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def _data_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


RES = _res_dir()
DATA = _data_dir()
os.environ.setdefault("GREENTV_DATA", DATA)

# 从内置密钥文件注入环境变量（各模块按环境变量优先读取，跨境口令/代理令牌两端一致）
for _fn, _ev in (("link_key.txt", "GREENTV_KEY"), ("proxy_token.txt", "GREENTV_PROXY_TOKEN")):
    _p = os.path.join(RES, _fn)
    if os.path.exists(_p) and not os.environ.get(_ev):
        try:
            v = open(_p, encoding="utf-8").read().strip()
            if v:
                os.environ[_ev] = v
        except Exception:
            pass

# 英国服务默认环境
os.environ.setdefault("GREENTV_CN_ONLY", "0")
os.environ.setdefault("GREENTV_GLOBAL", "1")          # 全球频道列表（供浏览/点播）
os.environ.setdefault("GREENTV_DEMO_ONLY", "1")       # 英国不开重采样
os.environ.setdefault("GREENTV_NO_DEMO", "1")         # 无数据即断连
os.environ.setdefault("GREENTV_READ_CN", "1")         # 本机直读中国频道(全球可达)
os.environ.setdefault("GREENTV_PROXY_SERVE", "1")     # 伦敦HTTP代理 :8782
os.environ.setdefault("GREENTV_HTTPS", "1")           # HTTPS :8443 (cert.pem/key.pem)
os.environ.setdefault("GREENTV_UK", "http://127.0.0.1:8781")
PORT = int(os.environ.get("GREENTV_PORT", "8780"))


def ensure_assets():
    """把打包内的 static / 证书 复制到可写目录(Flask 服务 + 卫星云图写入 + 证书读取)。"""
    src = os.path.join(RES, "static")
    dst = os.path.join(DATA, "static")
    os.makedirs(dst, exist_ok=True)
    if os.path.isdir(src) and os.path.abspath(src) != os.path.abspath(dst):
        for fn in os.listdir(src):
            if fn == "cloud_cn.jpg" and os.path.exists(os.path.join(dst, fn)):
                continue
            try:
                shutil.copy2(os.path.join(src, fn), os.path.join(dst, fn))
            except Exception:
                pass
    # 证书复制到 exe 同目录(server 读 HERE，frozen 时 HERE=_MEIPASS 已含；额外放一份到 DATA 方便替换为正式证书)
    for fn in ("cert.pem", "key.pem"):
        s = os.path.join(RES, fn)
        if os.path.exists(s) and not os.path.exists(os.path.join(DATA, fn)):
            try:
                shutil.copy2(s, os.path.join(DATA, fn))
            except Exception:
                pass
    return dst


STATIC = ensure_assets()


def start_web():
    import server
    try:
        server.app.static_folder = STATIC
        server._start_readers()
    except Exception as e:
        print("web init err:", e)
    server.app.run(host="0.0.0.0", port=PORT, threaded=True, use_reloader=False)


def main():
    threading.Thread(target=start_web, daemon=True).start()
    time.sleep(1.2)                          # 让网页先起
    import uk_gui
    uk_gui.start_services()                  # 探针 :8781
    uk_gui.build_gui()                        # 主线程跑 GUI（阻塞）


if __name__ == "__main__":
    main()
