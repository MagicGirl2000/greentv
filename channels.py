# -*- coding: utf-8 -*-
"""channels.py — 央视频道清单。
stream 留空=演示模式(合成维度走势)。若你有【自己有权访问的】HLS/流地址，填进 stream 即可真实检测。
严禁抓取无权访问的受保护流；本项目默认不内置任何受保护源。
"""

CHANNELS = [
    {"id": "CCTV1",  "name": "CCTV-1 综合",     "stream": ""},
    {"id": "CCTV2",  "name": "CCTV-2 财经",     "stream": ""},
    {"id": "CCTV3",  "name": "CCTV-3 综艺",     "stream": ""},
    {"id": "CCTV4",  "name": "CCTV-4 中文国际", "stream": ""},
    {"id": "CCTV5",  "name": "CCTV-5 体育",     "stream": ""},
    {"id": "CCTV5P", "name": "CCTV-5+ 体育赛事","stream": ""},
    {"id": "CCTV6",  "name": "CCTV-6 电影",     "stream": ""},
    {"id": "CCTV7",  "name": "CCTV-7 国防军事", "stream": ""},
    {"id": "CCTV8",  "name": "CCTV-8 电视剧",   "stream": ""},
    {"id": "CCTV9",  "name": "CCTV-9 纪录",     "stream": ""},
    {"id": "CCTV10", "name": "CCTV-10 科教",    "stream": ""},
    {"id": "CCTV11", "name": "CCTV-11 戏曲",    "stream": ""},
    {"id": "CCTV12", "name": "CCTV-12 社会与法","stream": ""},
    {"id": "CCTV13", "name": "CCTV-13 新闻",    "stream": ""},
    {"id": "CCTV14", "name": "CCTV-14 少儿",    "stream": ""},
    {"id": "CCTV15", "name": "CCTV-15 音乐",    "stream": ""},
    {"id": "CCTV16", "name": "CCTV-16 奥林匹克","stream": ""},
    {"id": "CCTV17", "name": "CCTV-17 农业农村","stream": ""},
]


CONTINENT = {
    "中国": "亚洲", "印度": "亚洲", "香港": "亚洲", "澳门": "亚洲",
    "英国": "欧洲", "法国": "欧洲", "德国": "欧洲", "匈牙利": "欧洲", "奥地利": "欧洲",
    "波兰": "欧洲", "俄罗斯": "欧洲", "塞尔维亚": "欧洲", "克罗地亚": "欧洲", "波黑": "欧洲",
    "斯洛文尼亚": "欧洲", "黑山": "欧洲", "北马其顿": "欧洲", "科索沃": "欧洲",
    "葡萄牙": "欧洲", "西班牙": "欧洲", "意大利": "欧洲", "丹麦": "欧洲", "瑞典": "欧洲",
    "芬兰": "欧洲", "挪威": "欧洲",
    "埃及": "非洲", "南非": "非洲", "津巴布韦": "非洲",
    "美国": "北美洲", "加拿大": "北美洲", "墨西哥": "北美洲",
    "澳大利亚": "大洋洲", "新西兰": "大洋洲",
}


def all_channels():
    """CCTV + 国际频道，统一带 country / continent 字段。"""
    import json
    import os
    chans = [{**c, "country": "中国", "continent": "亚洲"} for c in CHANNELS]
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "channels_intl.json")
    if os.path.exists(p):
        try:
            for c in json.load(open(p, encoding="utf-8")):
                c["continent"] = CONTINENT.get(c.get("country", ""), "其他")
                chans.append(c)
        except Exception:
            pass
    return chans
