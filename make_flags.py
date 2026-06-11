# -*- coding: utf-8 -*-
"""生成三面小国旗 PNG 到 static/：英国 / 中国 / 绿黑红(中间标 3.4Pszm)。供网页与GUI共用。"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "static")
os.makedirs(OUT, exist_ok=True)
W, H = 132, 88
FONTS = r"C:\Windows\Fonts"


def star(d, cx, cy, r, rot, fill):
    pts = []
    for i in range(5):
        a = -math.pi / 2 + rot + i * 2 * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        a2 = a + math.pi / 5
        pts.append((cx + r * 0.4 * math.cos(a2), cy + r * 0.4 * math.sin(a2)))
    d.polygon(pts, fill=fill)


def flag_china(w, h):
    im = Image.new("RGBA", (w, h), (222, 41, 41, 255))
    d = ImageDraw.Draw(im)
    bx, by = w * 0.22, h * 0.32
    star(d, bx, by, h * 0.22, 0, (255, 222, 0, 255))
    for px, py in [(0.40, 0.12), (0.50, 0.26), (0.50, 0.46), (0.40, 0.60)]:
        cx, cy = w * px, h * py
        star(d, cx, cy, h * 0.085, math.atan2(by - cy, bx - cx) + math.pi / 2, (255, 222, 0, 255))
    return im


def flag_uk(w, h):
    im = Image.new("RGBA", (w, h), (1, 33, 105, 255))
    d = ImageDraw.Draw(im)
    white, red = (255, 255, 255, 255), (200, 16, 46, 255)
    d.line([(0, 0), (w, h)], fill=white, width=int(h * 0.30))
    d.line([(0, h), (w, 0)], fill=white, width=int(h * 0.30))
    d.line([(0, 0), (w, h)], fill=red, width=int(h * 0.13))
    d.line([(0, h), (w, 0)], fill=red, width=int(h * 0.13))
    d.rectangle([w / 2 - h * 0.17, 0, w / 2 + h * 0.17, h], fill=white)
    d.rectangle([0, h / 2 - h * 0.17, w, h / 2 + h * 0.17], fill=white)
    d.rectangle([w / 2 - h * 0.09, 0, w / 2 + h * 0.09, h], fill=red)
    d.rectangle([0, h / 2 - h * 0.09, w, h / 2 + h * 0.09], fill=red)
    return im


def flag_gbr(w, h, label="3.4Pszm"):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w / 3, h], fill=(26, 166, 75, 255))
    d.rectangle([w / 3, 0, 2 * w / 3, h], fill=(17, 17, 17, 255))
    d.rectangle([2 * w / 3, 0, w, h], fill=(224, 36, 36, 255))
    f = ImageFont.truetype(os.path.join(FONTS, "arialbd.ttf"), int(h * 0.30))
    cx, cy = w / 2, h / 2
    for dx in (-2, -1, 0, 1, 2):
        for dy in (-2, -1, 0, 1, 2):
            d.text((cx + dx, cy + dy), label, font=f, fill=(0, 0, 0, 255), anchor="mm")
    d.text((cx, cy), label, font=f, fill=(255, 238, 90, 255), anchor="mm")
    return im


def flag_us(w, h):
    im = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    d = ImageDraw.Draw(im)
    red, blue, white = (178, 34, 52, 255), (60, 59, 110, 255), (255, 255, 255, 255)
    sh = h / 13.0
    for i in range(13):
        if i % 2 == 0:
            d.rectangle([0, i * sh, w, (i + 1) * sh], fill=red)
    cw, ch = w * 0.42, sh * 7
    d.rectangle([0, 0, cw, ch], fill=blue)
    for r in range(4):
        for c in range(5):
            star(d, cw * (0.13 + 0.19 * c), ch * (0.17 + 0.22 * r), h * 0.042, 0, white)
    return im


def flag_fr(w, h):
    im = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w / 3, h], fill=(0, 85, 164, 255))        # 蓝
    d.rectangle([w / 3, 0, 2 * w / 3, h], fill=(255, 255, 255, 255))  # 白
    d.rectangle([2 * w / 3, 0, w, h], fill=(239, 65, 53, 255))   # 红
    return im


def bordered(fl):
    bw = 3
    bd = Image.new("RGBA", (fl.width + 2 * bw, fl.height + 2 * bw), (255, 255, 255, 255))
    bd.paste(fl, (bw, bw), fl)
    return bd


for name, mk in (("uk_flag", flag_uk), ("cn_flag", flag_china), ("gbr_flag", flag_gbr),
                 ("us_flag", flag_us), ("fr_flag", flag_fr)):
    bordered(mk(W, H)).save(os.path.join(OUT, name + ".png"))
    print("saved", name + ".png")
print("DONE")
