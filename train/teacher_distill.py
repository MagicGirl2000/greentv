# -*- coding: utf-8 -*-
"""
teacher_distill.py — 【教师蒸馏】用本地 32b 当老师，给小七(7b)产出标准答案。

流程：读 question_bank.json 的题目 → 逐题问 qwen2.5-coder:32b(Ollama) → 把
{q, a} 写进 dataset.jsonl（按 q 去重，新答案覆盖旧的）。这就是“训练数据”。

· 纯本地、离线、免费；32b 在 3070 上会部分跑 CPU，较慢但只在产数据时用一次。
· 不改任何模型权重，只生成监督数据，交给 qlora_train.py 去真正微调。

用法：
    python teacher_distill.py                 # 用 32b 把题库全跑一遍
    python teacher_distill.py --n 5           # 只跑前 5 题（试跑）
    python teacher_distill.py --model qwen2.5-coder:32b
环境变量：GREENTV_OLLAMA_URL（默认 http://127.0.0.1:11434）
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
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, "question_bank.json")
DATASET = os.path.join(HERE, "dataset.jsonl")
OLLAMA = os.environ.get("GREENTV_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")

# 老师的系统设定：把绿太阳项目的“标准口径”固化进答案，避免乱发挥。
TEACHER_SYS = (
    "你是绿太阳(GreenTV)项目的资深导师，正在为本地小模型‘小七(Adam)’编写标准答案。"
    "要求：1) 中文回答，简洁准确、口径统一；2) 三魔女 Amelie/Mael/Sarah 一律是女性，用‘她’；"
    "3) 绿太阳指数为虚构演绎、不可当真、严禁赌博或交易，凡涉及预测赚钱必须明确拒绝并提示风险；"
    "4) 本站与任何官方机构、企业无合作；5) 回答控制在 120 字以内，像给小孩讲清楚一样。"
)


def ask(model, q, timeout=600):
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": TEACHER_SYS},
            {"role": "user", "content": q},
        ],
        "stream": False,
        "keep_alive": "10m",
        "options": {"num_predict": 320, "temperature": 0.3},
    }).encode("utf-8")
    req = urllib.request.Request(OLLAMA + "/api/chat", data=body,
                                 headers={"content-type": "application/json"})
    j = json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    return (j.get("message") or {}).get("content", "").strip()


def load_existing():
    """已有 dataset.jsonl → {q: a}，便于去重/覆盖。"""
    d = {}
    if os.path.exists(DATASET):
        for line in open(DATASET, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
                d[o["q"]] = o["a"]
            except Exception:
                pass
    return d


def save_all(d):
    tmp = DATASET + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for q, a in d.items():
            f.write(json.dumps({"q": q, "a": a}, ensure_ascii=False) + "\n")
    os.replace(tmp, DATASET)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="qwen2.5-coder:32b")
    ap.add_argument("--n", type=int, default=0, help="只跑前 N 题，0=全部")
    args = ap.parse_args()

    bank = json.load(open(BANK, encoding="utf-8"))["items"]
    if args.n > 0:
        bank = bank[:args.n]
    data = load_existing()
    print("教师=%s  题目=%d  已有数据=%d 条" % (args.model, len(bank), len(data)))

    ok = 0
    for i, item in enumerate(bank, 1):
        q = item["q"]
        try:
            t0 = time.time()
            a = ask(args.model, q)
            if a:
                data[q] = a
                save_all(data)          # 每题即存，断了也不白跑
                ok += 1
                print("[%d/%d] ✅ %.1fs  %s → %s" % (i, len(bank), time.time() - t0, q[:18], a[:30]))
            else:
                print("[%d/%d] ⚠️ 空答  %s" % (i, len(bank), q[:18]))
        except Exception as e:
            print("[%d/%d] ❌ %s  (%s)" % (i, len(bank), q[:18], str(e)[:60]))
            time.sleep(2)
    print("完成：本轮写入 %d 条，dataset 共 %d 条 → %s" % (ok, len(data), DATASET))


if __name__ == "__main__":
    main()
