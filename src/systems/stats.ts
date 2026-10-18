import { DROP_PULL_RANGE, GRAVITY, HEAT_HURT_INTERVAL, JUMP_VELOCITY, MAX_HEALTH, REACH, RUN_SPEED, SAFE_FALL_TILES, STATION_RANGE, TILE_SIZE } from '../config';

// The player's stats: base values from config.ts, plus whatever equipment (Phase 16's gear) and
// boons (Descent) add. Code reads these instead of the config constants, so gear and boons only
// have to add a modifier here.

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
  /** Tiles of carried light around the player (the miner's helmet), 0 for none. */
  lightRadius: number;
  /** Seconds between burns once a hot zone's grace is used up. */
  heatHurtInterval: number;
  /** Above 0, the player can slide down and cling to walls (climbing claws). */
  wallGrip: number;
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
  lightRadius: 0,
  heatHurtInterval: HEAT_HURT_INTERVAL,
  wallGrip: 0,
};

/** The base stats with every modifier added. */
export function computeStats(modifiers: readonly StatModifier[] = []): PlayerStats {
  const stats = { ...BASE_STATS };
  for (const modifier of modifiers) {
    for (const key of Object.keys(modifier) as (keyof PlayerStats)[]) stats[key] += modifier[key] ?? 0;
  }
  return stats;
}

/** How high a full jump lifts the feet, in tiles. */
export function jumpHeight(stats: PlayerStats): number {
  return stats.jumpVelocity ** 2 / (2 * GRAVITY) / TILE_SIZE;
}

/** One line per stat that gear changes, for the inventory panel and tooltips. */
export interface StatLine {
  /** 'Reach', 'Jump'... */
  label: string;
  /** The value as shown: '6.5 tiles', 'none'. */
  text: string;
  /** Not the base value (gear changed it). */
  changed: boolean;
}

const tiles = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1)} tile${n === 1 ? '' : 's'}`;

/** What each stat the gear touches reads as, in panel order. Labels are short: the panel fits two columns. */
const STAT_TEXT: { key: keyof PlayerStats; label: string; text: (stats: PlayerStats) => string }[] = [
  { key: 'reach', label: 'Reach', text: (s) => tiles(s.reach) },
  { key: 'stationRange', label: 'Stations', text: (s) => tiles(s.stationRange) },
  { key: 'dropPullRange', label: 'Pickup', text: (s) => tiles(s.dropPullRange) },
  { key: 'jumpVelocity', label: 'Jump', text: (s) => tiles(Math.round(jumpHeight(s) * 10) / 10) },
  { key: 'safeFallTiles', label: 'Safe fall', text: (s) => tiles(s.safeFallTiles) },
  { key: 'lightRadius', label: 'Light', text: (s) => (s.lightRadius > 0 ? tiles(s.lightRadius) : 'none') },
  { key: 'heatHurtInterval', label: 'Heat burns', text: (s) => `every ${s.heatHurtInterval} s` },
  { key: 'wallGrip', label: 'Walls', text: (s) => (s.wallGrip > 0 ? 'slide, cling' : 'no grip') },
];

/** Every stat gear can change, as the panel shows it. */
export function statLines(stats: PlayerStats): StatLine[] {
  return STAT_TEXT.map(({ key, label, text }) => ({ label, text: text(stats), changed: stats[key] !== BASE_STATS[key] }));
}

/** The stats that differ between `before` and `after`, as "reach 5 tiles → 6.5 tiles". */
export function statChanges(before: PlayerStats, after: PlayerStats): string[] {
  return STAT_TEXT.filter(({ key }) => before[key] !== after[key]).map(({ label, text }) => `${label.toLowerCase()} ${text(before)} → ${text(after)}`);
}
