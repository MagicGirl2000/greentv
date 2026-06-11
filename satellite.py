# -*- coding: utf-8 -*-
"""
satellite.py — 气象卫星云图 + 加密货币式 token 验证。
下载中国区卫星云图(NASA GIBS 真彩) → 解析云量 → 与当前全球 GreenIndex 的降雨信号
做"token式"一致性校验(两者是否同时指向降雨) → 长期统计 token 成功匹配率。
注:云量为真彩亮像素占比(含雪/沙漠误差)，为虚构验证系统，娱乐参考。
"""
import os
import time
import hashlib
import sqlite3
import threading
import datetime
import urllib.request
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
_DATA = os.environ.get("GREENTV_DATA", HERE)
SDB = os.path.join(_DATA, "satellite.db")
IMG = os.path.join(_DATA, "static", "cloud_cn.jpg")     # 存 static 供前端展示
CLOUD_TH = 50            # 云量≥此值视为"多云/可能降雨"
GI_LO, GI_HI = 19, 30    # GreenIndex 降雨信号区间
REFRESH = 1800

_state = {"cloud_pct": None, "img_ts": 0, "date": None, "bright": None}
_lock = threading.Lock()


def fetch_image():
    y = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    url = ("https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=%s"
           "&BBOX=15,73,54,135&CRS=EPSG:4326&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor"
           "&FORMAT=image/jpeg&WIDTH=640&HEIGHT=400" % y)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "greentv/1.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
        with open(IMG, "wb") as f:
            f.write(data)
        im = np.asarray(Image.open(IMG).convert("RGB")).astype("float32")
        bri = im.mean(axis=2)
        cloud = float((bri > 150).mean() * 100)
        with _lock:
            _state.update(cloud_pct=round(cloud, 1), img_ts=int(time.time()),
                          date=y, bright=round(float(bri.mean()), 0))
        return True
    except Exception:
        return False


def _db():
    c = sqlite3.connect(SDB)
    c.execute("CREATE TABLE IF NOT EXISTS tokens(ts INTEGER, gi REAL, cloud REAL, "
              "gi_sig INT, cloud_sig INT, match INT, token TEXT)")
    c.commit()
    return c


def tick(gi):
    """每采样周期：GreenIndex降雨信号 vs 卫星云量信号 → 生成token、记录是否匹配。"""
    with _lock:
        cloud = _state["cloud_pct"]
    if gi is None or cloud is None:
        return None
    gi_sig = 1 if GI_LO <= gi < GI_HI else 0
    cloud_sig = 1 if cloud >= CLOUD_TH else 0
    match = 1 if gi_sig == cloud_sig else 0
    ts = int(time.time())
    raw = "%d|%.2f|%.1f|%d|%d" % (ts, gi, cloud, gi_sig, cloud_sig)
    token = hashlib.sha256(raw.encode()).hexdigest()[:16]
    c = _db()
    c.execute("INSERT INTO tokens VALUES(?,?,?,?,?,?,?)",
              (ts, gi, cloud, gi_sig, cloud_sig, match, token))
    c.commit(); c.close()
    return token


def match_rate():
    c = _db()
    rows = c.execute("SELECT match FROM tokens").fetchall()
    c.close()
    if not rows:
        return {"total": 0, "matched": 0, "rate": None}
    m = sum(r[0] for r in rows)
    return {"total": len(rows), "matched": m, "rate": round(100 * m / len(rows), 1)}


def recent_tokens(n=12):
    c = _db()
    rows = c.execute("SELECT ts,gi,cloud,gi_sig,cloud_sig,match,token FROM tokens "
                     "ORDER BY ts DESC LIMIT ?", (n,)).fetchall()
    c.close()
    return [{"ts": r[0], "gi": r[1], "cloud": r[2], "gi_sig": r[3],
             "cloud_sig": r[4], "match": r[5], "token": r[6]} for r in rows]


def snapshot(gi):
    with _lock:
        st = dict(_state)
    gi_sig = gi is not None and GI_LO <= gi < GI_HI
    cloud_sig = st["cloud_pct"] is not None and st["cloud_pct"] >= CLOUD_TH
    return {"cloud_pct": st["cloud_pct"], "bright": st["bright"],
            "img": "/cloud_cn.jpg?t=%d" % st["img_ts"], "date": st["date"],
            "gi": gi, "gi_signal": gi_sig, "cloud_signal": cloud_sig,
            "agree": gi_sig == cloud_sig,
            "match_rate": match_rate(), "recent": recent_tokens(),
            "note": "云量=真彩卫星图亮像素占比(含雪/沙漠误差)；token=GreenIndex降雨信号与卫星云量信号的加密式一致性校验，娱乐参考。"}


def start():
    def loop():
        while True:
            fetch_image()
            time.sleep(REFRESH)
    threading.Thread(target=loop, daemon=True).start()
    threading.Thread(target=lambda: (time.sleep(3), fetch_image()), daemon=True).start()
