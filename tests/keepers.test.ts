import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/newGame';
import { PERKS } from '../src/core/perks';
import { effectAt, tabLines } from '../src/core/upgradeTree';
import { UPGRADES, UPGRADE_TABS, upgradeTab } from '../src/core/upgrades';
import { lightLayer } from '../src/render/art/keepers/light';
import { paintKeeperScene } from '../src/render/art/keepers/scenes';
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
    // Quick Roll is on the Combat tab, with Swift Boots.
    expect(TINKER_CATS.combat.find((c) => c.lines.includes('quickRoll'))?.lines).toContain('swiftness');
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
