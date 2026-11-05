/**
 * A knight's class at a glance: its icon and name on a band in the class's own color, and what it
 * does in the squad (Tank, Healer...). Used where knights sit in slots and on their cards.
 */
import type { CSSProperties } from 'react';
import { CLASSES, type ClassId } from '../core/knights';
import { CLASS_ICON } from './classIcons';
import { Px } from './px';

/** Each class's color in the UI: strong enough to carry white letters. */
export const CLASS_TINT: Record<ClassId, string> = {
  guardian: '#3e6fb0',
  blade: '#b8423a',
  ranger: '#3a8a3a',
  cleric: '#b88a1e',
  arcanist: '#7a4fc8',
  lancer: '#c8662a',
};

/** The band: icon, CLASS, and (unless `short`) its role. */
export function ClassTag({ cls, short, style }: { cls: ClassId; short?: boolean; style?: CSSProperties }) {
  const c = CLASSES[cls];
  return (
    <span className="class-tag" style={{ ['--cc' as string]: CLASS_TINT[cls], ...style } as CSSProperties} title={`${c.name}: ${c.roleName}`}>
      <Px icon={CLASS_ICON[cls]} size="xs" />
      <b>{c.name.toUpperCase()}</b>
      {!short && <small>{c.roleName}</small>}
    </span>
  );
}
