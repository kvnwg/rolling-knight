"""
UI pieces from the two supplied UI sheets, copied 1:1 into src/assets/ui/ (the CSS scales them up
with nearest-neighbor):
  - "MediavelFree.png" (the medieval HUD): the hanging wooden board and its chains, wooden buttons,
    candles, daggers, the plank sign, corner brackets, small icons and the framed HP bar;
  - "UiCozyFree.png": the parchment card and its PLAY button.

  python3 -I tools/packs/ui.py <MediavelFree.png> <UiCozyFree.png> [out dir]
"""
import os
import sys
from PIL import Image

MEDIEVAL = {
    'board': (3, 21, 72, 72),
    'chains': (13, 0, 52, 23),
    'woodFill': (18, 36, 40, 40),
    'candle': (211, 5, 11, 23),
    'candleDark': (227, 5, 11, 23),
    'dagger': (242, 1, 12, 29),
    'daggerRed': (210, 32, 12, 29),
    'plank': (224, 34, 32, 29),
    'bar': (2, 98, 61, 12),
    'cornerTL': (84, 68, 8, 9), 'cornerTR': (100, 68, 8, 9), 'cornerBL': (84, 84, 8, 9), 'cornerBR': (100, 84, 8, 9),
    'cornerTLLight': (148, 68, 8, 9), 'cornerTRLight': (164, 68, 8, 9), 'cornerBLLight': (148, 84, 8, 9), 'cornerBRLight': (164, 84, 8, 9),
    'icoPlus': (212, 68, 7, 7), 'icoCheck': (228, 68, 8, 7), 'icoQuestion': (242, 66, 12, 12), 'icoHouse': (212, 83, 7, 8),
    'icoX': (228, 84, 8, 7), 'icoSound': (242, 82, 12, 10), 'icoMinus': (213, 103, 6, 2), 'icoGear': (226, 98, 12, 12),
    'icoMute': (242, 98, 12, 12), 'icoDollar': (213, 115, 7, 9), 'icoPause': (229, 116, 6, 7), 'icoPlay': (246, 116, 4, 8),
}
# Wooden buttons: 14 x 14 up, 14 x 13 pressed (drawn 1 row lower), light and dark wood.
BUTTONS = ['play', 'pause', 'plus', 'check', 'x', 'minus', 'question', 'dollar']
COZY = {
    'parchment': (164, 167, 47, 80),
    'parchmentTab': (8, 167, 87, 81),
    'playBig': (2, 5, 90, 27),
    'playBigDown': (99, 7, 90, 25),
}


def crop(im, box):
    x, y, w, h = box
    return im.crop((x, y, x + w, y + h))


def main(medieval, cozy, out='src/assets/ui'):
    os.makedirs(out, exist_ok=True)
    m = Image.open(medieval).convert('RGBA')
    c = Image.open(cozy).convert('RGBA')
    for name, box in MEDIEVAL.items():
        crop(m, box).save(os.path.join(out, f'{name}.png'))
    # The HP bar's empty frame: its red fill painted over with the bar's dark inside.
    bar = crop(m, MEDIEVAL['bar'])
    px = bar.load()
    reds = {(196, 26, 47), (254, 96, 86), (207, 30, 52), (255, 113, 104)}
    for y in range(bar.size[1]):
        for x in range(bar.size[0]):
            if px[x, y][:3] in reds:
                px[x, y] = (54, 28, 32, 255)
    bar.save(os.path.join(out, 'barEmpty.png'))
    for i, name in enumerate(BUTTONS):
        col, row = (i % 2) * 2, i // 2
        for shade, dx in (('', 0), ('Dark', 64)):
            x = 81 + col * 16 + dx
            y = 1 + row * 16
            crop(m, (x, y, 14, 14)).save(os.path.join(out, f'btn{name.capitalize()}{shade}.png'))
            crop(m, (x + 16, y + 1, 14, 13)).save(os.path.join(out, f'btn{name.capitalize()}{shade}Down.png'))
    # Blank wooden buttons for text labels: the icon painted over with the button's face.
    for shade in ('', 'Dark'):
        for down in ('', 'Down'):
            b = Image.open(os.path.join(out, f'btnPlus{shade}{down}.png')).convert('RGBA')
            px = b.load()
            face = px[3, 1]
            for y in range(2, 10):
                for x in range(2, 12):
                    px[x, y] = face
            b.save(os.path.join(out, f'btnBlank{shade}{down}.png'))
    for name, box in COZY.items():
        crop(c, box).save(os.path.join(out, f'{name}.png'))
    print('wrote', len(os.listdir(out)), 'files to', out)


if __name__ == '__main__':
    main(*sys.argv[1:])
