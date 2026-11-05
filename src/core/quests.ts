/**
 * Quests: small jobs the dungeon's NPCs hand out (world/npcs.ts). Kill so many of a pest, take down
 * elites or the stretch's boss, get a few floors deeper, or pick things up. Progress comes from game
 * events (questEvent); a finished quest goes back to whoever gave it (any NPC of that kind, on this
 * floor or a later one) for gold (counted in kills' worth, so it scales with the floor), Hourglasses,
 * a luck potion or Lucky Spins. Three at most are active at once.
 *
 * Text is plain ASCII with the bitmap font's punctuation (. , ! ? : ' " - ( )), so any of it can be
 * drawn in the world as well as in the dialog box.
 */
import { Rng } from './rng';

export type QuestKind = 'slay' | 'slayElite' | 'boss' | 'reach' | 'collect';
/** Pickups a collect quest can ask for (world Pickup kinds). */
export type QuestItem = 'gold' | 'hourglass' | 'potion';

export interface QuestReward {
  gold?: number;
  hourglasses?: number;
  potion?: boolean;
  /** Lucky Spins for the altar. */
  luckSpins?: number;
}

export interface Quest {
  /** Unique: the giver, the floor and a seed. */
  id: string;
  /** The kind of NPC who gave it (an NpcDef id, e.g. 'farmer'). Any NPC of that kind takes it back. */
  giver: string;
  title: string;
  text: string;
  kind: QuestKind;
  /** slay, slayElite, boss: kills. reach: floors deeper than floorTaken. collect: pickups. */
  target: number;
  progress: number;
  floorTaken: number;
  reward: QuestReward;
  done: boolean;
  turnedIn: boolean;
  /** slay: only this mob counts, and its kin (any slime for "Grumpy Slime"). None: any monster. */
  mobName?: string;
  /** The giver's name, for the tracker ("Back to Farmer Hob"). */
  giverName?: string;
  /** collect: which pickups count (gold coins when left out). */
  item?: QuestItem;
}

export type QuestEvent =
  | { type: 'kill'; elite: boolean; boss: boolean; mobName: string }
  | { type: 'floor'; floor: number }
  | { type: 'pickup'; kind: string };

export const MAX_ACTIVE_QUESTS = 3;

/** Quests still on the board (taken, not yet turned in; finished ones count until they're handed back). */
export function activeQuests(quests: readonly Quest[]): Quest[] {
  return quests.filter((q) => !q.turnedIn);
}

export function canTakeQuest(quests: readonly Quest[]): boolean {
  return activeQuests(quests).length < MAX_ACTIVE_QUESTS;
}

/** Adds a quest (a copy) if there's room and it isn't already taken. */
export function addQuest(quests: Quest[], q: Quest): boolean {
  if (!canTakeQuest(quests) || quests.some((x) => x.id === q.id)) return false;
  quests.push({ ...q, reward: { ...q.reward } });
  return true;
}

/** Hands back the oldest finished quest from this giver: marks it turned in and returns it (grant its reward). */
export function turnInQuest(quests: Quest[], giver: string): Quest | null {
  const q = quests.find((x) => x.giver === giver && x.done && !x.turnedIn);
  if (!q) return null;
  q.turnedIn = true;
  return q;
}

/** Drops quests that have been turned in. */
export function pruneQuests(quests: readonly Quest[]): Quest[] {
  return quests.filter((q) => !q.turnedIn);
}

/**
 * Feeds a game event to the quests: kills, a new floor, a pickup. Progress moves on (in place) and
 * the quests that just finished are returned (each one once).
 */
export function questEvent(quests: Quest[], e: QuestEvent): Quest[] {
  const finished: Quest[] = [];
  for (const q of quests) {
    if (q.done || q.turnedIn) continue;
    switch (e.type) {
      case 'kill':
        if (q.kind === 'slay' && (!q.mobName || questMatches(q.mobName, e.mobName))) q.progress++;
        else if (q.kind === 'slayElite' && (e.elite || e.boss)) q.progress++;
        else if (q.kind === 'boss' && e.boss) q.progress++;
        break;
      case 'floor':
        if (q.kind === 'reach') q.progress = Math.max(q.progress, Math.min(q.target, e.floor - q.floorTaken));
        break;
      case 'pickup':
        if (q.kind === 'collect' && (q.item ?? 'gold') === e.kind) q.progress++;
        break;
    }
    if (q.progress >= q.target) {
      q.progress = q.target;
      q.done = true;
      finished.push(q);
    }
  }
  return finished;
}

// ------------------------------------------------------------------ mob names

/** Mob nouns by family (mobgen.ts names are "<adjective> <noun>"): a quest for one counts its kin. */
const FAMILIES: ReadonlyArray<readonly string[]> = [
  ['Slime', 'Ooze', 'Blob', 'Popper', 'Bloater'],
  ['Hound', 'Wolf', 'Lynx', 'Stalker', 'Boar', 'Rhino', 'Tusker'],
  ['Goblin', 'Ghoul', 'Raider', 'Brute', 'Archer', 'Slinger', 'Hunter', 'Shaman', 'Cultist', 'Hexer'],
  ['Bat', 'Moth', 'Crow', 'Wisp', 'Spitter', 'Watcher', 'Eye'],
  ['Spore Pod', 'Thornweed', 'Bloom', 'Mandrake'],
  ['Golem', 'Sentinel', 'Colossus'],
  ['Mite', 'Beetle', 'Scarab', 'Bombardier', 'Tick', 'Spider', 'Crawler'],
  ['Jack', 'Gourdling', 'Pumpkin Bomb'],
  ['Wraith', 'Banshee', 'Spirit', 'Wisp'],
  ['Hog'],
  ['Ram'],
  ['Hen', 'Chicken'],
];
const NOUNS = [...new Set(FAMILIES.flat())].sort((a, b) => b.length - a.length);

function hasWord(name: string, word: string): boolean {
  const hay = name.toLowerCase();
  const w = word.toLowerCase();
  for (let i = hay.indexOf(w); i >= 0; i = hay.indexOf(w, i + 1)) {
    const before = i === 0 ? ' ' : hay[i - 1];
    const after = hay[i + w.length] ?? ' ';
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) return true;
  }
  return false;
}

/** The noun of a mob's name ("Grumpy Slime" -> "Slime"); its last word when it isn't a known one. */
export function mobNoun(name: string): string {
  const known = NOUNS.find((n) => hasWord(name, n));
  if (known) return known;
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? name;
}

/** Does killing `name` count for a quest after `want`? Same noun or the same family. */
export function questMatches(want: string, name: string): boolean {
  const noun = mobNoun(want);
  const kin = FAMILIES.filter((f) => f.includes(noun)).flat();
  return (kin.length ? kin : [noun]).some((n) => hasWord(name, n));
}

export function plural(noun: string): string {
  if (/colossus$/i.test(noun)) return noun.replace(/us$/i, 'i');
  if (/(s|x|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^f]f$/i.test(noun)) return `${noun.slice(0, -1)}ves`;
  return `${noun}s`;
}

// ------------------------------------------------------------------ text

/** 12,345 / 1.2M: gold for a sentence. */
export function formatGold(n: number): string {
  const v = Math.round(n);
  if (v >= 10_000_000) return `${(v / 1_000_000).toFixed(v >= 100_000_000 ? 0 : 1)}M`;
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "120 gold, 2 Hourglasses and a luck potion". */
export function rewardText(r: QuestReward): string {
  const parts: string[] = [];
  if (r.gold) parts.push(`${formatGold(r.gold)} gold`);
  if (r.hourglasses) parts.push(r.hourglasses === 1 ? '1 Hourglass' : `${r.hourglasses} Hourglasses`);
  if (r.luckSpins) parts.push(r.luckSpins === 1 ? '1 Lucky Spin' : `${r.luckSpins} Lucky Spins`);
  if (r.potion) parts.push('a luck potion');
  if (!parts.length) return 'my thanks';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "3/8". */
export function questProgress(q: Quest): string {
  return `${Math.min(q.progress, q.target)}/${q.target}`;
}

/** One short line for the quest tracker: "Slay slimes 3/8", "Floors deeper 1/3". */
export function questGoal(q: Quest): string {
  const p = questProgress(q);
  switch (q.kind) {
    case 'slay':
      return q.mobName ? `Slay ${plural(mobNoun(q.mobName)).toLowerCase()} ${p}` : `Slay monsters ${p}`;
    case 'slayElite':
      return `Slay elites ${p}`;
    case 'boss':
      return `Beat a boss ${p}`;
    case 'reach':
      return `Reach floor ${q.floorTaken + q.target} ${p}`;
    case 'collect':
      return `${q.item === 'hourglass' ? 'Hourglasses' : q.item === 'potion' ? 'Luck potions' : 'Coins'} ${p}`;
  }
}

/** Placeholders: {n} {left} {done} {mobs} "slimes" {Mobs} "Grumpy Slimes" {mob} {floor} (to reach) {items} {giver}. */
export function fillQuestText(text: string, q: Quest, extra: Record<string, string> = {}): string {
  const noun = q.mobName ? mobNoun(q.mobName) : null;
  const vars: Record<string, string> = {
    n: numberWord(q.target),
    left: numberWord(Math.max(0, q.target - q.progress)),
    done: numberWord(Math.min(q.progress, q.target)),
    mobs: noun ? plural(noun).toLowerCase() : 'monsters',
    Mobs: q.mobName ? plural(q.mobName) : 'monsters',
    mob: noun ? noun.toLowerCase() : 'monster',
    floor: String(q.kind === 'reach' ? q.floorTaken + q.target : q.floorTaken),
    items: itemsText(q.item ?? 'gold', q.target),
    giver: q.giverName ?? 'me',
    ...extra,
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string, at: number) => {
    const v = vars[k] ?? m;
    // A word starting a sentence gets its capital ("Nine more to go").
    return /(^|[.!?]\s+)$/.test(text.slice(0, at)) ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  });
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Small numbers read as words in a sentence ("Kill eight"), bigger ones as digits. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

function itemsText(item: QuestItem, n: number): string {
  if (item === 'hourglass') return n === 1 ? 'an hourglass' : `${n} hourglasses`;
  if (item === 'potion') return n === 1 ? 'a luck potion' : `${n} luck potions`;
  return `${n} coins`;
}

// ------------------------------------------------------------------ making quests

export interface QuestFlavor {
  title: string;
  /** See fillQuestText for the placeholders. */
  text: string;
}

/** Stock flavor for quests whose giver has nothing of their own to say. */
export const QUEST_FLAVOR: Readonly<Record<QuestKind, readonly QuestFlavor[]>> = {
  slay: [
    { title: 'Sock Thieves', text: 'Kill {n} {Mobs}. They keep eating my socks. I am down to one sock.' },
    { title: 'Neighborhood Watch', text: 'Thin out the {Mobs}. {n} should do it. They have been looking at me funny.' },
    { title: 'Bad Neighbors', text: '{n} {Mobs}, gone. They borrowed my ladder and never gave it back.' },
    { title: 'Noise Complaint', text: 'The {Mobs} howl all night. Every night. Make {n} of them stop. Forever.' },
  ],
  slayElite: [
    { title: 'Big Ones Only', text: 'Take down {n} of the big shiny ones. The little ones are somebody else\'s problem.' },
    { title: 'Shiny Problems', text: 'Elites. {n} of them. They glow, they growl, and they owe me money.' },
  ],
  boss: [
    { title: 'Management Issues', text: 'Their boss keeps sending me rude letters. Beat the boss at the end of this stretch. Return to sender.' },
    { title: 'The Big One', text: 'There is a big one at the end of this stretch. Make it stop being big.' },
  ],
  reach: [
    { title: 'Special Delivery', text: 'Take this letter down to floor {floor}. No, you can\'t read it. It\'s mostly about you.' },
    { title: 'House Hunting', text: 'Get down to floor {floor} and tell me if it\'s nicer. I\'m thinking of moving.' },
  ],
  collect: [
    { title: 'Loose Change', text: 'Pick up {items}. Monsters just drop them everywhere. It\'s a disgrace.' },
    { title: 'Shiny Things', text: 'Gather {items} for me. I want to roll around in them. For my health.' },
  ],
};

export interface QuestSpec {
  /** The NPC kind giving it (NpcDef id). */
  giver: string;
  giverName?: string;
  kind: QuestKind;
  /** The floor it's taken on. */
  floor: number;
  /** Gold per kill on that floor: rewards are counted in kills. */
  goldPerKill: number;
  seed: number;
  /** slay: a mob of this floor (its kin count too); leave out for any monster. */
  mobName?: string;
  /** collect: what to pick up (gold coins by default). */
  item?: QuestItem;
  /** Overrides the target the quest would roll. */
  target?: number;
  /** Title and text (placeholders allowed); stock flavor when left out. */
  title?: string;
  text?: string;
}

/** Builds a quest: its target from the kind and floor, its reward in kills' worth of gold and extras. */
export function makeQuest(spec: QuestSpec): Quest {
  const rng = new Rng(Rng.hashSeed((spec.seed ^ Math.imul(spec.floor, 0x45d9f3b) ^ 0x9e57) >>> 0));
  const f = Math.max(1, spec.floor);
  const kind = spec.kind;
  const item = kind === 'collect' ? spec.item ?? 'gold' : undefined;
  let target: number;
  switch (kind) {
    case 'slay':
      target = spec.mobName ? 4 + Math.min(4, Math.floor(f / 10)) + rng.int(0, 2) : 8 + Math.min(10, Math.floor(f / 4)) + rng.int(0, 3);
      break;
    case 'slayElite':
      target = 1 + (f >= 8 ? 1 : 0) + (f >= 20 && rng.chance(0.5) ? 1 : 0);
      break;
    case 'boss':
      target = 1;
      break;
    case 'reach':
      target = rng.int(2, 3);
      break;
    case 'collect':
      target = item === 'gold' ? 25 + Math.min(45, f * 2) + rng.int(0, 2) * 5 : 1 + (f >= 15 && rng.chance(0.4) ? 1 : 0);
      break;
  }
  if (spec.target !== undefined) target = Math.max(1, Math.round(spec.target));
  // The reward, in kills' worth of gold, and the extras.
  let kills = 0;
  const reward: QuestReward = {};
  switch (kind) {
    case 'slay':
      kills = target * (spec.mobName ? 3 : 2);
      if (rng.chance(0.3)) reward.luckSpins = 1;
      break;
    case 'slayElite':
      kills = target * 10;
      reward.hourglasses = target;
      break;
    case 'boss':
      kills = 40;
      reward.hourglasses = 3;
      reward.potion = true;
      break;
    case 'reach':
      kills = target * 12;
      reward.luckSpins = target - 1;
      break;
    case 'collect':
      if (item === 'gold') {
        kills = Math.round(target * 0.6);
        reward.luckSpins = 1;
      } else {
        kills = 15 * target;
        reward.luckSpins = 2;
      }
      break;
  }
  if (kind !== 'boss' && rng.chance(0.12)) reward.potion = true;
  reward.gold = Math.max(1, Math.round(Math.max(0, spec.goldPerKill) * kills));
  const pool = QUEST_FLAVOR[kind];
  const flavor = pool[rng.int(0, pool.length - 1)];
  const q: Quest = {
    id: `${spec.giver}-${spec.floor}-${(spec.seed >>> 0).toString(36)}`,
    giver: spec.giver,
    title: spec.title ?? flavor.title,
    text: spec.text ?? flavor.text,
    kind,
    target,
    progress: 0,
    floorTaken: spec.floor,
    reward,
    done: false,
    turnedIn: false,
    ...(spec.mobName && kind === 'slay' ? { mobName: spec.mobName } : {}),
    ...(spec.giverName ? { giverName: spec.giverName } : {}),
    ...(item ? { item } : {}),
  };
  q.title = fillQuestText(q.title, q);
  q.text = fillQuestText(q.text, q);
  return q;
}
