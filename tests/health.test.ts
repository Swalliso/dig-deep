import { describe, expect, it } from 'vitest';
import { HURT_PROTECTION, MAX_HEALTH, REACH, REGEN_DELAY, REGEN_INTERVAL, RESPAWN_PROTECTION, SAFE_FALL_TILES, TILE_SIZE } from '../src/config';
import { Player } from '../src/entities/player';
import { fallDamage, Health } from '../src/systems/health';
import { inReach } from '../src/systems/mining';
import { BASE_STATS, computeStats } from '../src/systems/stats';

describe('health', () => {
  it('starts full and loses HP when hurt, dying at 0', () => {
    const health = new Health(MAX_HEALTH);
    expect(health.hurt(3, 0, 'normal')).toBe('hurt');
    expect(health.hp).toBe(MAX_HEALTH - 3);
    expect(health.hurt(99, 10, 'normal')).toBe('died');
    expect(health.hp).toBe(0);
    expect(health.hurt(1, 20, 'normal')).toBe('ignored'); // already dead
  });

  it('ignores rapid repeated hits during hurt protection, whatever caused them', () => {
    const health = new Health(MAX_HEALTH);
    health.hurt(2, 0, 'normal');
    // Ten hits in the same instant and across the protection window: only the first counted.
    for (let i = 0; i < 10; i++) expect(health.hurt(5, (i / 10) * HURT_PROTECTION * 0.99, 'normal')).toBe('ignored');
    expect(health.hp).toBe(MAX_HEALTH - 2);
    expect(health.isProtected(HURT_PROTECTION - 0.01)).toBe(true);
    expect(health.hurt(2, HURT_PROTECTION, 'normal')).toBe('hurt');
    expect(health.hp).toBe(MAX_HEALTH - 4);
  });

  it('takes no damage in a Cozy world or in god mode', () => {
    const cozy = new Health(MAX_HEALTH);
    expect(cozy.hurt(99, 0, 'cozy')).toBe('ignored');
    expect(cozy.hp).toBe(MAX_HEALTH);
    const god = new Health(MAX_HEALTH);
    god.god = true;
    expect(god.hurt(99, 0, 'normal')).toBe('ignored');
    expect(god.hp).toBe(MAX_HEALTH);
  });

  it(`regenerates 1 HP every ${REGEN_INTERVAL} s once ${REGEN_DELAY} s pass without damage`, () => {
    const health = new Health(MAX_HEALTH);
    health.hurt(5, 100, 'normal');
    health.update(100 + REGEN_DELAY - 0.01, MAX_HEALTH);
    expect(health.hp).toBe(MAX_HEALTH - 5);
    health.update(100 + REGEN_DELAY, MAX_HEALTH);
    expect(health.hp).toBe(MAX_HEALTH - 4);
    health.update(100 + REGEN_DELAY + REGEN_INTERVAL, MAX_HEALTH);
    expect(health.hp).toBe(MAX_HEALTH - 3);
    // Another hit restarts the delay.
    health.hurt(1, 100 + REGEN_DELAY + REGEN_INTERVAL + 1, 'normal');
    health.update(100 + 2 * REGEN_DELAY + REGEN_INTERVAL, MAX_HEALTH);
    expect(health.hp).toBe(MAX_HEALTH - 4);
    // And it stops at full.
    health.update(10_000, MAX_HEALTH);
    expect(health.hp).toBe(MAX_HEALTH);
  });

  it('is protected for a while after respawning, so it cannot chain into another death', () => {
    const health = new Health(MAX_HEALTH);
    health.hurt(MAX_HEALTH, 50, 'normal');
    health.refill(MAX_HEALTH, 50, RESPAWN_PROTECTION);
    expect(health.hp).toBe(MAX_HEALTH);
    expect(health.hurt(MAX_HEALTH, 50 + RESPAWN_PROTECTION - 0.01, 'normal')).toBe('ignored');
    expect(health.hurt(1, 50 + RESPAWN_PROTECTION, 'normal')).toBe('hurt');
  });

  it('round-trips through a save, and never loads dead', () => {
    const health = new Health(MAX_HEALTH);
    health.hurt(3, 12, 'normal');
    const back = Health.fromSave(structuredClone(health.saved()), MAX_HEALTH);
    expect(back.saved()).toEqual(health.saved());
    expect(Health.fromSave(undefined, MAX_HEALTH).hp).toBe(MAX_HEALTH);
    expect(Health.fromSave({ hp: 'lots' }, MAX_HEALTH).hp).toBe(MAX_HEALTH);
    expect(Health.fromSave({ hp: 0, protectedUntil: 0, regenAt: 0 }, MAX_HEALTH).hp).toBe(1);
    expect(Health.fromSave({ hp: 400 }, MAX_HEALTH).hp).toBe(MAX_HEALTH);
  });
});

describe('fall damage', () => {
  it(`is free up to ${SAFE_FALL_TILES} tiles and grows past that`, () => {
    expect(fallDamage(4, SAFE_FALL_TILES)).toBe(0); // a jump
    expect(fallDamage(10, SAFE_FALL_TILES)).toBe(0);
    expect(fallDamage(SAFE_FALL_TILES, SAFE_FALL_TILES)).toBe(0);
    expect(fallDamage(SAFE_FALL_TILES + 0.5, SAFE_FALL_TILES)).toBe(1);
    expect(fallDamage(20, SAFE_FALL_TILES)).toBe(4);
    expect(fallDamage(40, SAFE_FALL_TILES)).toBeGreaterThanOrEqual(MAX_HEALTH);
  });
});

describe('player stats', () => {
  it('start from the config values', () => {
    expect(computeStats()).toEqual(BASE_STATS);
    expect(BASE_STATS.maxHealth).toBe(MAX_HEALTH);
    expect(BASE_STATS.safeFallTiles).toBe(SAFE_FALL_TILES);
    expect(BASE_STATS.reach).toBe(REACH);
  });

  it('add modifiers from gear and boons', () => {
    const stats = computeStats([{ reach: 2 }, { maxHealth: 4, reach: 1 }]);
    expect(stats.reach).toBe(REACH + 3);
    expect(stats.maxHealth).toBe(MAX_HEALTH + 4);
    expect(stats.runSpeed).toBe(BASE_STATS.runSpeed);
  });

  it('drive reach checks', () => {
    const player = new Player(10, 10);
    const tx = Math.floor(player.centerX / TILE_SIZE) + REACH + 2;
    const ty = Math.floor(player.centerY / TILE_SIZE);
    expect(inReach(player, tx, ty)).toBe(false);
    player.stats = computeStats([{ reach: 3 }]);
    expect(inReach(player, tx, ty)).toBe(true);
  });
});
