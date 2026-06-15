# -*- coding: utf-8 -*-
"""
train_loop.py — 【持续循环训练编排】无人值守跑：教师产数据 → 微调一轮 → 验证留最优 → 再来。

一轮 = 调 qlora_train.py 跑一轮(子进程，每轮独立、崩了不拖垮整体)。每 REFRESH_EVERY 轮
先调 teacher_distill.py 让 32b 补充/刷新数据。全程看 control.json：
  · run   正常跑
  · pause 跑完当前轮后挂起，等恢复
  · stop  跑完当前轮后干净退出
你在网吧通过 英国信箱 改 control.json（train_control.py 落地），即可远程启停。

防坍缩：真正的安全阀在 qlora_train.py（只在 eval 变好时更新 out/best）。本编排只负责调度。

用法：  python train_loop.py --steps 60 --refresh-every 5
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass
import json
import time
import argparse
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
STATUS = os.path.join(HERE, "status.json")
CONTROL = os.path.join(HERE, "control.json")
LOOPLOG = os.path.join(HERE, "loop.log")


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    try:
        open(LOOPLOG, "a", encoding="utf-8").write(line + "\n")
    except Exception:
        pass


def set_control(state):
    json.dump({"state": state}, open(CONTROL, "w", encoding="utf-8"))


def get_control():
    if os.path.exists(CONTROL):
        try:
            return json.load(open(CONTROL, encoding="utf-8")).get("state", "run")
        except Exception:
            return "run"
    return "run"


def write_status(**kw):
    cur = {}
    if os.path.exists(STATUS):
        try:
            cur = json.load(open(STATUS, encoding="utf-8"))
        except Exception:
            cur = {}
    cur.update(kw); cur["ts"] = int(time.time())
    json.dump(cur, open(STATUS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def run(cmd):
    log("$ " + " ".join(cmd))
    return subprocess.call(cmd, cwd=HERE)


def free_ollama_vram():
    """训练前卸载 Ollama 驻留模型，腾出显存给 QLoRA（否则 8GB 必 OOM）。"""
    exe = os.environ.get("GREENTV_OLLAMA_EXE",
                         os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Programs\Ollama\ollama.exe"))
    if not os.path.exists(exe):
        return
    for m in ("qwen2.5-coder:32b", "qwen2.5-coder:7b"):
        try:
            subprocess.call([exe, "stop", m], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    time.sleep(3)
    log("已卸载 Ollama 驻留模型，显存让给训练。")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=60, help="每轮微调步数")
    ap.add_argument("--refresh-every", type=int, default=5, help="每几轮用 32b 刷新一次数据")
    ap.add_argument("--max-rounds", type=int, default=0, help="0=无限循环直到 stop")
    args = ap.parse_args()

    if get_control() == "stop":
        set_control("run")          # 启动即复位，避免上次的 stop 残留
    log("===== 持续循环训练启动  steps=%d refresh_every=%d =====" % (args.steps, args.refresh_every))
    write_status(state="run", round=0, msg="循环训练启动")

    rnd = 0
    while True:
        st = get_control()
        if st == "stop":
            log("收到 stop，干净退出。"); write_status(state="stopped", msg="已停止"); break
        if st == "pause":
            write_status(state="paused", msg="已挂起，等待恢复…")
            time.sleep(15); continue

        rnd += 1
        if args.max_rounds and rnd > args.max_rounds:
            log("达到 max-rounds=%d，退出。" % args.max_rounds); write_status(state="stopped"); break

        # 1) 周期性用 32b 刷新数据（第1轮必刷）
        if rnd == 1 or (args.refresh_every and rnd % args.refresh_every == 1):
            write_status(state="distilling", round=rnd, msg="第%d轮：32b 教师产数据中…" % rnd)
            rc = run([PY, "teacher_distill.py"])
            if rc != 0:
                log("teacher_distill 失败 rc=%d，跳过本次刷新继续。" % rc)

        # 2) 微调一轮（首轮新建，之后续训）。先腾显存，避免 Ollama 占着导致 OOM。
        free_ollama_vram()
        resume = ["--resume"] if rnd > 1 else []
        write_status(state="training", round=rnd, msg="第%d轮：QLoRA 微调中…" % rnd)
        rc = run([PY, "qlora_train.py", "--steps", str(args.steps), "--round", str(rnd)] + resume)
        if rc != 0:
            log("qlora_train 失败 rc=%d，等 30s 重试本轮。" % rc)
            write_status(state="error", round=rnd, msg="本轮训练异常 rc=%d，稍后重试" % rc)
            time.sleep(30); rnd -= 1; continue

        log("第 %d 轮完成。" % rnd)
        write_status(state="round_done", round=rnd, msg="第%d轮完成" % rnd)
        time.sleep(2)


if __name__ == "__main__":
    main()
