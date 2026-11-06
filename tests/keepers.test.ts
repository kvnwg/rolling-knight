import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/newGame';
import { PERKS } from '../src/core/perks';
import { effectAt, tabLines } from '../src/core/upgradeTree';
import { UPGRADES, UPGRADE_TABS, upgradeTab } from '../src/core/upgrades';
import { Layer } from '../src/render/art/hubKit';
import { HUB_CAST } from '../src/render/art/hubNpcs';
import { bustGeometry, paintBust, type BustTool } from '../src/render/art/keepers/bust';
import { lightLayer } from '../src/render/art/keepers/light';
import { COUNTER_H, paintKeeperScene } from '../src/render/art/keepers/scenes';
import { UI_SPRITES } from '../src/render/pixel/ui';
import { TINKER_CATS } from '../src/ui/keeper/tinkerCats';
import { UPGRADE_ICON_ROWS } from '../src/ui/upgrades/iconRows';
import type { StationId } from '../src/world/hubWorld';

/** The UI's own extra icons (px.tsx draws these at one size). */
const PX_EXTRA = ['helm', 'tent', 'hourglass', 'boot', 'shard', 'sigil', 'swords'];
const STATIONS: StationId[] = ['altar', 'quests', 'scrap', 'upgrades', 'squad', 'perks', 'rebirth', 'smith', 'gate'];

describe("the tinker's counter", () => {
  it('sorts every line of each tab into exactly one of its categories', () => {
    for (const tab of UPGRADE_TABS) {
      const listed = TINKER_CATS[tab].flatMap((c) => c.lines);
      expect(new Set(listed).size, tab).toBe(listed.length);
      expect([...listed].sort(), tab).toEqual(tabLines(tab).map((u) => u.id).sort());
      for (const id of listed) expect(upgradeTab(UPGRADES.find((u) => u.id === id)!), id).toBe(tab);
    }
    // Quick Roll is on the Combat tab, with Attack Speed and Move Speed.
    expect(TINKER_CATS.combat.find((c) => c.lines.includes('quickRoll'))?.lines).toEqual(['atkSpeed', 'swiftness', 'quickRoll']);
  });

  it('says what every line does in a few words, at every tier (the lines on its card)', () => {
    const s = newGame(1);
    for (const u of UPGRADES) {
      for (let t = 0; t <= u.max; t++) {
        const text = effectAt(s, u.id, t);
        expect(text.length, `${u.id} ${t}`).toBeGreaterThan(0);
        expect(text.length, `${u.id} ${t}: ${text}`).toBeLessThanOrEqual(40);
      }
    }
    expect(effectAt(s, 'quickRoll', 5)).toBe('-60% roll time');
  });

  it('gives every perk a few words for its card', () => {
    for (const p of PERKS) {
      expect(p.short.length, p.id).toBeGreaterThan(0);
      expect(p.short.length, `${p.id}: ${p.short}`).toBeLessThanOrEqual(34);
    }
  });
});

describe('every offer has a picture', () => {
  it('for every upgrade line, perk and category, drawn here or one of the UI icons', () => {
    const has = (icon: string) => icon in UPGRADE_ICON_ROWS || icon in UI_SPRITES || PX_EXTRA.includes(icon);
    for (const u of UPGRADES) expect(has(u.icon), `${u.id}: ${u.icon}`).toBe(true);
    for (const p of PERKS) expect(has(p.icon), `${p.id}: ${p.icon}`).toBe(true);
    for (const tab of UPGRADE_TABS) for (const c of TINKER_CATS[tab]) expect(has(c.icon), c.id).toBe(true);
    // No two lines on a tab share a picture.
    for (const tab of UPGRADE_TABS) {
      const icons = tabLines(tab).map((u) => u.icon);
      const dupes = icons.filter((x, i) => icons.indexOf(x) !== i);
      expect(dupes, tab).toEqual([]);
    }
  });
});

describe("the keepers' scenes", () => {
  it('paint every keeper at a phone and a desktop size, fully, with a blink, and light up', () => {
    for (const id of STATIONS) {
      for (const [w, h] of [
        [196, 120],
        [280, 86],
      ]) {
        const art = paintKeeperScene(id, w, h);
        expect([art.L.w, art.L.h], id).toEqual([w, h]);
        // Every pixel painted.
        let holes = 0;
        for (let i = 3; i < art.L.buf.px.length; i += 4) if (!art.L.buf.px[i]) holes++;
        expect(holes, `${id} ${w}x${h}`).toBe(0);
        // The keepers blink (the notice board has no eyes).
        if (id === 'quests') expect(art.blink.length).toBe(0);
        else expect(art.blink.length, id).toBeGreaterThanOrEqual(16);
        expect(art.L.lights.length, id).toBeGreaterThan(0);
        const lit = lightLayer(art.L, { ambient: art.ambient, bloom: art.bloom, vignette: art.vignette });
        expect(lit.length).toBe(w * h * 4);
        // Warmly lit: neither black nor washed out.
        let sum = 0;
        for (let i = 0; i < lit.length; i += 4) sum += (lit[i] + lit[i + 1] + lit[i + 2]) / 3;
        const mean = sum / (w * h);
        expect(mean, id).toBeGreaterThan(18);
        expect(mean, id).toBeLessThan(170);
      }
    }
  });

  it('paint the same picture every time (nothing random at run time)', () => {
    const a = paintKeeperScene('upgrades', 200, 100).L.buf.px;
    const b = paintKeeperScene('upgrades', 200, 100).L.buf.px;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('the keepers at their counters', () => {
  /** A keeper's bust painted on a layer reaching well above the scene's top; its topmost row. */
  const topRow = (L: Layer) => {
    for (let y = L.y0; y < L.y0 + L.h; y++) for (let x = L.x0; x < L.x0 + L.w; x++) if (L.a(x, y)) return y;
    return Infinity;
  };
  const SHORTEST = 86;
  const TOOLS: Array<BustTool | undefined> = [undefined, 'wrench', 'hammer', 'tongs', 'candle', 'quill', 'staff', 'spear', 'magnifier', 'orbStaff'];

  it('fit whole in the shortest scene, hats, hair and whatever they hold', () => {
    const base = SHORTEST - COUNTER_H;
    for (const [id, def] of Object.entries(HUB_CAST)) {
      for (const tool of TOOLS) {
        const L = new Layer(0, -40, 120, SHORTEST + 40);
        paintBust(L, 60, base, { look: def.look, tool }).front(L);
        expect(topRow(L), `${id} ${tool ?? ''}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('stand in anime proportions: a head well under half the figure, shoulders far wider than it', () => {
    const base = SHORTEST - COUNTER_H;
    for (const [id, def] of Object.entries(HUB_CAST)) {
      const L = new Layer(0, -40, 120, SHORTEST + 40);
      paintBust(L, 60, base, { look: def.look });
      const g = bustGeometry(60, base);
      // Crown to chin is about four tenths of crown to counter (a chibi's head was three fifths), and
      // under about half even counting the hair or hat over it.
      const head = (g.chin - g.top + 1) / (base - g.top);
      expect(head, id).toBeGreaterThan(0.38);
      expect(head, id).toBeLessThan(0.48);
      const top = topRow(L);
      expect((g.chin - top + 1) / (base - top), id).toBeLessThan(0.53);
      const width = (y0: number, y1: number) => {
        let w = 0;
        for (let y = y0; y <= y1; y++) {
          let a = Infinity;
          let z = -Infinity;
          for (let x = L.x0; x < L.x0 + L.w; x++) if (L.a(x, y)) [a, z] = [Math.min(a, x), Math.max(z, x)];
          w = Math.max(w, z - a + 1);
        }
        return w;
      };
      // The shoulders under the neck are far wider than the head, hair and hoods and all.
      expect(width(g.chin + 8, base - 1), id).toBeGreaterThan(width(g.eyeY, g.chin) * 1.25);
    }
  });

  it('blink with their eyes only, and never paint the same face twice', () => {
    const base = SHORTEST - COUNTER_H;
    const faces = new Set<string>();
    for (const [id, def] of Object.entries(HUB_CAST)) {
      const L = new Layer(0, -40, 120, SHORTEST + 40);
      const out = paintBust(L, 60, base, { look: def.look });
      const g = bustGeometry(60, base);
      // Every pixel that shuts lies on the eyes' rows (lids, lashes, a flick at the corners).
      for (const [, y] of out.blink) {
        expect(y, id).toBeGreaterThanOrEqual(g.eyeY - 2);
        expect(y, id).toBeLessThanOrEqual(g.eyeY + 6);
      }
      expect(out.blink.length, id).toBeGreaterThanOrEqual(16);
      let face = '';
      for (let y = g.top - 4; y <= g.chin; y++) for (let x = 44; x <= 76; x++) face += L.get(x, y) ?? '.';
      faces.add(face);
    }
    expect(faces.size).toBe(Object.keys(HUB_CAST).length);
  });
});
