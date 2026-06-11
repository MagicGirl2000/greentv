# -*- coding: utf-8 -*-
"""dimension.py — 把一段频道音频映射成「维度」，并给出实时建议。
复用 realm_audio 的分段特征库 + realm_analyzer 的界名字典。无流/失败时走演示模式。
"""
import os
import sys
import subprocess
import random
import numpy as np

_LOCAL = os.path.dirname(os.path.abspath(__file__))
# 优先用本地打包的依赖（异地部署），找不到再退回开发机路径
sys.path.insert(0, _LOCAL)
sys.path.insert(0, r"D:\ballbs\realm_audio")
sys.path.insert(0, r"D:\ballbs\realm_analyzer")

_NPZ = os.path.join(_LOCAL, "feat_db.npz")
if not os.path.exists(_NPZ):
    _NPZ = r"D:\ballbs\realm_audio\feat_db.npz"

try:
    import feat
    _DB = np.load(_NPZ, allow_pickle=True)
    _V, _VS, _REALMS = _DB["V"], _DB["vs"], _DB["realms"]
    _HAVE_DB = True
except Exception:
    _HAVE_DB = False

try:
    import realm_data as rd
    def realm_name(n): return rd.realm_name(int(n))
except Exception:
    def realm_name(n): return "未知界"

import imageio_ffmpeg
_FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

_NOWIN = 0x08000000 if os.name == "nt" else 0   # CREATE_NO_WINDOW：不弹 ffmpeg 控制台窗口

SR = 11025
EXTREME = 150          # 超高维异常阈值（剔极端）


# 拉流超时(可调)：默认深圳本地快→短超时；伦敦拉HLS慢→设大(GREENTV_GRAB_TO 秒, GREENTV_RW_TO 微秒)。
_RW_TO = os.environ.get("GREENTV_RW_TO", "6000000")
_GRAB_TO = float(os.environ.get("GREENTV_GRAB_TO", "0"))   # >0 则覆盖默认进程超时


def grab_audio(stream_url, seconds=3, ua=None, referrer=None, to=None, proxy=None):
    """从流地址抓取一小段音频 → float32 PCM @11025 单声道。失败返回 None。支持 iptv 流的 ua/referrer。
    to=进程超时秒(None→GREENTV_GRAB_TO 或 seconds+7)；proxy=HTTP代理(经伦敦英国IP下载，绕开地域限制)。"""
    if not stream_url:
        return None
    args = [_FFMPEG, "-loglevel", "quiet", "-rw_timeout", _RW_TO]
    if proxy:
        args += ["-http_proxy", proxy]
    if referrer:
        args += ["-headers", "Referer: %s\r\n" % referrer]
    if ua:
        args += ["-user_agent", ua]
    args += ["-i", stream_url, "-t", str(seconds), "-ar", str(SR), "-ac", "1", "-f", "f32le", "pipe:1"]
    tmo = to if to is not None else (_GRAB_TO if _GRAB_TO > 0 else seconds + 7)
    try:
        p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=tmo, creationflags=_NOWIN)
        x = np.frombuffer(p.stdout, dtype=np.float32)
        return x if x.size >= SR else None
    except Exception:
        return None


def analyze_audio(x):
    """音频 → 剔极端维度 + 置信度。返回 (dim:float, sim:float) 或 None。"""
    if not _HAVE_DB or x is None or x.size < SR:
        return None
    try:
        seq = feat.feature_seq(x)
        dims, sims = [], []
        for _t, v in seq:
            s = _V @ v
            j = int(np.argmax(s))
            dims.append(int(_REALMS[int(_VS[j])])); sims.append(float(s[j]))
        if not dims:
            return None
        keep = [d for d in dims if d < EXTREME] or dims
        return float(np.median(keep)), float(np.mean(sims))
    except Exception:
        return None


def grab_frame(stream_url, ua=None, referrer=None, to=None, proxy=None):
    """从流抓 1 帧 → 缩略 64x36 RGB numpy。失败返回 None。to=进程超时秒；proxy=HTTP代理。"""
    if not stream_url:
        return None
    args = [_FFMPEG, "-loglevel", "quiet", "-rw_timeout", _RW_TO]
    if proxy:
        args += ["-http_proxy", proxy]
    if referrer:
        args += ["-headers", "Referer: %s\r\n" % referrer]
    if ua:
        args += ["-user_agent", ua]
    args += ["-i", stream_url, "-frames:v", "1", "-vf", "scale=64:36",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    tmo = to if to is not None else (_GRAB_TO if _GRAB_TO > 0 else 12)
    try:
        p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=tmo, creationflags=_NOWIN)
        buf = p.stdout
        if buf and len(buf) >= 64 * 36 * 3:
            return np.frombuffer(buf[:64 * 36 * 3], dtype=np.uint8).reshape(36, 64, 3).astype("float32")
    except Exception:
        pass
    return None


def frame_dim(frame):
    """画面 → 一个维度值(基于亮度+饱和度)。粗略映射 3~113。无帧返回 None。"""
    if frame is None:
        return None
    try:
        r, g, b = float(frame[:, :, 0].mean()), float(frame[:, :, 1].mean()), float(frame[:, :, 2].mean())
        bri = (r + g + b) / 3.0 / 255.0
        mx, mn = max(r, g, b), min(r, g, b)
        sat = (mx - mn) / mx if mx > 0 else 0.0
        v = 5 + bri * 70 + sat * 30
        return round(float(max(3.0, min(113.0, v))), 1)
    except Exception:
        return None


def analyze_av(x, frame):
    """音频维度 + 画面维度 融合(视频+音频)。两者都有→0.6音+0.4画；只一个→用那个。"""
    a = analyze_audio(x)
    av = a[0] if a else None
    vv = frame_dim(frame)
    if av is not None and vv is not None:
        return (round(0.6 * av + 0.4 * vv, 1), a[1])
    if av is not None:
        return a
    if vv is not None:
        return (vv, 0.3)
    return None


# ---- 演示模式：每频道一个有界随机游走（无真实流时用，纯属合成，不代表真实内容）----
_BASE = {  # 各频道演示基准维度（仅为演示观感，非真实判定）
    "CCTV1": 13, "CCTV2": 24, "CCTV3": 32, "CCTV4": 14, "CCTV5": 40, "CCTV5P": 41,
    "CCTV6": 43, "CCTV7": 5, "CCTV8": 22, "CCTV9": 9, "CCTV10": 11, "CCTV11": 33,
    "CCTV12": 12, "CCTV13": 13, "CCTV14": 7, "CCTV15": 7, "CCTV16": 40, "CCTV17": 9,
}
_walk = {}


def _base_for(ch_id):
    if ch_id in _BASE:
        return _BASE[ch_id]
    return 5 + (sum(ord(c) for c in ch_id) % 45)   # 任意频道：稳定基准 5~49


def demo_dim(ch_id):
    base = _base_for(ch_id)
    cur = _walk.get(ch_id, float(base))
    cur += random.uniform(-1.5, 1.5) + (base - cur) * 0.08   # 向基准回归的游走
    cur = max(3.0, min(113.0, cur))
    _walk[ch_id] = cur
    return round(cur, 1)


def channel_dimension(ch):
    """有流且连通→真实分析(live)；有流但连不上→断连(down,无数据)；无流→演示(demo)。"""
    stream = ch.get("stream", "")
    if stream:
        x = grab_audio(stream)
        r = analyze_audio(x)
        if r is not None:
            return r[0], r[1], "live"
        return None, 0.0, "down"            # 连不上直播源 → 断连
    return demo_dim(ch["id"]), 0.0, "demo"  # 无源 → 演示


def advice(dim):
    """严格按字典界名给提示，不自行归类阴阳/性别/区间。仅供娱乐，不可当真。"""
    d = int(round(dim))
    name = realm_name(d)               # 直接取字典界名
    if d >= EXTREME:
        tip = "⚠ 异常超高维，极可能识别错误，请勿相信。"
    else:
        tip = "界名以字典为准，仅供娱乐参考，切勿当真。"
    return name, tip
