# The economy

How gold comes in, what it buys, and how fast a player gets through it, checked by playing the
game: `npm run econ -- --hours 6 --seed 1` (tools/econ.ts).

## The shape of it

Every rebirth wipes the run: gold, upgrades, knights (none ever come through), perks. What stays is
the rebirth count, which multiplies luck, gold and power for good. The next rebirth needs ten
floors more than the last (15, 25, 35...).

- **Income** comes from the fights: a kill pays `goldPerKill x goldGrowth^floor` (x1.14 a floor)
  times the gold multipliers (Greed, the Royal Treasury, rebirths, the solo bonus, run items).
  Repeats rolled at the altar are kept as extras, each worth a few kills' worth of gold at your best
  floor as it lands (`BAL.roster.sellKills`: a Rare 2, an Epic 4, a Legendary 10, a Mythic 50), paid
  when Bram the Broker sells them: the same gold as when repeats paid on landing, collected later.
- **Prices** are set per run (core/economy.ts). A run goes ten floors deeper than the last, where
  a kill pays 1.14^10 = 3.7 times as much, so every price in it is `BAL.economy.runPriceGrowth`
  (3) times the last run's: the tinker's tiers, combat rolls, the knights' levels. The scale stays
  under 3.7 on purpose, so each run goes a little faster than the last, with the rebirth's own gold,
  luck and power on top. Merchants' wares, reforging and extras are priced from the floor you're
  on or your best, so they scale already.
- **Away** (core/offline.ts): the fights' gold keeps coming at 12% of the last ten minutes' rate of
  picked-up gold (Night Watch adds 5% a tier), for up to 8 hours. That is about an hour of play for
  a night away, up to about three with Night Watch maxed. It counts fight gold only, never a purse
  swollen by extras sold, a sale or saving up. The altar rolls at a tenth of its speed, up to 300
  rolls, and every pull lands: new knights join, and repeats found while away are kept as extras
  worth 15% of their usual.
- **Rebirth** takes extras with their knights, like the rest of the gold (a purse emptied by a
  rebirth would only swallow them, and carrying them over would bring the last run's prices into a
  fresh one); the Shrine lists them, and what they'd fetch, before you go.

## What the old numbers did

Six hours of the bot's play under the old numbers:

- The combat tab was maxed in the fourth run (about 1.5 hours in), the luck tab in the fifth (about
  2 hours), and the squad was at level 57.
- Duplicates (now extras) paid up to 17 times what kills did.
- A night away paid 22 billion gold: about 98 hours of play's worth.

Away paid 75% of the purse's growth rate, plus 40% a tier of Night Watch: 275% maxed, more than
playing.

## Now

Three seeds, 6 hours of play, all three squad slots open from the start, 8 hours away after every
hour, rebirthing a minute after the push:

| run | rebirth floor | length (min) | luck tab owned | combat tab owned |
| --- | --- | --- | --- | --- |
| 0 | 15 | 13 to 16 | 8 to 9% | 16% |
| 1 | 25 | 20 to 24 | 20 to 38% | 31 to 47% |
| 2 | 35 | 32 to 37 | 34 to 52% | 42 to 57% |
| 3 | 45 | 59 to 79 | 42 to 68% | 48 to 68% |
| 4 | 55 | 65 to 154 | 62 to 89% | 60 to 85% |
| 5 | 65 | 92 to 105 | 76 to 86% | 74 to 81% |

"Owned" means the share of the tab's tiers bought by the time of the rebirth.

- Runs get longer as they go deeper. Nothing is maxed by the time a rebirth opens; maxing a tab
  means staying and farming well past it.
- A night away pays about an hour of play, under two when the altar rolls something big.
- Purchases come every half minute to a minute and a half.

The bot plays every fight perfectly, so a person takes longer.

## Tuning

Everything is in `src/core/balance.ts`:

- `economy.runPriceGrowth`: how much dearer each run is (under 3.7 makes later runs quicker).
- `offline`: efficiency, Night Watch's share, the rolls and the extras' share.
- `roster.sellKills`: what a repeat's extra fetches.
- `dungeon.goldGrowth`, `goldPerKill`: the income curve.

tests/economy.test.ts holds the rules: every price scales per rebirth, a night away pays the fights'
rate (about an hour of it) and lands every pull, the 8-hour cap, and a repeat's extra worth a few
kills. tools/econ.ts sells the player's extras whenever it spends (every few seconds), which comes
to the same gold as repeats paying on landing.
