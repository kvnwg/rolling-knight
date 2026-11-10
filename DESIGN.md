# Roll a Knight!: Idle RPG, how it works

A top-down (3/4 view) pixel action roguelite with a rolling game on top. A free altar rolls knights
forever; you field a squad of three in endless procedural dungeons, control one, and the other two
fight by their class's AI. Every number lives in `src/core/balance.ts`.

## 1. The Summoning Altar (rolling)

Dumpster Legend's dumpster, with knights instead of items.

- **The spin.** Free and never stops. Each spin rolls one knight per reel. Every result is decided the
  instant the spin starts; the spinning reels are only the animation, and they land one by one.
  A spin is 2.6 s plus a 0.9 s rest (3.5 s). Spin Speed's 8 tiers bring that to about 1 s, never
  under 0.7 s; the Greased Gears perk doubles the speed past that limit.
- **Turbo spins.** Each Hourglass (elites 25%, bosses 5) makes one spin run twice as fast (Turbo
  Power more, down to 0.45 s). A spin building up to a rare find plays at normal speed and the
  Hourglass waits.
- **Reels.** 1 to start; Extra Reel adds up to 4 (5 at most); the Bootleg Reel perk adds one and
  slows spins by 50%.

## 2. Luck decides the rarity

Tiers are tried rarest first; each hits with a chance of luck ÷ X; the first hit wins, else Common.

| Tier | 1 in X at luck 1 |
| --- | --- |
| Uncommon | 3 |
| Rare | 12 |
| Epic | 80 |
| Legendary | 1,000 |
| Mythic | 25,000 |
| Ancient | 60,000 |
| Exalted | 150,000 |
| Celestial | 400,000 |
| Astral | 1,000,000 |
| Divine | 5,000,000 |
| Eternal | 25,000,000 |
| Primordial | 250,000,000 |

Side effect: once luck reaches a tier's X, everything below it stops dropping (luck 3: no Commons).

**Luck** = (1 + Luck upgrades + Depth) × rebirths × Luck Potion

- Luck upgrade: +15% per tier, 8 tiers.
- Depth: +5% for every boss beaten this run, up to +145%.
- Rebirths: ×1.25 after one, ×1.5 after two, and so on.
- Luck Potion: ×2 for 60 s (Potion Time adds 20 s a tier). Drops from mobs (0.3%), elites (5%) and
  bosses (30%).

Per spin: every 10th is a **Lucky Spin** (×2; upgrades bring it to every 4th and ×4); the Golden
Wheel gives each spin a 2% chance (up to 10%) of a **Golden Spin** (×5).

## 3. Luck tokens

Before a reel lands its knight it has a 5% chance (×3 with Four-Leaf Litter, 50% max) of a token:
×2 (60%), ×3 (25%), ×5 (11%), ×10 (4%). The reel then spins again with a 50% chance of another, up
to 4 in a row, multiplying (max ×10,000). Tokens landing in the same round on two or more reels make
a **combo**: each counts the round's product. Chains of ×25, ×50 and ×250 guarantee Epic, Legendary
and Mythic or better.

## 4. Safety nets

- Bad-luck protection: after 40 rolls without Epic or better, the next is at least Epic (Pity Shield
  takes 4 off per tier, down to 8). Shown as "Epic+ guaranteed in N".
- Rigged Jackpot (perk): every 25th spin, every reel lands Legendary or better.

## 5. Knights

- **78 knights**: one of each of the 6 classes in every tier, each with a name and its own colors.
- **Mutations** (a second roll, independent of luck; Alchemy raises it): Gilded (1 in 25, +20%),
  Shadow (1 in 150, +45%), Radiant (1 in 1,000, +90%), Void (1 in 10,000, +200%). A repeat with a
  better mutation upgrades the knight you have.
- **"1 in X"** on a knight: its tier at luck 1 times its mutation's odds.
- **Stats**: class base × rarity (Common 1 … Primordial 30) × level × mutation × rebirths × upgrades.
- **Extras**: every copy after the first is kept on that knight's record as an extra, worth what a
  repeat was worth the moment it landed (kills' worth by rarity at your best floor; 3x for Commons and
  Uncommons with Peasant Levy), until Bram the Broker sells it for you at the curio cabinet (one
  knight's extras, or all of them at once). Selling extras never touches the knight: its level,
  mutation and place in the squad stay; a better mutation a repeat rolled with still sticks to the
  knight as it lands. Selling a knight at the Warden's sells its extras with it, and a rebirth takes
  them with the knights, like the rest of the gold (the Shrine lists them first). Old saves' spare
  copies and shards were cashed in as gold.
- **Levels** cost gold only: 40 x 1.32^(L-1), times 1.9 per rarity tier (half for Commons and
  Uncommons with Hand-Me-Downs); each adds 10% of base stats (30% for Commons and Uncommons with
  Humble Beginnings).
- **Classes** (the kit is the same for every knight of a class):

| Class | Role | Attack | Dash (the dodge) |
| --- | --- | --- | --- |
| Guardian | Tank | Shield Sweep (short heavy arc, big knockback; cuts shots) | Shield Bash (a charge: foes in the way are hit, knocked aside and staggered; shots blocked) |
| Blade | Fighter | Cleave (wide arc; sends shots back as its own) | Shadowstep (a little longer, afterimages; ready again in 0.5 s) |
| Ranger | Archer | Longshot | Shot or Snare (toward a foe: a roll and a piercing Power Shot; away: a backflip and a snare) |
| Cleric | Healer | Holy Orb (heals the most hurt ally) | Blessed Step (a holy circle where it started: 6% of max HP a second for 2.5 s) |
| Arcanist | Mage (rebirth 1) | Arcane Bolt (bends toward foes, splash) | Blink (1.3x as far, never through a wall; an arcane burst where it left) |
| Lancer | Lancer (rebirth 2) | Pierce (long thrust; pops shots along it) | Spear Lunge (fast and long: through foes, hitting each and pushing it on) |

  Melee knights are the sturdy ones: the Guardian has about three times a ranged knight's HP and the
  most armor by far, the Blade and Lancer about twice, with two to three times the armor; they pay
  for it in damage, and Power rates every class the same.

- **Skill rolls** (`src/core/skillbook.ts`, `src/world/skills.ts`). There is no fixed special: a
  1.8 s reel spins over the class's list and fires whatever it stops on (a Legendary slams down onto
  the screen first; the result is fixed when the spin starts, as at the altar). There are no
  cooldowns: in a fight every knight rolls, fires, and
  rolls again as soon as the skill has finished firing (the skill button rolls yours when there's no
  fight). Quick Roll (the tinker's Combat tab) makes each tier's spin 12% shorter (at 5 tiers: a
  0.72 s spin). Knights only roll with an awake foe within a screen of them. Each class has six skills; at luck 1 they weigh 30, 26, 20, 13, 8
  and 3 in 100 (two commons, an uncommon, a rare, an epic, a legendary), and luck tilts them rarer
  (weight × luck^(0.1 × tier step), luck capped at 1000; Loaded Dice adds to it). Epic and up chain
  several beats and announce their tier; legendary and up flash the screen and stop time for a beat.

| Class | Common | Common | Uncommon | Rare | Epic | Legendary |
| --- | --- | --- | --- | --- | --- | --- |
| Guardian | Shield Slam | Iron Skin | Ground Pound | Rallying Taunt | Aegis | Titan's Wrath |
| Blade | Twin Slash | Battle Cry | Shadowstep | Whirlwind | Thousand Cuts | Excalibur |
| Ranger | Power Shot | Fan of Arrows | Snare Shot | Arrow Rain | Arrow Nova | Thousand Arrows |
| Cleric | Mend | Smite | Blessing | Sanctuary | Guardian Angel | Miracle |
| Arcanist | Magic Missiles | Frost Nova | Chain Lightning | Meteor | Singularity | Meteor Storm |
| Lancer | Javelin | Sweep | Impale | Dragon Lunge | Wyrm Rush | Skyfall |

- **Signature skills.** A few rare knights add a jackpot to their own list (weight 2). **Chronomancer
  Aeon** (Mythic Arcanist) can roll **Rewind**: the squad goes back 4 seconds (positions, HP, fallen
  knights), enemy shots and spells in the air vanish, and damage dealt stays.

## 5b. Fighting

After Enter the Gungeon (`src/world/aim.ts`, `melee.ts`, `feel.ts`, `dash.ts`):

- **Aim.** On a computer the mouse aims, free through 360 degrees, with a small pixel crosshair in
  place of the cursor (gold over a foe). Hold attack and the knight attacks along the aim at its
  class's pace, at full walking speed, facing the aim while it does. The camera leans a quarter of
  the way toward the aim. On a phone, holding Attack aims for you: the foe ahead of where you're
  walking first, else the nearest in reach and in sight, and it sticks to that one until it falls or
  gets well away (corner brackets mark it); drag from the Attack button to aim by hand like a second
  stick. Auto attack does the phone's aiming and holds attack down for you.
- **Melee** swings are live for a moment: an arc in front (the Blade's wide, the Guardian's short and
  heavy) or the Lancer's long, narrow thrust, with a small step forward. Only what's in the arc is
  hit, never what's behind. A swing cuts foes' bullets out of the air with a clink: the Blade (and
  Kevin) send them back along the aim as their own, the Lancer pops every one along the thrust, and
  squadmates' swings cut too.
- **Shots** go straight along the aim and faster than any foe's bullets, with a muzzle flash and a
  1 px kick; the Arcanist's bend a little toward foes.
- **Feel.** Melee hits and crits stop the world for 40 to 70 ms (hit-stop, the same at any frame
  rate), foes flash white and slide back along the blow, heavy hits shake the screen. When your
  knight is hit: a red flash, a short stop and 0.8 s of blinking safety. A dash is untouchable for
  most of its length and then lands, open, for a moment; no attacking while it runs.

## 6. The squad

Three slots. You control one (switch any time); the other two run their role's AI: tanks wade in and
taunt when the squad is pressed, fighters chase, archers and mages kite, healers stay by whoever is
hurt and save Sanctuary for when it counts. Everyone dodges what they see coming, most of the time
(shots, blasts and boulders about to land, a lunge's lane or landing ring once its aim has locked).
They find their own way about (world/nav.ts): round trees, props and walls on paths planned over the
floor, to the nearest free spot beside you when their place in the formation falls in a tree or a
wall, backing off into open ground rather than into a corner, and should anything still hold one
up, it steps aside, and at last hops back to your side: no knight is left pushing into a wall.
Auto attack aims and fires for your knight too (and it is on while a menu is open); moving and
dodging stay yours. (A dev bot, `&auto` and `npm run sim`, plays your knight outright.) Empty slots fill with your
strongest free knight; anything else is your call (or Best squad), at the Warden's by the steps down.
The squad is locked in the dungeon: knights rolled during a dive wait at the hub, and to change who
fights (or spend anything) you head back up, or fall.

**Perfect rolls.** When a dodge roll makes something miss that would have hit (a shot through the
knight, a blast or a boulder going off on it, a bite, a charge, a dash or a leap coming down), PERFECT!
pops over it in the big pixel font, it flashes and leaves an afterimage, a bright chime plays
(`perfect_roll`), and if you're steering it yourself the fight holds its breath for a beat. Once per
roll, for show only; squadmates' are smaller and quieter.

## 6b. The tinker's upgrades

`src/core/upgrades.ts`. Gold upgrades at Tinker Pell's counter, on two tabs. A rebirth resets them.

- **Luck** (the altar's lines: luck, spins, reels, mutations, bad-luck protection, Loaded Dice; and
  fortune's: gold, Luck Potions, nights away, kills that pay out) is bought, tier by tier, on its
  upgrade map (Dumpster Legend's honeycomb, `src/core/upgradeTree.ts`), one hex a tier: it grows from
  Luck I, a line opens once the tier it hangs off is owned, and each tier costs its line's growth
  times the last.
- **Combat** is rolled (`src/core/combatRoll.ts`): ROLL pays gold and lands on a random combat line
  that isn't maxed, which gains a tier. Every line is in the roll from the start: Strength (+18%
  damage a tier), Vitality (+18% HP), Attack Speed (-6% attack cooldown a tier, six tiers), Move
  Speed (+6%), Quick Roll, Giant Slayer, Leechblade, the chance lines, and the one-offs (Excalibur,
  Dragonscale, Two-Headed Coin, Lady Luck). A line weighs 0.8^(its next tier - 1), a one-off 0.2
  (about an eighth tier): Strength III is 1.6 times rarer than Attack Speed I, Strength VIII 5 times.
  Tiers I-II roll as Common, III-IV Uncommon, V-VI Rare, VII-VIII Epic, a one-off Legendary, and the
  reel's drama follows (a longer crawl, a glow climbing to the result's color, sparks, rays, a
  shake). A roll costs 150 gold × 1.12^(combat tiers owned), to two figures: about half the old
  prices for the first thirty tiers, the same around fifty, dearer at the end, and about 11M to max
  the tab (buying every tier was 13.6M). One roll in ten is a double (two tiers), one in twenty is
  free.

## 7. The dungeon

Endless floors, a new biome every 5 floors (a boss on every 5th): Mossy Hamlet, Old MacMayhem's Farm,
Gloomwood, Frostfang Tundra, Grimstone Dungeon, Sunken Crypt, Mirewater Bog, Sunscorch Ruins, Hollow
Graves, Ember Depths, Prism Grotto, Moonlit Shrine; after the first lap the order is reshuffled. Each floor is built to one of ten
designs (`src/world/designs.ts`): a chain of rooms, a loop round a lake or a block of houses, a plaza
with spokes, switchbacks, arenas joined by bridges, a crossroads with two wings, open ground with
islands of cover, a valley with ledges, a maze, a keep with a ring road. Their order is a shuffled
deck kept in the save (`src/core/deck.ts`): no design repeats until all have been played, a reshuffle
never repeats the last one, and a floor you come back to is a new map to the next design. Boss
floors keep the same arena with a different approach. Every floor has side rooms, pools and props,
and is checked to be fully connected. Mobs are designed
per floor: body plan, behavior (chaser, archer, charger, bomber, caster, tank, swarm), colors, size,
features and name; bosses have three of ring, fan, charge, slam, summon, rain and leap (always a
charge or a leap among them), and enrage at half HP. The way down is open from the start: fight what you like, then stand in the portal a moment to go down (a boss floor's opens when its boss falls). A wiped squad
is carried back to the hub, and the run goes back to the biome's first floor (the dev bot heads back
down by itself unless you move).

**How monsters fight** (after Enter the Gungeon; `src/world/ai.ts`, `src/world/mobgen.ts`). They come
with intent: chasers at nearly a knight's pace (sprinting when they're far off), swarms faster than
you, even ogres at a jog; they find their way round water and props, close in at an angle rather than
straight, and those that fight from range keep their distance and circle you. Every attack has a tell:
through its wind-up the monster pulses red (a couple of frames on, a couple off) inside a crisp red
outline, and big moves add a red ! over its head. Every kind has a lunge or a gun, many both:

- Lunges (LUNGES): wolves and spiders pounce, slimes, pumpkins and chickens hop, goblins dash in and
  stab, orcs shoulder-charge, skeletons thrust, bats and spirits swoop, beetles skitter, boars, pigs and
  rams charge, bombers hop in before they go off, ogres leap and slam. On the ground a red lane (a dash)
  or a red ring (a leap) fills up over the wind-up, following you for its first half and then holding;
  then one hit, and the monster stands spent for a moment. A roll goes straight through any of them.
- Bullets come in kinds, each family of monster with its own (`src/world/bullets.ts`, fired in the
  patterns of `gunFor`), and ONE rule for their colors: every foe's bullet has the same dark ink
  outline and a white-hot heart (nothing of the squad's has both, nor has a pickup), and its hue says
  what it does. **Red flies straight, pink bends, orange bursts.**
  - the plain **orb**: slow (60 to 100 px/s, slower than any knight's shot), a big glossy ball; red,
    or pink when it curves in (shamans: pairs from either side; an elite shaman a **beam** instead, a
    quick stream of **sparks** down one line);
  - **dart** (archers): fast and thin, down a dashed line the archer shows through a longer wind-up;
    the line follows you for the first half, then holds and turns white (one, and every third volley
    a fan);
  - **blade** (goblins a knife, skeletons a burst of bones, orcs a fan of axes): thrown straight out
    to just past you, it loops back to where it was thrown from, bulging to one side;
  - **spit** (bats, spitters): leaves fast, brakes hard and hangs in the air a while;
  - **spore** (blooms, spiders, mites): drifts slowly, weaving side to side;
  - **seed** (spore pods): a fat pod that swells white-hot, then bursts into a fan of **pips**;
  - **glob** (slimes): lobbed in an arc onto a marked spot (its ring shows from the throw, its shadow
    under it); it only hits where it lands;
  - **mine** (pumpkins; the farm's hens lay theirs): tossed a little way, it sits blinking faster
    and faster, then pops into a ring of pips: get clear, or smash it first;
  - **pellets** (beasts): a short spray when you're close, soon spent; a charger's hooves fling
    clods on ahead as its charge ends; a bomber's shrapnel;
  - **wisp** (ghosts): slow, turns after you (its eye is on you), and can be cut or shot down;
  - **wave** (golems): crescents rolling out along the ground from a slam: step between them or roll
    through, a swing won't stop one.
  Slimes, pumpkins, bombers and ogres shake theirs loose as they land, slam or go off, from the edge
  of the ring that just came down. Every gun has its wind-up; a swing cuts everything but a glob in
  its arc and a wave; a roll through any of them is a PERFECT roll; knights on Auto see each kind
  coming along its real path (`bulletThreat`). A boss's every other ring and fan is one of its
  kind's own patterns (globs onto every knight, rings of crescents, blades that all come back, wisps,
  mines), never heavier than the plain one. More bullets in a pattern means less each: a floor's
  incoming damage is what it was (`tests/bullets.test.ts`). The first ten floors fire the plain
  patterns (and a little slower); from floor 11 and again from 21, and from elites and bosses, they're
  denser. `bullets-preview.html` shows the art (`npx tsx tools/bulletsPreview.ts` writes it as PNGs).
- Ogres that can't get to you (no way round, the way round far longer than straight across, or kited
  for a few seconds) tear up a chunk of the floor and throw it: a red ring where it will land from the
  start of the throw, its shadow growing as it falls, shards flying off as it breaks.
- Slams and blasts show their red ring from the start of the wind-up too. Bosses charge and leap bigger.

A monster that wakes (or is summoned) rises into the fight in a puff of dust and does nothing for 0.6 s.

**Traps** (`src/world/traps.ts`), on the Dungeon's floors and a few in the crypt's: each room may get
a set and some halls a line across, never in the start room or by the exit, never under a prop.
Every trap shows a tell before it strikes (and glows red), a knight mid-roll passes untouched, flyers
float over, and mobs walking in get hurt too (bosses barely):

| Trap | Cycle | The tell | Hurts | Knights lose | Mobs lose |
| --- | --- | --- | --- | --- | --- |
| Spikes | 3 s (a patch's columns a beat apart) | the tips show, 0.6 s | 0.9 s, once | 7% HP | 18% |
| Fire vent | 3.6 s (every other vent half a cycle apart) | a spark and a small flame, 0.6 s | 0.7 s, every 0.3 s | 3.5% a tick | 9% a tick |
| Saw | 2.6 s to and fro along a 3-tile slot | always out, running | where the blade is | 8% | 20% |
| Pressure plate | stepped on, then rests 0.9 s | it turns over, 0.36 s | 0.84 s, once | 9% | 22% |

Folk turn up on some floors (`src/world/npcs.ts`): farmers, guards, a bard, a goblin accountant, a
ghost who is three hundred years late, a chicken who is not a chicken. Each keeps a set-up of their
own in the setting's style (`src/world/camps.ts`, art in `src/render/art/camps.ts`): a market stall
in the hamlet, a hay cart on the farm, a tent by a campfire in Gloomwood, a hide tent and a fire bowl
on the tundra, a candlelit shrine in the crypt, a hut on stilts in the bog, a pavilion over a rug in
the ruins, a cemetery gate with a bench and a lantern, a smith's cart in the Ember Depths, a lean-to
by a crystal lamp, a little stall hung with paper lanterns at the shrine. It stands off the fighting:
in a nook cut into the wall beside the start room or a side room when one fits, else with its back to
a wall in a quiet corner; never on a corridor's line or where it would cut the floor in two, and the
mobs that would spawn beside it move elsewhere. Talk to them for jobs (slay, elites, a boss, go
deeper, collect) with gold, Hourglasses, potions and banked Lucky Spins as rewards; three at once,
tracked in the HUD. In the conversation your replies drop down as one list (arrows, Enter, number
keys or a tap); a job shows as a parchment card in icons (the goal and its number, the pay and how
much; a tap for the words), and the replies that lead to it carry the "!" from over the folk's head.
About one floor in eight hides a demon in disguise. Ask the wrong questions and it drops the act: it
fights like a boss, with its own bar and banter, but the floor's other foes don't fall with it.

Merchants (`src/world/shop.ts`, `src/core/runItems.ts`): now and then a room of a floor is Madame
Thrift's (40% of floors, 85% on the one before a boss; never floor 1 or a boss floor), nothing
spawning in it. Three wares stand on little tables in front of her stall, each for this run only
(a heal, a revive, tonics, charms and gear that last until you head back to camp), priced in kills'
worth of the floor's gold. Stand at one and the HUD offers it: the price, and beside it, in crimson,
STEAL (G on a keyboard). The first press only asks ("Steal? She'll fight you."); a second, still
standing there, takes it for nothing.

Stealing (`src/world/thief.ts`): the ware works like a bought one, and the merchant turns on you.
A warning of 0.9 s (she shouts, a red "!" over her head, the light goes red-ish, the boss's music
starts), then she vaults her counter and is a foe: the Furious Merchant, with a boss's bar. She has
3x the HP and 3x the hit of the boss this floor would have had: the floor's own boss generator at
this floor's difficulty, as if it were a boss floor (so about 54 s of the squad's damage at par,
and close to half a knight's HP a hit). She is herself, not a monster: her own chibi, red in the
face, steam coming off her, at twice the size. Her moves are a merchant's: a fistful of coins (a
fan), coins all round (a ring), her wares raining down, and a shoulder-first barge; she summons no
one. She never fights unless she's stolen from, and only the player steals: the squad's AI and Auto
see her only once she's a foe (then they target her like any other, and Auto won't leave the floor
while she stands).

While she's after you nobody minds the stall: every ware left on it is free for the grabbing (the
tags say FREE; no more buying), in the middle of the fight or after it. The way down is as open as
it was: you can run, and she chases across the floor. Beating her pays 60 kills' worth of gold (a
few wares' price) and leaves her dazed where she fell; the squad going down to her is a wipe like
any other. A thief is remembered for the rest of the run: every later merchant charges half again
(a red +50% tag on the price) and says so when you talk to her. Heading back to camp, a wipe or a
rebirth clears it, like the run's items.

## 7b. Balance: power, par and difficulty

`src/core/power.ts`. Every knight is rated from its real stats: damage per second and HP, each
against a level-1 Common of its class with no upgrades (that knight rates 100), so the rating counts
rarity, level, mutation, upgrades, rebirths and perks alike, on the same scale for every class.
Squad Power is the three ratings added up. Each floor has a par (the Squad Power the game expects
there: 750 on floor 1, then x1.1 a floor). When a floor starts, its foes are built for a difficulty:
par at par; above par they grow by (power / par)^0.6, so a squad four times par clears about 1.7x
faster, not four times, and nothing folds in one hit; below par they shrink only by (power / par)^0.2,
so the wall is real. Foes come from targets, not raw numbers: at their difficulty a plain foe takes
0.6 s of the squad's damage and each hit takes 8.5% of a knight's HP (elites 2.6 s and 12%, bosses
18 s and 15%): quick, dangerous fights, neither sponges nor pushovers, and each foe type keeps its shape against the plain chaser (a tank has three times
its HP). (Each blow is lighter than it used to be because monsters now land many more: lunges,
volleys, quicker feet.) The first floors bite harder than par alone would say (a new squad is usually
well ahead of it there): on floor 1 foes hit 20% harder and take 10% longer to kill, fading to the
plain targets by floor 10 (`BAL.balance.early`). The camp and the gate show Power against par with a
wax seal: Deadly, Hard, Fair, Easy, Trivial. `npm run sim` plays the real game with the dev bot and logs power
against par floor by floor.

## 8. Rebirth and perks

Rebirth at floor 15 (then +10 each time): start over at floor 1 with luck ×1.25, gold ×1.5 and stats
+30% per rebirth (stacking), and new classes to roll. Knights, gold, upgrades and perks go; the
Codex and records stay.

Perks open after the first rebirth. **Sigils** (one per rebirth at the start of a run, one per boss
beaten for the first time in a run) roll for perks at Sage Orrin's (`src/core/perks.ts`): a roll
lands on a random perk you don't have yet. A perk weighs 1 / its old sigil price (Common 1,
Uncommon 1/2, Rare 1/3, Epic 1/4), and a roll costs a sigil, plus one for every five perks owned (50
for all twenty). A rebirth clears them all. The four trees only sort them:

- **Underdogs**: Humble Beginnings (Common and Uncommon level-ups ×3), Peasant Levy (every 4th spin at
  luck 1; low extras fetch 3x), Rags to Riches (+25% stats per tier below Legendary), Peasant Revolt
  (a low-rarity squad deals double damage and dodges twice as often), Hand-Me-Downs (Common and
  Uncommon level-ups cost half).
- **Command**: Tag Team (the knight you switch to hits 30% harder for 4 s, once every 10 s), Lone Wolf (solo: ×3 HP, ×2.5 damage), Hive Mind
  (the squad dodges with you; allies' skill rolls 2× faster), War Banner (your hits speed up the squad),
  Heirloom (keep your knight through the next rebirth).
- **Rigged Reels**: Four-Leaf Litter, Bootleg Reel, Greased Gears, Pawn Shop, Rigged Jackpot.
- **Bad Ideas**: Glass Cannon, Roll Dancer, Blood Pact, Berserker, Kamikaze.

## 9. What's real and what's show

Results are fixed when a spin starts. The scrolling silhouettes are decoration and lean far rarer
than the real odds; 65% of the time a near miss sits right next to the real result. Full-screen
reveals are judged against your own recent finds: the tier must be at least 1 in 20 at your luck and
rarer, for you, than everything in the last 5 (BIG), 50 (HUGE) or 500 (INSANE) minutes. HYPER RARE is
the rarest find of your whole game, at least 1 in 100,000 for your luck, after 10 minutes of play.
Build-ups use 30-second and 2-minute windows, and nothing is judged in a new game's first 2 minutes.

## 10. Away, and the first minute

Offline rolling uses the same rules at 1/10 speed, up to 300 rolls or 8 hours, and every pull lands:
new knights join, repeats wait as extras worth 15% of their usual (docs/ECONOMY.md); the squad's
fight income runs on too.

The start: ordinary rolls, no scripted finds and no gift to hook you; the first spins are just quick
(1.6 s) until you have three knights for a squad.

## 11. On a portal (CrazyGames)

`src/platform/`. The CrazyGames build (`npm run build:crazygames`) has the portal's SDK on the page;
no other build does, and without it none of this exists for the player.

- **Saves** go to the SDK's data module (the player's CrazyGames account, on every device), under
  the same key as everywhere else; the browser's storage is the fallback if the module is off.
- **Ad breaks** (`break` events, `src/game.ts`): with the screen black after a boss floor's portal,
  and as the hub comes up after a wipe. Not in a player's first four minutes, and never anywhere
  else. The game is paused from the ask until the ad is over; its sound goes only while one plays.
- **Rewards for watching an ad**, both optional and both away from the fight:
  - the welcome back's GOLD x2: the squad's gold from the time away, paid once more;
  - the Oracle's Favour, in the Luck sheet at the hub: a Luck Potion (as if one had dropped; it
    adds to one that's running), once every 10 minutes.
- The portal's mute switch silences the game above its own volume sliders; its device type (not
  the browser's touch support) decides between touch controls and keyboard hints.
