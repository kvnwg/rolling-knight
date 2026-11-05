# Rolling Knight: how it works

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
  Shadow (1 in 150, +45%), Radiant (1 in 1,000, +90%), Void (1 in 10,000, +200%). A duplicate with a
  better mutation upgrades the knight you have.
- **"1 in X"** on a knight: its tier at luck 1 times its mutation's odds.
- **Stats**: class base × rarity (Common 1 … Primordial 30) × level × mutation × rebirths × upgrades.
- **Duplicates**: every copy after the first turns straight into gold as it lands (kills' worth by
  rarity; 3x for Commons and Uncommons with Peasant Levy); a better mutation it rolled sticks to the
  knight. **Levels** cost gold only: 40 x 1.32^(L-1), times 1 + 0.5 per rarity tier (half for Commons
  and Uncommons with Hand-Me-Downs); each adds 10% of base stats (30% for Commons and Uncommons with
  Humble Beginnings). Old saves' spare copies and shards were cashed in as gold.
- **Classes** (the kit is the same for every knight of a class):

| Class | Role | Auto attack | Dodge |
| --- | --- | --- | --- |
| Guardian | Tank | Shield Bash (knockback) | Bulwark Roll (short, then half damage) |
| Blade | Fighter | Cleave (wide arc) | Combat Roll |
| Ranger | Archer | Longshot | Backflip (long) |
| Cleric | Healer | Holy Orb (heals the most hurt ally) | Blessed Step (healing glow) |
| Arcanist | Mage (rebirth 1) | Arcane Bolt (seeking, splash) | Blink |
| Lancer | Lancer (rebirth 2) | Pierce (a line) | Vault |

- **Skill rolls** (`src/core/skillbook.ts`, `src/world/skills.ts`). There is no fixed special: the
  skill button spins a 0.7 s reel over the class's list and fires whatever it lands on (the result is
  fixed when the spin starts, as at the altar). There are no cooldowns: in a fight every knight rolls,
  fires, and rolls again at once. Quick Roll (the tinker's Combat tab) makes each tier's spin 12%
  shorter (at 5 tiers: a 0.28 s spin). Each class has six skills; at luck 1 they weigh 30, 26, 20, 13, 8
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

## 6. The squad

Three slots. You control one (switch any time); the other two run their role's AI: tanks wade in and
taunt when the squad is pressed, fighters chase, archers and mages kite, healers stay by whoever is
hurt and save Sanctuary for when it counts. Everyone dodges what they see coming, most of the time
(shots, blasts and boulders about to land, a lunge's lane or landing ring once its aim has locked).
Auto hands your knight to the AI too (and it is on while a menu is open). Empty slots fill with your
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
is carried back to the hub, and the run goes back to the biome's first floor (on Auto it heads back
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
- Bullets, slow (60 to 100 px/s, slower than any knight's shot), big and high-contrast (the effects'
  danger balls: a glossy ball in danger red or orange with a white-hot heart and an ink outline,
  throbbing and dragging a short tail; `src/render/vfx/art.ts`), in a pattern each kind is known by
  (`gunFor`): archers aim and fan out every third volley, flying shooters spit bursts, spore pods
  ring, casters curve theirs in; chasers shoot between lunges (goblins aimed shots, skeletons short
  bursts, orcs and spiders fans), swarms the odd slow shot (spirits curving ones). Slimes, pumpkins,
  bombers and ogres shake a ring loose as they land, slam or go off, from the edge of the ring that
  came down. The first ten floors fire the plain patterns (and a little slower); from floor 11 and
  again from 21, and from elites and bosses, they're denser.
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
wax seal: Deadly, Hard, Fair, Easy, Trivial. `npm run sim` plays the real game on Auto and logs power
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
  luck 1; low duplicates pay 3x), Rags to Riches (+25% stats per tier below Legendary), Peasant Revolt
  (a low-rarity squad deals double damage and dodges twice as often), Hand-Me-Downs (Common and
  Uncommon level-ups cost half).
- **Command**: Tag Team (switching lands the incoming knight's roll at once), Lone Wolf (solo: ×3 HP, ×2.5 damage), Hive Mind
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

Offline rolling uses the same rules at 1/10 speed and 75% efficiency (Night Watch +40% a tier), up to
1,000 rolls or 8 hours, keeping only Epic or better; the squad's gold income runs on too.

The start: ordinary rolls, no scripted finds and no gift to hook you; the first spins are just quick
(1.6 s) until you have three knights for a squad.
