============================================================
 绿太阳深圳一体端 3.5109 · 本地微调 + 跨境加密遥控训练
============================================================
目标：小七(7b) 在深圳 3070 上做真·本地微调(QLoRA)，32b 当老师持续蒸馏；
      你在网吧用任意电脑(带对口令)经英国服务器加密遥控启停、看进度。

【三台角色】
  网吧机   cafe_client.py        —— 你 + Claude 指导，发指令/看进度
     │ (加密 push/status)
  英国服务器 8.208.127.130 :8795  uk_train_mailbox.py  —— 公网加密信箱(集合点)
     │ (深圳出站 pull/report)
  深圳本机(3070)  train_control.py —— 守护：拉指令→管训练→回传进度
                  └ train_loop.py → teacher_distill.py(32b产数据) + qlora_train.py(练7b) + promote_gguf.py(上线)

全程 link.py(Fernet 共享口令)加密；两端口令必须一致(link_key.txt 或环境变量 GREENTV_KEY)。
解不开=没带对口令=403，信箱即便公网开放也无妨。

------------------------------------------------------------
一、文件清单(train/)
------------------------------------------------------------
  question_bank.json   教师产数据用的题库(可增删)
  teacher_distill.py   32b 老师 → 产出 dataset.jsonl 标准答案
  qlora_train.py       一轮 QLoRA 微调(4bit/8GB)，带 eval 防坍缩门槛(只留更优 out/best)
  train_loop.py        持续循环编排：产数据→微调→留最优→再来；看 control.json 启停
  train_control.py     深圳守护：轮询英国信箱、执行指令、回传 status
  uk_train_mailbox.py  英国信箱服务(部署到英国服务器)
  cafe_client.py       网吧端遥控 CLI
  promote_gguf.py      把 out/best 合并转 GGUF → ollama create xiaoqi:trained 上线
  requirements_train.txt 训练依赖
  out/                 适配器/检查点/合并模型(自动生成)
  status.json control.json loop.log dataset.jsonl  运行时产生

------------------------------------------------------------
二、一次性环境准备(深圳本机，约 30-60 分钟 + 十几 GB)
------------------------------------------------------------
⚠️ 当前 .venv 是 Python 3.8，bitsandbytes/peft 跑不动 → 用 Python 3.11(最稳)。
1) 建训练专用环境(放 D 盘)：
     py -3.11 -m venv D:\ballbs\trainenv      # 若无 3.11：先装 Python 3.11
     D:\ballbs\trainenv\Scripts\activate
2) 装 PyTorch(CUDA 12.1) + 训练依赖：
     pip install torch --index-url https://download.pytorch.org/whl/cu121
     pip install -r D:\ballbs\greentv\train\requirements_train.txt
3) HF 缓存指到 D 盘(C 盘只剩十几 GB)：
     set HF_HOME=D:\ballbs\hf_cache
   首次 qlora_train 会自动下载 Qwen/Qwen2.5-Coder-7B-Instruct(~15GB) 到这里。
4) 自检：
     python -c "import torch;print('cuda',torch.cuda.is_available())"   # 必须 True

------------------------------------------------------------
三、英国服务器部署信箱(RDP 登入一次)
------------------------------------------------------------
  把 link.py / link_key.txt / uk_train_mailbox.py 放同目录，python uk_train_mailbox.py
  安全组放行 TCP 8795。  验证：本机 ping → cafe_client.py ping 指纹一致。

------------------------------------------------------------
四、日常使用
------------------------------------------------------------
A. 深圳本机(出门前)，开两样：
   1) 确保 Ollama 在跑、能看到 qwen2.5-coder:7b 与 :32b (ollama list)
   2) set GREENTV_KEY=<两端同口令>
      D:\ballbs\trainenv\Scripts\python.exe train_control.py    # 守护常驻，不要关
   （不必现在就开训，等你在网吧 start）

B. 网吧机(带 link.py + cafe_client.py + 口令)：
   set GREENTV_KEY=<同口令>
   set GREENTV_TM_URL=http://8.208.127.130:8795
   python cafe_client.py ping                 # 先确认通、指纹一致
   python cafe_client.py start --steps 60 --refresh-every 5   # 开练
   python cafe_client.py watch                # 盯进度(每10秒刷新)
   python cafe_client.py pause / resume / stop

C. 回到家想上线成果：
   python promote_gguf.py        # 需 llama.cpp(转GGUF)；生成 xiaoqi:trained
   把 ollama_model.txt 改成 xiaoqi:trained → 群聊里小七即用上微调版。

------------------------------------------------------------
五、安全 / 防坍缩(无人值守关键)
------------------------------------------------------------
  · 原始 qwen2.5-coder:7b 永不被改，随时回滚。
  · qlora_train 每轮算 hold-out eval_loss，只有变好才更新 out/best；坏了保留旧 best。
  · 通讯全加密，口令不对一律 403；网吧端口令走环境变量、不落地。
  · 持续循环靠 eval 门槛兜底；想更保守可调小 --steps、调大 --refresh-every。
  · ⚠️ 8GB 显存极限：若 qlora_train 报 CUDA out of memory，把 qlora_train.py 里
    max_len 调到 384/256、gradient_accumulation_steps 调大即可。

============================================================
 © 绿太阳 GreenTV 3.5109 · 虚构演绎 · 仅供娱乐 · 不可当真不可交易
============================================================
