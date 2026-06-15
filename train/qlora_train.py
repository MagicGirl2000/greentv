# -*- coding: utf-8 -*-
"""
qlora_train.py — 【真·本地微调·一轮】在 RTX 3070(8GB) 上用 QLoRA(4-bit) 微调
qwen2.5-coder-7b 的 LoRA 适配器，数据来自 teacher_distill.py 产出的 dataset.jsonl。

设计要点（8GB 显存 + 无人值守 + 防坍缩）：
  · 4-bit 量化加载基座 + LoRA，只训练极少参数，batch=1 + 梯度累积 + 梯度检查点。
  · 每次只跑“一轮”(--steps 步)就退出，由 train_loop.py 反复调用；每轮都存检查点，断了能续。
  · 留出 hold-out 验证集算 eval loss：**只有变好才更新 out/best**，坏了不覆盖 → 防止越练越崩。
  · 全程把进度写 status.json，深圳遥控端/网吧能读到。
  · 绝不动 Ollama 里原始的 qwen2.5-coder:7b（那是小七的保底版本，永远可回滚）。

依赖：torch(cuda) transformers peft bitsandbytes datasets accelerate  (见 requirements_train.txt)
基座权重：Qwen/Qwen2.5-Coder-7B-Instruct（HF 格式，首次自动下载到 HF_HOME）

用法：
    python qlora_train.py --steps 60          # 跑一轮(60步)
    python qlora_train.py --steps 60 --resume # 从上轮 out/adapter 继续
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

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET = os.path.join(HERE, "dataset.jsonl")
OUT = os.path.join(HERE, "out")
ADAPTER = os.path.join(OUT, "adapter")          # 最新适配器（每轮覆盖）
BEST = os.path.join(OUT, "best")                # 历史最优（只在变好时更新）
STATUS = os.path.join(HERE, "status.json")
CONTROL = os.path.join(HERE, "control.json")    # {state: run|pause|stop}

# HF 缓存放 D 盘（C 盘空间紧张）。可被外部环境变量覆盖。
os.environ.setdefault("HF_HOME", r"D:\ballbs\hf_cache")
os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")

BASE_MODEL = os.environ.get("GREENTV_BASE_MODEL", "Qwen/Qwen2.5-Coder-7B-Instruct")


def write_status(**kw):
    """合并写 status.json（train_loop / 遥控端轮询读）。"""
    cur = {}
    if os.path.exists(STATUS):
        try:
            cur = json.load(open(STATUS, encoding="utf-8"))
        except Exception:
            cur = {}
    cur.update(kw)
    cur["ts"] = int(time.time())
    tmp = STATUS + ".tmp"
    json.dump(cur, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    os.replace(tmp, STATUS)


def control_state():
    if os.path.exists(CONTROL):
        try:
            return json.load(open(CONTROL, encoding="utf-8")).get("state", "run")
        except Exception:
            return "run"
    return "run"


def build_dataset(tokenizer, max_len=512):
    """dataset.jsonl({q,a}) → 按 qwen chat 模板拼成监督样本，切 90/10 训练/验证。"""
    from datasets import Dataset
    rows = []
    for line in open(DATASET, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        if not o.get("q") or not o.get("a"):
            continue
        msgs = [{"role": "user", "content": o["q"]},
                {"role": "assistant", "content": o["a"]}]
        text = tokenizer.apply_chat_template(msgs, tokenize=False)
        rows.append({"text": text})
    if len(rows) < 4:
        raise SystemExit("dataset 样本太少(%d)，先跑 teacher_distill.py 产数据。" % len(rows))

    ds = Dataset.from_list(rows)

    def tok(b):
        out = tokenizer(b["text"], truncation=True, max_length=max_len, padding="max_length")
        out["labels"] = out["input_ids"].copy()
        return out

    ds = ds.map(tok, batched=True, remove_columns=["text"])
    split = ds.train_test_split(test_size=0.1, seed=42)
    return split["train"], split["test"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=60)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--round", type=int, default=0, help="train_loop 传入的轮次编号，仅用于状态显示")
    args = ap.parse_args()

    if control_state() == "stop":
        write_status(state="stopped", msg="收到 stop，未开训"); return

    import torch
    from transformers import (AutoModelForCausalLM, AutoTokenizer,
                              BitsAndBytesConfig, TrainingArguments, Trainer)
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, PeftModel

    write_status(state="loading", round=args.round, msg="加载基座(4bit)…", base=BASE_MODEL)
    tok = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                             bnb_4bit_use_double_quant=True,
                             bnb_4bit_compute_dtype=torch.float16)
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, quantization_config=bnb, device_map="auto", trust_remote_code=True)
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model.config.use_cache = False

    if args.resume and os.path.isdir(ADAPTER):
        model = PeftModel.from_pretrained(model, ADAPTER, is_trainable=True)
        write_status(msg="已从上轮适配器续训")
    else:
        lora = LoraConfig(r=8, lora_alpha=16, lora_dropout=0.05, bias="none",
                          task_type="CAUSAL_LM",
                          target_modules=["q_proj", "k_proj", "v_proj", "o_proj"])
        model = get_peft_model(model, lora)

    train_ds, eval_ds = build_dataset(tok)
    write_status(state="training", samples=len(train_ds) + len(eval_ds),
                 msg="开始第 %d 轮微调，共 %d 步" % (args.round, args.steps))

    # 读取历史最优 eval_loss（防坍缩门槛）
    best_eval = float("inf")
    best_meta = os.path.join(BEST, "eval.json")
    if os.path.exists(best_meta):
        try:
            best_eval = json.load(open(best_meta, encoding="utf-8")).get("eval_loss", float("inf"))
        except Exception:
            pass

    class StatusCb:
        """每步把 loss 写进 status，并响应 pause/stop。"""
        def __init__(self):
            from transformers import TrainerCallback
            self.base = TrainerCallback
        def make(self):
            outer = self
            from transformers import TrainerCallback
            class _Cb(TrainerCallback):
                def on_log(self, a, s, c, logs=None, **k):
                    if logs and "loss" in logs:
                        write_status(step=s.global_step, loss=round(float(logs["loss"]), 4))
                def on_step_end(self, a, s, c, **k):
                    st = control_state()
                    if st in ("pause", "stop"):
                        c.should_training_stop = True
                        write_status(state=st, msg="第%d轮在第%d步收到 %s" % (args.round, s.global_step, st))
            return _Cb()

    targs = TrainingArguments(
        output_dir=os.path.join(OUT, "trainer"),
        per_device_train_batch_size=1, gradient_accumulation_steps=8,
        max_steps=args.steps, learning_rate=1e-4, logging_steps=1,
        save_strategy="no", report_to=[], fp16=True,
        optim="paged_adamw_8bit", gradient_checkpointing=True,
        warmup_steps=max(2, args.steps // 10),
    )
    trainer = Trainer(model=model, args=targs, train_dataset=train_ds,
                      eval_dataset=eval_ds, callbacks=[StatusCb().make()])

    trainer.train()
    model.save_pretrained(ADAPTER)                 # 最新适配器（总是保存，便于续训）

    # —— 验证 + 防坍缩门槛 ——
    metrics = trainer.evaluate()
    eval_loss = float(metrics.get("eval_loss", float("inf")))
    improved = eval_loss < best_eval - 1e-4
    write_status(state="evaluated", round=args.round, eval_loss=round(eval_loss, 4),
                 best_eval=(None if best_eval == float("inf") else round(best_eval, 4)),
                 improved=improved,
                 msg=("✅变好→更新best" if improved else "未变好→保留旧best(防坍缩)"))

    if improved:
        model.save_pretrained(BEST)
        json.dump({"eval_loss": eval_loss, "round": args.round, "ts": int(time.time())},
                  open(os.path.join(BEST, "eval.json"), "w", encoding="utf-8"))

    print("round=%d steps=%d eval_loss=%.4f best=%.4f improved=%s"
          % (args.round, args.steps, eval_loss,
             (eval_loss if best_eval == float('inf') else best_eval), improved))


if __name__ == "__main__":
    main()
