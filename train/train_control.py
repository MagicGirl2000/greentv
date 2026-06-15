# -*- coding: utf-8 -*-
"""
train_control.py — 【深圳·训练遥控守护】(3.5109)

常驻深圳本机：每隔几秒向英国信箱 pull 加密指令并执行，同时把本地 status.json + loop.log
尾部 report 回英国，供网吧端读取。深圳只做出站请求，无需公网入站端口。

指令(网吧端 push)：
  {action:"start", steps:60, refresh_every:5}   启动持续循环训练(子进程)
  {action:"pause"}    挂起(跑完当前轮)        {action:"resume"} 恢复
  {action:"stop"}     干净停止                {action:"status"} 仅触发一次回传

启动：  set GREENTV_KEY=<两端同口令>
        python train_control.py
环境：GREENTV_TM_URL(默认 http://8.208.127.130:8795)  POLL_SEC(默认5)
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass
import json
import time
import subprocess
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
# link.py 可能在本目录(网吧部署)或父目录 greentv/(深圳本机)，两处都加进搜索路径
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import link

PY = sys.executable
TM = os.environ.get("GREENTV_TM_URL", "http://8.208.127.130:8795").rstrip("/")
POLL = int(os.environ.get("GREENTV_TM_POLL", "5"))
STATUS = os.path.join(HERE, "status.json")
CONTROL = os.path.join(HERE, "control.json")
LOOPLOG = os.path.join(HERE, "loop.log")

_loop_proc = None        # train_loop 子进程句柄


def _post(path, obj, timeout=20):
    data = link.seal(obj).encode("ascii")
    req = urllib.request.Request(TM + path, data=data, headers={"content-type": "text/plain"})
    return link.unseal(urllib.request.urlopen(req, timeout=timeout).read().decode("ascii"))


def set_control(state):
    json.dump({"state": state}, open(CONTROL, "w", encoding="utf-8"))


def read_status():
    s = {}
    if os.path.exists(STATUS):
        try:
            s = json.load(open(STATUS, encoding="utf-8"))
        except Exception:
            pass
    tail = ""
    if os.path.exists(LOOPLOG):
        try:
            tail = "".join(open(LOOPLOG, encoding="utf-8").readlines()[-6:])
        except Exception:
            pass
    s["loop_alive"] = bool(_loop_proc and _loop_proc.poll() is None)
    s["log_tail"] = tail
    return s


def start_loop(steps, refresh_every):
    global _loop_proc
    if _loop_proc and _loop_proc.poll() is None:
        return "已在运行"
    set_control("run")
    _loop_proc = subprocess.Popen(
        [PY, "train_loop.py", "--steps", str(steps), "--refresh-every", str(refresh_every)],
        cwd=HERE)
    return "已启动 pid=%s" % _loop_proc.pid


def handle(cmd):
    a = (cmd.get("action") or "").lower()
    if a == "start":
        return start_loop(int(cmd.get("steps", 60)), int(cmd.get("refresh_every", 5)))
    if a in ("pause", "resume", "stop"):
        set_control("run" if a == "resume" else a)
        return "control=%s" % ("run" if a == "resume" else a)
    if a == "status":
        return "ok"
    return "未知指令: %s" % a


def main():
    print("🟢 深圳训练遥控守护启动  信箱=%s  口令指纹=%s  轮询=%ds" %
          (TM, link.key_fingerprint(), POLL))
    # 启动先报到一次（确认与英国口令一致）
    try:
        png = _post("/tm/report", {"status": {"state": "controller_online",
                                              "msg": "深圳遥控守护已上线", "ts": int(time.time())}})
        print("已向英国报到:", png)
    except Exception as e:
        print("⚠️ 连英国信箱失败(检查英国是否启动 uk_train_mailbox / 口令是否一致):", str(e)[:120])

    while True:
        try:
            r = _post("/tm/pull", {"who": "sz"})
            for cmd in r.get("cmds", []):
                res = handle(cmd)
                print("执行指令 %s → %s" % (cmd, res))
        except Exception as e:
            print("pull 异常:", str(e)[:100])
        # 回传进度
        try:
            _post("/tm/report", {"status": read_status()})
        except Exception as e:
            print("report 异常:", str(e)[:100])
        time.sleep(POLL)


if __name__ == "__main__":
    main()
