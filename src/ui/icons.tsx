/** Pixel icons for the menus, drawn as rows of palette keys (src/render/pixel/palette.ts), and the medieval HUD pieces. */
import { fromRows, type Rows } from '../render/pixel/buf';

const ROWS: Record<string, Rows> = {
  coin: ['..kkkk...', '.kyyyyk..', 'kyYyyyok.', 'kyYyoyok.', 'kyyyyyok.', 'kyyyyook.', '.kooook..', '..kkkk...'],
  clover: ['..kk.kk..', '.klLklLk.', '.kGlkGlk.', 'kkkGlGkkk', 'klLkGklLk', 'kGlkkkGlk', '.kkkgk.k.', '....gk...', '...kk....'],
  hourglass: ['kkkkkkk', 'knnnnnk', '.kYYYk.', '..kyk..', '..kCk..', '.kCYCk.', 'kCYYYCk', 'knnnnnk', 'kkkkkkk'],
  shard: ['...k...', '..kCk..', '.kCwck.', '.kCcck.', 'kCCcUck', '.kCcUk.', '..kUk..', '...k...'],
  sigil: ['...kkk...', '..kMmVk..', '.kMmmmVk.', 'kMmkkkmVk', 'kmmkMkmvk', 'kVmkkkmvk', '.kVmmmvk.', '..kVvvk..', '...kkk...'],
  potion: ['..kkk..', '..kTk..', '.kkTkk.', 'kLlllGk', 'klLlGGk', 'kllGGgk', 'kGGGggk', '.kkkkk.'],
  sword: ['......kk', '.....kwk', '....kwck', '...kwck.', 'kk.kck..', 'kyknk...', '.kyk....', 'kykkk...'],
  shield: ['kkkkkkk', 'k5RRR4k', 'k5RyR4k', 'k5RRR3k', '.k5R3k.', '..k3k..', '...k...'],
  star: ['....k....', '...kyk...', 'kkkkykkkk', 'kYyyyyyok', '.kYyyyok.', '..kyyyk..', '.kyokoyk.', '.kok.kok.', '.kk...kk.'],
  book: ['kkkkkkkk.', 'kRRRRRRk.', 'kReeeeRk.', 'kRRRRRRk.', 'kReeeRRk.', 'kRRRRRRk.', 'kWWWWWWWk', 'kkkkkkkkk'],
  flame: ['....k....', '...kOk...', '..kOyk...', '..kOyOk..', '.kOyYyOk.', '.kOyYYOk.', 'kOyYYYyOk', '.kOyyyOk.', '..kkkkk..'],
  reel: ['kkkkkkkkk', 'k5k5k5k5k', 'kRkGkUkyk', 'k3k3k3k3k', 'kkkkkkkkk', '..k...k..', '.kkk.kkk.'],
  helm: ['..kkkkk..', '.k55554k.', 'k5555443k', 'k5544443k', 'kkkkkkkkk', 'k3k333k3k', 'k3333332k', '.kkkkkkk.'],
  anvil: ['kkkkkkkk.', 'k555544kk', 'kk44443k.', '..k433k..', '..k322k..', '.kk2222kk', 'k11111111k'.slice(0, 9)],
  skull: ['.kkkkk.', 'kWWWWWk', 'kWkWkWk', 'kWWWWWk', '.kWkWk.', '.kkkkk.'],
  bolt: ['....kk', '...kyk', '..kyk.', '.kyyyk', 'kyyyk.', '..kyk.', '.kyk..', '.kk...'],
  swap: ['..k......', '.kyk.....', 'kyyykkkk.', '.kyyyyyk.', '..k...ky.', '.yk...k..', 'kyyyyyk..', '.kkkkyyyk', '.....kyk.'],
  auto: ['.kkkkk.', 'kCCCCCk', 'kCkCkCk', 'kCCCCCk', 'kCkkkCk', 'kCCCCCk', '.kk.kk.'],
};

const cache = new Map<string, string>();

export function iconUrl(name: string): string {
  let url = cache.get(name);
  if (url) return url;
  const rows = ROWS[name];
  if (!rows) return '';
  const w = Math.max(...rows.map((r) => r.length));
  const b = fromRows(rows.map((r) => r.padEnd(w, '.')));
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(b.w, b.h);
  img.data.set(b.px);
  ctx.putImageData(img, 0, 0);
  url = c.toDataURL();
  cache.set(name, url);
  return url;
}

export function Icon({ name, size = 2, className }: { name: string; size?: number; className?: string }) {
  const rows = ROWS[name];
  const w = rows ? Math.max(...rows.map((r) => r.length)) : 8;
  const h = rows ? rows.length : 8;
  return <img className={`px ${className ?? ''}`} src={iconUrl(name)} alt="" draggable={false} style={{ width: w * size, height: h * size }} />;
}

// The medieval HUD pieces (cut from the supplied sheet by tools/packs/ui.py).
const ui = import.meta.glob('../assets/ui/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function uiUrl(name: string): string {
  return ui[`../assets/ui/${name}.png`] ?? '';
}

export function UiImg({ name, scale = 2, className, style }: { name: string; scale?: number; className?: string; style?: React.CSSProperties }) {
  return <img className={`px ${className ?? ''}`} src={uiUrl(name)} alt="" draggable={false} style={{ zoom: scale, ...style }} />;
}
