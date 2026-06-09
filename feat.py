# -*- coding: utf-8 -*-
"""
feat.py — 分段声学特征：每 ~0.75s 一个 24维归一化对数频谱向量。
用最近邻(余弦)比当前段最像歌典哪一段 → 报那段的维度。比指纹更鲁棒、可逐段。
常量需与 Kotlin 端完全一致。
"""
import numpy as np

SR = 11025
NFFT = 1024
HOP = 512
FMAX = 320
NBANDS = 24
WIN_FRAMES = 11      # ~0.5s 窗（精确到 500ms）
HOP_FRAMES = 6       # ~0.28s 跳（库内密集采样）

_HAN = np.hanning(NFFT).astype(np.float32)

# 频带边界（bin 1..FMAX 对数分布，去重单调）。两端都要硬编码进 Kotlin。
def _make_edges():
    raw = np.logspace(0, np.log10(FMAX), NBANDS + 1)
    e = [1]
    for v in raw[1:]:
        nv = int(round(v))
        if nv <= e[-1]:
            nv = e[-1] + 1
        e.append(min(nv, FMAX))
    # 若被 FMAX 截断导致末尾重复，回退修正
    for i in range(len(e) - 1, 0, -1):
        if e[i] <= e[i - 1]:
            e[i - 1] = e[i] - 1
    return e

EDGES = _make_edges()   # 长度 NBANDS+1


def power_spec(x):
    n = 1 + (len(x) - NFFT) // HOP if len(x) >= NFFT else 0
    P = np.empty((FMAX, n), dtype=np.float32)
    for i in range(n):
        seg = x[i * HOP:i * HOP + NFFT] * _HAN
        P[:, i] = (np.abs(np.fft.rfft(seg))[:FMAX]) ** 2
    return P


def _bands(col):
    out = np.empty(NBANDS, dtype=np.float32)
    for b in range(NBANDS):
        out[b] = col[EDGES[b]:EDGES[b + 1]].sum()
    return out


def feature(window_avg_power):
    """320维平均功率 → 24维归一化对数特征。"""
    v = np.log1p(_bands(window_avg_power))
    nrm = float(np.linalg.norm(v))
    return v / nrm if nrm > 0 else v


def feature_seq(x):
    """整段音频 → 特征向量序列 [(t_sec, vec24)]。"""
    P = power_spec(x)
    n = P.shape[1]
    out = []
    i = 0
    while i + WIN_FRAMES <= n:
        avg = P[:, i:i + WIN_FRAMES].mean(axis=1)
        out.append((i * HOP / SR, feature(avg)))
        i += HOP_FRAMES
    return out


if __name__ == "__main__":
    print("EDGES =", EDGES, "len", len(EDGES))
