/** Each class's little picture (the keepers' cards, the squad's cards in the dungeon). */
import type { ClassId } from '../core/knights';
import type { IconName } from './px';

export const CLASS_ICON: Record<ClassId, IconName> = {
  guardian: 'shield',
  blade: 'sword',
  ranger: 'target',
  cleric: 'heart',
  arcanist: 'bolt',
  lancer: 'lance',
};
