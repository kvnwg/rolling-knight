"""
Builds the UI's digits font (src/assets/fonts/rk-digits-{400,700}.woff2): Pixelify Sans's digits with
a new 2 and 5. Pixelify's own 2 is a backwards S with a curled foot and its 5 an S with a round top,
so numbers read as letters. These are built from bars as heavy as each weight's own 0 and 3 (read off
those glyphs, so the bold 2 and 5 are as bold as the bold 3): a 2 with a flat base and a 5 with a flat
top and square corners, the shapes on any clock. The face covers only the digits (the CSS gives it
unicode-range U+0030-0039, in front of Pixelify Sans), so everything else is Pixelify as before.

  python3 -I tools/fonts/digits.py <rolling-knight checkout>

Needs fontTools and brotli (pip install fonttools brotli). Pixelify Sans is under the SIL Open Font
License; the derivative is renamed ("RK Digits") as the license asks.
"""
import sys
from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
SRC = ROOT / 'node_modules/@fontsource/pixelify-sans/files'
OUT = ROOT / 'src/assets/fonts'

from fontTools.pens.recordingPen import RecordingPen


def edges(font, name):
    """The x and y coordinates a glyph's outline uses, sorted (Pixelify draws digits from bars)."""
    pen = RecordingPen()
    font.getGlyphSet()[name].draw(pen)
    xs, ys = set(), set()
    for _, args in pen.value:
        for pt in args:
            xs.add(round(pt[0]))
            ys.add(round(pt[1]))
    return sorted(xs), sorted(ys)


def metrics(font, weight):
    """
    The weight's own strokes, read off its 0 and its 3: the outer left and right, the inner edges of
    the side strokes, the bottom and top bars, and the middle bar (so the new digits are exactly as
    heavy as the others in this weight).
    """
    zx, zy = edges(font, 'zero')
    _, ty = edges(font, 'three')
    # (The regular weight's strokes are a pixel wide with their corner cuts inside; the bold's are
    # wider with the cuts outside: so the inner edge is the 2nd coordinate in, or the 3rd.)
    k = 1 if weight == '400' else 2
    L, R = zx[0], zx[-1]
    Li, Ri = zx[k], zx[-1 - k]
    B, T = zy[0], zy[-1]
    Bi, Ti = zy[k], zy[-1 - k]
    # The 3's middle bar, as thick as the others.
    mid = (B + T) / 2
    lower = [y for y in ty if Bi < y < mid]
    M0 = lower[-2]
    return L, Li, Ri, R, B, Bi, M0, M0 + (Bi - B), Ti, T


def rects(boxes):
    pen = TTGlyphPen(None)
    for a, lo, b, hi in boxes:
        pen.moveTo((a, lo))
        pen.lineTo((a, hi))
        pen.lineTo((b, hi))
        pen.lineTo((b, lo))
        pen.closePath()
    return pen.glyph()


def two(m):
    """A 2 that can't be read as anything else: top bar, right side down to the middle, the middle
    bar, left side down to the base, a flat base."""
    L, Li, Ri, R, B, Bi, M0, M1, Ti, T = m
    return rects([(L, Ti, R, T), (Ri, M0, R, T), (L, M0, R, M1), (L, B, Li, M1), (L, B, R, Bi)])


def five(m):
    """A 5 with a flat top and square corners: top bar, left side down to the middle, the middle bar,
    right side down to the base, a flat base."""
    L, Li, Ri, R, B, Bi, M0, M1, Ti, T = m
    return rects([(L, Ti, R, T), (L, M0, Li, T), (L, M0, R, M1), (Ri, B, R, M1), (L, B, R, Bi)])


GLYPHS = {'two': two, 'five': five}


for weight in ('400', '700'):
    font = TTFont(SRC / f'pixelify-sans-latin-{weight}-normal.woff2')
    glyf = font['glyf']
    m = metrics(font, weight)
    print(weight, 'strokes', m)
    for name, make in GLYPHS.items():
        glyf[name] = make(m)
        adv, _ = font['hmtx'][name]
        glyf[name].recalcBounds(glyf)
        font['hmtx'][name] = (adv, glyf[name].xMin)
    opts = Options()
    opts.flavor = 'woff2'
    opts.layout_features = []
    opts.name_IDs = ['*']
    sub = Subsetter(opts)
    sub.populate(unicodes=range(0x30, 0x3A))
    sub.subset(font)
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = 'RK Digits' if rec.nameID != 4 else f'RK Digits {"Bold" if weight == "700" else "Regular"}'
        elif rec.nameID == 6:
            rec.string = f'RKDigits-{"Bold" if weight == "700" else "Regular"}'
    font.flavor = 'woff2'
    out = OUT / f'rk-digits-{weight}.woff2'
    font.save(out)
    print('wrote', out, out.stat().st_size, 'bytes')
