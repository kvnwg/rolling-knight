/**
 * The deck of floor designs. Every floor is built to one of a handful of designs (world/designs.ts:
 * the long chain of rooms, a loop round a lake, a plaza with spokes, a switchback serpent...). Their
 * order is a shuffled deck kept in the save: each new floor, and each return to a floor, deals the
 * next card, so no design comes round again until every one has been played. An empty deck is
 * shuffled anew, and a fresh deck never opens with the design the last floor used.
 */
import { Rng } from './rng';

export const FLOOR_DESIGNS = ['chain', 'loop', 'plaza', 'serpent', 'gauntlet', 'crossroads', 'islands', 'valley', 'maze', 'spiral'] as const;
export type DesignId = (typeof FLOOR_DESIGNS)[number];

export function isDesign(x: unknown): x is DesignId {
  return typeof x === 'string' && (FLOOR_DESIGNS as readonly string[]).includes(x);
}

/** The part of a run the deck lives in (GameState['run']). */
export interface DeckState {
  /** Designs still to deal, next first. */
  designDeck: string[];
  /** The design the last floor was built to (a fresh deck never opens with it). */
  lastDesign: string | null;
}

/**
 * A freshly shuffled deck of every design: never opening with `avoid`, and opening with `first` if
 * given (a brand new game's first floor is the plain chain of rooms).
 */
export function shuffleDeck(seed: number, avoid: string | null, first?: DesignId): DesignId[] {
  const rng = new Rng(Rng.hashSeed(seed ^ 0xdec4));
  const deck = rng.shuffle([...FLOOR_DESIGNS]);
  if (first) deck.unshift(...deck.splice(deck.indexOf(first), 1));
  else if (deck[0] === avoid && deck.length > 1) {
    const j = rng.int(1, deck.length - 1);
    [deck[0], deck[j]] = [deck[j], deck[0]];
  }
  return deck;
}

/**
 * Deals the next floor's design: the deck's top card, or (the deck used up) the top of a new shuffle.
 * `seed` shuffles the new deck when one is needed: pass something that differs every deal.
 */
export function drawDesign(run: DeckState, seed: number): DesignId {
  let deck = cleanDeck(run.designDeck);
  // (Only a damaged save could hold the card just played on top: play the next one first.)
  if (deck[0] === run.lastDesign) {
    if (deck.length > 1) [deck[0], deck[1]] = [deck[1], deck[0]];
    else deck = [];
  }
  if (!deck.length) deck = shuffleDeck(seed, run.lastDesign);
  const next = deck.shift()!;
  run.designDeck = deck;
  run.lastDesign = next;
  return next;
}

/** A saved deck with anything that isn't a design (or is one twice) taken out. */
export function cleanDeck(deck: unknown): DesignId[] {
  if (!Array.isArray(deck)) return [];
  return deck.filter((d, i): d is DesignId => isDesign(d) && deck.indexOf(d) === i);
}
