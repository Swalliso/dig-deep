import { DROP_PULL_RANGE, JUMP_VELOCITY, MAX_HEALTH, REACH, RUN_SPEED, SAFE_FALL_TILES, STATION_RANGE } from '../config';

// The player's stats: base values from config.ts, plus whatever equipment (Phase 15) and boons
// (Descent) add. Code reads these instead of the config constants, so gear and boons only have
// to add a modifier here.

export interface PlayerStats {
  /** HP when full. */
  maxHealth: number;
  /** Tiles a fall can be without hurting. */
  safeFallTiles: number;
  /** Tiles from the player's centre to a tile's centre that can be mined, built or used. */
  reach: number;
  /** Tiles to a workbench, furnace or chest that crafting and quick stack can use. */
  stationRange: number;
  /** Tiles within which drops fly to the player. */
  dropPullRange: number;
  /** px/s */
  runSpeed: number;
  /** px/s upward at the start of a jump. */
  jumpVelocity: number;
}

/** Something that changes stats (a piece of gear, a boon): amounts added to the base values. */
export type StatModifier = Partial<PlayerStats>;

export const BASE_STATS: Readonly<PlayerStats> = {
  maxHealth: MAX_HEALTH,
  safeFallTiles: SAFE_FALL_TILES,
  reach: REACH,
  stationRange: STATION_RANGE,
  dropPullRange: DROP_PULL_RANGE,
  runSpeed: RUN_SPEED,
  jumpVelocity: JUMP_VELOCITY,
};

/** The base stats with every modifier added. */
export function computeStats(modifiers: readonly StatModifier[] = []): PlayerStats {
  const stats = { ...BASE_STATS };
  for (const modifier of modifiers) {
    for (const key of Object.keys(modifier) as (keyof PlayerStats)[]) stats[key] += modifier[key] ?? 0;
  }
  return stats;
}
