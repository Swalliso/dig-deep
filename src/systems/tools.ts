import { DRILL_TILES_PER_COAL, PLAYER_HEIGHT, PLAYER_WIDTH, ROPE_LENGTH, TILE_SIZE } from '../config';
import type { Player } from '../entities/player';
import { isSolid, Tile, tileDef } from '../world/tiles';
import type { World } from '../world/world';
import { inReach } from './mining';

// Phase 16's tools: what a bomb's blast breaks and whom it hurts, where a rope coil hangs, how
// a rope rolls back up and unrolls into new air, and the drill's fuel. Plain functions over the world, so they're tested
// without the game.

// --- Bombs ---

/**
 * The tiles a blast centred on tile (tx, ty) breaks: the 3 x 3 around it, top row first, minus
 * empty tiles, lava, anything unbreakable (bedrock) and anything `tier` (the thrower's best
 * pickaxe) can't mine.
 */
export function blastTiles(world: World, tx: number, ty: number, tier: number): [number, number][] {
  const tiles: [number, number][] = [];
  for (let y = ty - 1; y <= ty + 1; y++) {
    for (let x = tx - 1; x <= tx + 1; x++) if (blastBreaks(world, x, y, tier)) tiles.push([x, y]);
  }
  return tiles;
}

/** Would a blast break (x, y), for a thrower whose best pickaxe is `tier`? */
export function blastBreaks(world: World, x: number, y: number, tier: number): boolean {
  if (!world.inBounds(x, y)) return false;
  const def = tileDef(world.getTile(x, y));
  return def.id !== Tile.Air && !def.liquid && Number.isFinite(def.hardness) && def.minTier <= tier;
}

/** Does a blast centred on tile (tx, ty) hurt a player with its top-left at (x, y)? Anywhere in the 5 x 5 around it. */
export function blastHits(tx: number, ty: number, x: number, y: number): boolean {
  const left = (tx - 2) * TILE_SIZE;
  const top = (ty - 2) * TILE_SIZE;
  const size = 5 * TILE_SIZE;
  return x < left + size && x + PLAYER_WIDTH > left && y < top + size && y + PLAYER_HEIGHT > top;
}

// --- Rope coils ---

/** What a rope coil hung at a spot would do. */
export interface RopePlan {
  /** Rope ladder tiles it unrolls, from the spot down (1..ROPE_LENGTH). */
  length: number;
  /** Open tiles left under its end before something to land on (counted up to `ROPE_PREVIEW_BELOW`). */
  below: number;
}

/** How far under a rope's end the preview looks for the floor. */
export const ROPE_PREVIEW_BELOW = 60;

/**
 * Can a rope hang from (tx, ty)? Something holds its top: a solid tile, platform or beam right
 * above it, or a solid tile beside it (the lip of a shaft).
 */
export function ropeAnchored(world: World, tx: number, ty: number): boolean {
  const above = tileDef(world.getTile(tx, ty - 1));
  return above.solid || above.oneWay === true || above.support !== undefined || isSolid(world.getTile(tx - 1, ty)) || isSolid(world.getTile(tx + 1, ty));
}

/**
 * What a rope coil used at (tx, ty) would unroll, or null if it can't hang there: the spot must
 * be open air in reach with something to hang from (see ropeAnchored). It unrolls straight down
 * through open air, up to ROPE_LENGTH tiles.
 */
export function ropePlan(world: World, player: Player, tx: number, ty: number): RopePlan | null {
  if (!world.inBounds(tx, ty) || world.getTile(tx, ty) !== Tile.Air || !inReach(player, tx, ty) || !ropeAnchored(world, tx, ty)) return null;
  let length = 0;
  while (length < ROPE_LENGTH && world.inBounds(tx, ty + length) && world.getTile(tx, ty + length) === Tile.Air) length++;
  let below = 0;
  while (below < ROPE_PREVIEW_BELOW && world.inBounds(tx, ty + length + below) && world.getTile(tx, ty + length + below) === Tile.Air) below++;
  return { length, below };
}

/** Unroll a rope ladder `length` tiles down from (tx, ty). */
export function hangRope(world: World, tx: number, ty: number, length: number): void {
  for (let i = 0; i < length; i++) world.setTile(tx, ty + i, Tile.Rope);
}

/**
 * A rope tile at (tx, ty) was just broken: roll up the rest of its rope (every rope tile joined
 * to it above and below). Returns how many coils that gives back: one per ROPE_LENGTH tiles,
 * rounded up, counting the broken tile, so a rope always gives back at least the coils it took
 * and never more.
 */
export function rollUpRope(world: World, tx: number, ty: number): number {
  let length = 1;
  for (const dir of [-1, 1]) {
    for (let y = ty + dir; world.getTile(tx, y) === Tile.Rope; y += dir) {
      world.setTile(tx, y, Tile.Air);
      length++;
    }
  }
  return Math.ceil(length / ROPE_LENGTH);
}

/**
 * Tiles of rope still rolled up on a rope `length` tiles long: it took ceil(length / ROPE_LENGTH)
 * coils, and that many coils hold this much more.
 */
export function ropeSlack(length: number): number {
  return Math.ceil(length / ROPE_LENGTH) * ROPE_LENGTH - length;
}

/**
 * If a rope's bottom end is right above (tx, ty) and that tile is open air, the rope unrolls down
 * into the open from there, up to its slack (see ropeSlack). Its length still rolls back up into
 * the coils it took. Returns how many tiles it unrolled.
 */
export function unrollSlack(world: World, tx: number, ty: number): number {
  if (world.getTile(tx, ty) !== Tile.Air || world.getTile(tx, ty - 1) !== Tile.Rope) return 0;
  let length = 0;
  for (let y = ty - 1; world.getTile(tx, y) === Tile.Rope; y--) length++;
  const slack = ropeSlack(length);
  let more = 0;
  while (more < slack && world.inBounds(tx, ty + more) && world.getTile(tx, ty + more) === Tile.Air) more++;
  hangRope(world, tx, ty, more);
  return more;
}

/**
 * Ropes unroll into new air: when the tile under a rope's bottom end opens up (dug out, fallen
 * away, blown up), the rope unrolls down into it, up to its slack. Tile changes queue those
 * spots, and update() unrolls up to a budget of them per step. Nothing needs saving: the slack
 * follows from the rope's length.
 */
export class RopeSlack {
  private readonly world: World;
  /** Spots under a rope's end that opened up, as ty * width + tx. */
  private readonly queued = new Set<number>();

  constructor(world: World) {
    this.world = world;
    world.onTileChange((tx, ty) => {
      if (world.getTile(tx, ty) === Tile.Air && world.getTile(tx, ty - 1) === Tile.Rope) this.queued.add(ty * world.width + tx);
    });
  }

  /** Spots waiting to be checked. */
  get size(): number {
    return this.queued.size;
  }

  /** Unroll up to `budget` of the waiting ropes. Returns where each one that unrolled now ends. */
  update(budget: number): { tx: number; ty: number }[] {
    const { world } = this;
    const unrolled: { tx: number; ty: number }[] = [];
    let done = 0;
    for (const key of this.queued) {
      if (done++ >= budget) break;
      this.queued.delete(key);
      const tx = key % world.width;
      const ty = Math.floor(key / world.width);
      const more = unrollSlack(world, tx, ty);
      if (more > 0) unrolled.push({ tx, ty: ty + more - 1 });
    }
    return unrolled;
  }
}

/** "Rope ladder: 20 m, ends 7 m above the floor": what the cursor says before a rope coil is used. */
export function ropePlanText(plan: RopePlan): string {
  const end = plan.below === 0 ? 'reaches the floor' : plan.below >= ROPE_PREVIEW_BELOW ? `the drop goes on past its end` : `ends ${plan.below} m above the floor`;
  return `Rope ladder: ${plan.length} m, ${end}`;
}

// --- The drill ---

/** Tiles the drill can still break: what's left of the coal burning now, plus every carried coal's worth. */
export function drillTilesLeft(charge: number, coal: number): number {
  return charge + coal * DRILL_TILES_PER_COAL;
}
