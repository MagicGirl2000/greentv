# -*- coding: utf-8 -*-
"""
cafe_client.py — 【网吧端遥控小工具】(3.5109)

在任意一台能上网的电脑(网吧机)上，带对口令即可加密遥控深圳的训练。
只需三个文件：link.py + cafe_client.py + (口令)。口令用环境变量 GREENTV_KEY 传，
不落地、不写文件，离开网吧不留痕。

用法(先 set GREENTV_KEY=两端同口令)：
    python cafe_client.py start --steps 60 --refresh-every 5   # 启动持续训练
    python cafe_client.py pause       # 挂起
    python cafe_client.py resume      # 恢复
    python cafe_client.py stop        # 停止
    python cafe_client.py status      # 看最新进度
    python cafe_client.py watch       # 每10秒刷新进度（盯着看）
环境：GREENTV_TM_URL(默认 http://8.208.127.130:8795)
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass
import time
import argparse
import urllib.request

_H = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [_H, os.path.dirname(_H)]   # link.py 在本目录或父目录均可
import link

TM = os.environ.get("GREENTV_TM_URL", "http://8.208.127.130:8780").rstrip("/")  # 训练信道焊进一体机主站:8780


def post(path, obj, timeout=20):
    data = link.seal(obj).encode("ascii")
    req = urllib.request.Request(TM + path, data=data, headers={"content-type": "text/plain"})
    return link.unseal(urllib.request.urlopen(req, timeout=timeout).read().decode("ascii"))


def show_status():
    r = post("/tm/status", {"who": "cafe"})
    s = r.get("status", {}) or {}
    age = int(time.time()) - r.get("status_ts", 0)
    print("─" * 48)
    print("状态: %-12s 轮次: %-4s 步: %-5s" % (s.get("state", "?"), s.get("round", "-"), s.get("step", "-")))
    print("loss: %-8s eval_loss: %-8s best: %-8s" %
          (s.get("loss", "-"), s.get("eval_loss", "-"), s.get("best_eval", "-")))
    print("循环存活: %s  待办指令: %s  数据新鲜度: %ds前" %
          (s.get("loop_alive", "?"), r.get("pending", 0), age))
    if s.get("msg"):
        print("信息: " + str(s["msg"]))
    if s.get("log_tail"):
        print("日志尾:\n" + s["log_tail"].rstrip())
    print("─" * 48)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["start", "pause", "resume", "stop", "status", "watch", "ping"])
    ap.add_argument("--steps", type=int, default=60)
    ap.add_argument("--refresh-every", type=int, default=5)
    args = ap.parse_args()

    if args.action == "ping":
        print(link.unseal(urllib.request.urlopen(TM + "/hub/ping", timeout=15).read().decode("ascii")))
        return
    if args.action == "status":
        show_status(); return
    if args.action == "watch":
        try:
            while True:
                show_status(); time.sleep(10)
        except KeyboardInterrupt:
            return
    if args.action == "start":
        cmd = {"action": "start", "steps": args.steps, "refresh_every": args.refresh_every}
    else:
        cmd = {"action": args.action}
    r = post("/tm/push", cmd)
    print("已投递指令: %s → %s" % (cmd, r))
    print("（深圳守护每几秒轮询一次，稍等用 status 看效果）")


if __name__ == "__main__":
    main()
