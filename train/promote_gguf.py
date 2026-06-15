# -*- coding: utf-8 -*-
"""
promote_gguf.py — 【上线】把训练好的最优适配器(out/best)合并进基座 → 转 GGUF → 注册成
Ollama 模型 `xiaoqi:trained`，让群聊里的小七真正用上微调成果。

⚠️ 永不动原始 qwen2.5-coder:7b（小七保底版，可随时回滚）。只新增一个 xiaoqi:trained 标签。

依赖：除训练依赖外，还需 llama.cpp（转 GGUF + 量化）：
    git clone https://github.com/ggerganov/llama.cpp  D:\ballbs\llama.cpp
    并准备好 convert_hf_to_gguf.py（纯 Python）+ 量化用的 llama-quantize(需 cmake 编译，或下官方预编译版)
    设 GREENTV_LLAMACPP=D:\ballbs\llama.cpp

用法：  python promote_gguf.py
"""
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass
import json
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
BEST = os.path.join(OUT, "best")
MERGED = os.path.join(OUT, "merged_hf")          # 合并后的 HF 权重(fp16)
GGUF_F16 = os.path.join(OUT, "xiaoqi-f16.gguf")
GGUF_Q4 = os.path.join(OUT, "xiaoqi-q4_k_m.gguf")
MODELFILE = os.path.join(OUT, "Modelfile")
TAG = os.environ.get("GREENTV_TRAINED_TAG", "xiaoqi:trained")

os.environ.setdefault("HF_HOME", r"D:\ballbs\hf_cache")
BASE_MODEL = os.environ.get("GREENTV_BASE_MODEL", "Qwen/Qwen2.5-Coder-7B-Instruct")
LCPP = os.environ.get("GREENTV_LLAMACPP", r"D:\ballbs\llama.cpp")
OLLAMA = os.environ.get("GREENTV_OLLAMA_EXE",
                        os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Programs\Ollama\ollama.exe"))


def step_merge():
    if not os.path.isdir(BEST):
        raise SystemExit("没有 out/best（还没练出更优模型）。先让 train_loop 跑出至少一次 improved。")
    print("① 合并 LoRA(best) 进基座 → fp16 …")
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    tok = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, torch_dtype=torch.float16, device_map="cpu", trust_remote_code=True)
    merged = PeftModel.from_pretrained(base, BEST).merge_and_unload()
    merged.save_pretrained(MERGED, safe_serialization=True)
    tok.save_pretrained(MERGED)
    print("   合并完成 →", MERGED)


def step_gguf():
    conv = os.path.join(LCPP, "convert_hf_to_gguf.py")
    if not os.path.exists(conv):
        raise SystemExit("未找到 %s。请先 git clone llama.cpp 并设 GREENTV_LLAMACPP。" % conv)
    print("② 转 GGUF(f16) …")
    subprocess.check_call([sys.executable, conv, MERGED, "--outfile", GGUF_F16, "--outtype", "f16"])
    # 量化(可选，体积/显存友好)。llama-quantize 需编译；没有就直接用 f16。
    q = None
    for name in ("llama-quantize.exe", "quantize.exe", "llama-quantize", "quantize"):
        cand = os.path.join(LCPP, "build", "bin", name)
        if os.path.exists(cand):
            q = cand; break
    if q:
        print("③ 量化 → q4_k_m …")
        subprocess.check_call([q, GGUF_F16, GGUF_Q4, "q4_k_m"])
        return GGUF_Q4
    print("   (未找到 llama-quantize，跳过量化，直接用 f16)")
    return GGUF_F16


def step_ollama(gguf):
    print("④ 写 Modelfile 并 ollama create %s …" % TAG)
    sysmsg = ("你是绿太阳项目的小七(Adam)。三魔女 Amelie/Mael/Sarah 都是女性，用‘她’。"
              "绿太阳指数虚构、不可当真、严禁赌博交易。")
    with open(MODELFILE, "w", encoding="utf-8") as f:
        f.write('FROM %s\n' % gguf.replace("\\", "/"))
        f.write('PARAMETER temperature 0.6\n')
        f.write('SYSTEM """%s"""\n' % sysmsg)
    if not os.path.exists(OLLAMA):
        raise SystemExit("未找到 ollama.exe：%s（设 GREENTV_OLLAMA_EXE）" % OLLAMA)
    subprocess.check_call([OLLAMA, "create", TAG, "-f", MODELFILE])
    print("✅ 上线完成：Ollama 新增模型 %s。把 ollama_model.txt 改成它即可让小七用上。" % TAG)


def main():
    step_merge()
    gguf = step_gguf()
    step_ollama(gguf)


if __name__ == "__main__":
    main()
