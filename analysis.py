# -*- coding: utf-8 -*-
"""
analysis.py — 各国(地区) 指数 × 卫星云图(实时+历史) × 官方天气 比对 + 加密式Token + 正确率。
对每个国家/地区，逐日取：
  ① 该地 GreenIndex 指数 IDXC_<country> 当天均值
  ② NASA GIBS 真彩卫星云量(今天=实时，过去=历史档案)
  ③ Open-Meteo 官方降水(过去=再分析档案，今天=预报)
判「指数降雨信号([19,30))」与「卫星多云 或 官方降水」实况是否一致 → 生成验证 Token → 统计正确率，
并算指数与云量/降水的相关性以找规律。【虚构假说验证，娱乐参考，勿当真】。
"""
import os
import io
import time
import json
import hashlib
import sqlite3
import threading
import datetime
import statistics
import urllib.request
import numpy as np
from PIL import Image

import weather as wx
import channels as ch_cfg

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("GREENTV_DATA", HERE)
ADB = os.path.join(DATA, "analysis.db")
GREEN_DB = os.path.join(DATA, "greentv.db")

GI_LO, GI_HI = 19, 30      # 指数降雨信号区间 [19,30)
CLOUD_TH = 50              # 卫星云量阈值(%)，≥即「多云/可能降雨」
RAIN_MM = 1.0             # 官方降水阈值(mm)，≥即「下雨」
HIST_DAYS = 4              # 每次刷新回看天数


def _load_centroids():
    try:
        with open(os.path.join(HERE, "country_centroids.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


CENTROIDS = _load_centroids()


def _country_points():
    """每国【多个采样点】：该国 weather.REGIONS 的全部城市(最多5个)；没有则用国家质心单点。
    多点是为了大国(如中国)不被单一城市(北京0mm)误判——降水/云量取多点 MAX(任一处下雨即算下雨)。"""
    by = {}
    for r in wx.REGIONS:
        c = r.get("country")
        if c:
            by.setdefault(c, []).append((r["lat"], r["lon"]))
    try:
        for ch in ch_cfg.all_channels():
            c = ch.get("country")
            if c and c not in by and c in CENTROIDS:
                by[c] = [(CENTROIDS[c][0], CENTROIDS[c][1])]
    except Exception:
        pass
    return [{"country": c, "points": pts[:5]} for c, pts in by.items()]


REGIONS = _country_points()


def _db():
    c = sqlite3.connect(ADB)
    c.execute("CREATE TABLE IF NOT EXISTS recs(country TEXT, date TEXT, idx REAL, cloud REAL, precip REAL, "
              "idx_sig INT, sat_sig INT, wx_sig INT, match INT, token TEXT, PRIMARY KEY(country,date))")
    c.commit()
    return c


def gibs_cloud(lat, lon, date):
    """该地 ±4° 方框的 GIBS 真彩快照 → 亮像素占比估云量(%)。date=YYYY-MM-DD。失败返回 None。"""
    w = 4.0
    bbox = "%.2f,%.2f,%.2f,%.2f" % (lat - w, lon - w, lat + w, lon + w)
    url = ("https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=%s"
           "&BBOX=%s&CRS=EPSG:4326&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor"
           "&FORMAT=image/jpeg&WIDTH=320&HEIGHT=320" % (date, bbox))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "greentv/1.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
        im = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype("float32")
        bri = im.mean(axis=2)
        return round(float((bri > 150).mean() * 100), 1)
    except Exception:
        return None


def _precip_one(lat, lon, date):
    """单点官方降水(mm)：过去用 Open-Meteo 再分析档案，今天用预报。失败返回 None。"""
    today = datetime.date.today().isoformat()
    try:
        if date < today:
            u = ("https://archive-api.open-meteo.com/v1/archive?latitude=%s&longitude=%s"
                 "&start_date=%s&end_date=%s&daily=precipitation_sum&timezone=auto" % (lat, lon, date, date))
        else:
            u = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
                 "&daily=precipitation_sum&forecast_days=1&timezone=auto" % (lat, lon))
        dy = json.load(urllib.request.urlopen(u, timeout=20))["daily"]
        p = dy["precipitation_sum"][0]
        return float(p) if p is not None else None
    except Exception:
        return None


def official_precip(points, date):
    """多点取 MAX 官方降水：区域内任一采样点下雨即算该国下雨(避免单城误判)。"""
    vals = [v for v in (_precip_one(la, lo, date) for (la, lo) in points) if v is not None]
    return max(vals) if vals else None


def gibs_cloud_multi(points, date):
    """多点取 MAX 卫星云量(最多取2点，云图为重图)。"""
    vals = [v for v in (gibs_cloud(la, lo, date) for (la, lo) in points[:2]) if v is not None]
    return max(vals) if vals else None


def _series_daymean(series, date):
    """任一序列在 date 当天的均值(从 greentv.db)。无则 None。"""
    try:
        c = sqlite3.connect(GREEN_DB)
        c.execute("PRAGMA query_only=1")
        d0 = int(datetime.datetime.strptime(date, "%Y-%m-%d").timestamp())
        rows = c.execute("SELECT val FROM ticks WHERE series=? AND ts>=? AND ts<?",
                         (series, d0, d0 + 86400)).fetchall()
        c.close()
        if rows:
            return round(sum(r[0] for r in rows) / len(rows), 2)
    except Exception:
        pass
    return None


def index_for(country, date):
    """该国指数 IDXC_<country> 在 date 当天的均值。无则 None。"""
    return _series_daymean("IDXC_" + country, date)


def _sig(v, lo=None, hi=None, th=None):
    if v is None:
        return None
    if th is not None:
        return 1 if v >= th else 0
    return 1 if (lo <= v < hi) else 0


def _index_rain(dim):
    """国家(全频道)指数 → 降雨信号(新规则)。
    判下雨：所有【个位为2】的维度(2,12,22,32,42,52,…,202)，以及 0-0.99 / 4-4.99 / 20-24.99 / 47-47.99；
    其余(尤其 25-30 及以上)判不下雨。"""
    if dim is None:
        return None
    d = int(dim)
    if d % 10 == 2:
        return 1
    if 0 <= dim < 1 or 4 <= dim < 5 or 20 <= dim < 25 or 47 <= dim < 48:
        return 1
    return 0


def _match_truth(idx_sig, wx_sig):
    """正确性以【官方天气API】为地面真值：指数与官方天气一致=对(紫)，不一致=错。
    官方天气通常正确；卫星只用于决定错判的颜色(蓝/浅绿)，不计入正确率。无官方天气=无法判定(None)。"""
    if idx_sig is None or wx_sig is None:
        return None
    return 1 if idx_sig == wx_sig else 0


def evaluate(country, points, date):
    idx = index_for(country, date)
    cloud = gibs_cloud_multi(points, date)
    precip = official_precip(points, date)
    idx_sig = _index_rain(idx)
    sat_sig = _sig(cloud, th=CLOUD_TH)
    wx_sig = _sig(precip, th=RAIN_MM)
    match = _match_truth(idx_sig, wx_sig)
    raw = "%s|%s|%s|%s|%s|%s|%s|%s" % (country, date, idx, cloud, precip, idx_sig, sat_sig, wx_sig)
    token = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return dict(country=country, date=date, idx=idx, cloud=cloud, precip=precip,
                idx_sig=idx_sig, sat_sig=sat_sig, wx_sig=wx_sig, match=match, token=token)


def store(rec):
    c = _db()
    c.execute("INSERT OR REPLACE INTO recs VALUES(?,?,?,?,?,?,?,?,?,?)",
              (rec["country"], rec["date"], rec["idx"], rec["cloud"], rec["precip"],
               rec["idx_sig"], rec["sat_sig"], rec["wx_sig"], rec["match"], rec["token"]))
    c.commit()
    c.close()


def _dates(n):
    t = datetime.date.today()
    return [(t - datetime.timedelta(days=i)).isoformat() for i in range(n)]


def refresh_once(history_days=HIST_DAYS):
    for r in REGIONS:
        for date in _dates(history_days):
            try:
                store(evaluate(r["country"], r["points"], date))
            except Exception:
                pass
            time.sleep(0.25)         # 错峰，别砸外部 API
        time.sleep(0.4)


def start():
    def loop():
        time.sleep(20)               # 等指数先跑起来
        while True:
            try:
                refresh_once()
            except Exception:
                pass
            try:
                refresh_prov_once()  # 省级逐省验证
            except Exception:
                pass
            time.sleep(3600 * 6)     # 每6小时刷新一轮
    threading.Thread(target=loop, daemon=True).start()


def _rate(ms):
    v = [x for x in ms if x is not None]
    return round(100 * sum(v) / len(v), 1) if v else None


def _corr(pairs, ai, bi):
    xs = [p[ai] for p in pairs if p[ai] is not None and p[bi] is not None]
    ys = [p[bi] for p in pairs if p[ai] is not None and p[bi] is not None]
    if len(xs) < 3:
        return None
    try:
        return round(statistics.correlation(xs, ys), 2)
    except Exception:
        return None


def snapshot():
    c = _db()
    rows = c.execute("SELECT country,date,idx,cloud,precip,idx_sig,sat_sig,wx_sig,match,token "
                     "FROM recs ORDER BY date DESC, country").fetchall()
    c.close()
    latest, per, series, allm = {}, {}, {}, []
    for co, date, idx, cloud, precip, isig, ssig, wsig, m, tok in rows:
        if co not in latest:
            latest[co] = dict(country=co, date=date, idx=idx, cloud=cloud, precip=precip,
                              idx_sig=isig, sat_sig=ssig, wx_sig=wsig, match=m, token=tok)
        per.setdefault(co, []).append(m)
        series.setdefault(co, []).append((idx, cloud, precip))
        if m is not None:
            allm.append(m)
    out = []
    for co, rec in latest.items():
        rec["accuracy"] = _rate(per[co])
        rec["n"] = len([m for m in per[co] if m is not None])
        rec["corr_idx_cloud"] = _corr(series[co], 0, 1)
        rec["corr_idx_precip"] = _corr(series[co], 0, 2)
        out.append(rec)
    out.sort(key=lambda r: (r["accuracy"] is None, -(r["accuracy"] or 0)))
    return {"regions": out, "overall_rate": _rate(allm), "overall_n": len(allm),
            "thresholds": {"指数区间": "[%d,%d)" % (GI_LO, GI_HI), "云量%": CLOUD_TH, "降水mm": RAIN_MM},
            "note": "指数降雨信号 vs 卫星云量/官方降水 实况 的加密式一致性校验(Token)；虚构假说，娱乐参考，勿当真。"}


# ========================= 省级(行政区)逐省验证 =========================
# 频道(id) → 省份 ISO 3166-2 代码。多频道同省 → 该省指数取这些频道当天均值的均值。
# 仅中国有【按省份】的卫视频道；其它国家暂无省级频道(地图上显示绿色=无频道)。
CN_CHAN_PROV = {
    "BEIJING": "CN-BJ", "DONGFANG": "CN-SH", "TIANJIN": "CN-TJ", "CHONGQING": "CN-CQ",
    "ANHUI": "CN-AH", "HUBEI": "CN-HB", "HENAN": "CN-HA", "HEBEI": "CN-HE", "SHANDONG": "CN-SD",
    "GUANGDONG": "CN-GD", "GUANGXI": "CN-GX", "SICHUAN": "CN-SC", "JIANGXI": "CN-JX", "DONGNAN": "CN-FJ",
    "JILIN": "CN-JL", "LIAONING": "CN-LN", "YUNNAN": "CN-YN", "GANSU": "CN-GS", "NINGXIA": "CN-NX",
    "QINGHAI": "CN-QH", "GUIZHOU": "CN-GZ", "HLJ": "CN-HL", "XINJIANG": "CN-XJ", "XIZANG": "CN-XZ",
    "NMG": "CN-NM", "SHENZHENW": "CN-GD", "ZHEJIANG": "CN-ZJ", "JIANGSU": "CN-JS", "HUNAN": "CN-HN",
    "SHANXI_J": "CN-SX", "SHAANXI": "CN-SN", "HAINAN": "CN-HI", "YANBIAN": "CN-JL",
    "JINAN": "CN-SD", "LUANNAN": "CN-HE", "HRBNEWS": "CN-HL", "HRBYS": "CN-HL",
}

PROV_CHANS = {}
for _cid, _iso in CN_CHAN_PROV.items():
    PROV_CHANS.setdefault(_iso, []).append(_cid)


def _load_chan_prov():
    """并入全球频道→省映射(由 build_channel_prov 用 GeoNames 城市名+点在多边形内 生成)。
    多数外国频道名是品牌无地名，只有名字含城市名的频道(约30+)能定位到省，其余仍代表全国。"""
    try:
        m = json.load(open(os.path.join(HERE, "channel_prov.json"), encoding="utf-8"))
        for cid, iso in m.items():
            PROV_CHANS.setdefault(iso, []).append(cid)
        return len(m)
    except Exception:
        return 0


_load_chan_prov()


def _load_prov_geo():
    """从 static/provinces.json 读各省中心点(lat,lon,本地名)。"""
    try:
        d = json.load(open(os.path.join(HERE, "static", "provinces.json"), encoding="utf-8"))
        return {p["id"]: (p.get("lat"), p.get("lon"), p.get("nl") or p.get("n") or p["id"])
                for p in d.get("provs", []) if p.get("lat") is not None}
    except Exception:
        return {}


PROV_GEO = _load_prov_geo()


def _pdb():
    c = sqlite3.connect(ADB)
    c.execute("CREATE TABLE IF NOT EXISTS provrecs(id TEXT, date TEXT, idx REAL, cloud REAL, precip REAL, "
              "idx_sig INT, sat_sig INT, wx_sig INT, match INT, token TEXT, PRIMARY KEY(id,date))")
    c.commit()
    return c


def prov_index(chs, date):
    """该省指数 = 所属频道当天均值的均值。无则 None。"""
    vals = [v for v in (_series_daymean(c, date) for c in chs) if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def evaluate_prov(iso, date):
    geo = PROV_GEO.get(iso)
    if not geo:
        return None
    lat, lon, name = geo
    chs = PROV_CHANS.get(iso, [])
    idx = prov_index(chs, date)
    cloud = gibs_cloud(lat, lon, date)
    precip = _precip_one(lat, lon, date)
    idx_sig = _index_rain(idx)
    sat_sig = _sig(cloud, th=CLOUD_TH)
    wx_sig = _sig(precip, th=RAIN_MM)
    match = _match_truth(idx_sig, wx_sig)
    raw = "%s|%s|%s|%s|%s" % (iso, date, idx, sat_sig, wx_sig)
    token = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return dict(id=iso, name=name, date=date, idx=idx, cloud=cloud, precip=precip,
                idx_sig=idx_sig, sat_sig=sat_sig, wx_sig=wx_sig, match=match, token=token)


def store_prov(rec):
    c = _pdb()
    c.execute("INSERT OR REPLACE INTO provrecs VALUES(?,?,?,?,?,?,?,?,?,?)",
              (rec["id"], rec["date"], rec["idx"], rec["cloud"], rec["precip"],
               rec["idx_sig"], rec["sat_sig"], rec["wx_sig"], rec["match"], rec["token"]))
    c.commit()
    c.close()


def refresh_prov_once(history_days=HIST_DAYS):
    for iso in PROV_CHANS:
        for date in _dates(history_days):
            try:
                r = evaluate_prov(iso, date)
                if r:
                    store_prov(r)
            except Exception:
                pass
            time.sleep(0.25)
        time.sleep(0.3)


def snapshot_prov():
    """各省最新一条 + 正确率。仅返回有频道(有数据)的省；前端其余省显示绿色=无频道。"""
    c = _pdb()
    rows = c.execute("SELECT id,date,idx,cloud,precip,idx_sig,sat_sig,wx_sig,match,token "
                     "FROM provrecs ORDER BY date DESC").fetchall()
    c.close()
    latest, per = {}, {}
    for iso, date, idx, cloud, precip, isig, ssig, wsig, m, tok in rows:
        if iso not in latest:
            latest[iso] = dict(id=iso, name=PROV_GEO.get(iso, (0, 0, iso))[2], date=date, idx=idx,
                               cloud=cloud, precip=precip, idx_sig=isig, sat_sig=ssig, wx_sig=wsig,
                               match=m, token=tok)
        per.setdefault(iso, []).append(m)
    out = []
    for iso, rec in latest.items():
        rec["accuracy"] = _rate(per[iso])
        rec["n"] = len([m for m in per[iso] if m is not None])
        out.append(rec)
    out.sort(key=lambda r: (r["accuracy"] is None, -(r["accuracy"] or 0)))
    return {"provinces": out,
            "note": "逐省：该省卫视频道指数 vs 该省官方天气/卫星云图。无频道省份显示绿色。单一频道代表全省，仅娱乐。"}
