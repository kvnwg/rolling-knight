/**
 * Saves live in localStorage as JSON (or, on a portal, in the store it gives: setSaveStore). A save
 * that fails to load is kept under a rescue key instead of being thrown away, and anything missing
 * from an older save is filled in from a new game.
 */
import { cleanDeck, isDesign, shuffleDeck } from './deck';
import { newGame } from './newGame';
import { Rng } from './rng';
import { KNIGHTS_BY_ID } from './knights';
import { PERKS_BY_ID } from './perks';
import { dupeGold, sanitizeSquad } from './roster';
import { SAVE_VERSION, type GameState, type KnightRec } from './state';
import { mendTutorial } from './tutorial';
import { sanitizeUpgrades } from './upgrades';

export const SAVE_KEY = 'rolling-knight-save';
const RESCUE_KEY = 'rolling-knight-rescue';

/** Somewhere to keep a save: localStorage's own shape, so anything with these three will do. */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let store: SaveStore | null = null;

/**
 * Keeps saves in `to` instead of the browser's localStorage: a portal's own storage, tied to the
 * player's account and synced across their devices (platform/crazygames.ts). Null: localStorage again.
 * Set before the game is made (the Game loads its save as it starts).
 */
export function setSaveStore(to: SaveStore | null): void {
  store = to;
}

function storage(): SaveStore | null {
  if (store) return store;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Fills in anything an older or damaged save is missing, from a fresh game's values. */
export function mend(raw: unknown): GameState {
  const fresh = newGame();
  if (!raw || typeof raw !== 'object') return fresh;
  const s = raw as Partial<GameState> & Record<string, unknown>;
  const out = { ...fresh, ...s } as GameState;
  out.roll = { ...fresh.roll, ...(s.roll ?? {}) };
  out.run = { ...fresh.run, ...(s.run ?? {}) };
  out.records = { ...fresh.records, ...(s.records ?? {}) };
  out.stats = { ...fresh.stats, ...(s.stats ?? {}) };
  out.settings = { ...fresh.settings, ...(s.settings ?? {}) };
  out.seen = { ...fresh.seen, ...(s.seen ?? {}) };
  if (!out.roster || typeof out.roster !== 'object') out.roster = {};
  // Older saves flagged knights NEW until you opened each one; NEW now lasts 30 s from `gotAt`
  // (which those knights don't have), so the old flag goes and nothing from them shows NEW.
  for (const rec of Object.values(out.roster)) {
    if (rec && typeof rec === 'object') delete (rec as { isNew?: unknown }).isNew;
  }
  // A record that isn't a knight the game has (a damaged save, or a knight since renamed) goes: left
  // in, the first thing to look it up throws, on every start, before anything can be saved over it.
  for (const [id, rec] of Object.entries(out.roster)) {
    if (!rec || typeof rec !== 'object' || rec.id !== id || !KNIGHTS_BY_ID.has(id)) delete out.roster[id];
  }
  if (!Array.isArray(out.quests)) out.quests = [];
  if (!Array.isArray(out.squad) || out.squad.length !== 3) out.squad = [null, null, null];
  out.squad = out.squad.map((id) => (id && out.roster[id] ? id : null));
  if (!(out.controlled >= 0 && out.controlled < 3)) out.controlled = 0;
  for (const k of ['gold', 'hourglasses', 'sigils', 'playTimeMs', 'rebirths'] as const) {
    if (!Number.isFinite(out[k]) || out[k] < 0) out[k] = 0;
  }
  // The tutorial: the save's own, cleaned; a save from before it gets none if it has any progress.
  out.seen.tutorial = mendTutorial((s.seen as { tutorial?: unknown } | undefined)?.tutorial, out);
  // A spin in progress is replayed from the top, the same spin (what it rolled was settled, and what
  // it spent was spent, the moment it began: dropping it would lose both). A damaged one goes.
  const cur = out.roll.current;
  if (cur && !(Array.isArray(cur.reels) && cur.reels.length > 0 && cur.reels.every((r) => r && KNIGHTS_BY_ID.has(r.knightId) && Number.isFinite(r.landAt)) && Number.isFinite(cur.spinSeconds) && Number.isFinite(cur.restSeconds))) out.roll.current = null;
  out.roll.timer = 0;
  mendDeck(out, s.run);
  out.version = SAVE_VERSION;
  // Upgrade tiers within each line's range (the map was rebuilt: some lines have fewer tiers now).
  // Combat lines hang off nothing now (they're rolled), so every combat tier a save has stays.
  sanitizeUpgrades(out);
  sanitizeSquad(out);
  mendPerks(out);
  cashInSpares(out);
  mendExtras(out);
  return out;
}

/**
 * Extras (repeat pulls waiting at the broker's, on each knight's record): a save from before them
 * has none (its repeats paid out as gold as they landed). A damaged count becomes a whole number, and
 * extras that lost what they'd fetch are valued at what a repeat is worth now.
 */
function mendExtras(out: GameState): void {
  for (const rec of Object.values(out.roster)) {
    if (!rec || typeof rec !== 'object') continue;
    const n = Math.max(0, Math.floor(Number(rec.extras) || 0));
    let g = Number(rec.extrasGold);
    if (!Number.isFinite(g) || g < 0 || n === 0) g = 0;
    if (n > 0 && g === 0 && KNIGHTS_BY_ID.has(rec.id)) g = n * dupeGold(out, rec.id);
    rec.extras = n;
    rec.extrasGold = g;
  }
}

/**
 * Perks owned stay owned (bought from the trees before perks were rolled, or rolled since): only
 * perks that still exist, each once, so the sage's roll never lands one you have.
 */
function mendPerks(out: GameState): void {
  const known = (raw: unknown): string[] => [...new Set((Array.isArray(raw) ? raw : []).filter((id): id is string => typeof id === 'string' && PERKS_BY_ID.has(id)))];
  out.perks = known(out.perks);
  // Perks turned down this run (a save from before there was a choice has none), never one that's owned;
  // and the offer on the sage's counter, if it's still one he could make.
  out.perksPassed = known(out.perksPassed).filter((id) => !out.perks.includes(id));
  const offer = out.perkOffer;
  out.perkOffer = typeof offer === 'string' && PERKS_BY_ID.has(offer) && !out.perks.includes(offer) && !out.perksPassed.includes(offer) ? offer : null;
}

/**
 * The deck of floor designs. A save from before there were designs (version 1) played the chain of
 * rooms on every floor: it gets a fresh deck that opens with something else. A damaged deck loses
 * what isn't a design.
 */
function mendDeck(out: GameState, saved: Partial<GameState['run']> | undefined): void {
  const run = out.run;
  if (!Array.isArray(saved?.designDeck)) {
    run.lastDesign = 'chain';
    run.designDeck = shuffleDeck(Rng.hashSeed(run.biomeSeed ^ out.seed ^ 0x5eed), 'chain');
  }
  run.designDeck = cleanDeck(run.designDeck);
  if (!isDesign(run.lastDesign)) run.lastDesign = null;
  if (!Number.isInteger(run.visits) || run.visits < 0) run.visits = 0;
}

export function loadGame(): GameState | null {
  const st = storage();
  let text: string | null | undefined;
  try {
    text = st?.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return mend(JSON.parse(text));
  } catch {
    try {
      st?.setItem(RESCUE_KEY, text);
    } catch {
      // Nowhere to keep it: a new game all the same.
    }
    return null;
  }
}

export function saveGame(state: GameState): void {
  const st = storage();
  if (!st) return;
  state.savedAt = Date.now();
  try {
    st.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: keep playing.
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/**
 * Shards and the first kind of spare copies are long gone: a save from back then has its spare
 * copies (`dupes`, from before repeats were kept as extras) paid what a repeat is worth now, and its
 * shards half that each, into the purse.
 */
function cashInSpares(out: GameState): void {
  const raw = out as GameState & { dupeRules?: unknown };
  delete raw.dupeRules;
  for (const rec of Object.values(out.roster)) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as KnightRec & { dupes?: unknown; shards?: unknown };
    const dupes = Math.max(0, Math.floor(Number(r.dupes) || 0));
    const shards = Math.max(0, Math.floor(Number(r.shards) || 0));
    if ((dupes || shards) && KNIGHTS_BY_ID.has(r.id)) {
      const each = dupeGold(out, r.id);
      out.gold += dupes * each + Math.round(shards * each * 0.5);
    }
    delete r.dupes;
    delete r.shards;
  }
}
