# -*- coding: utf-8 -*-
"""把绿太阳 Logo 合成为【英国服务端】/【深圳客户端】两个图标(PNG+ICO)。分辨率自适应。
元素：去豆包水印改『北京抖音AI技术』；左上白字『图标为Claude_豆包并联生成』；
底部三面小旗(英/中/绿黑红)，绿黑红旗标注 3.4Pz。"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:\Users\Administrator\Documents\绿太阳服务器、客户端的Logo.png"
FONTS = r"C:\Windows\Fonts"


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), int(size))


def outline_text(d, xy, s, fnt, fill="white", anchor=None, ow=3, oc=(0, 0, 0, 235)):
    x, y = xy
    for dx in range(-ow, ow + 1):
        for dy in range(-ow, ow + 1):
            if dx or dy:
                d.text((x + dx, y + dy), s, font=fnt, fill=oc, anchor=anchor)
    d.text((x, y), s, font=fnt, fill=fill, anchor=anchor)


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
        rot = math.atan2(by - cy, bx - cx) + math.pi / 2
        star(d, cx, cy, h * 0.085, rot, (255, 222, 0, 255))
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


def flag_gbr(w, h):
    """绿-黑-红 竖三条。"""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w / 3, h], fill=(26, 166, 75, 255))
    d.rectangle([w / 3, 0, 2 * w / 3, h], fill=(17, 17, 17, 255))
    d.rectangle([2 * w / 3, 0, w, h], fill=(224, 36, 36, 255))
    return im


def paste_flag(base, mk, x, y, w, h, S, label=None):
    fl = mk(w, h)
    bw = max(2, int(3 * S))
    bd = Image.new("RGBA", (w + 2 * bw, h + 2 * bw), (255, 255, 255, 240))
    bd.paste(fl, (bw, bw), fl)
    base.alpha_composite(bd, (x, y))
    if label:
        d = ImageDraw.Draw(base)
        outline_text(d, (x + (w + 2 * bw) / 2, y + (h + 2 * bw) / 2), label,
                     font("arialbd.ttf", h * 0.46), fill=(255, 238, 90, 255),
                     anchor="mm", ow=max(2, int(2 * S)))


def erase_watermark(im):
    """从水印正上方克隆草地，覆盖右下角『豆包AI生成』。"""
    W, H = im.size
    x0, y0, y1 = int(W * 0.73), int(H * 0.915), int(H * 0.995)
    dy = int(H * 0.090)
    patch = im.crop((x0, y0 - dy, W, y1 - dy))
    im.paste(patch, (x0, y0, W, y1))


def build(kind):
    im = Image.open(SRC).convert("RGBA")
    W, H = im.size
    S = W / 600.0
    erase_watermark(im)
    d = ImageDraw.Draw(im)
    m = int(14 * S)

    # 左上：白色小字（图标来源）
    outline_text(d, (m, int(12 * S)), "图标为Claude_豆包并联生成",
                 font("msyh.ttc", 16 * S), ow=max(2, int(1.6 * S)))
    # 右上：北京抖音AI技术（替代原水印）
    outline_text(d, (W - m, int(12 * S)), "北京抖音AI技术",
                 font("msyh.ttc", 16 * S), anchor="ra", ow=max(2, int(1.6 * S)))

    big = (int(72 * S), int(48 * S))
    sml = (int(58 * S), int(39 * S))
    yb = int(H - 104 * S)
    if kind == "uk":          # 英国服务端：左下英(最小) 中 中国 右 绿黑红(3.4Pz)
        paste_flag(im, flag_uk, m, yb + int(7 * S), sml[0], sml[1], S)
        paste_flag(im, flag_china, int(W / 2 - big[0] / 2), yb, big[0], big[1], S)
        paste_flag(im, flag_gbr, W - m - big[0], yb, big[0], big[1], S, label="3.4Pz")
        title = "UK PROBE · 大英探针"
    else:                     # 深圳客户端：左下中国 中 绿黑红(3.4Pz) 右下 英国
        paste_flag(im, flag_china, m, yb, big[0], big[1], S)
        paste_flag(im, flag_gbr, int(W / 2 - big[0] / 2), yb, big[0], big[1], S, label="3.4Pz")
        paste_flag(im, flag_uk, W - m - sml[0], yb + int(7 * S), sml[0], sml[1], S)
        title = "SHENZHEN CLIENT · 深圳客户端"

    outline_text(d, (W / 2, int(H - 30 * S)), title, font("msyhbd.ttc", 19 * S),
                 anchor="mm", ow=max(2, int(2 * S)))

    out_png = os.path.join(HERE, "logo_%s.png" % kind)
    out_ico = os.path.join(HERE, "logo_%s.ico" % kind)
    im.convert("RGB").save(out_png)
    im.save(out_ico, format="ICO",
            sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print("saved", out_png, "+", out_ico)


build("uk")
build("sz")
print("DONE")
