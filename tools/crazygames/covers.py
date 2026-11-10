#!/usr/bin/env python3
"""Build the CrazyGames store covers for "Roll a Knight!: Idle RPG" from one piece of cover art.

    python3 -I tools/crazygames/covers.py        (from the repo root; needs Pillow and numpy)

Reads   crazygames/covers/source/roll-a-knight-art.webp   1054x1492 portrait key art
Writes  crazygames/covers/cover-portrait-800x1200.png     2:3
        crazygames/covers/cover-portrait-1080x1620.png    2:3, the same frame at trailer size
        crazygames/covers/cover-landscape-1920x1080.png   16:9
        crazygames/covers/cover-square-800x800.png        1:1
Deterministic: fixed seeds, no clock -- the same art gives the same files.

How each cover is composed
  portrait   The art itself with an even ~30 px sliver cropped off each side to reach 2:3.
  landscape  A 16:9 window from a little above the helm down to just above the original title,
             which is cropped away. The knight stands left of centre at full frame height; the
             title lettering is cut out of the art and set at the same pixel scale on the right
             half, vertically centred, over newly synthesised cloud.
  square     From just above the helm to just under the title ornament. That stack is taller than
             the art is wide, so the original title is painted out with cloud, the lettering is
             moved up 9 cells onto the dark fade of the knight's shins, and a thin strip of new
             cloud is added down each side.

How the pieces are made
  cloud      The art is read on its own ~11.5 px block grid (92x130 cells) and its sky reduced to
             7 tones. New cloud is image-quilted on that grid from the art's own cloud cells
             (pure-cloud 12x12 windows, also turned 180 degrees and shifted a tone or two), matched
             to the real art where they meet and steered by a low-frequency guidance map: continue
             the art's tone at the seam, go darker toward the frame edge and behind the lettering.
             It is painted as flat blocks in the art's colours -- no gradients, no mirroring, no
             repeating tile.
  title      Cream letters and rules, their cyan/orange accents and the gem ornament are masked by
             colour and connectivity, then grown by one block for the dark outline; outline pixels
             that are not already near-black are repainted, so none of the old background comes
             along.
  resize     Nearest-neighbour x4, then a box (area) reduction: block edges stay about one pixel
             sharp, without Lanczos ringing or the uneven block widths of plain nearest-neighbour.

The pixel positions below (helm, title box, knight outline ...) were measured on this one piece of art.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COVERS = os.path.join(ROOT, 'crazygames', 'covers')
ART = os.path.join(COVERS, 'source', 'roll-a-knight-art.webp')

NX, NY = 92, 130          # the art's chunky "pixel" grid, in cells (about 11.5 source px each)
K = 7                     # cloud tones, dark -> light
PATCH, OVERLAP = 12, 4    # quilting patch size / overlap, in cells
SUPER = 4                 # supersampling factor of the final resize
LUMW = np.array([0.299, 0.587, 0.114], dtype=np.float32)
TITLE_BOX = (140, 1050, 915, 1450)     # generous source-px box round the title lettering
OUTLINE = (6, 8, 10)                   # the lettering's outline colour in the art


# ----------------------------------------------------------------------------- small helpers

def gauss_kernel(s):
    r = max(1, int(np.ceil(3 * s)))
    x = np.arange(-r, r + 1)
    k = np.exp(-x * x / (2 * s * s))
    return (k / k.sum()).astype(np.float32)


def blur(a, s):
    """Separable Gaussian blur of the first two axes, edges replicated."""
    k = gauss_kernel(s)
    r = len(k) // 2
    pad = [(0, 0)] * a.ndim
    pad[0] = (r, r)
    b = np.pad(a, pad, mode='edge')
    a = sum(k[i] * b[i:i + a.shape[0]] for i in range(len(k)))
    pad[0], pad[1] = (0, 0), (r, r)
    b = np.pad(a, pad, mode='edge')
    return sum(k[i] * b[:, i:i + a.shape[1]] for i in range(len(k)))


def masked_blur(a, m, s):
    m = m.astype(np.float32)
    return blur(a * m, s) / np.maximum(blur(m, s), 1e-4)


def dilate(mask, r):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))) > 127


def label4(mask):
    """4-connected components by max-propagation (small regions only, so plain numpy is fine)."""
    h, w = mask.shape
    lab = np.where(mask, np.arange(1, h * w + 1).reshape(h, w), 0)
    while True:
        m = lab.copy()
        m[1:, :] = np.maximum(m[1:, :], np.where(mask[1:, :] & mask[:-1, :], lab[:-1, :], 0))
        m[:-1, :] = np.maximum(m[:-1, :], np.where(mask[:-1, :] & mask[1:, :], lab[1:, :], 0))
        m[:, 1:] = np.maximum(m[:, 1:], np.where(mask[:, 1:] & mask[:, :-1], lab[:, :-1], 0))
        m[:, :-1] = np.maximum(m[:, :-1], np.where(mask[:, :-1] & mask[:, 1:], lab[:, 1:], 0))
        if (m == lab).all():
            return lab
        lab = m


def smooth_noise(shape, seed, angle_deg=-33.0, scale=14.0, aniso=2.6, beta=3.2):
    """Seeded low-frequency noise (unit std) with streaks rising to the right, like the art's drift."""
    h, w = shape
    wn = np.random.default_rng(seed).standard_normal((h, w)).astype(np.float32)
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    th = np.deg2rad(angle_deg)
    ku = kx * np.cos(th) + ky * np.sin(th)
    kv = -kx * np.sin(th) + ky * np.cos(th)
    filt = 1.0 / (1.0 + (ku * scale * aniso) ** 2 + (kv * scale) ** 2) ** (beta / 2)
    f = np.fft.ifft2(np.fft.fft2(wn) * filt).real
    f -= f.mean()
    return (f / f.std()).astype(np.float32)


# ----------------------------------------------------------------------------- art analysis

def foreground_mask(W, H):
    """Rough hand-measured cover of knight + lance + title, as cells; everything else is cloud."""
    fg = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(fg)
    d.line([(125, 618), (985, 58)], fill=255, width=80)
    d.polygon([(320, 330), (480, 245), (600, 245), (770, 400), (800, 640), (780, 900), (710, 1000),
               (660, 1110), (420, 1110), (335, 880), (350, 640), (290, 560), (285, 420)], fill=255)
    d.rectangle([150, 1045, 910, 1450], fill=255)
    return np.asarray(fg.resize((NX, NY), Image.BOX)) > 20


class Art:
    """The source art plus everything measured from it."""

    def __init__(self, path):
        self.px = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
        self.H, self.W, _ = self.px.shape
        self.cells = self._cell_colors()
        self.bg = ~foreground_mask(self.W, self.H)
        self.pal, self.L = self._palette_levels()
        self.trend = masked_blur(self.L.astype(np.float32), self.bg, 3.0)
        self._lib = None

    def col_x(self, j):
        """Source-px x of cell-column boundary j (j may lie outside the art)."""
        return int(np.round(j * self.W / NX))

    def row_y(self, i):
        return int(np.round(i * self.H / NY))

    def _cell_colors(self):
        """Median colour of the middle of every cell: the art re-read as true pixel art."""
        out = np.zeros((NY, NX, 3), np.float32)
        for i in range(NY):
            y0, y1 = self.row_y(i), self.row_y(i + 1)
            q = (y1 - y0) // 4
            for j in range(NX):
                x0, x1 = self.col_x(j), self.col_x(j + 1)
                p = (x1 - x0) // 4
                out[i, j] = np.median(self.px[y0 + q:y1 - q, x0 + p:x1 - p].reshape(-1, 3), axis=0)
        return out

    def _palette_levels(self):
        """K-means the cloud cells into K tones ordered dark -> light; palette + per-cell level."""
        X = self.cells[self.bg]
        lum = X @ LUMW
        cen = np.array([X[np.abs(lum - v) < 4].mean(0) for v in (16, 27, 48, 84, 117, 154, 171)])
        for _ in range(50):
            a = ((X[:, None] - cen[None]) ** 2).sum(2).argmin(1)
            cen = np.array([X[a == k].mean(0) for k in range(K)])
        pal = np.array([np.median(X[a == k], axis=0) for k in range(K)]).astype(np.float32)
        L = ((self.cells[:, :, None] - pal[None, None]) ** 2).sum(3).argmin(2)
        return pal, L

    @property
    def lib(self):
        if self._lib is None:
            self._lib = Library(self.L, self.bg)
        return self._lib

    def flipped(self):
        """Mirror image of the analysis, so the left side can be extended by the same
        left-to-right quilter (the result is mirrored back, so nothing ends up flipped)."""
        o = object.__new__(Art)
        o.px, o.H, o.W = self.px[:, ::-1], self.H, self.W
        o.cells, o.bg, o.pal = self.cells[:, ::-1], self.bg[:, ::-1], self.pal
        o.L, o.trend, o._lib = self.L[:, ::-1], self.trend[:, ::-1], None
        return o


# ----------------------------------------------------------------------------- cloud synthesis

class Library:
    """Every PATCHxPATCH window of the art's level map that is pure cloud, plus its 180-degree turn
    (a half-turn keeps the lower-left -> upper-right drift of the clouds)."""

    def __init__(self, L, bg):
        B = PATCH
        Lf = L.astype(np.float32)
        Lb = masked_blur(Lf, bg, 2.0)
        view = np.lib.stride_tricks.sliding_window_view
        ii, jj = np.nonzero(view(bg, (B, B)).all(axis=(2, 3)))
        wl = view(Lf, (B, B))[ii, jj]
        wb = view(Lb, (B, B))[ii, jj]
        di, dj = np.mgrid[0:B, 0:B]
        si = ii[:, None, None] + di[None]
        sj = jj[:, None, None] + dj[None]
        self.lev = np.concatenate([wl, wl[:, ::-1, ::-1]]).astype(np.float32)
        self.blr = np.concatenate([wb, wb[:, ::-1, ::-1]]).astype(np.float32)
        self.si = np.concatenate([si, si[:, ::-1, ::-1]])
        self.sj = np.concatenate([sj, sj[:, ::-1, ::-1]])
        self.n = len(self.lev)
        self.shape = L.shape


def min_cut(e):
    """Minimum-error top-to-bottom seam through e (rows x overlap). True = right of the seam."""
    r, c = e.shape
    cost = e.astype(np.float64).copy()
    for i in range(1, r):
        prev = cost[i - 1]
        cost[i] += np.minimum(prev, np.minimum(np.r_[np.inf, prev[:-1]], np.r_[prev[1:], np.inf]))
    mask = np.zeros((r, c), bool)
    j = int(np.argmin(cost[-1]))
    for i in range(r - 1, -1, -1):
        mask[i, j:] = True
        if i > 0:
            lo, hi = max(0, j - 1), min(c, j + 2)
            j = lo + int(np.argmin(cost[i - 1, lo:hi]))
    return mask


def _runs(flags):
    """(start, stop) of every run of True in a 1-D bool array."""
    edges = np.flatnonzero(np.diff(np.r_[False, flags, False].astype(np.int8)))
    return list(zip(edges[::2], edges[1::2]))


def tidy(lev, new, rng):
    """Remove the marks patch seams can leave in the new cells -- shapes the art's own cloud never
    has: lone cells two or more tones away from all eight neighbours, one-cell-wide straight bars
    four or more cells long, and dead-straight tone edges seven or more cells long (those get a
    stair-step knocked into the middle). Art cells are never changed."""
    lev = lev.copy()
    h, w = lev.shape
    for _ in range(3):
        pad = np.pad(lev, 1, mode='edge')
        nb = np.stack([pad[1 + a:1 + a + h, 1 + b:1 + b + w] for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b])
        hi, lo = nb.max(0), nb.min(0)
        lev = np.where(new & (lev >= hi + 2), hi, np.where(new & (lev <= lo - 2), lo, lev))
        for L, N in ((lev, new), (lev.T, new.T)):          # bars/edges running down, then across
            for j in range(1, L.shape[1] - 1):
                side_hi, side_lo = np.maximum(L[:, j - 1], L[:, j + 1]), np.minimum(L[:, j - 1], L[:, j + 1])
                for bar, side in (((L[:, j] > side_hi) & N[:, j], side_hi), ((L[:, j] < side_lo) & N[:, j], side_lo)):
                    for a, b in _runs(bar):
                        if b - a >= 4:
                            L[a:b, j] = side[a:b]
            for j in range(L.shape[1] - 1):
                step = np.sign(L[:, j + 1] - L[:, j])
                for sgn in (-1, 1):
                    for a, b in _runs(step == sgn):
                        if b - a >= 7:
                            m = (a + b) // 2 + int(rng.integers(-1, 2))
                            for k in range(m - 1, m + 2):
                                if N[k, j + 1]:
                                    L[k, j + 1] = L[k, j]
                                elif N[k, j]:
                                    L[k, j] = L[k, j + 1]
    return lev


def quilt(art, lev, known, cmp_ok, G, seed, shifts=(-2, -1, 0, 1), w_g=0.6, w_use=0.15, tol=0.08):
    """Image-quilt the unknown cells of the level map `lev` from the art's cloud library.

    Patches are laid in raster order. Each is chosen to (a) agree with whatever is already there
    inside its window -- real art (`cmp_ok` marks the cells that are cloud and so comparable) or
    earlier patches -- and (b) follow the guidance map G (target local mean tone); one of the
    near-best candidates is picked with the seeded rng, and re-using the same spot of the art is
    penalised. Patches may be shifted a tone or two. Seams between patches follow a minimum-error
    cut; cells that were known on entry (the art) are never overwritten.

    Returns (colours, new): RGB per cell for the cells that were filled, and the mask of those cells.
    """
    lib, B, ov = art.lib, PATCH, OVERLAP
    rng = np.random.default_rng(seed)
    h, w = lev.shape
    lev, known = lev.copy(), known.copy()
    keep = known.copy()
    src_i = np.zeros((h, w), np.int32)
    src_j = np.zeros((h, w), np.int32)
    src_s = np.zeros((h, w), np.int32)
    G = np.clip(G, 0, K - 1).astype(np.float32)
    ui, uj = np.nonzero(~known)

    def starts(lo, hi, limit):
        first = max(0, lo - ov)
        s = list(range(first, max(first + 1, hi - B + 2), B - ov))
        if s[-1] + B < hi + 1:
            s.append(s[-1] + B - ov)
        return [min(v, limit - B) for v in s]

    use = np.zeros(lib.shape, np.float32)
    inov = np.zeros((B, B), bool)
    inov[:ov, :] = True
    inov[:, :ov] = True
    for wi in starts(ui.min(), ui.max(), h):
        for wj in starts(uj.min(), uj.max(), w):
            sl = (slice(wi, wi + B), slice(wj, wj + B))
            kn = known[sl]
            if kn.all():
                continue
            t = lev[sl].astype(np.float32)
            cm = (kn & cmp_ok[sl]).astype(np.float32)
            n_cm = cm.sum()
            best = np.full(lib.n, np.inf, np.float32)
            best_s = np.zeros(lib.n, np.int32)
            for s in shifts:
                cost = w_g * ((np.clip(lib.blr + s, 0, K - 1) - G[sl][None]) ** 2).mean(axis=(1, 2)) + 0.02 * abs(s)
                if n_cm > 0:
                    cost += (((np.clip(lib.lev + s, 0, K - 1) - t[None]) ** 2) * cm[None]).sum(axis=(1, 2)) / n_cm
                better = cost < best
                best[better] = cost[better]
                best_s[better] = s
            best += w_use * use[lib.si, lib.sj].mean(axis=(1, 2))
            cand = np.nonzero(best <= best.min() * (1 + tol) + 0.01)[0]
            pick = int(cand[rng.integers(len(cand))])
            s = int(best_s[pick])
            p = np.clip(lib.lev[pick] + s, 0, K - 1)
            synth = kn & ~keep[sl]
            e = ((p - t) ** 2) * synth
            cut = np.ones((B, B), bool)
            if synth[:, :ov].any():
                cut[:, :ov] &= min_cut(e[:, :ov] + 1e-3)
            if synth[:ov, :].any():
                cut[:ov, :] &= min_cut(e[:ov, :].T + 1e-3).T
            take = ~kn | (synth & inov & cut)
            lev[sl][take] = p[take].astype(lev.dtype)
            known[sl] |= take
            src_i[sl][take] = lib.si[pick][take]
            src_j[sl][take] = lib.sj[pick][take]
            src_s[sl][take] = s
            use[lib.si[pick][take], lib.sj[pick][take]] += 1

    lev = tidy(lev, ~keep, rng)

    # Colours: a copied cell keeps the art's own slight colour variation around its tone; cells
    # that straddled two blocks in the art (large residual) or were tone-shifted lean on the palette.
    old = art.L[src_i, src_j]
    resid = art.cells[src_i, src_j] - art.pal[old]
    wgt = np.where(np.abs(resid).max(axis=2) > 16, 0.0, 1.0)
    wgt = wgt * np.minimum(1.0, (art.pal[lev] @ LUMW) / (art.pal[old] @ LUMW))
    wgt = np.where((old + src_s) != lev, 0.0, wgt)
    return np.clip(art.pal[lev] + resid * wgt[..., None], 0, 255), ~keep


def extend_right(art, rows, n_new, guide, seed):
    """Quilt `n_new` cell columns of new cloud to the right of the art, for cell rows
    [rows[0], rows[1]). guide(shape, edge_trend) gives the guidance map for the new columns from
    the art's local mean tone along its right edge. Returns their colours (rows x n_new x 3)."""
    r0, r1 = rows
    h, w = r1 - r0, PATCH + n_new
    a0 = NX - PATCH                                    # a patch-width of real art as context
    lev = np.zeros((h, w), np.int64)
    lev[:, :PATCH] = art.L[r0:r1, a0:]
    known = np.zeros((h, w), bool)
    known[:, :PATCH] = True
    cmp_ok = np.zeros((h, w), bool)
    cmp_ok[:, :PATCH] = art.bg[r0:r1, a0:]
    G = np.zeros((h, w), np.float32)
    G[:, :PATCH] = art.trend[r0:r1, a0:]
    G[:, PATCH:] = guide((h, n_new), art.trend[r0:r1, NX - 1])
    colors, _ = quilt(art, lev, known, cmp_ok, G, seed)
    return colors[:, PATCH:]


def paint_cells(art, colors, col0, row0, mask=None, into=None):
    """Render cell colours as flat blocks on the art's grid, softened by a fraction of a pixel to
    match the art's own block edges. Returns (px block, x0, y0); with `mask`/`into`, instead
    paints only the masked cells straight onto the full-art-sized px array `into`."""
    h, w, _ = colors.shape
    xs = [art.col_x(col0 + j) for j in range(w + 1)]
    ys = [art.row_y(row0 + i) for i in range(h + 1)]
    out = np.zeros((ys[-1] - ys[0], xs[-1] - xs[0], 3), np.float32)
    sel = np.zeros(out.shape[:2], bool)
    for i in range(h):
        for j in range(w):
            if mask is None or mask[i, j]:
                out[ys[i] - ys[0]:ys[i + 1] - ys[0], xs[j] - xs[0]:xs[j + 1] - xs[0]] = colors[i, j]
                sel[ys[i] - ys[0]:ys[i + 1] - ys[0], xs[j] - xs[0]:xs[j + 1] - xs[0]] = True
    if into is None:
        return blur(out, 0.55), xs[0], ys[0]
    region = into[ys[0]:ys[-1], xs[0]:xs[-1]]
    mixed = blur(np.where(sel[..., None], out, region), 0.55)
    region[dilate(sel, 1)] = mixed[dilate(sel, 1)]
    return into


# ----------------------------------------------------------------------------- title lettering

def lift_title(art, ring=11):
    """Cut the title lettering out of the art. Returns (rgba, bbox): a float RGBA layer the size of
    TITLE_BOX and the source-px bounding box (x0, y0, x1, y1) of its opaque part.

    core  = cream letters and rules (bright pixels connected to cream), their cyan/orange accents,
            and the ornament rule + gem under "Knight";
    ring  = the one-block dark outline: `core` grown by one block. Ring pixels that are not already
            near-black in the art (old cloud showing through) are repainted outline-black, so no
            rectangle or halo of the original background comes along."""
    x0, y0, x1, y1 = TITLE_BOX
    sub = art.px[y0:y1, x0:x1].copy()
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    lum = sub @ LUMW
    cream = lum > 185
    cream[:18, :] = False                                  # rows above the lettering (knight's legs)
    cyan = (b > r + 35) & (g > r + 25) & (lum > 60)
    orange = (r > g + 45) & (g > b + 15) & (r > 140)
    lab = label4((lum > 92) & dilate(cream, 16))
    seeds = np.unique(lab[cream])
    letters = np.isin(lab, seeds[seeds > 0])
    accents = (cyan | orange) & dilate(letters, 14)
    orn = np.zeros_like(letters)
    oy0, oy1, ox0, ox1 = 1378 - y0, 1436 - y0, 355 - x0, 712 - x0
    orn[oy0:oy1, ox0:ox1] = ((lum > 60) | cyan | orange)[oy0:oy1, ox0:ox1]
    core = letters | accents | orn
    full = dilate(core, ring)
    sub[full & ~dilate(core, 2) & (lum >= 14)] = OUTLINE
    ys, xs = np.nonzero(full)
    bbox = (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)
    return np.dstack([sub, full.astype(np.float32) * 255]), bbox


def erase_title(art, rgba, seed):
    """The art's pixels with the title lettering painted out: every cell the lettering touches is
    re-quilted from the surrounding cloud."""
    x0, y0, x1, y1 = TITLE_BOX
    cover = np.zeros((art.H, art.W), bool)
    cover[y0:y1, x0:x1] = dilate(rgba[..., 3] > 0, 3)
    gone = np.asarray(Image.fromarray((cover * 255).astype(np.uint8)).resize((NX, NY), Image.BOX)) > 8
    # comparable cloud: the art's cloud, plus the cells between the letters
    box = np.zeros_like(gone)
    box[1045 * NY // art.H:-(-1450 * NY // art.H), 150 * NX // art.W:-(-910 * NX // art.W)] = True
    cloud = art.bg | (box & ~gone)
    G = masked_blur(art.L.astype(np.float32), cloud, 3.0) - 0.3
    colors, new = quilt(art, art.L, ~gone, cloud, G, seed)
    return paint_cells(art, colors, 0, 0, mask=new, into=art.px.copy())


def paste_rgba(canvas, layer, x, y):
    """Alpha-composite the float RGBA `layer` onto the float RGB array `canvas` at (x, y), clipped."""
    h, w = layer.shape[:2]
    H, W = canvas.shape[:2]
    cx0, cy0, cx1, cy1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if cx0 >= cx1 or cy0 >= cy1:
        return
    lay = layer[cy0 - y:cy1 - y, cx0 - x:cx1 - x]
    a = lay[..., 3:4] / 255.0
    canvas[cy0:cy1, cx0:cx1] = canvas[cy0:cy1, cx0:cx1] * (1 - a) + lay[..., :3] * a


# ----------------------------------------------------------------------------- compositing

class Canvas:
    """Float RGB image addressed in the art's source-px coordinates (the art's top-left is 0,0),
    wide enough for `left`/`right` extra cell columns either side of the art."""

    def __init__(self, art, px, left=0, right=0):
        self.ox = art.col_x(-left)
        self.px = np.zeros((art.H, art.col_x(NX + right) - self.ox, 3), np.float32)
        self.px[:, -self.ox:-self.ox + art.W] = px

    def put(self, block, x, y):
        self.px[y:y + block.shape[0], x - self.ox:x - self.ox + block.shape[1]] = block

    def paste(self, rgba, x, y):
        paste_rgba(self.px, rgba, x - self.ox, y)

    def render(self, x0, y0, x1, y1, size):
        """Resize the window (source px) to `size`: nearest x SUPER, then a box (area) reduction."""
        im = Image.fromarray(np.clip(np.round(self.px), 0, 255).astype(np.uint8))
        box = (x0 - self.ox, y0, x1 - self.ox, y1)
        big = (int(round((x1 - x0) * SUPER)), int(round((y1 - y0) * SUPER)))
        return im.resize(big, Image.NEAREST, box=box).resize(size, Image.BOX)


def save(im, out_dir, name):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    im.save(path, optimize=True)
    print(f'{name}: {im.size[0]}x{im.size[1]}, {os.path.getsize(path) / 1024:.0f} KB')


# ----------------------------------------------------------------------------- the covers

def build_portrait(art, out_dir):
    """2:3 -- the art itself with an even sliver cropped off each side."""
    w = art.H * 2 / 3
    x0 = (art.W - w) / 2
    canvas = Canvas(art, art.px)
    save(canvas.render(x0, 0, x0 + w, art.H, (800, 1200)), out_dir, 'cover-portrait-800x1200.png')
    save(canvas.render(x0, 0, x0 + w, art.H, (1080, 1620)), out_dir, 'cover-portrait-1080x1620.png')


def build_landscape(art, title, out_dir):
    """16:9 -- knight left of centre at full frame height, lettering lifted to the right over new cloud."""
    rgba, (tx0, ty0, tx1, ty1) = title
    y_top, y_bot = 180, 1060                       # a bit above the helm .. just above the original title
    x_left = 100                                   # crop a little cloud off the left; lance butt stays in
    x_right = x_left + (y_bot - y_top) * 16 / 9
    r0 = max(0, y_top * NY // art.H - 2)
    r1 = min(NY, -(-y_bot * NY // art.H) + 2)
    n_new = int(np.ceil(x_right * NX / art.W)) - NX + 1

    # lettering: centred between the knight's sword arm and the frame edge, vertically centred,
    # moved by a whole number of cells so its blocks stay on the cloud grid
    knight_right = 755
    dx = art.col_x(int(np.round(((knight_right + x_right) / 2 - (tx0 + tx1) / 2) * NX / art.W)))
    dy = -art.row_y(int(np.round(((ty0 + ty1) / 2 - (y_top + y_bot) / 2) * NY / art.H)))

    def guide(shape, edge_trend):
        h, w = shape
        jj = np.arange(w, dtype=np.float32)[None, :].repeat(h, 0)
        ii = np.arange(h, dtype=np.float32)[:, None].repeat(w, 1)
        design = 1.4 + 1.3 * smooth_noise((160, 256), seed=5)[:h, NX:NX + w]
        wm = np.exp(-jj / 2.5)                                     # continue the art's tone at the seam
        G = wm * edge_trend[:, None] + (1 - wm) * design
        G -= 2.0 * np.clip((jj - (w - 16)) / 15, 0, 1) ** 1.5      # darker toward the frame edge
        cx = ((tx0 + tx1) / 2 + dx) * NX / art.W - NX              # darker behind the lettering
        cy = ((ty0 + ty1) / 2 + dy) * NY / art.H - r0
        rx, ry = (tx1 - tx0) / 2 * NX / art.W, (ty1 - ty0) / 2 * NY / art.H
        d = np.sqrt(((jj - cx) / (rx + 4)) ** 2 + ((ii - cy) / (ry + 4)) ** 2)
        return G - 0.9 * np.clip(1.25 - d, 0, 1)

    canvas = Canvas(art, art.px, right=n_new)
    canvas.put(*paint_cells(art, extend_right(art, (r0, r1), n_new, guide, seed=1), NX, r0))
    canvas.paste(rgba, TITLE_BOX[0] + dx, TITLE_BOX[1] + dy)
    save(canvas.render(x_left, y_top, x_right, y_bot, (1920, 1080)), out_dir, 'cover-landscape-1920x1080.png')


def build_square(art, title, out_dir):
    """1:1 -- helm to ornament, with the lettering moved up over the knight's shins and a thin strip
    of new cloud on each side."""
    rgba, (tx0, ty0, tx1, ty1) = title
    lift = art.row_y(9)                            # whole cells, so the letters stay on the grid
    y_top, y_bot = 228, ty1 - lift + 24
    side = y_bot - y_top
    x_left = (art.W - side) // 2
    x_right = x_left + side
    r0 = max(0, y_top * NY // art.H - 2)
    n_new = int(np.ceil(-x_left * NX / art.W))

    def guide(shape, edge_trend):
        h, w = shape
        jj = np.arange(w, dtype=np.float32)[None, :].repeat(h, 0)
        return edge_trend[:, None] - 0.13 * jj                     # same clouds, darker toward the edge

    canvas = Canvas(art, erase_title(art, rgba, seed=5), left=n_new, right=n_new)
    canvas.put(*paint_cells(art, extend_right(art, (r0, NY), n_new, guide, seed=2), NX, r0))
    left = extend_right(art.flipped(), (r0, NY), n_new, guide, seed=3)[:, ::-1]
    canvas.put(*paint_cells(art, left, -n_new, r0))
    canvas.paste(rgba, TITLE_BOX[0], TITLE_BOX[1] - lift)
    save(canvas.render(x_left, y_top, x_right, y_bot, (800, 800)), out_dir, 'cover-square-800x800.png')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--art', default=ART, help='source art (default: %(default)s)')
    ap.add_argument('--out', default=COVERS, help='output directory (default: %(default)s)')
    args = ap.parse_args()
    art = Art(args.art)
    title = lift_title(art)
    build_portrait(art, args.out)
    build_landscape(art, title, args.out)
    build_square(art, title, args.out)


if __name__ == '__main__':
    main()
