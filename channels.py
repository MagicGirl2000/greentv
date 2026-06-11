# -*- coding: utf-8 -*-
"""channels.py — 央视频道清单。
stream 留空=演示模式(合成维度走势)。若你有【自己有权访问的】HLS/流地址，填进 stream 即可真实检测。
严禁抓取无权访问的受保护流；本项目默认不内置任何受保护源。
"""

# 中国频道直播源（用户自有权访问，取自 文档/Centeral：卫视音频源 + Coreplayer直播源）。
# 腾讯云/各地CDN，全球可达、已实测可播；旧的 myalicdn 央视音频源已失效，移除。
_QC = "http://wstvcpudtxy.liveplay.myqcloud.com/wstvcpud/udrm%s_1_hd.flv"   # 腾讯云卫视
_CNR = "http://satellitepull.cnr.cn/live/%s.flv"                            # 央广拉流卫视
_HRB = "http://streamings.hrbtv.net/live/%s?fmt=h264_400k_flv"               # 哈尔滨台

CHANNELS = [
    # —— 省级卫视(腾讯云 CDN，全球可达) ——
    {"id": "BEIJING",   "name": "北京卫视",   "stream": _QC % "btv1"},
    {"id": "DONGFANG",  "name": "东方卫视",   "stream": _QC % "dongfang"},
    {"id": "TIANJIN",   "name": "天津卫视",   "stream": _QC % "tianjin"},
    {"id": "CHONGQING", "name": "重庆卫视",   "stream": _QC % "chongqing"},
    {"id": "ANHUI",     "name": "安徽卫视",   "stream": _QC % "anhui"},
    {"id": "HUBEI",     "name": "湖北卫视",   "stream": _QC % "hubei"},
    {"id": "HENAN",     "name": "河南卫视",   "stream": _QC % "henan"},
    {"id": "HEBEI",     "name": "河北卫视",   "stream": _QC % "hebei"},
    {"id": "SHANDONG",  "name": "山东卫视",   "stream": _QC % "shandong"},
    {"id": "GUANGDONG", "name": "广东卫视",   "stream": _QC % "guangdong"},
    {"id": "GUANGXI",   "name": "广西卫视",   "stream": _QC % "guangxi"},
    {"id": "SICHUAN",   "name": "四川卫视",   "stream": _QC % "sichuan"},
    {"id": "JIANGXI",   "name": "江西卫视",   "stream": _QC % "jiangxi"},
    {"id": "DONGNAN",   "name": "东南卫视",   "stream": _QC % "dongnan"},
    {"id": "JILIN",     "name": "吉林卫视",   "stream": _QC % "jilin"},
    {"id": "LIAONING",  "name": "辽宁卫视",   "stream": _QC % "liaoning"},
    {"id": "YUNNAN",    "name": "云南卫视",   "stream": _QC % "yunnan"},
    {"id": "GANSU",     "name": "甘肃卫视",   "stream": _QC % "gansu"},
    {"id": "NINGXIA",   "name": "宁夏卫视",   "stream": _QC % "ningxia"},
    {"id": "QINGHAI",   "name": "青海卫视",   "stream": _QC % "qinghai"},
    {"id": "GUIZHOU",   "name": "贵州卫视",   "stream": _QC % "guizhou"},
    {"id": "HLJ",       "name": "黑龙江卫视", "stream": _QC % "heilongjiang"},
    {"id": "XINJIANG",  "name": "新疆卫视",   "stream": _QC % "xinjiang"},
    {"id": "XIZANG",    "name": "西藏卫视",   "stream": _QC % "xizang"},
    {"id": "NMG",       "name": "内蒙古卫视", "stream": _QC % "neimenggu"},
    {"id": "SHENZHENW", "name": "深圳卫视",   "stream": _QC % "shenzhen"},
    # —— 省级卫视(央广拉流 CDN) ——
    {"id": "ZHEJIANG",  "name": "浙江卫视",   "stream": _CNR % "wxzjws"},
    {"id": "JIANGSU",   "name": "江苏卫视",   "stream": _CNR % "wx32jsws"},
    {"id": "HUNAN",     "name": "湖南卫视",   "stream": _CNR % "wx32hunws"},
    {"id": "SHANXI_J",  "name": "山西卫视",   "stream": _CNR % "wxssxws"},
    {"id": "SHAANXI",   "name": "陕西卫视",   "stream": _CNR % "wxsxxws"},
    {"id": "HAINAN",    "name": "海南卫视",   "stream": _CNR % "wxhainlyws"},
    {"id": "YANBIAN",   "name": "延边卫视",   "stream": _CNR % "wxybws"},
    # —— 地方台 ——
    {"id": "JINAN",     "name": "济南 JNTV-1",  "stream": "http://play.jinnantv.top/live/JNTV1.flv"},
    {"id": "LUANNAN",   "name": "滦南综合",     "stream": "http://8.130.49.89/live/lntv1.flv"},
    {"id": "HRBNEWS",   "name": "哈尔滨新闻综合", "stream": _HRB % "09267a2e15214137aaae37b8a7124b1b"},
    {"id": "HRBYS",     "name": "哈尔滨影视",    "stream": _HRB % "4f28da88b8984bcbbced624179617f2c"},
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
    """中国频道 + 国际频道，统一带 country / continent 字段。
    GREENTV_GLOBAL=1 → 国际部分用全球 channels_global.json(174国/iptv-org)，否则用精选 channels_intl.json。"""
    import json
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    chans = [{**c, "country": "中国", "continent": "亚洲"} for c in CHANNELS]
    use_global = os.environ.get("GREENTV_GLOBAL") == "1"
    gp = os.path.join(here, "channels_global.json")
    if use_global and os.path.exists(gp):
        try:
            for c in json.load(open(gp, encoding="utf-8")):
                chans.append(c)          # 已自带 continent
            return chans
        except Exception:
            pass
    p = os.path.join(here, "channels_intl.json")
    if os.path.exists(p):
        try:
            for c in json.load(open(p, encoding="utf-8")):
                c["continent"] = CONTINENT.get(c.get("country", ""), "其他")
                chans.append(c)
        except Exception:
            pass
    return chans
