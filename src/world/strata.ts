import {
  BANNER_HYSTERESIS,
  BEDROCK_BOTTOM_ROWS,
  DAMP_FADE_ROWS,
  DAMP_TORCH_LIGHT,
  FLOAT_RADIUS,
  STRATA_GEN,
  STRATA_LOOKS,
  SURFACE_LEVEL,
  TORCH_LIGHT,
  WORLD_HEIGHT,
  type AmbienceId,
  type StratumLook,
} from '../config';
import { Tile, type TileId } from './tiles';
import type { World } from './world';

// Strata (Phase 14a): the depth bands of a strata world, each with its own rock, ores, look and
// ambient sound, and (Phase 14b) its rule: damp air dims torches in the Fungal Hollows, floatstone
// lowers gravity in the Geode Depths' caverns, and the Magma Layer has hot zones (world/heat.ts).
// Worlds made with an older generation profile have no strata (world.strataTops is empty).

/** One stratum: a depth band with its own rock, ores, look and sound. */
export interface Stratum {
  name: string;
  /** Nominal depth band in m below SURFACE_LEVEL; each boundary wanders a little per column. */
  top: number;
  bottom: number;
  /** Its rock: ores of this stratum replace it, and it makes its own bricks. Topsoil is dirt. */
  rock: TileId;
  /** What's found there, for its entry banner. */
  finds: string;
  /**
   * Its rule (Phase 14b), for the entry banner's last line. Damp needs only strata; the others
   * come with what strata v2 generates (floatstone, hot rock and lava).
   */
  rule?: { text: string; needsDepths: boolean };
  ambience: AmbienceId;
  /** Behind caves and dug-out spaces; null keeps the dirt backdrop (Topsoil). */
  look: StratumLook | null;
}

/** The deepest depth (m) a player can dig to: the top of the bedrock floor. */
export const WORLD_BOTTOM_DEPTH = WORLD_HEIGHT - BEDROCK_BOTTOM_ROWS - SURFACE_LEVEL;

const [caverns, hollows, geode, magma] = STRATA_GEN.tops;

/** Top to bottom. An index into this is a stratum's number (0 = Topsoil). */
export const STRATA: readonly Stratum[] = [
  { name: 'Topsoil', top: 0, bottom: caverns, rock: Tile.Dirt, finds: 'Trees, dirt and stone', ambience: 'wind', look: null },
  { name: 'Stone Caverns', top: caverns, bottom: hollows, rock: Tile.Stone, finds: 'Coal and copper · loose gravel', ambience: 'drone', look: STRATA_LOOKS[0] },
  {
    name: 'Fungal Hollows',
    top: hollows,
    bottom: geode,
    rock: Tile.Mudstone,
    finds: 'Iron · glowshrooms · giant mushrooms',
    rule: { text: "Damp air: torches light less. Glowshrooms don't mind.", needsDepths: false },
    ambience: 'drips',
    look: STRATA_LOOKS[1],
  },
  {
    name: 'Geode Depths',
    top: geode,
    bottom: magma,
    rock: Tile.Deepstone,
    finds: 'Gold, rubies and sapphires · glow crystals',
    rule: { text: 'Floatstone in the great caverns: gravity is lighter near it', needsDepths: true },
    ambience: 'hum',
    look: STRATA_LOOKS[2],
  },
  {
    name: 'Magma Layer',
    top: magma,
    bottom: WORLD_BOTTOM_DEPTH,
    rock: Tile.Basalt,
    finds: 'Emberite',
    rule: { text: 'Heat near lava and hot rock burns. Bricks keep it out.', needsDepths: true },
    ambience: 'rumble',
    look: STRATA_LOOKS[3],
  },
];

/** Indices into STRATA of the strata with rules. */
export const HOLLOWS = 2;
export const GEODE = 3;
export const MAGMA = 4;

/**
 * The stratum (index into STRATA) at tile (tx, ty), or -1 in a world without strata. Anything
 * above the ground counts as Topsoil.
 */
export function stratumAt(world: World, tx: number, ty: number): number {
  const tops = world.strataTops;
  if (tops.length === 0) return -1;
  const x = Math.min(world.width - 1, Math.max(0, tx));
  let s = 0;
  while (s < tops.length && ty >= tops[s][x]) s++;
  return s;
}

/** First row of stratum `s` (1 and up) in column tx. */
export function stratumTopRow(world: World, s: number, tx: number): number {
  return world.strataTops[s - 1][Math.min(world.width - 1, Math.max(0, tx))];
}

/** "110–230 m", or "from 350 m" for the bottom stratum. */
export function depthRange(s: number): string {
  const { top, bottom } = STRATA[s];
  return bottom >= WORLD_BOTTOM_DEPTH ? `from ${top} m` : `${top}–${bottom} m`;
}

/**
 * The light a torch at (tx, ty) gives off: TORCH_LIGHT, or in the Fungal Hollows' damp air less,
 * fading in over the stratum's top DAMP_FADE_ROWS rows down to DAMP_TORCH_LIGHT.
 */
export function torchLight(world: World, tx: number, ty: number): number {
  if (stratumAt(world, tx, ty) !== HOLLOWS) return TORCH_LIGHT;
  const into = ty - stratumTopRow(world, HOLLOWS, tx) + 1;
  return Math.round(TORCH_LIGHT - (TORCH_LIGHT - DAMP_TORCH_LIGHT) * Math.min(1, into / DAMP_FADE_ROWS));
}

/** Is (tx, ty) within FLOAT_RADIUS tiles of a floatstone tile (centre to centre)? */
export function inFloatField(world: World, tx: number, ty: number): boolean {
  const r = FLOAT_RADIUS;
  for (let y = ty - r; y <= ty + r; y++) {
    for (let x = tx - r; x <= tx + r; x++) {
      if ((x - tx) ** 2 + (y - ty) ** 2 <= r * r && world.getTile(x, y) === Tile.Floatstone) return true;
    }
  }
  return false;
}

/** The entry banner's title: "Fungal Hollows — 110 m". */
export function bannerTitle(s: number): string {
  return `${STRATA[s].name} — ${STRATA[s].top} m`;
}

/**
 * Which stratum the player is in, for the entry banner and the ambience. It only changes once
 * the player is BANNER_HYSTERESIS tiles past a boundary, so walking along one doesn't flicker.
 */
export class StratumTracker {
  /** -1 in a world without strata. */
  current: number;

  constructor(world: World, tx: number, ty: number) {
    this.current = stratumAt(world, tx, ty);
  }

  /** Call with the player's tile; returns the stratum just entered, or null. */
  update(world: World, tx: number, ty: number): number | null {
    const above = stratumAt(world, tx, ty - BANNER_HYSTERESIS);
    const below = stratumAt(world, tx, ty + BANNER_HYSTERESIS);
    if (above !== below || above === this.current) return null;
    this.current = above;
    return above;
  }
}
