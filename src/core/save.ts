/**
 * Saves live in localStorage as JSON. A save that fails to load is kept under a rescue key instead
 * of being thrown away, and anything missing from an older save is filled in from a new game.
 */
import { cleanDeck, isDesign, shuffleDeck } from './deck';
import { newGame } from './newGame';
import { Rng } from './rng';
import { SAVE_VERSION, type GameState } from './state';
import { sanitizeUpgrades } from './upgrades';

export const SAVE_KEY = 'rolling-knight-save';
const RESCUE_KEY = 'rolling-knight-rescue';

function storage(): Storage | null {
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
  out.dupeRules = { ...fresh.dupeRules, ...(s.dupeRules ?? {}) };
  if (!Array.isArray(out.quests)) out.quests = [];
  if (!Array.isArray(out.squad) || out.squad.length !== 3) out.squad = [null, null, null];
  out.squad = out.squad.map((id) => (id && out.roster[id] ? id : null));
  if (!(out.controlled >= 0 && out.controlled < 3)) out.controlled = 0;
  for (const k of ['gold', 'hourglasses', 'sigils', 'playTimeMs', 'rebirths'] as const) {
    if (!Number.isFinite(out[k]) || out[k] < 0) out[k] = 0;
  }
  // A spin in progress is replayed from scratch rather than resumed mid-animation.
  if (out.roll.current && !out.roll.current.landed) out.roll.current = null;
  out.roll.timer = 0;
  mendDeck(out, s.run);
  out.version = SAVE_VERSION;
  // Upgrade tiers within each line's range (the map was rebuilt: some lines have fewer tiers now).
  sanitizeUpgrades(out);
  return out;
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
  const text = st?.getItem(SAVE_KEY);
  if (!text) return null;
  try {
    return mend(JSON.parse(text));
  } catch {
    st?.setItem(RESCUE_KEY, text);
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
  storage()?.removeItem(SAVE_KEY);
}
