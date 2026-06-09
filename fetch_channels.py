# -*- coding: utf-8 -*-
"""fetch_channels.py — 从 iptv-org（公开免费直播流聚合，非收费频道）抓取各国电视频道，
写入 channels_intl.json，供 GreenIndex 使用。iptv-org 只索引公开可获取的流，不托管内容。"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "channels_intl.json")
CAP = 8   # 每国最多取几个（控制采样负载）

COUNTRIES = {
    "uk": "英国", "us": "美国", "fr": "法国", "de": "德国", "hu": "匈牙利", "at": "奥地利",
    "pl": "波兰", "ru": "俄罗斯",
    "rs": "塞尔维亚", "hr": "克罗地亚", "ba": "波黑", "si": "斯洛文尼亚", "me": "黑山",
    "mk": "北马其顿", "xk": "科索沃",            # 南斯拉夫全境
    "eg": "埃及", "za": "南非", "au": "澳大利亚", "in": "印度", "nz": "新西兰",
    "mx": "墨西哥", "ca": "加拿大", "pt": "葡萄牙", "es": "西班牙", "hk": "香港", "mo": "澳门",
    "zw": "津巴布韦", "it": "意大利", "dk": "丹麦", "se": "瑞典", "fi": "芬兰", "no": "挪威",
}


def fetch(code):
    url = "https://iptv-org.github.io/iptv/countries/%s.m3u" % code
    try:
        r = subprocess.run(["curl.exe", "-s", "-L", "--max-time", "40", url],
                           stdout=subprocess.PIPE, timeout=60)
        return r.stdout.decode("utf-8", "ignore")
    except Exception:
        return ""


def parse(text, code, cn):
    out = []
    name = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF"):
            name = line.split(",", 1)[1].strip() if "," in line else "频道"
        elif line and not line.startswith("#"):
            if name and line.startswith("http") and ".m3u8" in line:
                out.append({"id": "%s%d" % (code, len(out)),
                            "name": "%s · %s" % (cn, name),
                            "country": cn, "stream": line})
            name = None
            if len(out) >= CAP:
                break
    return out


def main():
    all_ch = []
    for code, cn in COUNTRIES.items():
        txt = fetch(code)
        chs = parse(txt, code, cn) if txt else []
        print("  %s %-6s → %d 个" % (cn, code, len(chs)))
        all_ch.extend(chs)
    json.dump(all_ch, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("\n共 %d 个国际频道 → %s" % (len(all_ch), OUT))


if __name__ == "__main__":
    main()
