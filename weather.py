# -*- coding: utf-8 -*-
"""
weather.py — 天气综合系统。
假说：当 GreenIndex 长期落在 [19,30)(即 20–29 区间)→ 预测中国部分地区有降雨可能。
用真实的【模式/卫星派生降水数据】(Open-Meteo, 含未来1–7天降水概率)验证，
以加密货币式的方式长期追踪命中率，并给实用建议。
"""
import os
import json
import time
import sqlite3
import threading
import datetime
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WDB = os.path.join(os.environ.get("GREENTV_DATA", HERE), "weather.db")
REFRESH_SEC = 1800          # 半小时刷新一次预报
RAIN_PROB = 50              # 降水概率≥此值视为"会下雨"
GI_LO, GI_HI = 19, 30       # GreenIndex 降雨信号区间 [19,30)

REGIONS = [
    # 中国主要地区
    {"name": "北京", "lat": 39.90, "lon": 116.40, "cn": True, "country": "中国"},
    {"name": "上海", "lat": 31.23, "lon": 121.47, "cn": True, "country": "中国"},
    {"name": "广州", "lat": 23.13, "lon": 113.26, "cn": True, "country": "中国"},
    {"name": "深圳", "lat": 22.54, "lon": 114.06, "cn": True, "country": "中国"},
    {"name": "成都", "lat": 30.57, "lon": 104.07, "cn": True, "country": "中国"},
    {"name": "武汉", "lat": 30.59, "lon": 114.30, "cn": True, "country": "中国"},
    {"name": "西安", "lat": 34.34, "lon": 108.94, "cn": True, "country": "中国"},
    {"name": "沈阳", "lat": 41.80, "lon": 123.43, "cn": True, "country": "中国"},
    {"name": "乌鲁木齐", "lat": 43.83, "lon": 87.62, "cn": True, "country": "中国"},
    {"name": "拉萨", "lat": 29.65, "lon": 91.14, "cn": True, "country": "中国"},
    {"name": "济南", "lat": 36.67, "lon": 117.00, "cn": True, "country": "中国"},
    {"name": "滦南", "lat": 39.51, "lon": 118.74, "cn": True, "country": "中国"},
    {"name": "石家庄(河北)", "lat": 38.04, "lon": 114.51, "cn": True, "country": "中国"},
    # 各频道国家(每国对应当地天气，用于"每个国家的数据反应当地天气"的科学验证)
    {"name": "香港", "lat": 22.32, "lon": 114.17, "cn": False, "country": "香港"},
    {"name": "澳门", "lat": 22.20, "lon": 113.54, "cn": False, "country": "澳门"},
    {"name": "伦敦", "lat": 51.51, "lon": -0.13, "cn": False, "country": "英国"},
    {"name": "巴黎", "lat": 48.86, "lon": 2.35, "cn": False, "country": "法国"},
    {"name": "柏林", "lat": 52.52, "lon": 13.40, "cn": False, "country": "德国"},
    {"name": "布达佩斯", "lat": 47.50, "lon": 19.04, "cn": False, "country": "匈牙利"},
    {"name": "维也纳", "lat": 48.21, "lon": 16.37, "cn": False, "country": "奥地利"},
    {"name": "华沙", "lat": 52.23, "lon": 21.01, "cn": False, "country": "波兰"},
    {"name": "莫斯科", "lat": 55.76, "lon": 37.62, "cn": False, "country": "俄罗斯"},
    {"name": "贝尔格莱德", "lat": 44.79, "lon": 20.45, "cn": False, "country": "塞尔维亚"},
    {"name": "萨格勒布", "lat": 45.81, "lon": 15.98, "cn": False, "country": "克罗地亚"},
    {"name": "开罗", "lat": 30.04, "lon": 31.24, "cn": False, "country": "埃及"},
    {"name": "约翰内斯堡", "lat": -26.20, "lon": 28.05, "cn": False, "country": "南非"},
    {"name": "悉尼", "lat": -33.87, "lon": 151.21, "cn": False, "country": "澳大利亚"},
    {"name": "新德里", "lat": 28.61, "lon": 77.21, "cn": False, "country": "印度"},
    {"name": "惠灵顿", "lat": -41.29, "lon": 174.78, "cn": False, "country": "新西兰"},
    {"name": "墨西哥城", "lat": 19.43, "lon": -99.13, "cn": False, "country": "墨西哥"},
    {"name": "多伦多", "lat": 43.65, "lon": -79.38, "cn": False, "country": "加拿大"},
    {"name": "纽约", "lat": 40.71, "lon": -74.01, "cn": False, "country": "美国"},
    {"name": "洛杉矶", "lat": 34.05, "lon": -118.24, "cn": False, "country": "美国"},
    {"name": "里斯本", "lat": 38.72, "lon": -9.14, "cn": False, "country": "葡萄牙"},
    {"name": "马德里", "lat": 40.42, "lon": -3.70, "cn": False, "country": "西班牙"},
    {"name": "罗马", "lat": 41.90, "lon": 12.50, "cn": False, "country": "意大利"},
    {"name": "哥本哈根", "lat": 55.68, "lon": 12.57, "cn": False, "country": "丹麦"},
    {"name": "斯德哥尔摩", "lat": 59.33, "lon": 18.07, "cn": False, "country": "瑞典"},
    {"name": "赫尔辛基", "lat": 60.17, "lon": 24.94, "cn": False, "country": "芬兰"},
    {"name": "奥斯陆", "lat": 59.91, "lon": 10.75, "cn": False, "country": "挪威"},
    {"name": "东京", "lat": 35.68, "lon": 139.69, "cn": False, "country": "日本"},
    {"name": "哈拉雷", "lat": -17.83, "lon": 31.05, "cn": False, "country": "津巴布韦"},
]

_cache = {}        # name -> {dates, prob, mm}
_cache_ts = 0
_lock = threading.Lock()


def _fetch(lat, lon):
    u = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
         "&daily=precipitation_probability_max,precipitation_sum&forecast_days=7&timezone=auto" % (lat, lon))
    with urllib.request.urlopen(u, timeout=20) as r:
        dy = json.load(r)["daily"]
    return {"dates": dy["time"], "prob": dy["precipitation_probability_max"],
            "mm": dy["precipitation_sum"]}


def refresh():
    global _cache_ts
    out = {}
    for reg in REGIONS:
        try:
            out[reg["name"]] = _fetch(reg["lat"], reg["lon"])
        except Exception:
            pass
        time.sleep(0.3)
    with _lock:
        _cache.update(out)
        _cache_ts = time.time()


def _db():
    c = sqlite3.connect(WDB)
    c.execute("CREATE TABLE IF NOT EXISTS wlog(date TEXT PRIMARY KEY, gi REAL, signal INT, "
              "cn_prob REAL, cn_rain INT)")
    c.commit()
    return c


def log_daily(gi):
    """每天记一笔：当日 GreenIndex、是否触发降雨信号、中国地区实际降水概率/是否下雨。"""
    today = datetime.date.today().isoformat()
    with _lock:
        cn = [v for k, v in _cache.items() if any(r["name"] == k and r["cn"] for r in REGIONS)]
    if not cn:
        return
    probs = [c["prob"][0] for c in cn if c.get("prob")]   # 今天(day0)各中国地区降水概率
    cn_prob = round(sum(probs) / len(probs), 1) if probs else 0
    cn_rain = 1 if cn_prob >= RAIN_PROB else 0
    signal = 1 if (gi is not None and GI_LO <= gi < GI_HI) else 0
    c = _db()
    c.execute("INSERT OR REPLACE INTO wlog(date,gi,signal,cn_prob,cn_rain) VALUES(?,?,?,?,?)",
              (today, gi, signal, cn_prob, cn_rain))
    c.commit(); c.close()


def accuracy():
    """加密货币式命中率：信号触发当日，中国地区确实下雨的比例 + 样本数。"""
    c = _db()
    rows = c.execute("SELECT signal,cn_rain FROM wlog").fetchall()
    c.close()
    sig = [r for r in rows if r[0] == 1]
    hit = [r for r in sig if r[1] == 1]
    base = [r for r in rows if r[1] == 1]
    return {
        "样本天数": len(rows),
        "信号触发天数": len(sig),
        "信号命中天数": len(hit),
        "命中率%": round(100 * len(hit) / len(sig), 1) if sig else None,
        "基准降雨率%": round(100 * len(base) / len(rows), 1) if rows else None,
    }


def snapshot(gi):
    """给前端：当前信号 + 各地区7天预报 + 命中率 + 建议。"""
    with _lock:
        cache = dict(_cache)
        ts = _cache_ts
    signal = gi is not None and GI_LO <= gi < GI_HI
    regions = []
    for reg in REGIONS:
        f = cache.get(reg["name"])
        if not f:
            continue
        regions.append({"name": reg["name"], "cn": reg["cn"],
                        "dates": f["dates"], "prob": f["prob"], "mm": f["mm"],
                        "today_prob": f["prob"][0] if f["prob"] else None})
    cn_today = [r["today_prob"] for r in regions if r["cn"] and r["today_prob"] is not None]
    cn_avg = round(sum(cn_today) / len(cn_today), 0) if cn_today else None
    if signal:
        tip = ("⚠ GreenIndex 处于 20–29 区间 → 按本系统假说，中国部分地区近日有降雨可能；"
               "实测中国地区平均降水概率 %s%%。建议外出带伞、关注当地预报。" % (cn_avg if cn_avg is not None else "?"))
    else:
        tip = ("GreenIndex 不在 20–29 区间，本系统不发降雨信号；实测中国地区平均降水概率 %s%%，以官方预报为准。"
               % (cn_avg if cn_avg is not None else "?"))
    return {"signal": signal, "gi": gi, "gi_band": "[19,30)",
            "cn_today_prob": cn_avg, "regions": regions,
            "accuracy": accuracy(), "advice": tip, "history": history_summary(),
            "updated": int(ts), "note": "降水数据来自 Open-Meteo(模式/卫星派生)；本系统为虚构假说验证，娱乐性参考，勿当真。"}


def mine_history(days=7):
    """挖掘过去 days 天各中国地区【实际降水】(Open-Meteo 历史档案)，存入 weather.db。"""
    end = datetime.date.today() - datetime.timedelta(days=2)     # 档案有 2~5 天延迟
    start = end - datetime.timedelta(days=days)
    c = _db()
    c.execute("CREATE TABLE IF NOT EXISTS whist(region TEXT, country TEXT, date TEXT, precip REAL, "
              "PRIMARY KEY(region,date))")
    got = 0
    for reg in REGIONS:        # 全部地区(各国当地天气)
        try:
            u = ("https://archive-api.open-meteo.com/v1/archive?latitude=%s&longitude=%s"
                 "&start_date=%s&end_date=%s&daily=precipitation_sum&timezone=auto"
                 % (reg["lat"], reg["lon"], start.isoformat(), end.isoformat()))
            with urllib.request.urlopen(u, timeout=25) as r:
                dy = json.load(r)["daily"]
            for d, p in zip(dy["time"], dy["precipitation_sum"]):
                c.execute("INSERT OR REPLACE INTO whist VALUES(?,?,?,?)",
                          (reg["name"], reg.get("country", ""), d, p if p is not None else 0))
                got += 1
        except Exception:
            pass
        time.sleep(0.25)
    c.commit(); c.close()
    return got


def history_summary():
    """过去一周：每天中国各城平均降水量 + 下雨城市数。"""
    c = _db()
    try:
        rows = c.execute("SELECT date, AVG(precip), SUM(CASE WHEN precip>=1 THEN 1 ELSE 0 END), "
                         "COUNT(*) FROM whist WHERE country='中国' GROUP BY date ORDER BY date").fetchall()
    except Exception:
        rows = []
    c.close()
    return [{"date": r[0], "avg_mm": round(r[1], 1), "rain_cities": r[2], "cities": r[3]} for r in rows]


def start():
    def loop():
        last_log = None
        while True:
            refresh()
            time.sleep(REFRESH_SEC)
    threading.Thread(target=loop, daemon=True).start()
    threading.Thread(target=lambda: (time.sleep(8), refresh()), daemon=True).start()  # 启动后尽快来一次
