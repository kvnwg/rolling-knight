"""
The knights' PixelForge sheets without PixelForge's white swing trails, for the game's own swings to
stand alone (the game draws every melee knight's stroke itself, aimed at its target and dressed in
the knight's rarity: src/render/vfx/). Run it with PixelForge's own Python, after `pf build --all`:

    <pixelforge>/.venv/bin/python -I tools/packs/pixelforge_bare.py <pixelforge repo> [recipe...]

(-I keeps this folder off the import path: tools/packs/pixelforge.py would shadow the package.)

It builds each knight recipe (default: every rk_* the game imports) exactly as `pf build` does, with
one change: no swing trail is painted (the trails are the only pixels that differ; a trail drawn over
the body covered it, so the body under it comes from this build). The exports go to
<pixelforge>/out/bare/<name>/ (out/ is PixelForge's build folder, ignored by its git), where
tools/packs/pixelforge.py reads the knights from. Nothing in the PixelForge checkout is changed.
"""
import json
import sys
from pathlib import Path

from PIL import Image

import pixelforge.compose as compose
from pixelforge.build import build
from pixelforge.export import export
from pixelforge.recipe import find_recipe, load_recipe
from pixelforge.style import load_style

KNIGHTS = ['rk_guardian', 'rk_blade', 'rk_ranger', 'rk_cleric', 'rk_arcanist', 'rk_lancer', 'rk_kevin']


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    root = Path(sys.argv[1]).resolve()
    names = sys.argv[2:] or KNIGHTS
    if not callable(getattr(compose.Composer, 'smear_cell', None)):
        raise SystemExit('PixelForge has no Composer.smear_cell any more: update this script for its new trails')
    # The one change: every frame's smear (the swing trail) is left out.
    compose.Composer.smear_cell = lambda self, *args, **kwargs: None
    style = load_style(root / 'style' / 'style.json')
    swing = {tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in style.raw['fx_ramps']['swing']}
    out = root / 'out' / 'bare'
    for name in names:
        recipe = load_recipe(find_recipe(root, name), style)
        folder, _findings = export(build(root, recipe, style=style), out, gifs=False)
        png = Image.open(Path(folder) / f'{name}.png').convert('RGBA')
        data = png.get_flattened_data() if hasattr(png, 'get_flattened_data') else png.getdata()
        left = sum(1 for px in data if px[3] == 255 and px[:3] in swing)
        if left:
            raise SystemExit(f'{name}: {left} swing trail pixels are still drawn')
        meta = json.loads((Path(folder) / f'{name}.json').read_text())
        print(f'{name}: {len(meta["frames"])} frames without trails -> {folder}')


if __name__ == '__main__':
    main()
