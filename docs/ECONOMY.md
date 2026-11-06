# The economy

How gold comes in, what it buys, and how fast a player gets through it, checked by playing the
game: `npm run econ -- --hours 6 --seed 1` (tools/econ.ts).

## The shape of it

Every rebirth wipes the run: gold, upgrades, knights (none ever come through), perks. What stays is
the rebirth count, which multiplies luck, gold and power for good. The next rebirth needs ten
floors more than the last (15, 25, 35...).

- **Income** comes from the fights: a kill pays `goldPerKill x goldGrowth^floor` (x1.14 a floor)
  times the gold multipliers (Greed, the Royal Treasury, rebirths, the solo bonus, run items).
  Duplicates rolled at the altar turn into a few kills' worth of gold at your best floor
  (`BAL.roster.sellKills`: a Rare 2, an Epic 4, a Legendary 10, a Mythic 50).
- **Prices** are set per run (core/economy.ts). A run goes ten floors deeper than the last, where
  a kill pays 1.14^10 = 3.7 times as much, so every price in it is `BAL.economy.runPriceGrowth`
  (3) times the last run's: the tinker's tiers, combat rolls, the knights' levels. The scale stays
  under 3.7 on purpose, so each run goes a little faster than the last, with the rebirth's own gold,
  luck and power on top. Merchants' wares, reforging and duplicates are priced from the floor you're
  on or your best, so they scale already.
- **Away** (core/offline.ts): the fights' gold keeps coming at 12% of the last ten minutes' rate of
  picked-up gold (Night Watch adds 5% a tier), for up to 8 hours. That is about an hour of play for
  a night away, up to about three with Night Watch maxed. It counts fight gold only, never a purse
  swollen by duplicates, a sale or saving up. The altar rolls at a tenth of its speed, up to 300
  rolls, and keeps only Epic-or-better finds; duplicates found while away pay 15% of their gold.

## What the old numbers did

Six hours of the bot's play under the old numbers:

- The combat tab was maxed in the fourth run (about 1.5 hours in), the luck tab in the fifth (about
  2 hours), and the squad was at level 57.
- Duplicates paid up to 17 times what kills did.
- A night away paid 22 billion gold: about 98 hours of play's worth.

Away paid 75% of the purse's growth rate, plus 40% a tier of Night Watch: 275% maxed, more than
playing.

## Now

Three seeds, 6 hours of play, 8 hours away after every hour, rebirthing a minute after the push:

| run | rebirth floor | length (min) | luck tab owned | combat tab owned |
| --- | --- | --- | --- | --- |
| 0 | 15 | 11 to 14 | 6 to 8% | 12 to 16% |
| 1 | 25 | 24 to 32 | 19 to 30% | 28 to 40% |
| 2 | 35 | 34 to 38 | 37 to 41% | 44 to 49% |
| 3 | 45 | 51 to 74 | 63 to 70% | 62 to 69% |
| 4 | 55 | 83 to 101 | 53 to 75% | 58 to 70% |

"Owned" means the share of the tab's tiers bought by the time of the rebirth.

- Runs get longer as they go deeper. Nothing is maxed by the time a rebirth opens; maxing a tab
  means staying and farming well past it.
- A night away pays about an hour of play, about two when the altar rolls something big.
- Purchases come every half minute to a minute and a half.

The bot plays every fight perfectly, so a person takes longer.

## Tuning

Everything is in `src/core/balance.ts`:

- `economy.runPriceGrowth`: how much dearer each run is (under 3.7 makes later runs quicker).
- `offline`: efficiency, Night Watch's share, the rolls and the duplicates' share.
- `roster.sellKills`: what duplicates pay.
- `dungeon.goldGrowth`, `goldPerKill`: the income curve.

tests/economy.test.ts holds the rules: every price scales per rebirth, a night away pays the fights'
rate (about an hour of it), the 8-hour cap, and duplicates worth a few kills.
