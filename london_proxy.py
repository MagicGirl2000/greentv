# -*- coding: utf-8 -*-
"""london_proxy.py — 【伦敦探针·HTTP正向代理】。
深圳的 ffmpeg 通过 -http_proxy 指向本代理 → 用伦敦的英国IP去下载国际直播流的原始字节，
回传给深圳本机解码分析。伦敦只转发字节(不解码)，绕开对中国的地域限制/慢路由。
支持：CONNECT 隧道(https/TLS 透传) + 绝对URI GET(http)。可选 token 鉴权防开放滥用。
启动：python london_proxy.py  (端口 GREENTV_PROXY_PORT，默认 8782；令牌 GREENTV_PROXY_TOKEN)
"""
import os
import base64
import socket
import select
import threading

PORT = int(os.environ.get("GREENTV_PROXY_PORT", "8782"))


def _load_token():
    """令牌鉴权(防公网开放代理被滥用)。来源：环境变量 GREENTV_PROXY_TOKEN > 同目录 proxy_token.txt > 占位符。
    真实令牌放 gitignored 的 proxy_token.txt，不进公开仓库；深圳侧用 http://gt:<令牌>@伦敦:8782 连接。"""
    t = os.environ.get("GREENTV_PROXY_TOKEN")
    if t:
        return t.strip()
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "proxy_token.txt")
    try:
        if os.path.exists(f):
            v = open(f, encoding="utf-8").read().strip()
            if v:
                return v
    except Exception:
        pass
    return "CHANGE_ME_set_proxy_token.txt"          # 占位符：克隆者请自行设置 proxy_token.txt


TOKEN = _load_token()
CONNECT_TIMEOUT = 15


def _pipe(a, b):
    """双向转发，任一端关闭即结束。"""
    socks = [a, b]
    try:
        while True:
            r, _, x = select.select(socks, [], socks, 60)
            if x or not r:
                break
            for s in r:
                try:
                    data = s.recv(65536)
                except Exception:
                    return
                if not data:
                    return
                (b if s is a else a).sendall(data)
    except Exception:
        pass
    finally:
        for s in (a, b):
            try:
                s.close()
            except Exception:
                pass


def _read_headers(sock):
    buf = b""
    while b"\r\n\r\n" not in buf:
        d = sock.recv(4096)
        if not d:
            break
        buf += d
        if len(buf) > 65536:
            break
    return buf


def _auth_ok(head):
    """校验 Proxy-Authorization: Basic base64(user:pass)，令牌匹配 user 或 pass 即放行。"""
    if not TOKEN:
        return True
    for line in head.split("\r\n"):
        if line.lower().startswith("proxy-authorization:"):
            val = line.split(":", 1)[1].strip()
            parts = val.split(None, 1)
            if len(parts) == 2 and parts[0].lower() == "basic":
                try:
                    creds = base64.b64decode(parts[1]).decode("latin1", "ignore")
                except Exception:
                    return False
                return TOKEN in creds.split(":")
    return False


def handle(client, addr):
    try:
        head = _read_headers(client)
        if not head:
            client.close(); return
        line = head.split(b"\r\n", 1)[0].decode("latin1", "ignore")
        parts = line.split(" ")
        if len(parts) < 2:
            client.close(); return
        method, target = parts[0].upper(), parts[1]
        if not _auth_ok(head.decode("latin1", "ignore")):
            client.sendall(b"HTTP/1.1 407 Proxy Authentication Required\r\n"
                           b"Proxy-Authenticate: Basic realm=\"london\"\r\n"
                           b"Content-Length: 0\r\n\r\n")
            client.close(); return
        if method == "CONNECT":                                  # https/TLS 隧道
            host, _, port = target.partition(":")
            port = int(port or "443")
            try:
                up = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT)
            except Exception:
                client.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n"); client.close(); return
            client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            _pipe(client, up)
        elif target.startswith("http://"):                       # 明文 http 绝对URI
            rest = target[7:]
            host = rest.split("/", 1)[0]
            host, _, port = host.partition(":")
            port = int(port or "80")
            try:
                up = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT)
                up.sendall(head)                                 # 原样转发请求(含绝对URI，多数源站可接受)
            except Exception:
                client.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n"); client.close(); return
            _pipe(client, up)
        else:
            client.sendall(b"HTTP/1.1 400 Bad Request\r\n\r\n"); client.close()
    except Exception:
        try:
            client.close()
        except Exception:
            pass


def serve(port=None):
    port = port or PORT
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", port))
    srv.listen(128)
    print("london_proxy 监听 :%d  鉴权=%s" % (port, "开" if TOKEN else "关"))
    while True:
        try:
            c, a = srv.accept()
            threading.Thread(target=handle, args=(c, a), daemon=True).start()
        except Exception:
            pass


def start(port=None):
    t = threading.Thread(target=serve, args=(port,), daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    serve()
