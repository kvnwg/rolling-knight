"""
Builds the UI's digits font (src/assets/fonts/rk-digits-{400,700}.woff2): Pixelify Sans's digits with
a new 2 and 5. Pixelify's own 2 is a backwards S with a curled foot and its 5 an S with a round top,
so numbers read as letters; these are drawn on the same 5 x 7 pixel grid with a flat base on the 2 and
a flat top and square corner on the 5. The face covers only the digits (the CSS gives it
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

GLYPHS = {
    'two': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    'five': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
}

# Each weight's 5 x 7 grid in font units: left, right, bottom, top (measured from its own 0 and 3).
GRID = {'400': (60, 525, -12, 631), '700': (61, 542, -11, 638)}


def draw(rows, grid):
    x0, x1, y0, y1 = grid
    cw = (x1 - x0) / 5
    rh = (y1 - y0) / 7
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        top = y1 - r * rh
        bot = top - rh
        c = 0
        while c < 5:
            if row[c] != '#':
                c += 1
                continue
            start = c
            while c < 5 and row[c] == '#':
                c += 1
            # One rectangle per run, a unit taller each way so rows join without seams.
            a, b = round(x0 + start * cw), round(x0 + c * cw)
            lo, hi = round(bot - 1), round(top + 1)
            pen.moveTo((a, lo))
            pen.lineTo((a, hi))
            pen.lineTo((b, hi))
            pen.lineTo((b, lo))
            pen.closePath()
    return pen.glyph()


for weight, grid in GRID.items():
    font = TTFont(SRC / f'pixelify-sans-latin-{weight}-normal.woff2')
    glyf = font['glyf']
    for name, rows in GLYPHS.items():
        glyf[name] = draw(rows, grid)
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
