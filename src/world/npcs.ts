/**
 * NPCs: the dungeon's locals. Ordinary folk (a lost farmer, a worried mother, a tired guard, a
 * merchant with one ware, a cartographer), weirdos (a rock collector, a one-chord bard, a man who is
 * a chicken, a ghost running three hundred years late, a goblin accountant, a mostly magnificent
 * wizard, a chef, the King of This Hallway) and, now and then, a demon in disguise who really, really
 * wants you to chill. Catch it out in conversation (or keep pestering it) and it drops the act and
 * fights you as a mini-boss, still talking.
 *
 * placeNpcs puts 0-2 on a floor (none on boss floors); dialogFor builds a small dialog graph for one
 * of them from the game's state (quest offers, reminders, turn-ins, gifts, the demon's unmasking);
 * applyDialogAction does the bookkeeping for a chosen line. Quests live in core/quests.ts and the art
 * in render/art/npcs.ts (every NPC is dressed on the same Snoblin mannequin as the knights).
 *
 * All text is plain ASCII with the bitmap font's punctuation (. , ! ? : ' " - ( )) so barks and
 * taunts can be drawn in the world too.
 */
import { addQuest, canTakeQuest, fillQuestText, makeQuest, questAsk, questGoal, turnInQuest, type Quest, type QuestItem, type QuestKind, type QuestReward } from '../core/quests';
import { Rng } from '../core/rng';
import { BIOMES, isBossFloor, type BiomeId } from './biomes';
import { pitchCamp, type Camp } from './camps';
import type { View } from './entities';
import type { FloorMap } from './mapgen';
import { floorMobs, type BossMove, type MobType } from './mobgen';

// ------------------------------------------------------------------ types

export type NpcKind = 'folk' | 'weirdo' | 'demon';

/** A color ramp, darkest first. */
export type Ramp3 = readonly [string, string, string];
export type Ramp2 = readonly [string, string];
export type HatKind = 'straw' | 'kerchief' | 'kettle' | 'cap' | 'beret' | 'chef' | 'wizard' | 'twigs' | 'chicken' | 'visor' | 'hood';
export type HairStyle = 'short' | 'bob' | 'bun' | 'bald' | 'none';
export type BeardStyle = 'stubble' | 'mustache' | 'full' | 'long' | 'goatee';
export type NpcItem = 'pitchfork' | 'spear' | 'lute' | 'map' | 'ladle' | 'staff' | 'orbStaff' | 'rock' | 'ledger' | 'spoon' | 'scroll';
/** A panel of cloth over the torso: an apron, overalls' bib, a vest, a tabard, a shawl. */
export type PanelKind = 'apron' | 'bib' | 'vest' | 'tabard' | 'shawl';

/** How an NPC is dressed on the mannequin (render/art/npcs.ts draws it). */
export interface NpcLook {
  skin: Ramp3;
  hair: Ramp3;
  hairStyle: HairStyle;
  shirt: Ramp3;
  /** Arms (the shirt's color when left out). */
  sleeves?: Ramp3;
  pants: Ramp3;
  shoes: Ramp2;
  /** A long dress or robe: the legs take the shirt's color and the gap between them closes. */
  dress?: boolean;
  panel?: { kind: PanelKind; ramp: Ramp2 };
  hat?: { kind: HatKind; ramp: Ramp3; trim?: Ramp2 };
  beard?: BeardStyle;
  /** The hair's color when left out. */
  beardRamp?: Ramp3;
  glasses?: boolean;
  /** Eye color (near-black when left out). */
  eyes?: string;
  item?: NpcItem;
  /** A big backpack. */
  pack?: Ramp3;
  /** See-through, and a wisp instead of legs. */
  ghost?: boolean;
  /** Big pointy goblin ears. */
  ears?: boolean;
  /** An orange beak (it's a costume). */
  beak?: boolean;
  /** A demon's tells: a tail poking out, horn tips under the hat, smoke. */
  demon?: { tail: Ramp3; horns: boolean; smoke: boolean };
}

/** A job an NPC hands out (quest text placeholders: see fillQuestText in core/quests.ts). */
export interface QuestTemplate {
  kind: QuestKind;
  title: string;
  text: string;
  /** slay: one of this floor's own mobs (else any monster). */
  pest?: boolean;
  /** collect: what to pick up. */
  item?: QuestItem;
  /** Said while the job is still going. */
  waiting: string[];
  /** Said when it's handed back (the reward line follows). */
  thanks: string[];
}

export interface NpcDef {
  id: string;
  /** What it calls itself (a demon's disguise name). */
  name: string;
  /** A few words under the name: "a farmer, lost". */
  title: string;
  kind: NpcKind;
  look: NpcLook;
  /** Short lines it mutters as you walk by. */
  barks: string[];
  /** The jobs it hands out (none: it doesn't). One is picked per floor. */
  quests: QuestTemplate[];
  /** How often it turns up (relative). */
  weight: number;
  /** Biomes it's three times as likely in. */
  likes?: BiomeId[];
  /** The first floor it can turn up on. */
  minFloor?: number;
  /** Demons: the name and title it fights under, and its own taunts. */
  demon?: { name: string; title: string; taunts: string[] };
}

export interface Npc {
  uid: number;
  def: NpcDef;
  /** World pixels: where the feet stand. */
  x: number;
  y: number;
  /** Where it was placed (if it wanders, it comes back here). */
  homeX: number;
  homeY: number;
  /** Facing: -1 left, 1 right (side view); and which way the body is drawn. */
  dir: 1 | -1;
  view: View;
  /** Seconds into its idle animation (for whoever animates it). */
  animT: number;
  /** Index of its room in map.rooms. */
  room: number;
  floor: number;
  biomeId: string;
  /** Its own seed: picks its lines and its quest. Pass it to demonMobType for a demon. */
  seed: number;
  /** Conversations finished with it (bump it when the dialog box closes). */
  talkedTo: number;
  /** Which of def.quests it offers this floor (-1: none). */
  questIndex: number;
  /** Its quest was taken this floor (it won't offer another). */
  questTaken: boolean;
  /** It has handed out its one-time gift (the bard's song, the chef's stew...). */
  gifted: boolean;
  /** A demon in disguise. */
  demon: boolean;
  /** Unmasked: the fight is on (take the NPC away and spawn demonMobType where it stood). */
  revealed: boolean;
  /** The floor's mob names (for "kill 6 of those slimes" jobs); ctx.mobNames overrides them. */
  mobNames: string[];
  /** Their set-up on this floor (camps.ts): the stall, tent or shrine they keep, and the spot in front to talk from. */
  camp?: Camp;
}

export type DialogAction =
  | { type: 'acceptQuest'; quest: Quest }
  | { type: 'turnIn' }
  | { type: 'reward'; gold?: number; hourglasses?: number; potion?: boolean; luckSpins?: number }
  | { type: 'fight' }
  | { type: 'close' };

/** A choice runs its action (if any), then goes to `next`; with no `next` the conversation ends. */
export interface DialogChoice {
  label: string;
  next?: string;
  action?: DialogAction;
  /** The line that leads to a job (asks for one, takes it, hands it back): marked apart from small talk. */
  job?: boolean;
}

/**
 * The job a line is about, shown apart from the small talk (a job card): its title, what it asks, how
 * far along it is, what it pays. `offer`: one you can take; `taken`: just taken; `progress`: one of
 * theirs under way; `done`: handed back; `contract`: a demon's "deal" (with fine print).
 */
export interface DialogJob {
  stage: 'offer' | 'taken' | 'progress' | 'done' | 'contract';
  title: string;
  /** What it asks, in words (shown on a tap): "Slay 6 slimes"; under way, with the count: "Slay slimes 3/6". */
  goal: string;
  /** What it asks as an icon and a number. */
  aim: JobAim;
  /** How far along (0..1), for a job under way. */
  progress?: number;
  reward: QuestReward;
  /** The small print (a contract's catch). */
  fine?: string;
}

/** A job's goal for its icon: what to do and how many (or which floor), and how many are done. */
export interface JobAim {
  kind: QuestKind | 'sign';
  /** How many to slay or pick up; for `reach`, the floor. */
  n: number;
  /** So far (a job under way): how many, or the floor reached. */
  done?: number;
  /** slay: the pest (its kin count too). */
  mob?: string;
  /** collect: what. */
  item?: QuestItem;
}

export interface DialogNode {
  speaker: string;
  text: string;
  choices: DialogChoice[];
  job?: DialogJob;
}

export interface DialogCtx {
  floor: number;
  biomeName: string;
  /** The player's quests (state.quests): offers, reminders and turn-ins are worked out from them. */
  activeQuests: Quest[];
  goldPerKill: number;
  /** The floor's mob names (world.mobTypes), for "kill those slimes" jobs. Optional. */
  mobNames?: string[];
  /** The floor is cleared: a demon still in disguise gives up the act. Optional. */
  cleared?: boolean;
  /** The knight doing the talking (the bard sings about them). Optional. */
  heroName?: string;
}

// ------------------------------------------------------------------ the cast

const SKIN = {
  pale: ['#c88a6a', '#eab08a', '#ffd4b0'],
  light: ['#b07a5a', '#d8a07a', '#f4c8a0'],
  tan: ['#9a6444', '#c08458', '#e0a878'],
  brown: ['#7a4a30', '#9a6440', '#be8458'],
  dark: ['#5a3420', '#784830', '#9a6444'],
  goblin: ['#36561e', '#55862e', '#86b84a'],
  ghost: ['#6a7cb4', '#a2b6e6', '#dce8ff'],
} as const satisfies Record<string, Ramp3>;

const HAIR = {
  brown: ['#2a1a14', '#4a2e20', '#6e4630'],
  ginger: ['#6a2a12', '#a4481e', '#d4723a'],
  blond: ['#7a5a20', '#b48a3a', '#e4c060'],
  black: ['#141016', '#2a2430', '#443c4a'],
  gray: ['#5a5460', '#8e8894', '#c4bec8'],
  white: ['#8a8698', '#c8c4d4', '#f2f0f8'],
} as const satisfies Record<string, Ramp3>;

const SHOES: Ramp2 = ['#2e2018', '#4a3424'];
const BOOTS: Ramp2 = ['#1e1a1e', '#38303a'];

const FOLK_QUIT = 'Bye.';

export const NPC_DEFS: readonly NpcDef[] = [
  // --- ordinary folk
  {
    id: 'farmer',
    name: 'Farmer Hob',
    title: 'a farmer, lost',
    kind: 'folk',
    weight: 3,
    likes: ['hamlet', 'farmland'],
    look: {
      skin: SKIN.tan,
      hair: HAIR.brown,
      hairStyle: 'short',
      shirt: ['#5a2a1e', '#8a3e28', '#b85a3a'],
      pants: ['#22304a', '#34507a', '#5076a6'],
      shoes: SHOES,
      panel: { kind: 'bib', ramp: ['#34507a', '#5076a6'] },
      hat: { kind: 'straw', ramp: ['#8a6a2a', '#c8a048', '#ecd078'], trim: ['#6a2a1a', '#a8402a'] },
      beard: 'stubble',
      item: 'pitchfork',
    },
    barks: ['Has anyone seen a farm?', 'Turnips...', 'Cows don\'t just vanish.', 'Hob\'s the name. Lost is the game.'],
    quests: [
      {
        kind: 'slay',
        pest: true,
        title: 'Turnip Vengeance',
        text: 'Those {Mobs} ate my turnips. Even the ugly one. Avenge them.',
        waiting: ['The turnips are watching.', 'Any luck with the {mobs}? For the turnips.'],
        thanks: ['The turnips are avenged! I\'d plant a memorial turnip, but... well.'],
      },
      {
        kind: 'reach',
        title: 'The Lost Farm',
        text: 'Look for a farm down there. Barn, cows, very farm-shaped. Can\'t miss it. I did.',
        waiting: ['Floor {floor} yet? Any farms? Farm-shaped things?'],
        thanks: ['No farm? Just slimes? Well. Slimes are basically wet cows. I\'ll take it.'],
      },
    ],
  },
  {
    id: 'mother',
    name: 'Mother Marta',
    title: 'a worried mother',
    kind: 'folk',
    weight: 3,
    likes: ['hamlet', 'farmland', 'forest'],
    look: {
      skin: SKIN.light,
      hair: HAIR.brown,
      hairStyle: 'bob',
      shirt: ['#2a3a5a', '#3e5a8a', '#5a7cb0'],
      pants: ['#2a3a5a', '#3e5a8a', '#5a7cb0'],
      shoes: BOOTS,
      dress: true,
      panel: { kind: 'apron', ramp: ['#c8c2d2', '#f0ecf4'] },
      hat: { kind: 'kerchief', ramp: ['#6a1a20', '#a82a30', '#d8504a'] },
    },
    barks: ['PIP!', 'Pip, supper\'s cold!', 'Has anyone seen a small mud?', 'Six children. SIX.'],
    quests: [
      {
        kind: 'reach',
        title: 'Where\'s Pip?',
        text: 'My boy went down. They always go down! Find him. Tell him supper\'s cold.',
        waiting: ['Floor {floor}, dear. He\'ll be the muddy one. Well. The muddiest one.'],
        thanks: ['Pip\'s running a gang of slimes? ...That\'s my boy. He\'s grounded. Forever.'],
      },
      {
        kind: 'slay',
        pest: true,
        title: 'Not In My Pantry',
        text: '{Mobs} got in my pantry. They licked the cheese. Licking cheese is a crime.',
        waiting: ['Still {mobs} in my pantry, dear. I can hear them licking things.'],
        thanks: ['My pantry\'s safe! I was saving this for a rainy day, but down here every day is rainy.'],
      },
    ],
  },
  {
    id: 'guard',
    name: 'Guard Aldous',
    title: 'a very tired guard',
    kind: 'folk',
    weight: 3,
    likes: ['crypt', 'hamlet', 'desert', 'ember'],
    look: {
      skin: SKIN.pale,
      hair: HAIR.brown,
      hairStyle: 'short',
      shirt: ['#1c2a5a', '#2a4490', '#4468c0'],
      sleeves: ['#4a4e5a', '#7a808e', '#a8aeba'],
      pants: ['#2e2620', '#4a3e32', '#62564a'],
      shoes: BOOTS,
      panel: { kind: 'tabard', ramp: ['#c89a2a', '#f2c24a'] },
      hat: { kind: 'kettle', ramp: ['#3e4450', '#6e7684', '#a4acb8'] },
      beard: 'mustache',
      item: 'spear',
    },
    barks: ['Halt. Or don\'t. Whatever.', 'Yaaawn.', 'Eleven more hours...', 'Nobody told me there\'d be slimes.'],
    quests: [
      {
        kind: 'slayElite',
        title: 'Above My Pay Grade',
        text: 'The big shiny ones are my job. My feet say no. I\'ll split my wages. Your ninety.',
        waiting: ['Still big ones about. Take your time. I\'m on shift. Forever.'],
        thanks: ['You got the big ones? Brilliant. I\'ll tell the captain it was me. Here\'s your ninety.'],
      },
      {
        kind: 'boss',
        title: 'Report to the Boss',
        text: 'Their boss sits at the end of this stretch. Never does his paperwork. Sort him out.',
        waiting: ['The boss is still up, then? I can tell. The walls are grumpy.'],
        thanks: ['You beat their boss? Then who do I report to now? ...Oh no. Is it you? Here. Sir. Boss.'],
      },
    ],
  },
  {
    id: 'merchant',
    name: 'Barty Coin',
    title: 'a merchant with one ware',
    kind: 'folk',
    weight: 2,
    likes: ['desert', 'hamlet', 'crystal'],
    look: {
      skin: SKIN.brown,
      hair: HAIR.black,
      hairStyle: 'short',
      shirt: ['#3a1e4a', '#5e3478', '#8a54a8'],
      sleeves: ['#a89a7a', '#d4c8a4', '#f0e8cc'],
      pants: ['#3a2a1e', '#5a4230', '#7a5a40'],
      shoes: SHOES,
      panel: { kind: 'vest', ramp: ['#c8902a', '#ffd86a'] },
      hat: { kind: 'cap', ramp: ['#3a1e4a', '#5e3478', '#8a54a8'], trim: ['#c8902a', '#ffd86a'] },
      beard: 'mustache',
      pack: ['#3a2414', '#5e3c22', '#8a5c34'],
      item: 'spoon',
    },
    barks: ['Wares! Ware!', 'One spoon, barely used!', 'Finest spoon in the dungeon!', 'No refunds. No other wares.'],
    quests: [
      {
        kind: 'collect',
        item: 'gold',
        title: 'Finder\'s Fee',
        text: 'Pick up coins out there and I\'ll pay a finder\'s fee. In coins. That\'s how money works.',
        waiting: ['Coins! Pick them up! They\'re just lying about, being money!'],
        thanks: ['Lovely. Here\'s your fee. Don\'t spend it on spoons. That\'s my market.'],
      },
      {
        kind: 'collect',
        item: 'hourglass',
        title: 'Rare Goods',
        text: 'A customer wants an hourglass. I\'ll pay handsomely. Medium-somely.',
        waiting: ['Any hourglasses yet? The customer is very impatient. The customer is me.'],
        thanks: ['An hourglass! The customer will be thrilled. The customer is still me. Here.'],
      },
    ],
  },
  {
    id: 'cartographer',
    name: 'Ines the Cartographer',
    title: 'maps the dungeon, roughly',
    kind: 'folk',
    weight: 2,
    likes: ['forest', 'tundra', 'crystal', 'swamp'],
    look: {
      skin: SKIN.dark,
      hair: HAIR.black,
      hairStyle: 'bob',
      shirt: ['#15403e', '#226660', '#38908a'],
      pants: ['#6a5236', '#94764e', '#b8986a'],
      shoes: SHOES,
      hat: { kind: 'beret', ramp: ['#1e3a1e', '#2e5a2a', '#4a8040'], trim: ['#8a2a20', '#d0503a'] },
      glasses: true,
      item: 'map',
    },
    barks: ['Hold still, I\'m mapping you!', 'Here be... something.', 'Which way is north? It\'s all down.', 'Scale: one inch to one ouch.'],
    quests: [
      {
        kind: 'reach',
        title: 'Here Be Something',
        text: 'Scout ahead for me. My map says "here be death" and I trust my map.',
        waiting: ['Floor {floor}, remember! Note anything that tries to eat you. For the legend.'],
        thanks: ['"Damp"? "Bitey"? Perfect. I\'ll draw a little bite. Here, for your trouble.'],
      },
      {
        kind: 'slay',
        title: 'Clean Margins',
        text: 'Monsters keep chewing my margins. Clear some out? Any kind. They all smudge.',
        waiting: ['Still smudges in my margins. Very bitey smudges.'],
        thanks: ['Clean margins! All that lovely nothing. And a drawing of you. It\'s a smudge.'],
      },
    ],
  },
  // --- weirdos
  {
    id: 'rocks',
    name: 'Gordon of the Rocks',
    title: 'collects interesting rocks',
    kind: 'weirdo',
    weight: 2,
    likes: ['tundra', 'desert', 'crystal', 'ember'],
    look: {
      skin: SKIN.pale,
      hair: HAIR.ginger,
      hairStyle: 'bald',
      shirt: ['#3a3e1e', '#5a602e', '#7e8644'],
      pants: ['#3a2a1e', '#5a4230', '#7a5a40'],
      shoes: SHOES,
      panel: { kind: 'vest', ramp: ['#8a6a44', '#b08c5c'] },
      beard: 'full',
      glasses: true,
      item: 'rock',
    },
    barks: ['Want to see a rock?', 'Kevin says hi.', 'This one\'s gray!', 'Rocks: nature\'s potatoes.'],
    quests: [],
  },
  {
    id: 'bard',
    name: 'Melvin the Bard',
    title: 'knows one chord',
    kind: 'weirdo',
    weight: 2,
    likes: ['hamlet', 'shrine', 'forest', 'graveyard'],
    look: {
      skin: SKIN.light,
      hair: HAIR.blond,
      hairStyle: 'short',
      shirt: ['#1e4a24', '#2e7034', '#48984a'],
      pants: ['#5a1a1e', '#8a2a2c', '#b8423e'],
      shoes: SHOES,
      panel: { kind: 'vest', ramp: ['#c8902a', '#f2c24a'] },
      hat: { kind: 'cap', ramp: ['#6a1a1e', '#a8302c', '#d8503a'], trim: ['#c4bece', '#f2f0f8'] },
      item: 'lute',
    },
    barks: ['(strum)', 'This one\'s in G!', 'Another G? Gladly!', 'La la la... G.'],
    quests: [
      {
        kind: 'slay',
        pest: true,
        title: 'The Ballad of {Mobs}',
        text: 'My ballad\'s about a hero who slays {Mobs}. Make it true. Bards have ethics.',
        waiting: ['(strum) The ballad\'s stuck at verse {done}. (strum) Verse {done}. (strum)'],
        thanks: ['(strum) The Ballad of {hero}! (strum) It\'s a hit. Here\'s your cut.'],
      },
      {
        kind: 'slayElite',
        title: 'The Big Finish',
        text: 'My ballad needs a big finish. A big shiny one. Then I strum really hard.',
        waiting: ['(strum) Still waiting on the big finish. (strum)'],
        thanks: ['(STRUM) That\'s the big finish! My finger hurts. Worth it. Take the tips.'],
      },
    ],
  },
  {
    id: 'chicken',
    name: 'Gerald',
    title: 'is definitely a chicken',
    kind: 'weirdo',
    weight: 2,
    likes: ['farmland', 'hamlet'],
    look: {
      skin: SKIN.light,
      hair: HAIR.blond,
      hairStyle: 'none',
      shirt: ['#a8a4b0', '#d8d4e0', '#fafaff'],
      pants: ['#a4501a', '#e0802a', '#f8b04a'],
      shoes: ['#a4501a', '#e0802a'],
      hat: { kind: 'chicken', ramp: ['#a8a4b0', '#d8d4e0', '#fafaff'], trim: ['#a8201e', '#e0402e'] },
      beak: true,
    },
    barks: ['BAWK.', 'Bawk?', 'I am a normal chicken.', 'Peck. Peck peck.'],
    quests: [
      {
        kind: 'collect',
        item: 'hourglass',
        title: 'The Egg',
        text: 'My egg is missing. Round. Shiny. Sand inside. It hatches into a minute.',
        waiting: ['Found my egg yet? It\'s glass. With sand in. Like all eggs.'],
        thanks: ['My egg! BAWK! I\'ll sit on it till it hatches. Here, I found this in a nest.'],
      },
      {
        kind: 'slay',
        pest: true,
        title: 'Fox Watch',
        text: 'To a chicken, {Mobs} are foxes. They aren\'t foxes. Kill them anyway.',
        waiting: ['Still foxes about. Not foxes. Foxes. BAWK.'],
        thanks: ['The foxes are gone! The not-foxes too! Here. Don\'t ask where I kept it.'],
      },
    ],
  },
  {
    id: 'ghost',
    name: 'Sir Latimer the Late',
    title: 'a ghost, running late',
    kind: 'weirdo',
    weight: 2,
    likes: ['crypt', 'graveyard', 'shrine'],
    look: {
      skin: SKIN.ghost,
      hair: ['#4a5c9a', '#7088c4', '#a8bcec'],
      hairStyle: 'short',
      shirt: ['#3a4a8a', '#5a70b8', '#8aa0e0'],
      pants: ['#3a4a8a', '#5a70b8', '#8aa0e0'],
      shoes: ['#3a4a8a', '#5a70b8'],
      panel: { kind: 'shawl', ramp: ['#c8d4f4', '#f0f4ff'] },
      hat: { kind: 'cap', ramp: ['#2a3470', '#4a58a0', '#7080c8'], trim: ['#c8d4f4', '#f0f4ff'] },
      beard: 'mustache',
      eyes: '#1a2050',
      ghost: true,
    },
    barks: ['I\'m late! I\'m late!', 'Is it Tuesday? Which century?', 'Oh bother, oh bother.', 'Three hundred years late...'],
    quests: [
      {
        kind: 'reach',
        title: 'Tell Them I\'m Coming',
        text: 'Run ahead and tell them I\'m on my way! Whoever they are! For whatever it is!',
        waiting: ['Floor {floor}! Hurry! I\'d go myself, but I\'d be late.'],
        thanks: ['My own funeral? And I missed it AGAIN? ...Take this. I can\'t spend it.'],
      },
      {
        kind: 'boss',
        title: 'The Appointment',
        text: 'I had an appointment to haunt their boss. Go in my place? Hit him a lot.',
        waiting: ['Has my appointment been kept? Hit him a lot, remember. Ghostly a lot.'],
        thanks: ['You hit him a lot? Splendid. I\'ll mark it "attended". Here, for your trouble.'],
      },
    ],
  },
  {
    id: 'goblin',
    name: 'Nib Ledgerbottom',
    title: 'goblin accountant',
    kind: 'weirdo',
    weight: 2,
    likes: ['ember', 'crypt', 'swamp', 'desert'],
    look: {
      skin: SKIN.goblin,
      hair: HAIR.black,
      hairStyle: 'none',
      shirt: ['#9a96a4', '#cac6d4', '#eeeaf4'],
      pants: ['#26222e', '#3a3444', '#524a5e'],
      shoes: BOOTS,
      panel: { kind: 'vest', ramp: ['#4a3020', '#6e4a30'] },
      hat: { kind: 'visor', ramp: ['#1e5a3a', '#2e8a5a', '#5ac08a'], trim: ['#26222e', '#3a3444'] },
      glasses: true,
      ears: true,
      item: 'ledger',
    },
    barks: ['Carry the two...', 'Receipts, people!', 'That\'s a write-off.', 'Who expensed a catapult?'],
    quests: [
      {
        kind: 'slay',
        title: 'Downsizing',
        text: 'Too many monsters on payroll. Please... process them. I\'ll pay a consulting fee.',
        waiting: ['More to process. Chop chop. Not literally. Well. Literally.'],
        thanks: ['Processed! Beautiful numbers. Here\'s your fee, minus a small fee for the fee.'],
      },
      {
        kind: 'collect',
        item: 'gold',
        title: 'The Audit',
        text: 'Audit time! Bring me coins so I can count them. I\'ll keep SOME. For accuracy.',
        waiting: ['Coins, coins, coins! The audit waits for no goblin.'],
        thanks: ['Counted! Here\'s a few back. Don\'t tell the Treasurer. The Treasurer is a slime.'],
      },
    ],
  },
  {
    id: 'wizard',
    name: 'Mortimer the Mostly Magnificent',
    title: 'a wizard, mostly',
    kind: 'weirdo',
    weight: 2,
    likes: ['crystal', 'shrine', 'forest'],
    look: {
      skin: SKIN.pale,
      hair: HAIR.white,
      hairStyle: 'short',
      shirt: ['#1e2a6a', '#2e44a0', '#4a68d0'],
      pants: ['#1e2a6a', '#2e44a0', '#4a68d0'],
      shoes: BOOTS,
      dress: true,
      hat: { kind: 'wizard', ramp: ['#3a1a5e', '#5a2e8a', '#8048b8'], trim: ['#c8902a', '#ffd86a'] },
      beard: 'long',
      item: 'orbStaff',
    },
    barks: ['Abraca... something.', 'Toads! ...No.', 'Sparkle! ...Fizzle.', 'I meant to do that.'],
    quests: [
      {
        kind: 'slayElite',
        title: 'Arcane Ingredients',
        text: 'I need glowing hearts from the big shiny ones. For my spell: "make the big shiny ones stop".',
        waiting: ['The spell still needs glowing hearts. Chop chop. Magically.'],
        thanks: ['Splendid! The spell is complete! The big shiny ones have stopped. Well. Those ones have.'],
      },
      {
        kind: 'slay',
        pest: true,
        title: 'Toad Practice',
        text: 'Testing my toad spell. Clear out those {Mobs}. Not toads? It failed safely!',
        waiting: ['Toads or not? I genuinely can\'t tell any more.'],
        thanks: ['Excellent. No toads. Spell confirmed useless. Science! Here, for your trouble.'],
      },
    ],
  },
  {
    id: 'chef',
    name: 'Chef Gustave',
    title: 'cooks with what he finds',
    kind: 'weirdo',
    weight: 2,
    likes: ['swamp', 'farmland', 'ember', 'hamlet'],
    look: {
      skin: SKIN.light,
      hair: HAIR.brown,
      hairStyle: 'short',
      shirt: ['#a8a4b0', '#d8d4e0', '#fafaff'],
      pants: ['#2a2830', '#46424e', '#625e6a'],
      shoes: BOOTS,
      panel: { kind: 'shawl', ramp: ['#a8201e', '#e0402e'] },
      hat: { kind: 'chef', ramp: ['#a8a4b0', '#d8d4e0', '#fafaff'] },
      beard: 'mustache',
      item: 'ladle',
    },
    barks: ['Mmm, stew!', 'Who wants seconds?', 'Needs salt. And slime.', 'Fresh ingredients! Running away!'],
    quests: [
      {
        kind: 'slay',
        pest: true,
        title: 'Stew Fixings',
        text: 'My stew needs {Mobs}. Freshly slain. Don\'t bring them. I\'ll know.',
        waiting: ['The stew needs more {mobs}. It\'s bubbling impatiently. Stews do that.'],
        thanks: ['Magnificent! The stew is complete! It is terrible. Take this instead of a bowl. Trust me.'],
      },
      {
        kind: 'slay',
        title: 'Health Inspection',
        text: 'The kitchen is crawling. Clear it out. The inspector\'s a ghost. Very thorough.',
        waiting: ['The inspector is floating about somewhere. Literally.'],
        thanks: ['Spotless! The inspector gave us four stars. Out of four hundred. A record! Here.'],
      },
    ],
  },
  {
    id: 'hermit',
    name: 'Old Bramble',
    title: 'King of This Hallway',
    kind: 'weirdo',
    weight: 2,
    likes: ['forest', 'swamp', 'shrine', 'graveyard'],
    look: {
      skin: SKIN.tan,
      hair: HAIR.gray,
      hairStyle: 'short',
      shirt: ['#2e3420', '#4a5230', '#6a7444'],
      pants: ['#2e3420', '#4a5230', '#6a7444'],
      shoes: [SKIN.tan[0], SKIN.tan[1]],
      dress: true,
      hat: { kind: 'twigs', ramp: ['#3a2a1a', '#5e4428', '#86643c'], trim: ['#3e6a2a', '#68a040'] },
      beard: 'long',
      item: 'staff',
    },
    barks: ['Bow! Or wave.', 'My hallway!', 'Long live me!', 'Kneel! Knees permitting.'],
    quests: [
      {
        kind: 'boss',
        title: 'Dethrone the Pretender',
        text: 'A rival king claims this stretch. End of the line. Dethrone him. Politely. Then rudely.',
        waiting: ['The pretender still sits on his throne. Or squats. Or oozes. I haven\'t seen him.'],
        thanks: ['The pretender has fallen! I name you Duke of... that rock. Over there. Also, this.'],
      },
      {
        kind: 'slay',
        title: 'Royal Census',
        text: 'Too many of my subjects have teeth. Reduce them. The ones with teeth.',
        waiting: ['The census says more to go. The census is me. I counted.'],
        thanks: ['A leaner, less toothy kingdom! The royal treasury grants you this.'],
      },
    ],
  },
  // --- demons in disguise
  {
    id: 'gary',
    name: 'Gary',
    title: 'a totally normal guy',
    kind: 'demon',
    weight: 1,
    minFloor: 2,
    look: {
      skin: SKIN.light,
      hair: HAIR.brown,
      hairStyle: 'short',
      shirt: ['#6a5a3e', '#9a865c', '#c4b083'],
      pants: ['#3a2a20', '#5a4232', '#7a5c46'],
      shoes: SHOES,
      hat: { kind: 'straw', ramp: ['#7a5a26', '#b08a3e', '#d8bc68'], trim: ['#3a2a20', '#5a4232'] },
      eyes: '#ff3a2a',
      demon: { tail: ['#5a0e10', '#a01e1a', '#d83a2a'], horns: true, smoke: true },
    },
    barks: ['Hello, fellow human.', 'Very normal day today.', 'Hm? No. Nothing swished.', 'Chill. Everyone chill.'],
    quests: [],
    demon: {
      name: 'Gary',
      title: 'Demon of Mild Inconvenience',
      taunts: ['Gary\'s had ENOUGH!', 'This is SO not chill!', 'I was going to be normal for once!', 'Gary is VERY upset!'],
    },
  },
  {
    id: 'nana',
    name: 'Nana Grizelda',
    title: 'a sweet old lady',
    kind: 'demon',
    weight: 1,
    minFloor: 2,
    look: {
      skin: SKIN.pale,
      hair: HAIR.gray,
      hairStyle: 'bun',
      shirt: ['#2e1a3a', '#4a2a5e', '#6a4084'],
      pants: ['#2e1a3a', '#4a2a5e', '#6a4084'],
      shoes: BOOTS,
      dress: true,
      panel: { kind: 'shawl', ramp: ['#8a6aa8', '#b496d0'] },
      glasses: true,
      eyes: '#ff3a2a',
      demon: { tail: ['#5a0e10', '#a01e1a', '#d83a2a'], horns: false, smoke: true },
    },
    barks: ['Come here, dearie.', 'Cookies! Fresh from the... oven.', 'Hehehe. Ahem. Just a cough.', 'Stay for tea. Forever.'],
    quests: [],
    demon: {
      name: 'Grizelda',
      title: 'Matron of Burnt Cookies',
      taunts: ['Nana\'s telling your mother!', 'Eat your vegetables! THEY\'RE ON FIRE!', 'Respect your elders! Your ELDRITCH elders!', 'No tea for you!'],
    },
  },
  {
    id: 'lou',
    name: 'Lou C. Fur',
    title: 'a licensed merchant',
    kind: 'demon',
    weight: 1,
    minFloor: 2,
    look: {
      skin: SKIN.tan,
      hair: HAIR.black,
      hairStyle: 'short',
      shirt: ['#2e0e14', '#4e1a22', '#742a32'],
      pants: ['#2e0e14', '#4e1a22', '#742a32'],
      shoes: BOOTS,
      dress: true,
      hat: { kind: 'hood', ramp: ['#4a0e14', '#7a1a20', '#a8302c'] },
      beard: 'goatee',
      eyes: '#ff3a2a',
      item: 'scroll',
      demon: { tail: ['#5a0e10', '#a01e1a', '#d83a2a'], horns: true, smoke: false },
    },
    barks: ['Psst. Want some luck?', 'Deals! Hot deals! Very hot!', 'Sign here. And here. And here.', 'Licensed! Very licensed!'],
    quests: [],
    demon: {
      name: 'Lou Cifer',
      title: 'Archfiend of Fine Print',
      taunts: ['This violates clause seven!', 'No refunds! NO REFUNDS!', 'See you in small claims court!', 'You never read page nine!'],
    },
  },
];

/**
 * The floors' shopkeeper (world/shop.ts): she keeps a merchant's room, wares set out in front of her
 * stall. No jobs; never one of the floor's random locals.
 */
export const SHOPKEEPER: NpcDef = {
  id: 'shopkeeper',
  name: 'Madame Thrift',
  title: 'a travelling merchant',
  kind: 'folk',
  weight: 0,
  look: {
    skin: SKIN.light,
    hair: HAIR.ginger,
    hairStyle: 'bun',
    shirt: ['#1e3a4a', '#2e5a6e', '#4a8296'],
    sleeves: ['#a89a7a', '#d4c8a4', '#f0e8cc'],
    pants: ['#3a2a1e', '#5a4230', '#7a5a40'],
    shoes: SHOES,
    dress: true,
    panel: { kind: 'apron', ramp: ['#c8902a', '#ffd86a'] },
    hat: { kind: 'kerchief', ramp: ['#6a1e2a', '#a8323e', '#d85a5a'] },
    glasses: true,
    pack: ['#3a2414', '#5e3c22', '#8a5c34'],
    item: 'ledger',
  },
  barks: ['Wares for coin!', 'Potions! Tonics! Charms!', 'Everything must go!', 'Coin first, friend.', 'No refunds. No haggling.'],
  quests: [],
};

export const NPC_BY_ID: ReadonlyMap<string, NpcDef> = new Map(NPC_DEFS.map((d) => [d.id, d]));
const DEMONS = NPC_DEFS.filter((d) => d.kind === 'demon');
const LOCALS = NPC_DEFS.filter((d) => d.kind !== 'demon');

export function npcDef(id: string): NpcDef {
  const d = NPC_BY_ID.get(id);
  if (!d) throw new Error(`Unknown NPC ${id}`);
  return d;
}

/** Shouted while fighting, by every demon (each has a few of its own in def.demon.taunts). */
export const demonTaunts: string[] = [
  'Can we talk about this?',
  'Ow! Rude!',
  'Chill! CHILL!',
  'I have a family! Well. A cousin. He\'s a gargoyle.',
  'Not the face! I just got this face!',
  'You\'re harshing my vibe!',
  'I was going to give you a discount!',
  'Is it the horns? It\'s the horns, isn\'t it.',
  'Truce? Truce? ...No? Okay.',
  'Okay, ow, that one actually hurt.',
  'I\'m telling my mom! She\'s also a demon!',
  'Deep breaths. In through the nose, out through the fire.',
  'I was having such a nice day!',
  'Hey! Watch the tail!',
  'There\'s paperwork if I die, you know!',
  'Let\'s hug it out! With claws. Mostly claws.',
];

/** Shouted at half HP. */
export const demonEnrageLines: string[] = ['Okay. NOW I\'m not chill.', 'That\'s it! Gloves off! I wasn\'t wearing gloves!', 'You made me use my scary voice!'];

/** Its last words. */
export const demonDeathLines: string[] = [
  'I\'ll be back... in like a week. Tops.',
  'Tell my cousin... he owes me five gold...',
  'Worth it. The tail swish was worth it.',
  'This is so embarrassing.',
  'Ugh. Fine. Respawning in hell.',
];

/** The taunts one demon picks from: its own and everyone's. */
export function demonTauntsFor(def: NpcDef): string[] {
  return [...(def.demon?.taunts ?? []), ...demonTaunts];
}

/** Which demon an NPC seed belongs to (placeNpcs and demonMobType agree through this). */
export function demonDefFor(seed: number): NpcDef {
  return DEMONS[Rng.hashSeed((seed ^ 0xd3e0) >>> 0) % DEMONS.length];
}

// ------------------------------------------------------------------ small talk about the place

const BIOME_QUIPS: Partial<Record<BiomeId, string[]>> = {
  hamlet: ['The Mossy Hamlet. Quaint. Thatched roofs, flower boxes, things that bite.', 'Nice village. Bit stabby. I think the ducks are in on it.'],
  farmland: ['A farm. Sort of. The pigs charge. Not money. Themselves. At you.', 'The hens here have opinions. And knives. Mostly opinions.'],
  forest: ['Gloomwood. The trees whisper at night. Mostly gossip about the other trees.', 'Dark, damp and full of eyes. Like my cousin\'s cellar.'],
  tundra: ['Cold enough to freeze the "brr" right out of you.', 'I lost feeling in my toes two floors up. Then I lost a boot. Then I lost the will.'],
  crypt: ['Very quiet down here. The dead are polite. Until they aren\'t.', 'Mind the coffins. Some of them are occupied. Some are just resting their eyes.'],
  swamp: ['Don\'t drink the water. Don\'t touch the water. Don\'t make eye contact with the water.', 'Smells like old socks and older regrets.'],
  desert: ['Sand in my boots, sand in my bread, sand in my dreams.', 'The ruins are lovely. If you like ruins. And sand. And being cooked.'],
  graveyard: ['Lots of folks here are dying to meet you. Sorry. I\'ve been saving that one.', 'Quiet neighbors. Mostly. Don\'t knock on any doors. Especially the low ones.'],
  ember: ['Hot. Lava hot. My eyebrows left two floors up and never came back.', 'They say it\'s a dry heat. It\'s a lava heat.'],
  crystal: ['Everything sparkles. My eyes hurt. My purse is excited, though.', 'You can\'t take the crystals. I tried. They took me. Briefly.'],
  shrine: ['Peaceful, isn\'t it? Apart from the ghosts. And the foxes. And the ghost foxes.', 'Mind the lanterns. They watch you. Lovingly, I hope.'],
};

function biomeQuip(biomeId: string, biomeName: string, seed: number): string {
  const lines = BIOME_QUIPS[biomeId as BiomeId];
  if (lines?.length) return lines[seed % lines.length];
  return `${biomeName}. Could be worse. Could be raining. It\'s probably raining somewhere.`;
}

// ------------------------------------------------------------------ placement

let nextNpcUid = 1_000_000;

function npcWeight(d: NpcDef, floor: number, biomeId: string, quests: readonly Quest[]): number {
  if ((d.minFloor ?? 1) > floor) return 0;
  let w = d.weight * (d.likes?.includes(biomeId as BiomeId) ? 3 : 1);
  // Someone already waiting on a job of theirs mostly stays home.
  if (quests.some((q) => q.giver === d.id && !q.done && !q.turnedIn)) w *= 0.15;
  return w;
}

/**
 * The NPCs on a floor: 0-2 (more likely early on; none on boss floors), each at a set-up of their own
 * that suits the biome (camps.ts: a market stall, a tent by a campfire, a candlelit shrine...), backed
 * against a wall off the fighting: the start room first, then side rooms and quiet corners, away from
 * the corridors, the portal and the mobs. About one floor in eight has a demon in disguise among them.
 * Deterministic for the floor, biome and seed. Pass the player's quests and the giver of a finished
 * one turns up to take it back.
 *
 * Pitches the set-ups on `map` (their tiles blocked, their pieces added to the props, mobs that would
 * spawn beside them moved off), so call it once per map, before the World is built from it.
 */
export function placeNpcs(map: FloorMap, floor: number, biomeId: string, seed: number, quests: readonly Quest[] = []): Npc[] {
  if (isBossFloor(floor) || map.rooms.some((r) => r.kind === 'arena') || map.spawns.some((s) => s.boss)) return [];
  const rng = new Rng(Rng.hashSeed((seed ^ Math.imul(floor, 0x2c1b3c6d) ^ 0x4e7c) >>> 0));
  const pOne = floor <= 3 ? 0.9 : floor <= 10 ? 0.7 : floor <= 25 ? 0.55 : 0.45;
  const pTwo = floor <= 3 ? 0.45 : floor <= 10 ? 0.3 : 0.2;
  let n = rng.chance(pOne) ? (rng.chance(pTwo) ? 2 : 1) : 0;
  if (floor === 1) n = Math.max(1, n);
  const demon = floor >= 2 && rng.chance(1 / 8);
  const pending = quests.find((q) => q.done && !q.turnedIn && NPC_BY_ID.has(q.giver) && NPC_BY_ID.get(q.giver)!.kind !== 'demon');
  if (demon || pending) n = Math.max(1, n);
  if (n === 0) return [];
  // Who: a giver waiting for a turn-in first, then the demon, then locals by weight (no repeats).
  const seeds: number[] = [];
  const cast: NpcDef[] = [];
  const push = (d: NpcDef, s: number) => {
    cast.push(d);
    seeds.push(s);
  };
  if (pending) push(NPC_BY_ID.get(pending.giver)!, rng.int(0, 0x3fffffff));
  if (demon && cast.length < 2) {
    const s = rng.int(0, 0x3fffffff);
    push(demonDefFor(s), s);
  }
  while (cast.length < n && cast.length < 2) {
    const pool = LOCALS.map((d) => [d, cast.includes(d) ? 0 : npcWeight(d, floor, biomeId, quests)] as const).filter(([, w]) => w > 0);
    if (!pool.length) break;
    push(rng.weighted(pool), rng.int(0, 0x3fffffff));
  }
  // Where: each at a set-up of their own, pitched off the fighting.
  const mobNames = floorMobNames(map, floor, biomeId);
  const campRng = rng.fork(0xca3b);
  const camps: Camp[] = [];
  const out: Npc[] = [];
  cast.forEach((def, i) => {
    const camp = pitchCamp(map, biomeId, campRng, camps);
    if (!camp) return;
    camps.push(camp);
    const { x, y } = camp.stand;
    const s = seeds[i];
    out.push({
      uid: nextNpcUid++,
      def,
      x,
      y,
      homeX: x,
      homeY: y,
      dir: rng.chance(0.5) ? 1 : -1,
      view: 'down',
      animT: rng.next() * 4,
      room: camp.room,
      floor,
      biomeId,
      seed: s,
      talkedTo: 0,
      questIndex: def.quests.length ? Rng.hashSeed((s ^ 0x9e57) >>> 0) % def.quests.length : -1,
      questTaken: false,
      gifted: false,
      demon: def.kind === 'demon',
      revealed: false,
      mobNames: [...mobNames],
      camp,
    });
  });
  return out;
}

function floorMobNames(map: FloorMap, floor: number, biomeId: string): string[] {
  const biome = BIOMES[biomeId as BiomeId];
  if (!biome) return [];
  try {
    return floorMobs(biome, floor, map.seed).map((t) => t.name);
  } catch {
    return [];
  }
}

/** One NPC built by hand (tests, previews, scripted scenes): it stands at (x, y) on `floor`. */
export function makeNpc(def: NpcDef, x: number, y: number, floor: number, biomeId: string, seed: number, mobNames: string[] = []): Npc {
  return {
    uid: nextNpcUid++,
    def,
    x,
    y,
    homeX: x,
    homeY: y,
    dir: 1,
    view: 'down',
    animT: 0,
    room: -1,
    floor,
    biomeId,
    seed,
    talkedTo: 0,
    questIndex: def.quests.length ? Rng.hashSeed((seed ^ 0x9e57) >>> 0) % def.quests.length : -1,
    questTaken: false,
    gifted: false,
    demon: def.kind === 'demon',
    revealed: false,
    mobNames,
  };
}

// ------------------------------------------------------------------ quests

/** The job this NPC offers on its floor (null: it has none). Same NPC and gold, same quest. */
export function questFor(npc: Npc, goldPerKill: number, mobNames?: string[]): Quest | null {
  const tpl = npc.def.quests[npc.questIndex];
  if (!tpl) return null;
  const names = mobNames?.length ? mobNames : npc.mobNames;
  const pest = tpl.kind === 'slay' && tpl.pest && names.length ? names[Rng.hashSeed((npc.seed ^ 0x5e57) >>> 0) % names.length] : undefined;
  return makeQuest({
    giver: npc.def.id,
    giverName: npc.def.name,
    kind: tpl.kind,
    floor: npc.floor,
    goldPerKill,
    seed: npc.seed,
    mobName: pest,
    item: tpl.item,
    title: tpl.title,
    text: tpl.text,
  });
}

function templateOf(def: NpcDef, q: Quest): QuestTemplate | undefined {
  return def.quests.find((t) => fillQuestText(t.title, q) === q.title) ?? def.quests.find((t) => t.kind === q.kind);
}

/** The bubble over an NPC's head: a job to offer, a job to hand back, or nothing. */
export function npcMarker(npc: Npc, quests: readonly Quest[]): 'offer' | 'turnIn' | null {
  if (npc.revealed) return null;
  if (quests.some((q) => q.giver === npc.def.id && q.done && !q.turnedIn)) return 'turnIn';
  if (npc.demon) return npc.talkedTo === 0 ? 'offer' : null; // the bait
  if (npc.questIndex < 0 || npc.questTaken || !canTakeQuest(quests)) return null;
  if (quests.some((q) => q.giver === npc.def.id && !q.turnedIn)) return null;
  return 'offer';
}

/** A line it mutters as you pass (n: any number; the same n gives the same line). */
export function npcBark(npc: Npc, n: number): string {
  const b = npc.def.barks;
  return b[Math.abs(Math.floor(n) + npc.seed) % b.length];
}

export interface ActionResult {
  /** Grant these to the player (gold, Hourglasses, a luck potion, Lucky Spins). */
  reward: QuestReward | null;
  /** The quest just taken (already added to the list). */
  accepted: Quest | null;
  /** The quest just handed back (already marked; its reward is in `reward`). */
  turnedIn: Quest | null;
  /** The demon drops the act: take the NPC away and spawn demonMobType(floor, biome, npc.seed) where it stood. */
  fight: boolean;
  /** The conversation is over. */
  close: boolean;
}

function rewardOf(a: Extract<DialogAction, { type: 'reward' }>): QuestReward {
  const r: QuestReward = {};
  if (a.gold) r.gold = a.gold;
  if (a.hourglasses) r.hourglasses = a.hourglasses;
  if (a.potion) r.potion = true;
  if (a.luckSpins) r.luckSpins = a.luckSpins;
  return r;
}

/**
 * The bookkeeping for a chosen line: takes the quest (into `quests`, if there's room), hands one
 * back, marks the one-time gift, unmasks the demon. Returns what to grant and whether a fight starts.
 */
export function applyDialogAction(npc: Npc, choice: DialogChoice, quests: Quest[]): ActionResult {
  const res: ActionResult = { reward: null, accepted: null, turnedIn: null, fight: false, close: !choice.next };
  const a = choice.action;
  if (!a) return res;
  switch (a.type) {
    case 'acceptQuest':
      if (addQuest(quests, a.quest)) {
        res.accepted = quests[quests.length - 1];
        npc.questTaken = true;
      }
      break;
    case 'turnIn': {
      const q = turnInQuest(quests, npc.def.id);
      if (q) {
        res.turnedIn = q;
        res.reward = { ...q.reward };
      }
      break;
    }
    case 'reward':
      if (!npc.gifted) {
        npc.gifted = true;
        res.reward = rewardOf(a);
      }
      break;
    case 'fight':
      npc.revealed = true;
      res.fight = true;
      res.close = true;
      break;
    case 'close':
      res.close = true;
      break;
  }
  return res;
}

// ------------------------------------------------------------------ dialog

type Graph = Record<string, DialogNode>;

interface S {
  npc: Npc;
  def: NpcDef;
  ctx: DialogCtx;
  name: string;
  floor: number;
  biome: string;
  hero: string;
  quip: string;
  g: Graph;
  /** A line by the NPC's seed (salt: a different pick per topic). */
  pick(lines: readonly string[], salt?: number): string;
  /** Adds a node. */
  node(id: string, text: string, ...choices: DialogChoice[]): void;
  /** The opener: first meeting, coming back, or (while a job of theirs is going) a reminder. */
  open(hello: readonly string[], again: readonly string[]): string;
  /** The opener was a reminder of their job (the start node gets its job card). */
  reminded: boolean;
  /** "Need a hand?": adds the job's nodes (offer, busy, recap...) and returns the choice that leads there. */
  questChoice(label: string): DialogChoice[];
  /** Gold worth `kills` kills. */
  gold(kills: number): number;
}

const to = (label: string, next: string): DialogChoice => ({ label, next });
const bye = (label = FOLK_QUIT): DialogChoice => ({ label, action: { type: 'close' } });
const fight = (label: string): DialogChoice => ({ label, action: { type: 'fight' } });
const gift = (label: string, r: Omit<Extract<DialogAction, { type: 'reward' }>, 'type'>, next?: string): DialogChoice => ({ label, action: { type: 'reward', ...r }, ...(next ? { next } : {}) });

const YES = ['I\'ll do it.', 'Consider it done.', 'On it.', 'Leave it to me.'];
const NO = ['Not right now.', 'Maybe later.', 'Sounds like work.'];
const BUSY = [
  'You look busy. Your quest log is practically smoking. Come back when you\'ve got room.',
  'You\'ve got three jobs on already! Finish one. I\'ll wait. I\'m very good at waiting.',
];
const NOTHING = ['That\'s all I needed. You\'ve done plenty.', 'Nothing more today. Go on, be heroic somewhere.'];
const ACCEPTED = ['Wonderful! Off you go, then.', 'Splendid. I\'ll be right here. Probably.', 'Marvelous! Try not to die. It makes the paperwork awkward.'];

function makeS(npc: Npc, ctx: DialogCtx): S {
  const def = npc.def;
  const g: Graph = {};
  const name = def.name;
  const mine = ctx.activeQuests.find((q) => q.giver === def.id && !q.done && !q.turnedIn) ?? null;
  const s: S = {
    npc,
    def,
    ctx,
    name,
    floor: ctx.floor,
    biome: ctx.biomeName,
    hero: ctx.heroName ?? 'Sir Knight',
    quip: biomeQuip(npc.biomeId, ctx.biomeName, npc.seed),
    g,
    pick: (lines, salt = 0) => lines[Rng.hashSeed((npc.seed ^ Math.imul(salt + 1, 0x27d4eb2d)) >>> 0) % lines.length],
    node: (id, text, ...choices) => {
      g[id] = { speaker: name, text, choices };
    },
    open: (hello, again) => {
      if (mine) {
        const tpl = templateOf(def, mine);
        const line = tpl ? s.pick(tpl.waiting, 7) : 'How\'s that job coming along?';
        // (The job card under it shows the goal and how far along it is.)
        s.reminded = true;
        return fillQuestText(line, mine, { hero: s.hero });
      }
      return npc.talkedTo > 0 ? s.pick(again, 2) : s.pick(hello, 1);
    },
    reminded: false,
    questChoice: (label) => {
      if (!def.quests.length) return [];
      if (mine) {
        const tpl = templateOf(def, mine);
        s.node('questRecap', mine.text, bye(tpl?.kind === 'reach' ? 'On my way.' : 'On it.'), to('Something else...', 'start'));
        g.questRecap.job = jobOf(mine, 'progress');
        return [{ ...to(label, 'questRecap'), job: true }];
      }
      const offer = questFor(npc, ctx.goldPerKill, ctx.mobNames);
      const taken = npc.questTaken || (offer !== null && ctx.activeQuests.some((q) => q.id === offer.id));
      if (!offer || taken) {
        s.node('questNone', s.pick(NOTHING, 5), to('Something else...', 'start'), bye());
        return [to(label, 'questNone')];
      }
      if (!canTakeQuest(ctx.activeQuests)) {
        s.node('questBusy', s.pick(BUSY, 6), to('Fair enough.', 'start'), bye());
        return [to(label, 'questBusy')];
      }
      s.node('quest', offer.text, { label: s.pick(YES, 3), action: { type: 'acceptQuest', quest: offer }, next: 'questYes', job: true }, to(s.pick(NO, 4), 'start'));
      g.quest.job = jobOf(offer, 'offer');
      s.node('questYes', s.pick(ACCEPTED, 8), bye());
      g.questYes.job = jobOf(offer, 'taken');
      return [{ ...to(label, 'quest'), job: true }];
    },
    gold: (kills) => Math.max(1, Math.round(Math.max(0, ctx.goldPerKill) * kills)),
  };
  return s;
}

/** A job card for a quest at some stage (an offer says what it asks; one under way, how far along). */
function jobOf(q: Quest, stage: DialogJob['stage']): DialogJob {
  const reach = q.kind === 'reach';
  return {
    stage,
    title: q.title,
    goal: stage === 'offer' || stage === 'taken' ? questAsk(q) : questGoal(q),
    aim: {
      kind: q.kind,
      n: reach ? q.floorTaken + q.target : q.target,
      ...(stage === 'progress' ? { done: reach ? q.floorTaken + q.progress : q.progress } : {}),
      ...(q.mobName ? { mob: q.mobName } : {}),
      ...(q.item ? { item: q.item } : {}),
    },
    ...(stage === 'progress' ? { progress: Math.min(1, q.progress / Math.max(1, q.target)) } : {}),
    reward: { ...q.reward },
  };
}

/** The graph when a finished job of theirs comes back: thanks and the reward (on its job card). */
function turnInGraph(s: S, q: Quest): Graph {
  const tpl = templateOf(s.def, q);
  const line = tpl ? s.pick(tpl.thanks, 9) : 'You did it! Thank you!';
  s.node('start', fillQuestText(line, q, { hero: s.hero }), { label: s.pick(['Happy to help.', 'All in a day\'s work.', 'Any time.'], 10), action: { type: 'turnIn' }, job: true });
  s.g.start.job = jobOf(q, 'done');
  return s.g;
}

type Script = (s: S) => void;

const SCRIPTS: Record<string, Script> = {
  shopkeeper(s) {
    s.node(
      'start',
      s.open(
        ['Madame Thrift, travelling merchant. Walk up to anything you fancy: the price is on the tag.', 'Coin for wares, friend! Potions, tonics, charms. Step up to the one you want.'],
        ['Back for more? Step right up to the counter.', 'Still browsing? The tags don\'t bite.'],
      ),
      bye('Just looking.'),
    );
  },

  farmer(s) {
    s.node(
      'start',
      s.open(
        ['Excuse me! Have you seen a farm? Big. Flat. Cows on it. I put it down somewhere and now it\'s gone.', 'Oh, thank goodness, a knight! I\'m lost. Very lost. I\'ve been lost since floor one. Possibly before.'],
        ['Still no farm. I did find a turnip. Well. It found me. It bit me.', 'Back again? Did you bring my farm? No? Ah well.'],
      ),
      to('How did you get lost?', 'lost'),
      ...s.questChoice('Need a hand?'),
      to('What\'s this place like?', 'place'),
      to('Are you a demon?', 'accuse'),
      bye('Good luck, Hob.'),
    );
    s.node('lost', `Followed a chicken into a hole. Then the chicken got promoted. Now I\'m on floor ${s.floor}.`, to('Promoted?', 'promoted'), to('I see.', 'start'));
    s.node('promoted', 'Runs this whole stretch now. Wears a tiny crown. Won\'t answer my letters.', to('Poor Hob.', 'start'));
    s.node('place', s.quip, to('Huh.', 'start'));
    s.node('accuse', 'Do demons have this many blisters? Look at these hands. Honest work. Honest, terrible blisters.', to('Sorry, Hob.', 'start'));
  },

  mother(s) {
    s.node(
      'start',
      s.open(
        ['Have you seen my boy? About this tall. Answers to "Pip", "Stop that" and "PIP, PUT THAT DOWN".', 'Oh! A knight. Have you seen a small boy? Muddy. Loud. Probably holding a frog.'],
        ['Any sign of Pip? He never answers when I shout. He\'s twelve. It\'s a phase.', 'Back again, dear? Have you eaten? You look thin. Knights are always thin. It\'s all the running.'],
      ),
      to('What does he look like?', 'looks'),
      ...s.questChoice('Can I help?'),
      ...(s.npc.gifted ? [] : [to('Got any snacks?', 'snack')]),
      to('Are you a demon?', 'accuse'),
      bye('I\'ll keep an eye out.'),
    );
    s.node('looks', 'Like mud with legs. If a puddle waves at you, that\'s Pip.', to('Got it.', 'start'));
    if (!s.npc.gifted) s.node('snack', 'Snacks? Here, take a few coins and buy yourself a proper meal. Not slime. Slime is not a meal.', gift('Thanks, Marta!', { gold: s.gold(5) }));
    s.node('accuse', 'A demon? Dear, I have SIX children. I\'ve met demons. I raised two of them.', to('Fair enough.', 'start'));
  },

  guard(s) {
    s.node(
      'start',
      s.open(
        ['Halt! Who goes... ugh. Never mind. You look fine. I\'ve been on shift since floor one.', 'Halt. State your business. Actually, don\'t. I\'m too tired to care about business.'],
        ['Oh. You again. Still halted? Good. Very good. Carry on.', 'Still here. Still guarding. Still not sure what.'],
      ),
      to('What are you guarding?', 'guarding'),
      ...s.questChoice('Need help?'),
      to('What\'s this place like?', 'place'),
      to('Are you a demon?', 'accuse'),
      bye('Stay awake.'),
    );
    s.node('guarding', 'This spot. Very important spot. Nobody\'s stolen it yet, so I\'m doing great.', to('Great job.', 'start'), to('Can I stand in it?', 'spot'));
    s.node('spot', 'Absolutely not. Do you have a spot permit? No? Then no. Sorry. Rules are rules.', to('Fine.', 'start'));
    s.node('place', s.quip, to('Lovely.', 'start'));
    s.node('accuse', 'If I were a demon, would I be THIS tired? Demons get weekends. Demons have a union.', to('Good point.', 'start'));
  },

  merchant(s) {
    s.node(
      'start',
      s.open(
        ['Wares! Fine wares for sale! Well. Ware. I have one ware. It\'s a spoon.', 'Ah, a customer! Interested in a spoon? It\'s the only thing I sell. I\'m very focused.'],
        ['Back for the spoon? I knew you\'d be back for the spoon.', `Still got the spoon. Still the finest spoon on floor ${s.floor}.`],
      ),
      to('Can I see the spoon?', 'spoon'),
      ...s.questChoice('Got any work?'),
      to('Are you a demon?', 'accuse'),
      bye('Good luck with the spoon.'),
    );
    s.node('spoon', `Look, don\'t touch. That\'s a forty-gold spoon. It\'s been to ${s.biome}.`, to('Why forty gold?', 'spoon2'), to('Nice spoon.', 'start'));
    s.node('spoon2', `It\'s been to ${s.biome}! Provenance! You can\'t put a price on that. I did, though. Forty.`, to('I\'ll buy it.', 'buy'), to('I\'ll pass.', 'start'));
    if (s.npc.gifted) s.node('buy', 'No! Not for sale! I already paid you to forget about it. Did you forget? Forget it.', to('Forgotten.', 'start'));
    else s.node('buy', 'No! It\'s my only ware! I\'d just be a man with a backpack. Take this. Forget the spoon.', gift('What spoon?', { gold: s.gold(6) }));
    s.node('accuse', 'Me? A demon? Demons want your soul. I just want forty gold for a spoon.', to('Fair.', 'start'));
  },

  cartographer(s) {
    s.node(
      'start',
      s.open(
        ['Don\'t move! I\'m mapping you. ...Okay, you\'re a smudge. A very handsome smudge.', 'Ah, a traveler! Tell me, which way is north? So far I only have "down" and "more down".'],
        ['Back again! I\'ve put you on the map. You\'re the little sword. Well. Smudge.', 'Hello again! The map now says "down", "more down" and "you".'],
      ),
      to('How\'s the map?', 'map'),
      ...s.questChoice('Need a scout?'),
      to('Are you a demon?', 'accuse'),
      bye('Happy mapping.'),
    );
    s.node('map', 'So far it says "down", "more down" and "here be slimes". It\'s a living document.', to('Can I see?', 'map2'), to('Nice.', 'start'));
    s.node('map2', `No peeking! It\'s not finished. Also it\'s mostly a drawing of a duck. I got bored on floor ${Math.max(1, s.floor - 1)}.`, to('Nice duck.', 'start'));
    s.node('accuse', 'Let me check the legend. Demons: a little horn. Me: a little hat. Different.', to('My mistake.', 'start'));
  },

  rocks(s) {
    s.node(
      'start',
      s.open(
        ['A visitor! Want to see my rocks? Everyone does. Nobody\'s said so, but I can tell.', 'Psst! Knight! Want to see something amazing? It\'s a rock.'],
        ['Back for more rocks? I knew it. Nobody can resist the rocks.', 'The rocks missed you. Kevin especially.'],
      ),
      to('Show me your rocks.', 'rock1'),
      to('Why rocks?', 'why'),
      to('Are you a demon?', 'accuse'),
      bye('No thanks.'),
    );
    s.node('rock1', 'This is Kevin. Kevin is gray. Look at him. LOOK at how gray he is.', to('Wow. So gray.', 'rock2'), to('It\'s a rock.', 'rude'));
    s.node('rock2', 'And this is Kevin\'s brother. Also Kevin. Notice the bump. Feel the bump. Don\'t feel the bump.', to('Magnificent bump.', 'rock3'), to('These are just rocks.', 'rude'));
    s.node('rock3', `My prize. Found it right here on floor ${s.floor}. It\'s a rock. But it\'s a ${s.biome} rock.`, to('Best rock I\'ve ever seen.', 'gotit'), to('I have to go.', 'sad'));
    if (s.npc.gifted) s.node('gotit', 'You still get it. I\'d give you another flat shiny rock, but I\'m out. You can\'t have Kevin.', bye('Bye, Kevin.'));
    else s.node('gotit', 'You GET it! Nobody gets it! Here. It\'s money. Basically a flat, shiny rock. You\'ll love it.', gift('Thanks, Gordon!', { gold: s.gold(8), luckSpins: 1 }));
    s.node('sad', 'Oh. Okay. The rocks will wait. Rocks are very good at waiting.', bye('Bye, rocks.'));
    s.node('rude', 'Rocks have feelings. Kevin\'s crying. Look what you did. LOOK AT HIM.', to('Sorry, Kevin.', 'rock1'), bye('I\'m leaving.'));
    s.node('why', 'Rocks never leave you. Rocks never lie. Rocks never ask why you collect rocks.', to('Fair.', 'start'));
    s.node('accuse', 'A demon? Demons collect souls. I collect rocks. Rocks are better. They don\'t scream.', to('Good to know.', 'start'));
  },

  bard(s) {
    s.node(
      'start',
      s.open(
        ['(strum) Ohhh, a knight walked in, and the knight was brave... (strum) That\'s G. I only know G.', '(strum) Welcome, welcome! Request a song! Any song! As long as it\'s G.'],
        ['(strum) You came back! For the G! Everyone comes back for the G.', '(strum) Still G. It\'s always G. G is forever.'],
      ),
      to('Play another.', 'another'),
      to('Sing about me!', 'song'),
      ...s.questChoice('Need a hero?'),
      to('Are you a demon?', 'accuse'),
      bye('Keep strumming.'),
    );
    s.node('another', '(strum) That one was also G. They\'re all G. G is the people\'s chord.', to('Learn another chord?', 'chord'), to('Lovely.', 'start'));
    s.node('chord', 'I tried C once. Lost a finger. Not to the chord. To a goblin. But I blame the chord.', to('Fair.', 'start'));
    if (s.npc.gifted) s.node('song', `(strum) ${s.hero}, again! (strum) The sequel sounds exactly like the first one.`, to('A classic.', 'start'));
    else s.node('song', `(strum) ${s.hero}... (strum) ...was here. (strum) It\'s short. Here, a lucky pick.`, gift('Bravo!', { luckSpins: 1 }));
    s.node('accuse', '(strum) A demon? (strum) No. (strum) Demons can play TWO chords.', to('Fair.', 'start'));
  },

  chicken(s) {
    s.node(
      'start',
      s.open(
        ['BAWK. Greetings, traveler. I am a chicken. Do not tell the others. They suspect nothing.', 'Bawk bawk. Oh, a knight. Act natural, Gerald. Bawk.'],
        ['BAWK. It is I, the chicken. Same chicken. Totally normal chicken.', 'You again. Bawk. Did anyone follow you? A farmer? With a pot?'],
      ),
      to('You\'re a man.', 'man'),
      to('Why a chicken?', 'why'),
      ...s.questChoice('Need anything?'),
      to('Are you a demon?', 'accuse'),
      bye('Bye, Gerald.'),
    );
    s.node('man', 'That\'s exactly what a man would say. BAWK.', to('What?', 'man2'), to('...Fair.', 'start'));
    s.node('man2', 'Checkmate.', to('That\'s not how chess works.', 'start'));
    s.node('why', 'No taxes. No curfew. No knights asking questions. Usually.', to('Sorry.', 'start'));
    s.node('accuse', 'I\'m a chicken, not a demon. Demons can\'t lay eggs. Neither can I, but I\'m TRYING.', to('Keep trying.', 'start'));
  },

  ghost(s) {
    s.node(
      'start',
      s.open(
        ['Oh no, oh no. I\'m late! Three hundred years late, if this sundial is right. It\'s indoors.', 'Excuse me, do you have the time? The year would also help.'],
        ['Still late! Later, now! Thank you for asking. You didn\'t ask.', 'You again! Have I missed it? I\'ve missed it. Whatever it is.'],
      ),
      to('Late for what?', 'what'),
      to('You\'re a ghost.', 'dead'),
      ...s.questChoice('Can I help?'),
      to('Are you a demon?', 'accuse'),
      bye('Don\'t be late.'),
    );
    s.node('what', 'I can\'t remember! A wedding? A war? The dentist? It was important. I wore the good hat.', to('Nice hat.', 'start'));
    s.node('dead', 'I\'m a BUSY ghost. There\'s a difference. Busy ghosts are late. Lazy ghosts are just early.', to('Right.', 'start'));
    s.node('accuse', 'Demon? No, no, I\'m dead. Different department. Down the hall, left at the screaming.', to('Thanks.', 'start'));
  },

  goblin(s) {
    s.node(
      'start',
      s.open(
        ['Ah. The knight. My ledger says you\'ve killed a lot of my coworkers. That\'s a lot of paperwork.', 'Halt! Do you have a receipt for that sword? No? We\'ll call it a donation.'],
        ['Back again? I\'ve opened a file on you. It\'s thick. Mostly complaints.', 'You again! Your file\'s getting thicker. Congratulations, I suppose.'],
      ),
      to('You\'re a goblin.', 'gob'),
      to('Can I see the books?', 'books'),
      ...s.questChoice('Got any work?'),
      to('Are you a demon?', 'accuse'),
      bye('Good day.'),
    );
    s.node('gob', 'Goblin ACCOUNTANT. I don\'t do stabbing. Stabbing is a different department. Worse dental plan.', to('My mistake.', 'start'));
    s.node('books', 'The books say we\'re doing great. The books also say I\'m seven feet tall. Next question.', to('Sorry I asked.', 'start'));
    s.node('accuse', 'A demon? Please. Demons don\'t file their taxes. I file everyone\'s taxes. In triplicate.', to('Impressive.', 'start'));
  },

  wizard(s) {
    s.node(
      'start',
      s.open(
        ['Behold! Mortimer the Mostly Magnificent! I can turn anything into a toad. Not on purpose.', 'Ah! A visitor! Stand back. I\'m about to do magic. ...Any minute now.'],
        ['Ah, you again! I tried to summon you. Got a goat. Close enough.', 'Back for more magic? I\'ve learned a new spell. It makes soup lukewarm.'],
      ),
      to('Do some magic.', 'magic'),
      to('Bless me?', 'bless'),
      ...s.questChoice('Need an assistant?'),
      to('Are you a demon?', 'accuse'),
      bye('Farewell, wizard.'),
    );
    s.node('magic', 'Abraca... (waves hands) ...There! Your left boot is now three percent more boot.', to('Incredible.', 'start'));
    if (s.npc.gifted) s.node('bless', 'I already blessed you. Twice would be showing off. Or a curse. Hard to say.', to('Fair.', 'start'));
    else s.node('bless', 'I bless you with luck! If it fails, it was a curse. If it works, it was a blessing. Science!', gift('I feel lucky!', { luckSpins: 2 }));
    s.node('accuse', 'Demon? Ha! I tried to summon a demon once. Got a very confused goat. We\'re still friends.', to('Nice.', 'start'));
  },

  chef(s) {
    s.node(
      'start',
      s.open(
        ['Ah! Fresh meat! ...I mean, hello, customer. Welcome to my kitchen. It is the whole dungeon.', 'Welcome! Hungry? Of course you\'re hungry. Everyone\'s hungry down here. Mostly the monsters.'],
        ['Back for seconds? Nobody comes back for seconds. You\'re very brave.', 'Ah, my favorite customer! My only customer. Hungry?'],
      ),
      to('What\'s cooking?', 'cook'),
      ...s.questChoice('Need ingredients?'),
      to('Are you a demon?', 'accuse'),
      bye('Enjoy your stew.'),
    );
    s.node('cook', 'Stew. What kind? Don\'t ask. What\'s in it? Don\'t ask. Is it good? ...Don\'t ask.', to('Can I taste it?', 'taste'), to('I won\'t ask.', 'start'));
    if (s.npc.gifted) s.node('taste', 'One bottle per customer. Health and safety. Mostly safety.', to('Fair.', 'start'));
    else s.node('taste', 'A "luck potion". It\'s the stew, in a bottle. You\'re lucky if you survive it.', gift('Bottoms up!', { potion: true }));
    s.node('accuse', 'The only demon in this kitchen is my sous-chef, and he\'s a raccoon. Lovely knife work, though.', to('Good to know.', 'start'));
  },

  hermit(s) {
    s.node(
      'start',
      s.open(
        ['Kneel before the King of This Hallway! ...Or don\'t. My knees don\'t either.', 'Halt! You stand in the royal hallway of King Bramble the First! And Only. And Last.'],
        ['My loyal subject returns! You\'re my only subject. Don\'t tell anyone.', 'Ah, you! The kingdom grows stronger. It is still just a hallway.'],
      ),
      to('King of what?', 'king'),
      to('Knight me?', 'knight'),
      ...s.questChoice('Any royal decrees?'),
      to('Are you a demon?', 'accuse'),
      bye('Long live the king.'),
    );
    s.node('king', 'This hallway. From that rock to that other rock. No taxes. No subjects. No dentist.', to('Long live the king.', 'start'));
    if (s.npc.gifted) s.node('knight', 'You can\'t be triple-knighted. That\'s a different thing. That\'s juggling.', to('Fair.', 'start'));
    else s.node('knight', 'You already are one. Fine. I knight you AGAIN. Double-knighted! It comes with a royal blessing.', gift('Arise, me!', { gold: s.gold(4), luckSpins: 1 }));
    s.node('accuse', 'A demon? I\'m royalty. We\'re much, much worse.', to('Your Majesty.', 'start'));
  },

  gary(s) {
    const d = s.def.demon!;
    revealNodes(s, d, 'UGH. FINE. Yes! Demon! Gary, Demon of Mild Inconvenience! Couldn\'t you let me have ONE nice floor?', 'Can\'t we talk this out?', 'We WERE talking it out! Then you said "demon". Now it\'s a whole thing. Ugh. Fine.');
    if (s.ctx.cleared) {
      s.node('start', 'So... everyone else is gone. Just you and me. And I\'m a... normal guy. ...Forget it.', to('Forget what?', 'reveal'));
      return;
    }
    if (s.npc.talkedTo >= 2) {
      s.node('start', 'You keep COMING BACK. Acting normal is SO hard. That\'s it. Gary\'s done.', fight('Have at you!'), to('Gary, wait...', 'reveal'));
      return;
    }
    s.node(
      'start',
      s.open(
        [`Hello, fellow human. Lovely weather in ${s.biome}. Normal weather. For humans. Like me. Gary.`, `Hey there! Gary. Normal guy. Just standing here on floor ${s.floor}, being normal. Super chill.`],
        ['Oh. You again. Hi. Still Gary. Still normal. You\'re very... thorough.', 'Back already? Gary\'s still here. Being chill. Are YOU chill? You seem tense.'],
      ),
      to('What\'s with the tail?', 'tail'),
      to('Your hat is smoking.', 'hat'),
      { ...to('Got any work?', 'deal'), job: true },
      to('Are you a demon?', 'accuse'),
      bye('Bye, Gary.'),
    );
    s.node('tail', `Tail? That\'s a belt. A long, swishy, pointy belt. Everyone on floor ${s.floor} wears one. Relax.`, to('Belts don\'t swish.', 'sus'), to('Nice belt.', 'start'));
    s.node('hat', 'That\'s not smoke, that\'s steam. I\'m very warm-blooded. Human warm. Normal warm. Chill out.', to('And the horns?', 'horns'), to('Okay, Gary.', 'start'));
    s.node('horns', 'Not horns. A hat. A hat with two pointy... hat bits. It\'s trendy. Can we just relax?', to('Hats don\'t grow.', 'sus'), to('Sorry. Nice hat.', 'start'));
    s.node('deal', 'Since you\'re so chill: a deal! Sign here. Tiny signature. In ink. Red ink. It\'s ink.', to('Sign it.', 'signed'), to('Let me read it first.', 'fine'), to('No thanks.', 'start'));
    s.g.deal.job = { stage: 'contract', title: 'A Totally Normal Deal', goal: 'Sign here. In ink. Red ink.', aim: { kind: 'sign', n: 1 }, reward: { hourglasses: 3 }, fine: 'The signer agrees to every clause on page nine. There is no page nine. There is a page nine.' };
    if (s.npc.gifted) {
      s.node('signed', 'You already signed! One soul per customer. I mean ONE SIGNATURE. Relax.', to('Soul?!', 'reveal'), to('Right.', 'start'));
    } else {
      s.node('signed', 'Pleasure doing business! Here\'s your three hourglasses. It\'s one. The rest is fine print.', gift('What fine print?', { hourglasses: 1 }, 'fine2'));
      s.node('fine2', 'Page nine: "Signer agrees to fight Gary." Sorry. It\'s the law. Demon law. Normal-guy law! Ugh.', to('Demon law?', 'reveal'));
    }
    s.node('fine', 'There\'s no fine print. (covers the fine print) Is this the face of fine print?', to('Move your hand.', 'reveal'), to('Never mind.', 'start'));
    s.node('accuse', 'A demon? Pfft. No. What? Who said that? Do I look like a demon? Don\'t answer that.', to('You have horns.', 'horns'), to('You look like a demon.', 'sus'), to('Sorry, Gary.', 'start'));
    s.node('sus', 'Hypothetically. If I WERE a demon, which I\'m not, would you be chill? No stabbing?', to('No. Demon.', 'reveal'), to('Totally chill.', 'chill'));
    s.node('chill', 'Great! Great. Then I\'m... still not a demon. Bye now. Nothing to see here. (tail swish)', to('Your tail swished.', 'reveal'), bye('Bye, Gary.'));
  },

  nana(s) {
    const d = s.def.demon!;
    revealNodes(s, d, 'Oh, FINE. Grizelda, Matron of Burnt Cookies! Nobody ever stays for tea! NOBODY!', 'I\'d have stayed for tea.', '...Really? That\'s so sweet. Nana is still going to fight you. But it\'s sweet.');
    if (s.ctx.cleared) {
      s.node('start', 'Everyone\'s gone, dearie. Just you and Nana. Nana\'s been SO patient. Nana\'s done being patient.', to('Nana?', 'reveal'));
      return;
    }
    if (s.npc.talkedTo >= 2) {
      s.node('start', 'Back AGAIN, dearie? You never visit, and then you visit too much! Nana\'s had it up to HERE.', fight('Have at you!'), to('Nana, wait...', 'reveal'));
      return;
    }
    s.node(
      'start',
      s.open(
        ['Come here, dearie. Let Nana pinch your cheeks. With her claws. Nails! Her normal old-lady nails.', `Oh, a visitor! On floor ${s.floor}! Nobody visits Nana. Come in, sit down, stay forever. For tea.`],
        ['You came back! Nana knew you would. Nana knows everything. Nana is a normal grandmother.', 'Dearie! Sit, sit. Have you eaten? Have you been eaten? That\'s a joke. Nana jokes.'],
      ),
      to('Your eyes are glowing.', 'eyes'),
      to('Got any cookies?', 'cookies'),
      to('What big teeth you have.', 'teeth'),
      bye('Bye, Nana.'),
    );
    s.node('eyes', 'Cataracts, dearie. Red, glowing ones. Common at my age. Nine thousand. Sixty! Sixty.', to('Nine thousand?', 'sus'), to('Okay, Nana.', 'start'));
    s.node('cookies', 'Fresh from the oven! The oven is a lake of fire. A normal, fiery lake. Take one.', to('Eat the cookie.', 'cookie'), to('I\'m not hungry.', 'start'));
    if (s.npc.gifted) s.node('cookie', 'Only one cookie per grandchild, dearie. Nana counts. Nana ALWAYS counts.', to('Grandchild?', 'sus'), to('Okay, Nana.', 'start'));
    else s.node('cookie', 'Now you\'re bound to Nana. For tea. FOREVER. ...Spicy? You feel lucky, though.', gift('Bound?!', { potion: true }, 'reveal'), gift('Delicious! Bye!', { potion: true }));
    s.node('teeth', 'All the better to... no. No, Nana\'s not doing that one. Chill, dearie. Have some tea.', to('Are those fangs?', 'sus'), to('Sorry, Nana.', 'start'));
    s.node('sus', 'If Nana WERE a demon, hypothetically, you\'d still love Nana? You\'d be chill?', to('You\'re a demon.', 'reveal'), to('Of course, Nana.', 'chill'));
    s.node('chill', 'That\'s Nana\'s favorite. Run along now. Nana will just... be here. Watching. Normally.', to('Your tail is showing.', 'reveal'), bye('Bye, Nana.'));
  },

  lou(s) {
    const d = s.def.demon!;
    revealNodes(s, d, 'Okay, you got me. Lou Cifer, Archfiend of Fine Print. You never read page nine.', 'Can I still get a deal?', 'Sure! Step one: survive. Step two: there is no step two.');
    if (s.ctx.cleared) {
      s.node('start', 'Well, well. Floor\'s empty. No witnesses. For business. Legitimate business. Who am I kidding.', to('Kidding about what?', 'reveal'));
      return;
    }
    if (s.npc.talkedTo >= 2) {
      s.node('start', 'You keep browsing and never BUY. Know what we do to window shoppers? You\'re about to find out.', fight('Have at you!'), to('Lou, wait...', 'reveal'));
      return;
    }
    s.node(
      'start',
      s.open(
        ['Psst. Knight. You look like you appreciate a deal. Lou C. Fur, licensed merchant. Very licensed.', 'Step right up! Lou C. Fur\'s Discount Destiny! Everything must go! Including you, eventually.'],
        ['My favorite customer! Ready to talk business? Your business. Your soul\'s business.', `Back for a deal? Smart. Lou\'s deals are the hottest on floor ${s.floor}. Literally.`],
      ),
      { ...to('What are you selling?', 'sell'), job: true },
      to('Is that a tail?', 'tail'),
      to('Lou C. Fur?', 'name'),
      bye('Just browsing.'),
    );
    s.node('sell', 'Luck! Power! All yours for one tiny, barely-used soul. Or a handshake. Mostly souls.', to('How about a handshake?', 'shake'), to('Let me see your license.', 'license'), to('Pass.', 'start'));
    s.g.sell.job = { stage: 'contract', title: 'Discount Destiny', goal: 'Price: one soul, barely used', aim: { kind: 'sign', n: 1 }, reward: { luckSpins: 2 }, fine: 'All sales final. Souls are not refundable. Lou C. Fur is a licensed merchant (license pending).' };
    if (s.npc.gifted) s.node('shake', 'Already shook on it. One handshake per soul. I mean per customer. Customer!', to('Soul?', 'reveal'), to('Right.', 'start'));
    else s.node('shake', 'Deal! (shakes) ...Your hand\'s on fire. That\'s normal. That\'s how deals are sealed. Some luck.', gift('My HAND is on fire!', { luckSpins: 2 }, 'reveal'), gift('Pleasure doing business.', { luckSpins: 2 }));
    s.node('license', 'Here\'s my license. Don\'t read the bottom. Or the middle. The top\'s fine. The top says "License".', to('It says "Archfiend".', 'reveal'), to('Looks legit.', 'start'));
    s.node('tail', 'That\'s a rope. For tying up deals. Business rope. Relax. Everybody relax. Chill.', to('Ropes don\'t wag.', 'sus'), to('Okay.', 'start'));
    s.node('name', 'Lou C. Fur. Common name! There\'s dozens of us. Lou C. Fur the baker. Lou C. Fur the fishmonger...', to('Say it faster.', 'sus'), to('Okay, Lou.', 'start'));
    s.node('sus', 'Lou C. Fur. Lou C... Lucif... okay. Okay! Can we not? Can we just chill and do a little business?', to('No. Demon.', 'reveal'), to('Fine, let\'s chill.', 'chill'));
    s.node('chill', 'Beautiful. Chill. Love it. Now, about that soul... kidding! Kidding. Mostly.', to('Mostly?', 'reveal'), bye('Bye, Lou.'));
  },
};

/** The unmasking: the demon's real name, a last plea, the fight. */
function revealNodes(s: S, d: NonNullable<NpcDef['demon']>, line: string, plea: string, answer: string): void {
  const speaker = `${d.name}, ${d.title}`;
  s.g.reveal = { speaker, text: line, choices: [fight('Have at you!'), to(plea, 'reveal2')] };
  s.g.reveal2 = { speaker, text: answer, choices: [fight('Fight!')] };
}

/**
 * The conversation with an NPC right now: a graph of nodes from 'start'. A finished job of theirs
 * comes first (thanks and the reward, one 'turnIn' choice); a job still going changes the opener to a
 * reminder; otherwise its own script, with a job to offer if it has one and there's room (three at most).
 */
export function dialogFor(npc: Npc, ctx: DialogCtx): Record<string, DialogNode> {
  const s = makeS(npc, ctx);
  const def = npc.def;
  if (npc.revealed && def.demon) {
    const taunts = demonTauntsFor(def);
    s.g.start = { speaker: `${def.demon.name}, ${def.demon.title}`, text: taunts[(npc.seed + npc.talkedTo) % taunts.length], choices: [fight('Fight!')] };
    return s.g;
  }
  const done = def.kind === 'demon' ? undefined : ctx.activeQuests.find((q) => q.giver === def.id && q.done && !q.turnedIn);
  if (done) return turnInGraph(s, done);
  const script = SCRIPTS[def.id];
  if (script) script(s);
  else s.node('start', s.open(['Hello there.'], ['Hello again.']), ...s.questChoice('Need a hand?'), bye());
  // A reminder of their job under way opens with its card.
  const mine = ctx.activeQuests.find((q) => q.giver === def.id && !q.done && !q.turnedIn);
  if (s.reminded && mine && s.g.start) s.g.start.job = jobOf(mine, 'progress');
  return s.g;
}

// ------------------------------------------------------------------ the demon, unmasked

/**
 * The demon's mini-boss: a humanoid (its id starts with 'ember-' so the mob art dresses it as an imp
 * in its disguise's clothes) with boss moves, about 15 times a normal mob's HP. Name and title match
 * the disguise picked for that seed: call it with npc.seed.
 */
export function demonMobType(floor: number, biomeId: string, seed: number): MobType {
  const def = demonDefFor(seed);
  const d = def.demon!;
  const rng = new Rng(Rng.hashSeed((seed ^ Math.imul(floor, 0x2f6b4c1d) ^ 0xde70) >>> 0));
  const moves = rng.shuffle<BossMove>(['fan', 'rain', 'charge', 'summon', 'ring', 'slam']).slice(0, 3);
  if (!moves.includes('fan') && !moves.includes('ring')) moves[0] = 'fan';
  const cloth = def.look.shirt;
  return {
    id: `ember-demon-${def.id}-${biomeId}-${floor}`,
    name: d.name,
    plan: 'humanoid',
    behavior: 'chaser',
    // Cloth from the disguise, then hellfire (shots, rain and its glow).
    ramp: [cloth[0], cloth[1], cloth[2], '#ff7a2a'],
    eye: '#ffe24a',
    size: 1.6,
    radius: 8,
    hp: 30 * 15 * rng.float(0.95, 1.05),
    atk: 6 * 1.7 * rng.float(0.95, 1.05),
    speed: 36,
    range: 100,
    atkCd: 2.2,
    flying: false,
    features: { horns: true, spikes: false, crest: false, eyes: 2, tail: true, seed: rng.int(0, 1 << 30) },
    shot: { speed: 78, color: '#ff7a2a', radius: 3 },
    boss: { title: d.title, moves },
  };
}
