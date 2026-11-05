/**
 * Biomes: every 5 floors the dungeon changes setting, from hamlets, farms and dark forests to tundra, crypts
 * and lava caves, endlessly. A biome sets the floor's layout style, its materials and palettes, its
 * light (a cool ambient the scene is multiplied by, warm point lights on top), its weather, and the
 * flavor of the mobs that live there (mobgen.ts builds them).
 */

export type BiomeId = 'hamlet' | 'farmland' | 'forest' | 'tundra' | 'dungeon' | 'crypt' | 'swamp' | 'desert' | 'graveyard' | 'ember' | 'crystal' | 'shrine';

export type GroundKind = 'grass' | 'cobble' | 'dirt' | 'snow' | 'flagstone' | 'sand' | 'mud' | 'basalt' | 'crystalStone' | 'moss' | 'ice' | 'tilled';
export type SolidKind = 'trees' | 'wall' | 'cliff';
export type TreeKind = 'oak' | 'pine' | 'snowPine' | 'dead' | 'willow' | 'mushroom' | 'crystal' | 'cactus' | 'maple' | 'apple';
export type LiquidKind = 'water' | 'lava' | 'swampWater' | 'iceWater' | 'spiritWater' | 'chasm';
export type PropKind =
  | 'rock' | 'bush' | 'flowers' | 'barrel' | 'crate' | 'bones' | 'torch' | 'lantern' | 'brazier' | 'gravestone' | 'crystalSmall'
  | 'reeds' | 'mushroomSmall' | 'pumpkin' | 'stump' | 'pillar' | 'statue' | 'well' | 'fence' | 'skull' | 'cart' | 'stoneLantern' | 'banner'
  | 'campfire' | 'tent' | 'hayBale' | 'cabbage' | 'wheat' | 'scarecrow' | 'trough' | 'sunflower'
  // The village (art/village.ts).
  | 'house' | 'pot' | 'bench' | 'lampPost' | 'signpost' | 'sack' | 'woodpile' | 'noticeBoard' | 'flowerBed' | 'stall' | 'wellStone'
  // The wilds and their ruins (art/wild.ts).
  | 'lanternPost' | 'stringLights' | 'roughFence' | 'fern' | 'mossRock' | 'log' | 'brokenPillar' | 'stoneBlock' | 'ruinWall' | 'stairs'
  // The town (art/town.ts).
  | 'picket' | 'picketSide' | 'hedge' | 'fountain' | 'cafeTable' | 'stringPost' | 'bridgeRail'
  // The dungeon (pack art: render/packs/dungeonProps.ts).
  | DungeonPropKind;

/** The dungeon's own props, drawn from the supplied packs (world/dungeonDecor.ts places them). */
export type DungeonPropKind =
  | 'wallBanner' | 'hangingBanner' | 'wallRing' | 'cellDoor' | 'blueDoor' | 'sideTorch' | 'cobweb' | 'chest' | 'candles' | 'candlestick'
  | 'flask' | 'pedestal' | 'armor' | 'dragonSkull' | 'cabinet' | 'rubble' | 'coins' | 'sword';
export type Weather = 'fireflies' | 'snow' | 'embers' | 'dust' | 'spores' | 'petals' | 'leaves' | 'ash' | 'motes' | 'rain';
export type BodyPlan = 'slime' | 'beast' | 'humanoid' | 'flyer' | 'plant' | 'golem' | 'bug' | 'pumpkin' | 'ghost' | 'pig' | 'ram' | 'chicken';

/** A color ramp, darkest first. */
export type Ramp = readonly string[];

export interface Biome {
  id: BiomeId;
  name: string;
  layout: 'cave' | 'rooms';
  /**
   * The ground is stamped from a pack's tileset instead of painted per pixel (render/packs/dungeonTiles.ts):
   * its walls, floors and doors. `ground`, `path` and `solid` stay the colors the rest of the art reads.
   */
  tiles?: 'dungeon';
  ground: { kind: GroundKind; ramp: Ramp; accent?: Ramp };
  /** `dirt`: the packed earth a cobbled road wears down to at its edges. `wide`: extra tiles of road
   * each side of the corridors' middle line. `plaza`: how big rooms' plazas are (1 = as big as fits).
   * `everywhere`: every street is paved (a town), right up to the curbs. */
  path: { kind: GroundKind; ramp: Ramp; accent?: Ramp; dirt?: Ramp; wide?: number; plaza?: number; everywhere?: boolean };
  /** What the solid areas look like: dense trees over a dark floor, or walls with faces. `ledge`: the
   * wooded ground is raised, with an earthy cliff face (this ramp) where it drops to the floor.
   * `curb`: the wooded ground is a lot (bright, open), edged by a stone curb (this ramp) on the street. */
  solid: { kind: SolidKind; top: Ramp; face: Ramp; trees?: TreeKind[]; underRamp?: Ramp; ledge?: Ramp; curb?: Ramp };
  /** Trees and rocks standing inside rooms. */
  trees: TreeKind[];
  treeRamp: Ramp;
  liquid: { kind: LiquidKind; ramp: Ramp; glow?: string } | null;
  props: Array<[PropKind, number]>;
  light: {
    /** The scene is multiplied by this (cool and dark for night, warm and bright for day). */
    ambient: string;
    /** Each hero carries a soft light of this color and radius. */
    hero: string;
    heroRadius: number;
    /** Torches, lanterns and braziers. */
    fire: string;
    /** Color grading: a tint screened over the top of the view and multiplied over the bottom. */
    gradeTop: string;
    gradeBottom: string;
    vignette: number;
    fog?: string;
  };
  weather: Weather[];
  /**
   * Tilled crop fields (the farm): plowed soil in furrows, painted in this ramp (accent: seedlings),
   * planted with a crop per field (or only seedlings).
   */
  fields?: { ramp: Ramp; accent?: Ramp; crops: Array<[FieldCrop, number]> };
  mobs: {
    plans: BodyPlan[];
    adjectives: string[];
    palettes: Ramp[];
    eye: string;
    /** Plans every floor of the biome has (its signature mobs), ahead of the shuffled rest. */
    core?: BodyPlan[];
    /** Names per plan that replace the "Adjective Noun" names. */
    names?: Partial<Record<BodyPlan, string[]>>;
    /** The biome's own boss: always this plan, with a name and title picked as a pair. */
    boss?: { plan: BodyPlan; names: Array<readonly [name: string, title: string]> };
  };
}

/** What grows in a tilled field. */
export type FieldCrop = 'cabbage' | 'wheat' | 'pumpkin' | 'sprouts';

/** The farm's mobs don't do "Adjective Noun". */
const FARM_NAMES: Partial<Record<BodyPlan, string[]>> = {
  pig: [
    'Sir Loin', 'Hamageddon', 'Squealer of Souls', 'Porkchop Supreme', 'The Unbaconable', 'Trotter of Doom', 'Oinkmageddon',
    'Lord Porkington', 'Snoutlaw', 'Prosciutto Bandito', 'Swine of the Times', 'Rasher Than Thou', 'Chorizo Furioso',
    'Hamurai', 'Count Chopula', 'Bacon-Wrapped Menace', 'Snoutrageous', 'Mudwallow the Unwashed', 'Hogwash', 'Snortimer',
  ],
  ram: [
    'Ramsay the Unbaa-lievable', 'Lamb Chopper', 'Baa-rbarian', 'Woolverine', 'Headbutt Harold', 'Ewe-nited Front',
    'Ram-bunctious', 'Shear Terror', 'Baa-d Influence', 'The Fleecer', 'Ram Dunk', 'Knitpicker', 'Horns of Plenty',
    'Not Remotely Sheepish', 'Muttonchops', 'Ramshackle',
  ],
  chicken: [
    'Poultrygeist', 'Fowl Play', 'Eggsecutioner', 'Peckish', 'Beak Performance', 'Murder Nugget', 'Free-Range Menace',
    "Coop d'Etat", 'Henrietta the Unhinged', 'Cockadoodle-Doom', 'Eggstinction Event', 'Fowl Temper',
  ],
  flyer: [
    'Caw-tastrophe', 'Crowbar', 'Murder Most Fowl', 'Crowpocalypse', 'Not Scared, Actually', 'Corn Thief', 'Crowd Control',
    'Sir Caws-a-lot', 'Raven Mad', 'Seedy Character',
  ],
  humanoid: [
    'Strawman Argument', 'Hay Fever', 'The Last Straw', 'Stuffed Shirt', 'Corn-elius', 'Brains Not Included',
    'Scared of Crows', 'Outstanding in His Field', 'Sackface McStitches', 'Mister Burlap',
  ],
  pumpkin: ['Squashbuckler', 'Pumpkin Spite', 'Gourd Almighty', 'Gourdian Angel', 'Rind Over Matter', 'Orange You Scared?', 'Vine and Dandy'],
};

/** The farm's boss: a pig that kept eating, and its billing. */
const FARM_BOSSES: Array<readonly [string, string]> = [
  ['Lord Hamsworth', 'Exceeds Recommended Serving Size'],
  ['Chonkus Maximus', 'Has Its Own Gravity'],
  ['The Hamperor', 'Outgrew the Breakfast Menu'],
  ['Baron Von Bacon', 'Banned From Every Butcher'],
  ['Sir Hamsalot', 'Too Ham to Fry'],
  ['Lady Lardington', 'Legally a Landmass'],
  ['Porkules', 'Serves Twelve Thousand'],
];

export const BIOMES: Record<BiomeId, Biome> = {
  hamlet: {
    id: 'hamlet',
    name: 'Mossy Hamlet',
    layout: 'cave',
    ground: { kind: 'grass', ramp: ['#2e6a1e', '#3e8424', '#5aa02c', '#66ae32', '#74be3a'], accent: ['#f8d838', '#f08a30', '#f4f0e0', '#f8d838'] },
    path: { kind: 'cobble', ramp: ['#7a7064', '#91877a', '#a89d8e', '#bdb2a1', '#d1c7b5'], dirt: ['#3e3022', '#5a4632', '#766041', '#917a55'], wide: 1, plaza: 0.6, everywhere: true },
    solid: { kind: 'trees', top: ['#16251a', '#1f3322'], face: ['#2a2420', '#3f362f', '#56493e'], trees: ['oak', 'maple', 'oak'], underRamp: ['#1a2a1c', '#223522'], curb: ['#4e4a44', '#7a756c', '#a8a398', '#cac6ba'] },
    trees: ['oak', 'maple'],
    treeRamp: ['#1d3a22', '#2c5530', '#3f743b', '#5b9447', '#88b85a'],
    liquid: { kind: 'water', ramp: ['#1e4a9a', '#2a62c0', '#3a7ad8', '#5a9ae8', '#8ac0f4'] },
    props: [['flowerBed', 4], ['barrel', 3], ['crate', 2], ['bench', 2], ['pot', 3], ['sack', 1], ['cart', 1], ['lampPost', 1]],
    light: { ambient: '#d9c2a3', hero: '#ffd9a0', heroRadius: 40, fire: '#ffb35a', gradeTop: '#ffcf8a', gradeBottom: '#3a4a6a', vignette: 0.35 },
    weather: ['petals', 'motes'],
    mobs: { plans: ['slime', 'humanoid', 'beast', 'flyer'], adjectives: ['Feral', 'Rabid', 'Grumpy', 'Mangy', 'Rowdy'], palettes: [['#3b2a1e', '#6a4a2c', '#9a6d3e', '#c99a5a'], ['#2f3d22', '#4f6a2e', '#7a9a3e', '#a8c864']], eye: '#ffe066' },
  },
  farmland: {
    id: 'farmland',
    name: "Old MacMayhem's Farm",
    layout: 'cave',
    ground: { kind: 'grass', ramp: ['#2f3b1b', '#465626', '#61732f', '#83923b', '#aab25a'], accent: ['#f4d65a', '#fbf4e0', '#e8904a', '#d88aa0'] },
    path: { kind: 'dirt', ramp: ['#3c2c1e', '#5a432c', '#79603e', '#9a7c52', '#bc9c6a'] },
    solid: { kind: 'trees', top: ['#141e10', '#1a2814'], face: ['#2a2016', '#3e3222', '#54442e'], trees: ['apple', 'apple', 'oak'], underRamp: ['#18240f', '#1e2c14'], curb: ['#3a3020', '#5a4a30', '#7a8a3e', '#98a850'] },
    trees: ['apple'],
    treeRamp: ['#1c3416', '#2c4e1e', '#43702a', '#62913a', '#93b855'],
    liquid: { kind: 'water', ramp: ['#1a3a3e', '#235855', '#2f7a6c', '#5aa28a', '#a6d6b4'] },
    props: [['hayBale', 5], ['wheat', 5], ['flowers', 4], ['fence', 2], ['barrel', 2], ['trough', 2], ['scarecrow', 2], ['pumpkin', 2], ['crate', 1], ['cart', 1], ['well', 1], ['sunflower', 1], ['bush', 2], ['stump', 1]],
    light: { ambient: '#f0c898', hero: '#ffe2a8', heroRadius: 38, fire: '#ffb35a', gradeTop: '#ffb664', gradeBottom: '#34386a', vignette: 0.38 },
    weather: ['motes', 'leaves'],
    fields: { ramp: ['#24160e', '#3a2416', '#53361f', '#6e4a2b', '#8a6038'], accent: ['#5e8a2c', '#8ab83e'], crops: [['cabbage', 3], ['wheat', 3], ['pumpkin', 2], ['sprouts', 2]] },
    mobs: {
      plans: ['pig', 'ram', 'chicken', 'flyer', 'humanoid', 'pumpkin'],
      core: ['pig', 'ram'],
      adjectives: ['Barnyard', 'Hayseed', 'Muddy', 'Ornery', 'Corn-fed'],
      palettes: [['#3e1a16', '#72281f', '#a83e2c', '#d8694a'], ['#1c2640', '#2c3e62', '#46608e', '#7090bc'], ['#4a3618', '#7a5c2a', '#b08a42', '#e0c070']],
      eye: '#ffd23a',
      names: FARM_NAMES,
      boss: { plan: 'pig', names: FARM_BOSSES },
    },
  },
  forest: {
    id: 'forest',
    name: 'Gloomwood',
    layout: 'cave',
    ground: { kind: 'grass', ramp: ['#141f1c', '#1c2c25', '#26392d', '#324a36', '#45603f'], accent: ['#5f7d4a', '#6fd0c0', '#b48ae0', '#e0d070'] },
    path: { kind: 'dirt', ramp: ['#1e1814', '#2e241c', '#3e3125', '#514030', '#66523c'] },
    solid: { kind: 'trees', top: ['#0a1210', '#0f1a16'], face: ['#1a1612', '#2a221a', '#3a3024'], trees: ['oak', 'pine', 'oak', 'dead'], underRamp: ['#0c1512', '#111d18'], ledge: ['#1e2a26', '#2c3c36', '#3e544a', '#56705f', '#76907c'] },
    trees: ['oak', 'pine', 'mushroom'],
    treeRamp: ['#0f2420', '#173a2e', '#22513b', '#336c47', '#4d8a55'],
    liquid: { kind: 'water', ramp: ['#0c1e26', '#123040', '#1a4656', '#2a6670', '#58a0a0'] },
    props: [['fern', 6], ['mushroomSmall', 3], ['mossRock', 3], ['bush', 3], ['log', 2], ['stump', 2], ['brokenPillar', 1], ['stoneBlock', 1], ['bones', 1]],
    light: { ambient: '#4a5c7a', hero: '#b8e0ff', heroRadius: 52, fire: '#ffaa55', gradeTop: '#5a7aa0', gradeBottom: '#10182a', vignette: 0.55, fog: '#3a5a66' },
    weather: ['fireflies', 'leaves'],
    mobs: { plans: ['beast', 'bug', 'plant', 'flyer', 'humanoid'], adjectives: ['Gloom', 'Moss', 'Thorn', 'Hollow', 'Shade'], palettes: [['#1a2a24', '#2c4a3a', '#4a7050', '#7aa070'], ['#2a1e30', '#463050', '#6a4a7a', '#9a78b0']], eye: '#8affc8' },
  },
  tundra: {
    id: 'tundra',
    name: 'Frostfang Tundra',
    layout: 'cave',
    ground: { kind: 'snow', ramp: ['#5d6f8c', '#7e93b0', '#a3b8d0', '#c8d8e8', '#eef4fa'], accent: ['#9ab0c8', '#ffffff'] },
    path: { kind: 'ice', ramp: ['#3e5a7a', '#5a80a4', '#7ea8c8', '#a8cce0', '#d8eef8'] },
    solid: { kind: 'trees', top: ['#2a3a52', '#34465e'], face: ['#4a5a70', '#6a7c94', '#8c9cb4'], trees: ['snowPine', 'snowPine', 'pine'], underRamp: ['#5a6c88', '#6a7e98'] },
    trees: ['snowPine'],
    treeRamp: ['#122a2e', '#1c3e40', '#2a5652', '#3c7068', '#e8f2fa'],
    liquid: { kind: 'iceWater', ramp: ['#14304a', '#1e4a6a', '#2c6a8c', '#5a9ec0', '#b8e4f4'] },
    props: [['rock', 5], ['bones', 2], ['crystalSmall', 2], ['stump', 2], ['torch', 2]],
    light: { ambient: '#a8b8d8', hero: '#ffe2b0', heroRadius: 44, fire: '#ff9a4a', gradeTop: '#e0f0ff', gradeBottom: '#2a3a6a', vignette: 0.4 },
    weather: ['snow'],
    mobs: { plans: ['beast', 'golem', 'slime', 'humanoid'], adjectives: ['Frost', 'Rime', 'Glacial', 'Snowbound', 'Hoarfrost'], palettes: [['#3a4a66', '#6a84a8', '#a8c4e0', '#e8f4ff'], ['#2a3a4a', '#4a6a7a', '#7aa0b0', '#c0e0e8']], eye: '#7ae0ff' },
  },
  dungeon: {
    // Built from the supplied packs: each floor is either the purple-brown stone or the blue stone
    // (render/packs/dungeonTiles.ts), lit by torches and candles, with traps on its floors.
    id: 'dungeon',
    name: 'Grimstone Dungeon',
    layout: 'rooms',
    tiles: 'dungeon',
    ground: { kind: 'flagstone', ramp: ['#25131a', '#362030', '#3d253b', '#4c2f49', '#593756'] },
    path: { kind: 'flagstone', ramp: ['#25131a', '#362030', '#3d253b', '#4c2f49', '#593756'] },
    solid: { kind: 'wall', top: ['#25131a', '#2c1824'], face: ['#25131a', '#4c2f49', '#6e4a48', '#78514f', '#9a7068'] },
    trees: [],
    treeRamp: ['#25131a', '#3d253b', '#4c2f49', '#6e4a48', '#78514f'],
    liquid: null,
    // (Its rooms are furnished by world/dungeonDecor.ts; the floor generator puts these in its halls.)
    props: [['barrel', 3], ['crate', 3], ['pot', 3], ['chest', 1]],
    light: { ambient: '#76689a', hero: '#ffd8a8', heroRadius: 52, fire: '#ff9a3a', gradeTop: '#a07ad8', gradeBottom: '#140e22', vignette: 0.46 },
    weather: ['dust'],
    mobs: {
      plans: ['humanoid', 'slime', 'humanoid', 'flyer', 'golem'],
      core: ['humanoid'],
      adjectives: ['Dungeon', 'Chained', 'Rusted', 'Forsaken', 'Jailbroken'],
      palettes: [['#2a1a2a', '#4a2e48', '#6e4a6a', '#9a7090'], ['#3a2420', '#6a3e30', '#9a6048', '#c88a68']],
      eye: '#ff6a3a',
    },
  },
  crypt: {
    id: 'crypt',
    name: 'Sunken Crypt',
    layout: 'rooms',
    ground: { kind: 'flagstone', ramp: ['#0c1212', '#141c1c', '#1c2826', '#263432', '#30423e'], accent: ['#3a5a40'] },
    path: { kind: 'flagstone', ramp: ['#0e1414', '#182020', '#202e2c', '#2c3c3a', '#3a4e4a'] },
    solid: { kind: 'wall', top: ['#05070a', '#0a0f12'], face: ['#1c2a28', '#30443e', '#425e54', '#587a6c', '#7a9e88'] },
    trees: [],
    treeRamp: ['#1a2420', '#2a3a32', '#3a5044', '#4a6656', '#5e806a'],
    liquid: { kind: 'chasm', ramp: ['#020304', '#05080a', '#0a1014', '#121c22', '#1e2c34'] },
    props: [['bones', 4], ['brazier', 3], ['pillar', 3], ['barrel', 2], ['crate', 2], ['skull', 2], ['torch', 3], ['banner', 1]],
    light: { ambient: '#2c3e4a', hero: '#9adcc8', heroRadius: 46, fire: '#ff6a2a', gradeTop: '#3a6a6a', gradeBottom: '#0a0c18', vignette: 0.6, fog: '#1e3a3a' },
    weather: ['dust'],
    mobs: { plans: ['humanoid', 'flyer', 'slime', 'golem', 'ghost'], adjectives: ['Crypt', 'Bone', 'Grave', 'Rotting', 'Cursed'], palettes: [['#4a463c', '#8a8270', '#c8c0a8', '#f0ead8'], ['#1e3a34', '#2e5a4a', '#4a8a6a', '#8ac0a0']], eye: '#ff3a2a' },
  },
  swamp: {
    id: 'swamp',
    name: 'Mirewater Bog',
    layout: 'cave',
    ground: { kind: 'mud', ramp: ['#1c1e14', '#2a2c1c', '#3a3c24', '#4c4e2e', '#62643c'], accent: ['#7a8a3a', '#c0b050'] },
    path: { kind: 'grass', ramp: ['#1e2a18', '#2c3c20', '#3c522a', '#4e6a34', '#668a44'] },
    solid: { kind: 'trees', top: ['#0e140c', '#141c10'], face: ['#2a2418', '#3a3220', '#4a4028'], trees: ['willow', 'dead', 'willow'], underRamp: ['#141a10', '#1a2214'] },
    trees: ['willow', 'mushroom'],
    treeRamp: ['#142418', '#20361e', '#304c26', '#446430', '#5e803c'],
    liquid: { kind: 'swampWater', ramp: ['#101e16', '#18301e', '#244428', '#365a34', '#5a8048'] },
    props: [['reeds', 6], ['mushroomSmall', 3], ['stump', 3], ['bones', 2], ['lantern', 2], ['rock', 2]],
    light: { ambient: '#56684e', hero: '#e0ffb0', heroRadius: 46, fire: '#c8ff6a', gradeTop: '#8ab070', gradeBottom: '#141e18', vignette: 0.5, fog: '#4a6a48' },
    weather: ['fireflies', 'spores'],
    mobs: { plans: ['slime', 'beast', 'plant', 'bug', 'humanoid'], adjectives: ['Bog', 'Mire', 'Murk', 'Fetid', 'Leech'], palettes: [['#1e2a14', '#3a4e20', '#5a7430', '#8aa04a'], ['#2a1e14', '#4a3420', '#6e5030', '#9a7a4a']], eye: '#e8ff4a' },
  },
  desert: {
    id: 'desert',
    name: 'Sunscorch Ruins',
    layout: 'cave',
    ground: { kind: 'sand', ramp: ['#7a5232', '#9c6c40', '#bc8a52', '#d6a868', '#ecc88a'], accent: ['#a87a4a', '#f4dca4'] },
    path: { kind: 'flagstone', ramp: ['#6a4a34', '#8a6444', '#a88058', '#c49c70', '#dcba8c'] },
    solid: { kind: 'cliff', top: ['#8a5a36', '#a06c42'], face: ['#4a2e20', '#6a4230', '#8a5a3e', '#a8744e', '#c48e62'] },
    trees: ['cactus'],
    treeRamp: ['#1e3a24', '#2c5430', '#3e703e', '#5a8c4c', '#e8d0a0'],
    liquid: { kind: 'water', ramp: ['#1a3e4a', '#22606a', '#2e8a8a', '#5ab4a8', '#a8e4d0'] },
    props: [['bones', 4], ['rock', 4], ['pillar', 3], ['skull', 2], ['crate', 1], ['brazier', 2], ['statue', 1]],
    light: { ambient: '#ffe0b8', hero: '#fff0c8', heroRadius: 36, fire: '#ff8a3a', gradeTop: '#ffb86a', gradeBottom: '#6a3a4a', vignette: 0.3 },
    weather: ['dust'],
    mobs: { plans: ['bug', 'beast', 'humanoid', 'golem', 'slime'], adjectives: ['Dune', 'Scorch', 'Sun-baked', 'Sandworn', 'Ashen'], palettes: [['#5a3a22', '#8a5a32', '#ba8448', '#e4b46c'], ['#3a2a3a', '#5a4058', '#82607a', '#b08aa0']], eye: '#ffb03a' },
  },
  graveyard: {
    id: 'graveyard',
    name: 'Hollow Graves',
    layout: 'cave',
    ground: { kind: 'grass', ramp: ['#141a1e', '#1c262a', '#263236', '#324046', '#425258'], accent: ['#5a6a6a', '#a07ad0'] },
    path: { kind: 'dirt', ramp: ['#1a1616', '#28201e', '#362c28', '#463a34', '#584a42'] },
    solid: { kind: 'trees', top: ['#08090c', '#0e1014'], face: ['#1e1a1c', '#2c2628', '#3a3236'], trees: ['dead', 'dead', 'pine'], underRamp: ['#0e1214', '#14181c'] },
    trees: ['dead'],
    treeRamp: ['#120e14', '#1e1820', '#2c2430', '#3c3240', '#504454'],
    liquid: null,
    props: [['gravestone', 7], ['pumpkin', 3], ['bones', 2], ['lantern', 2], ['fence', 2], ['skull', 1], ['statue', 1]],
    light: { ambient: '#3a3a5e', hero: '#d0b0ff', heroRadius: 50, fire: '#ff8a3a', gradeTop: '#6a5aa0', gradeBottom: '#0a0814', vignette: 0.6, fog: '#3a3a5a' },
    weather: ['fireflies', 'ash'],
    mobs: { plans: ['ghost', 'humanoid', 'pumpkin', 'flyer'], adjectives: ['Grim', 'Wailing', 'Restless', 'Moonlit', 'Haunted'], palettes: [['#2a2a3e', '#4a4a6a', '#7a7aa0', '#b8b8e0'], ['#3a2a1a', '#6a4220', '#a0642a', '#e09a3a']], eye: '#b8ff5a' },
  },
  ember: {
    id: 'ember',
    name: 'Ember Depths',
    layout: 'rooms',
    ground: { kind: 'basalt', ramp: ['#120c0c', '#1e1414', '#2a1c1a', '#3a2622', '#4e322c'], accent: ['#ff6a2a', '#ffb04a'] },
    path: { kind: 'flagstone', ramp: ['#1a1212', '#281a18', '#362420', '#48302a', '#5c3e34'] },
    solid: { kind: 'cliff', top: ['#0a0606', '#120a0a'], face: ['#1e1212', '#2e1a18', '#402420', '#56302a', '#6e3e34'] },
    trees: [],
    treeRamp: ['#1e1212', '#2e1a18', '#402420', '#56302a', '#6e3e34'],
    liquid: { kind: 'lava', ramp: ['#8a1a0a', '#c83a12', '#ff6a1a', '#ffa83a', '#ffe08a'], glow: '#ff5a1a' },
    props: [['rock', 4], ['bones', 2], ['brazier', 2], ['skull', 2], ['pillar', 2], ['crystalSmall', 1]],
    light: { ambient: '#3a2626', hero: '#ffc890', heroRadius: 42, fire: '#ff5a1a', gradeTop: '#ff7a3a', gradeBottom: '#1a0610', vignette: 0.55 },
    weather: ['embers', 'ash'],
    mobs: { plans: ['golem', 'slime', 'flyer', 'beast', 'humanoid'], adjectives: ['Magma', 'Cinder', 'Molten', 'Scorched', 'Infernal'], palettes: [['#2a0e0a', '#5a1a10', '#a03a1a', '#ff8a3a'], ['#1e1a1a', '#3a3030', '#5a4a46', '#8a7068']], eye: '#ffe24a' },
  },
  crystal: {
    id: 'crystal',
    name: 'Prism Grotto',
    layout: 'cave',
    ground: { kind: 'crystalStone', ramp: ['#120e22', '#1c1630', '#282042', '#362c56', '#4a3c70'], accent: ['#7ae8ff', '#c08aff', '#ff8ad8'] },
    path: { kind: 'flagstone', ramp: ['#16122a', '#221c3a', '#2e264c', '#3c3260', '#504478'] },
    solid: { kind: 'cliff', top: ['#08060e', '#0e0a16'], face: ['#1a1430', '#261e44', '#342a5a', '#443872', '#58488c'] },
    trees: ['crystal'],
    treeRamp: ['#2a1a5a', '#4a3a9a', '#6a6ad8', '#8ac8ff', '#e0f8ff'],
    liquid: { kind: 'spiritWater', ramp: ['#0e1e3a', '#163056', '#204a7a', '#3a74a8', '#7ac0e0'], glow: '#5ab0ff' },
    props: [['crystalSmall', 7], ['rock', 3], ['pillar', 1], ['bones', 1]],
    light: { ambient: '#3a3460', hero: '#c8e0ff', heroRadius: 46, fire: '#7ab8ff', gradeTop: '#8a6aff', gradeBottom: '#0a0820', vignette: 0.5 },
    weather: ['motes'],
    mobs: { plans: ['golem', 'bug', 'flyer', 'slime'], adjectives: ['Prism', 'Shard', 'Gleaming', 'Facet', 'Geode'], palettes: [['#2a1a5a', '#4a3a9a', '#7a6ad8', '#b8b0ff'], ['#1a3a4a', '#2a6a7a', '#4aa0b0', '#a0e8f0']], eye: '#ffffff' },
  },
  shrine: {
    id: 'shrine',
    name: 'Moonlit Shrine',
    layout: 'cave',
    ground: { kind: 'moss', ramp: ['#1a2a26', '#24382e', '#304a38', '#3e5e42', '#527650'], accent: ['#e8a0c0', '#ffe0a0'] },
    path: { kind: 'flagstone', ramp: ['#2a302c', '#3a4440', '#4c5852', '#606c64', '#788478'] },
    solid: { kind: 'cliff', top: ['#14201e', '#1a2a26'], face: ['#24302c', '#34423c', '#46564e', '#5a6c62', '#728478'] },
    trees: ['maple', 'pine'],
    treeRamp: ['#2a1420', '#4a2034', '#7a3450', '#b0546e', '#e88aa0'],
    liquid: { kind: 'spiritWater', ramp: ['#0c3a3e', '#12585a', '#1a7a78', '#3aa8a0', '#8ae0d0'], glow: '#4ad8c8' },
    props: [['stoneLantern', 4], ['rock', 3], ['flowers', 3], ['bush', 3], ['statue', 1], ['lantern', 2]],
    light: { ambient: '#4a6a7a', hero: '#ffe0b0', heroRadius: 46, fire: '#ffb05a', gradeTop: '#7ad8d0', gradeBottom: '#0a1a2a', vignette: 0.45, fog: '#3a6a6a' },
    weather: ['petals', 'fireflies'],
    mobs: { plans: ['ghost', 'beast', 'slime', 'humanoid', 'flyer'], adjectives: ['Spirit', 'Lantern', 'Moon', 'Kitsune', 'Jade'], palettes: [['#1a3a3a', '#2a6a64', '#4aa094', '#9ae0d0'], ['#3a1a2a', '#6a2a44', '#a04a68', '#e08aa8']], eye: '#ffd84a' },
  },
};

/** The camp (the home screen): the hamlet's woods at night, lit by a campfire and lanterns. */
export const CAMP_BIOME: Biome = {
  ...BIOMES.hamlet,
  name: 'Camp',
  light: { ambient: '#4a5682', hero: '#ffd9a0', heroRadius: 30, fire: '#ffa24a', gradeTop: '#3a4a8a', gradeBottom: '#120c20', vignette: 0.6, fog: '#2a3a5a' },
  weather: ['fireflies', 'embers'],
};

/** The order of the first lap. The dungeon comes before the crypt: down from the tundra into a keep's cells, then deeper. */
export const BIOME_ORDER: BiomeId[] = ['hamlet', 'farmland', 'forest', 'tundra', 'dungeon', 'crypt', 'swamp', 'desert', 'graveyard', 'ember', 'crystal', 'shrine'];

/** The biome for a floor: each runs for 5 floors; after the first lap the order is reshuffled by seed. */
export function biomeForFloor(floor: number, seed: number): Biome {
  const stretch = Math.floor((floor - 1) / 5);
  const lap = Math.floor(stretch / BIOME_ORDER.length);
  if (lap === 0) return BIOMES[BIOME_ORDER[stretch]];
  // Later laps: a seeded order that never repeats the biome you just left.
  const i = stretch % BIOME_ORDER.length;
  const order = [...BIOME_ORDER];
  let s = (seed ^ (lap * 0x9e3779b1)) >>> 0;
  for (let k = order.length - 1; k > 0; k--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (k + 1);
    [order[k], order[j]] = [order[j], order[k]];
  }
  return BIOMES[order[i]];
}

export function isBossFloor(floor: number): boolean {
  return floor % 5 === 0;
}
