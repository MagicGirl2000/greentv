# -*- coding: utf-8 -*-
"""build_channel_prov.py — 把【全球电视频道】定位到所属省/区（两级）。
① 频道名含城市名(GeoNames cities1000，人口≥5000，去常见词) → 取该城市经纬度，
   用「点在多边形内」判断落在 static/provinces.json 的哪个省。
② 名字是品牌、无地名 → 归到【品牌总部所在地】：全国性广播品牌总部通常在国家首都，
   故取该国首都(GeoNames PPLC，缺则该国最大城市)所在省作为归属地。
两级合并写 channel_prov.json；analysis.py 启动时自动并入 PROV_CHANS。
联网运行一次即可：python build_channel_prov.py
"""
import io
import re
import json
import os
import zipfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
STOP = {"english", "center", "central", "national", "news", "sport", "sports", "music",
        "family", "life", "world", "star", "sun", "victory", "union", "capital",
        "international", "city", "town", "television", "channel", "radio", "media",
        "plus", "love", "hope", "faith", "grace", "palace", "liberty", "independence",
        "may", "june", "best", "general", "federal", "golden", "republic", "of", "the"}


def _norm(s):
    return re.sub(r"[^a-z]", " ", (s or "").lower())


def _xy(lon, lat):
    return ((lon + 180) / 360 * 1000, (90 - lat) / 180 * 500)


def _pip(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def main():
    print("下载 GeoNames cities1000…")
    z = urllib.request.urlopen(urllib.request.Request(
        "http://download.geonames.org/export/dump/cities1000.zip",
        headers={"User-Agent": "Mozilla/5.0"}), timeout=240).read()
    txt = zipfile.ZipFile(io.BytesIO(z)).read("cities1000.txt").decode("utf-8")
    by = {}                 # 国家 → [(城市名, lat, lon)]，人口≥5000
    cap = {}                # 国家 → (lat, lon)：首都(PPLC)
    maxcity = {}            # 国家 → (pop, lat, lon)：最大城市(首都兜底)
    for line in txt.splitlines():
        f = line.split("\t")
        if len(f) < 15:
            continue
        cc, fcode, pop = f[8], f[7], int(f[14] or 0)
        lat, lon = float(f[4]), float(f[5])
        if fcode == "PPLC":                       # 国家首都
            cap[cc] = (lat, lon)
        if pop >= 5000:
            by.setdefault(cc, []).append((f[2], lat, lon))
            if pop > maxcity.get(cc, (-1,))[0]:
                maxcity[cc] = (pop, lat, lon)

    def capital(cc):
        if cc in cap:
            return cap[cc]
        if cc in maxcity:
            return maxcity[cc][1], maxcity[cc][2]
        return None

    isozh = json.load(open(os.path.join(HERE, "static", "iso_zh.json"), encoding="utf-8"))
    zh2iso = {v: k.upper() for k, v in isozh.items()}
    prov = json.load(open(os.path.join(HERE, "static", "provinces.json"), encoding="utf-8"))["provs"]
    provby = {}
    for p in prov:
        provby.setdefault(p["id"].split("-")[0], []).append(p)

    def locate(iso2, lat, lon):
        x, y = _xy(lon, lat)
        cand = provby.get(iso2, [])
        for p in cand:
            for ring in p["r"]:
                if _pip(x, y, ring):
                    return p
        best, bd = None, 1e9
        for p in cand:
            if p.get("lat") is None:
                continue
            d = (p["lat"] - lat) ** 2 + (p["lon"] - lon) ** 2
            if d < bd:
                bd, best = d, p
        return best

    chans = json.load(open(os.path.join(HERE, "channels_global.json"), encoding="utf-8"))
    chprov = {}
    n_city, n_cap = 0, 0
    for ch in chans:
        iso2 = zh2iso.get(ch.get("country"))
        if not iso2:
            continue
        cn = " " + _norm(ch["name"]) + " "
        best = None
        for ascii_, lat, lon in by.get(iso2, []):
            cname = _norm(ascii_)
            if len(cname) < 4 or cname.strip() in STOP:
                continue
            if (" " + cname + " ") in cn and (best is None or len(cname) > len(_norm(best[0]))):
                best = (ascii_, lat, lon)
        if best:                                            # ① 名字含城市
            pv = locate(iso2, best[1], best[2])
            if pv:
                chprov[ch["id"]] = pv["id"]
                n_city += 1
                continue
        c = capital(iso2)                                   # ② 品牌 → 首都(总部)
        if c:
            pv = locate(iso2, c[0], c[1])
            if pv:
                chprov[ch["id"]] = pv["id"]
                n_cap += 1
    json.dump(chprov, open(os.path.join(HERE, "channel_prov.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("命中 %d 频道 → %d 省（城市定位 %d，品牌按首都/总部 %d）" %
          (len(chprov), len(set(chprov.values())), n_city, n_cap))


if __name__ == "__main__":
    main()
