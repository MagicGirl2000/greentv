# -*- coding: utf-8 -*-
"""fetch_iptv.py — 从 iptv-org 拉全球电视直播流 + mledoze/countries 拿中文国名/洲/经纬度，
生成 channels_global.json(全球频道清单) + country_centroids.json(各国质心，供天气/卫星分析)。
每国取 N 条(剔 NSFW、去重)。iptv-org 社区源死链率不低，靠探针验活即可。"""
import os
import json
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
N_PER_COUNTRY = int(os.environ.get("IPTV_N", "5"))

_CONT = {"Africa": "非洲", "Asia": "亚洲", "Europe": "欧洲", "Oceania": "大洋洲", "Antarctic": "南极洲"}


def _get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=45).read())


def _continent(region, subregion):
    if region == "Americas":
        return "南美洲" if (subregion and "South" in subregion) else "北美洲"
    return _CONT.get(region, "其他")


def main():
    print("拉取 iptv-org channels/streams + mledoze countries ...")
    chans = _get("https://iptv-org.github.io/api/channels.json")
    streams = _get("https://iptv-org.github.io/api/streams.json")
    countries = _get("https://raw.githubusercontent.com/mledoze/countries/master/countries.json")

    cmap, centroids = {}, {}
    for c in countries:
        code = c.get("cca2")
        zh = (c.get("translations", {}).get("zho", {}).get("common")
              or c.get("name", {}).get("common"))
        ll = c.get("latlng") or [None, None]
        cont = _continent(c.get("region"), c.get("subregion"))
        if code:
            cmap[code] = {"zh": zh, "cont": cont, "lat": ll[0], "lon": ll[1]}
            if zh and ll[0] is not None:
                centroids[zh] = [ll[0], ll[1]]

    chan_by_id = {c["id"]: c for c in chans}
    by_country = {}
    for s in streams:
        url = s.get("url")
        ch = chan_by_id.get(s.get("channel"))
        if not url or not ch or ch.get("is_nsfw"):
            continue
        code = ch.get("country")
        if code in cmap:
            by_country.setdefault(code, []).append((ch, s))

    out, seen, idx = [], set(), 0
    for code, lst in by_country.items():
        info, picked = cmap[code], 0
        for ch, s in lst:
            if picked >= N_PER_COUNTRY:
                break
            url = s["url"]
            if url in seen:
                continue
            seen.add(url)
            idx += 1
            out.append({"id": "g%d" % idx, "name": ch["name"], "country": info["zh"],
                        "continent": info["cont"], "stream": url,
                        "ua": s.get("user_agent"), "referrer": s.get("referrer")})
            picked += 1

    with open(os.path.join(HERE, "channels_global.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, "country_centroids.json"), "w", encoding="utf-8") as f:
        json.dump(centroids, f, ensure_ascii=False, indent=1)

    print("生成频道:", len(out), "| 覆盖国家/地区:", len(set(c["country"] for c in out)))
    print("洲分布:", dict(Counter(c["continent"] for c in out)))
    print("国家质心数:", len(centroids))
    print("含 ua/referrer 的流:", sum(1 for c in out if c["ua"] or c["referrer"]))


if __name__ == "__main__":
    main()
