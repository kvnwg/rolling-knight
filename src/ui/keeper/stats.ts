/**
 * What each upgrade line adds up to, as an icon and a short number for its card ("+45%" by a clover,
 * "2.4s" by a clock, "1/7" by a star): the words are in the line's details (upgradeTree.ts effectAt),
 * shown when its card is tapped.
 */
import { BAL } from '../../core/balance';
import { chanceFx, skillRollLuck } from '../../core/chance';
import { luckyEvery, luckyMult } from '../../core/luck';
import { drySpell, reelCount, spinCycle } from '../../core/roller';
import type { GameState } from '../../core/state';
import { pctText } from '../../core/upgradeTree';
import { upgradeFx, type UpgradeId } from '../../core/upgrades';
import type { IconName } from '../px';

export interface Stat {
  icon: IconName;
  text: string;
}

const x2 = (v: number) => `x${Math.round(v * 100) / 100}`;

/** A line's numbers with `level` tiers owned (everything else as it is): one stat, two for Quick Roll. */
export function upgradeStats(state: GameState, id: UpgradeId, level: number): Stat[] {
  const st = { ...state, upgrades: { ...state.upgrades, [id]: Math.max(0, level) } } as GameState;
  const fx = upgradeFx(st);
  const ch = chanceFx(st);
  const on = level > 0;
  switch (id) {
    case 'luck':
    case 'horseshoe':
      return [{ icon: 'clover', text: `+${Math.round(fx.luck * 100)}%` }];
    case 'spinSpeed':
      return [{ icon: 'clock', text: `${spinCycle(st).toFixed(1)}s` }];
    case 'sands':
      return [{ icon: 'hourglass', text: pctText(ch.sands) }];
    case 'luckySpin':
      return [{ icon: 'star', text: `1/${luckyEvery(st)}` }];
    case 'luckyStreak':
      return [{ icon: 'star', text: x2(luckyMult(st)) }];
    case 'goldenWheel':
    case 'goldenSpin':
      return [{ icon: 'reelGold', text: pctText(fx.goldenChance) }];
    case 'turbo':
      return [{ icon: 'hourglass', text: x2(BAL.roll.turboSpeedMult + fx.turboPower) }];
    case 'extraReel':
      return [{ icon: 'reel', text: `${reelCount(st)}` }];
    case 'alchemy':
    case 'philosopher':
      return [{ icon: 'gem', text: x2(fx.mutationMult) }];
    case 'pity':
      return [{ icon: 'shield', text: `${drySpell(st)}` }];
    case 'loadedDice':
      return [{ icon: 'dice', text: x2(skillRollLuck(st)) }];
    case 'greed':
    case 'treasury':
      return [{ icon: 'coin', text: `+${fx.goldPct}%` }];
    case 'coinShower':
      return [{ icon: 'coin', text: pctText(ch.coinShower) }];
    case 'jackpot':
      return [{ icon: 'star', text: pctText(ch.jackpot) }];
    case 'potionTime':
      return [{ icon: 'potion', text: `${BAL.luck.potionSeconds + fx.potionSeconds}s` }];
    case 'offline':
      return [{ icon: 'clock', text: `${Math.round((BAL.offline.efficiency + fx.offlineEff) * 100)}%` }];
    case 'might':
    case 'excalibur':
      return [{ icon: 'sword', text: `+${fx.atkPct}%` }];
    case 'vitality':
    case 'dragonscale':
      return [{ icon: 'heart', text: `+${fx.hpPct}%` }];
    case 'swiftness':
      return [{ icon: 'boot', text: `+${fx.speedPct}%` }];
    case 'quickRoll':
      return [
        { icon: 'dice', text: `-${fx.rollSpinPct}%` },
        { icon: 'clock', text: `-${fx.skillCdPct}%` },
      ];
    case 'giantSlayer':
      return [{ icon: 'skull', text: `+${pctText(ch.giantSlayer)}` }];
    case 'lifesteal':
      return [{ icon: 'drop', text: pctText(ch.lifesteal) }];
    case 'luckyStrike':
      return [{ icon: 'dice', text: pctText(ch.luckyStrike) }];
    case 'doubleOrNothing':
      return [{ icon: 'dice', text: pctText(ch.coinFlip) }];
    case 'twoHeaded':
      return [{ icon: 'coin', text: on ? '2/3' : '1/2' }];
    case 'ricochet':
      return [{ icon: 'dice', text: pctText(ch.ricochet) }];
    case 'wildMagic':
      return [{ icon: 'dice', text: pctText(ch.wildMagic) }];
    case 'ladyLuck':
      return [{ icon: 'clover', text: on ? 'x1.25' : 'x1' }];
    case 'secondWind':
      return [{ icon: 'heart', text: pctText(ch.secondWind) }];
    case 'butterfingers':
      return [{ icon: 'dice', text: pctText(ch.butterfingers) }];
    case 'pratfall':
      return [{ icon: 'dice', text: `${pctText(ch.pratfall)}/s` }];
  }
}
