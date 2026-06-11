# -*- coding: utf-8 -*-
"""
shenzhen_app.py — 【深圳一体端】单一入口：同一进程内同时启动
  ① 网页服务 GreenIndex（Flask，默认 :8780，含修复后的K线 + 进入弹窗）
  ② 深圳客户端 GUI（⇄ 英国服务器，加密上报全球数据 / 接收加密维度）
打包成单 exe 后双击即用；数据库与卫星云图写在 exe 同目录（GREENTV_DATA）。
环境变量：GREENTV_PORT(默认8780) GREENTV_CN_ONLY(默认0=全量) GREENTV_UK GREENTV_KEY
"""
import os
import sys
import shutil
import threading
import time


def _res_dir():
    """只读资源目录：打包后=解包临时目录(_MEIPASS)，源码运行=脚本目录。"""
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def _data_dir():
    """可写数据目录：打包后=exe同目录，源码运行=脚本目录。"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


RES = _res_dir()
DATA = _data_dir()
os.environ.setdefault("GREENTV_DATA", DATA)         # 各模块的可写库都落这里
os.environ.setdefault("GREENTV_CN_ONLY", "0")        # 深圳主服务=全量
os.environ.setdefault("GREENTV_NO_DEMO", "1")        # 无数据即断连，不造演示数据
os.environ.setdefault("GREENTV_GLOBAL", "1")         # 全球频道(iptv-org 174国/783台 + 中国)
os.environ.setdefault("GREENTV_ROTATE", "1")         # 轮转采样(几百路也扛得住，必须开)
os.environ.setdefault("GREENTV_VIDEO", "1")          # 视频+音频联合分析(本机显卡解码)
os.environ.setdefault("GREENTV_TICK_CN", "19")       # 19秒采样
os.environ.setdefault("GREENTV_TICK_INTL", "19")
# 国际源经【伦敦HTTP代理(英国IP)】下载，绕开对华地域限制/慢路由；中国源直连。伦敦端需运行 london_proxy。
# 令牌(防开放代理滥用)放 gitignored 的 proxy_token.txt，不进公开仓库；构成 http://gt:<令牌>@伦敦:8782。
def _proxy_url():
    host = os.environ.get("GREENTV_PROXY_HOST", "8.208.127.130:8782")
    tok = os.environ.get("GREENTV_PROXY_TOKEN")
    if not tok:
        for d in (RES, DATA):
            f = os.path.join(d, "proxy_token.txt")
            if os.path.exists(f):
                try:
                    tok = open(f, encoding="utf-8").read().strip()
                    break
                except Exception:
                    pass
    return "http://gt:%s@%s" % (tok, host) if tok else ""


_pu = _proxy_url()
if _pu:
    os.environ.setdefault("GREENTV_PROXY", _pu)
PORT = int(os.environ.get("GREENTV_PORT", "8780"))


def ensure_static():
    """把打包内的 static 复制到可写目录(供 Flask 服务 + 卫星云图写入)。"""
    src = os.path.join(RES, "static")
    dst = os.path.join(DATA, "static")
    os.makedirs(dst, exist_ok=True)
    if os.path.isdir(src) and os.path.abspath(src) != os.path.abspath(dst):
        for fn in os.listdir(src):
            if fn == "cloud_cn.jpg" and os.path.exists(os.path.join(dst, fn)):
                continue                              # 保留已生成的云图
            try:
                shutil.copy2(os.path.join(src, fn), os.path.join(dst, fn))
            except Exception:
                pass
    return dst


STATIC = ensure_static()


def start_web():
    import server
    try:
        server.app.static_folder = STATIC            # 指向可写副本
        server._start_readers()                      # 频道读取 + ticker + uk_poller + 天气 + 卫星
    except Exception as e:
        print("web init err:", e)
    server.app.run(host="0.0.0.0", port=PORT, threaded=True, use_reloader=False)


def main():
    threading.Thread(target=start_web, daemon=True).start()
    time.sleep(1.0)                                   # 让网页服务先起，客户端可读本机 /api/channels
    import shenzhen_gui
    shenzhen_gui.main()                               # 主线程跑 tkinter GUI（阻塞）


if __name__ == "__main__":
    main()
