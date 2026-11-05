/**
 * The PixelForge sheets the game ships (src/assets/pf/, made by tools/packs/pixelforge.py) and their
 * loading. The JSON is bundled with the code; the PNGs are URLs in the app build and data: URLs in the
 * single-file build. pfLoad() decodes every image once (main.tsx waits for it before the first
 * frame); outside a browser (tests, Node tools) there are no images and pfReady() stays false, so the
 * callers keep their old art.
 */
import bat from '../../assets/pf/bat.json';
import fxBoneCrumble from '../../assets/pf/fx_bone_crumble.json';
import fxPoofSmoke from '../../assets/pf/fx_poof_smoke.json';
import fxRockShard from '../../assets/pf/fx_rock_shard.json';
import fxStatusStun from '../../assets/pf/fx_status_stun.json';
import goblin from '../../assets/pf/goblin.json';
import goblinArcher from '../../assets/pf/goblin_archer.json';
import goblinChief from '../../assets/pf/goblin_chief.json';
import ogre from '../../assets/pf/ogre.json';
import orc from '../../assets/pf/orc.json';
import rkArcanist from '../../assets/pf/rk_arcanist.json';
import rkBlade from '../../assets/pf/rk_blade.json';
import rkCleric from '../../assets/pf/rk_cleric.json';
import rkGuardian from '../../assets/pf/rk_guardian.json';
import rkLancer from '../../assets/pf/rk_lancer.json';
import rkRanger from '../../assets/pf/rk_ranger.json';
import skeleton from '../../assets/pf/skeleton.json';
import slime from '../../assets/pf/slime.json';
import stoneWarden from '../../assets/pf/stone_warden.json';
import wolf from '../../assets/pf/wolf.json';
import { PFSheet, type PFMeta } from './sheet';

const METAS = {
  rk_guardian: rkGuardian,
  rk_blade: rkBlade,
  rk_ranger: rkRanger,
  rk_cleric: rkCleric,
  rk_arcanist: rkArcanist,
  rk_lancer: rkLancer,
  slime,
  bat,
  wolf,
  goblin,
  goblin_archer: goblinArcher,
  goblin_chief: goblinChief,
  orc,
  skeleton,
  ogre,
  stone_warden: stoneWarden,
  fx_poof_smoke: fxPoofSmoke,
  fx_bone_crumble: fxBoneCrumble,
  fx_status_stun: fxStatusStun,
  fx_rock_shard: fxRockShard,
} as const;

export type SheetName = keyof typeof METAS;

export const SHEETS: Readonly<Record<SheetName, PFSheet>> = Object.fromEntries(
  Object.entries(METAS).map(([k, m]) => [k, new PFSheet(m as unknown as PFMeta)]),
) as Record<SheetName, PFSheet>;

let urls: Record<string, string> = {};
try {
  urls = import.meta.glob<string>('../../assets/pf/*.png', { eager: true, query: '?url', import: 'default' });
} catch {
  /* not built by Vite (a Node tool): no images */
}

let ready = false;
let loading: Promise<void> | null = null;

/** True once every sheet's pixels are decoded (always false outside a browser). */
export function pfReady(): boolean {
  return ready;
}

async function decode(url: string): Promise<{ w: number; h: number; data: Uint8ClampedArray }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}

/** Decodes every sheet (once). Resolves even if something fails: the old art stays in that case. */
export function pfLoad(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return (loading = Promise.resolve());
  loading = (async () => {
    try {
      await Promise.all(
        (Object.keys(SHEETS) as SheetName[]).map(async (name) => {
          const url = Object.entries(urls).find(([p]) => p.endsWith(`/${name}.png`))?.[1];
          if (!url) throw new Error(`no image for ${name}`);
          SHEETS[name].setPixels(await decode(url));
        }),
      );
      ready = true;
    } catch (e) {
      console.warn('PixelForge sheets did not load; keeping the old art.', e);
    }
  })();
  return loading;
}
