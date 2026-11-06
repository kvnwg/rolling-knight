/**
 * A new game's altar is sealed (ui/fx/AltarSeal.tsx breaks it): it doesn't spin until the seal is
 * broken, then it spins as ever; a save from before the seal never has one.
 */
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/newGame';
import { mend } from '../src/core/save';
import { Game } from '../src/game';

describe('the sealed altar', () => {
  it('spins only once its seal is broken', () => {
    const g = new Game(true);
    g.state.roll.sealed = true;
    for (let i = 0; i < 200; i++) g.tick(0.05);
    expect(g.state.roll.count).toBe(0);
    expect(g.state.roll.current).toBeNull();
    expect(Object.keys(g.state.roster)).toHaveLength(0);
    g.breakSeal();
    expect(g.state.roll.sealed).toBe(false);
    for (let i = 0; i < 200; i++) g.tick(0.05);
    expect(g.state.roll.count).toBeGreaterThan(0);
    expect(Object.keys(g.state.roster).length).toBeGreaterThan(0);
  });

  it('starts sealed on a new game from Settings, and stays broken in a save', () => {
    const g = new Game(true);
    g.reset();
    expect(g.state.roll.sealed).toBe(true);
    g.breakSeal();
    const back = mend(JSON.parse(JSON.stringify(g.state)));
    expect(!!back.roll.sealed).toBe(false);
    // An older save (no seal in it) is never sealed; nor is a game the tools and tests make.
    const old = JSON.parse(JSON.stringify(newGame(3)));
    delete old.roll.sealed;
    expect(!!mend(old).roll.sealed).toBe(false);
    expect(!!new Game(true).state.roll.sealed).toBe(false);
  });
});
