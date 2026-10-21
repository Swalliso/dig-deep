import { DRILL_TILES_PER_COAL, PLAYER_HEIGHT, PLAYER_WIDTH, ROPE_LENGTH, TILE_SIZE } from '../config';
import type { Player } from '../entities/player';
import { isSolid, Tile, tileDef } from '../world/tiles';
import type { World } from '../world/world';
import { inReach } from './mining';

// Phase 16's tools: what a bomb's blast breaks and whom it hurts, where a rope coil hangs (or
// what it adds to a rope), what cutting a rope rolls up, how a rope unrolls into new air, and the
// drill's fuel. Plain functions over the world, so they're tested without the game.

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
// A rope is a column of rope tiles, and nothing about it is saved but its tiles: a rope `length`
// tiles long took ropeCoils(length) coils, and rolls back up into exactly that many.

/** What a rope coil used at a spot would do: hang a new rope there, or add to the rope there. */
export interface RopePlan {
  /** The first tile it unrolls: the spot itself, or when it extends a rope, the tile under that rope's end. */
  from: number;
  /** Rope ladder tiles it unrolls from there down (1..ROPE_LENGTH, plus any slack of the rope it extends). */
  length: number;
  /** Open tiles left under its end before something to land on (counted up to `ROPE_PREVIEW_BELOW`). */
  below: number;
  /** The length of the rope it extends, or 0 for a new rope. */
  extending: number;
  /** The length of a rope whose top it lands on, which it joins (they count as one rope), or 0. */
  joins: number;
  /** Coils it takes: 1, or 0 when the rope it makes needs no more coils than the ones it joins took (it uses their slack). */
  coils: number;
}

/** How far under a rope's end the preview looks for the floor. */
export const ROPE_PREVIEW_BELOW = 60;

/** Coils a rope `length` tiles long took, and rolls back up into: one per ROPE_LENGTH tiles, rounded up. */
export function ropeCoils(length: number): number {
  return Math.ceil(length / ROPE_LENGTH);
}

/** Open air tiles in a row from (tx, ty) down, counted up to `most`. */
function openBelow(world: World, tx: number, ty: number, most: number): number {
  let n = 0;
  while (n < most && world.inBounds(tx, ty + n) && world.getTile(tx, ty + n) === Tile.Air) n++;
  return n;
}

/** The top and bottom rows of the rope ladder through (tx, ty). */
export function ropeSpan(world: World, tx: number, ty: number): { top: number; end: number } {
  let top = ty;
  while (world.getTile(tx, top - 1) === Tile.Rope) top--;
  let end = ty;
  while (world.getTile(tx, end + 1) === Tile.Rope) end++;
  return { top, end };
}

/**
 * Can a rope hang from (tx, ty)? Something holds its top: a solid tile, platform or beam right
 * above it, or a solid tile beside it (the lip of a shaft).
 */
export function ropeAnchored(world: World, tx: number, ty: number): boolean {
  const above = tileDef(world.getTile(tx, ty - 1));
  return above.solid || above.oneWay === true || above.support !== undefined || isSolid(world.getTile(tx - 1, ty)) || isSolid(world.getTile(tx + 1, ty));
}

/**
 * What a rope coil used at (tx, ty) would do, or null if it can't: the spot must be in reach. On
 * a rope, or in the open spot right under a rope's end, it extends that rope (see ropeExtension).
 * Otherwise the spot must be open air with something to hang from (see ropeAnchored), and a new
 * rope unrolls from it straight down through open air, up to ROPE_LENGTH tiles.
 */
export function ropePlan(world: World, player: Player, tx: number, ty: number): RopePlan | null {
  if (!world.inBounds(tx, ty) || !inReach(player, tx, ty)) return null;
  const tile = world.getTile(tx, ty);
  if (tile === Tile.Rope) return ropeExtension(world, tx, ty);
  if (tile !== Tile.Air) return null;
  if (world.getTile(tx, ty - 1) === Tile.Rope) return ropeExtension(world, tx, ty - 1);
  return ropeAnchored(world, tx, ty) ? unrollPlan(world, tx, ty, ROPE_LENGTH, 0) : null;
}

/**
 * What one more coil does for the rope ladder through (tx, ty): it unrolls from under the rope's
 * end (which may be far out of reach), straight down through open air, up to ROPE_LENGTH tiles
 * plus the rope's slack, so the rope always counts as ropeCoils(its length) coils. Null if
 * there's no open air under its end: it already reaches the floor.
 */
export function ropeExtension(world: World, tx: number, ty: number): RopePlan | null {
  const { top, end } = ropeSpan(world, tx, ty);
  const length = end - top + 1;
  return unrollPlan(world, tx, end + 1, ropeSlack(length) + ROPE_LENGTH, length);
}

/**
 * Unrolling up to `most` tiles from (tx, from) down through open air, onto a rope `extending`
 * tiles long (0: a new rope). Landing on another rope's top joins that rope too. The coils it
 * takes are whatever the joined rope counts beyond the ropes it joins, so the column of rope
 * always counts as ropeCoils of its length. (That's 0 or 1, except when the rope it extends
 * still had slack over open air and joins another one: then it takes none, though the joined
 * rope counts a coil fewer than the two did. Slack unrolls into open air at once, so that
 * hardly happens.)
 */
function unrollPlan(world: World, tx: number, from: number, most: number, extending: number): RopePlan | null {
  const length = openBelow(world, tx, from, most);
  if (length === 0) return null;
  const end = from + length;
  const joins = world.getTile(tx, end) === Tile.Rope ? ropeSpan(world, tx, end).end - end + 1 : 0;
  const below = joins > 0 ? 0 : openBelow(world, tx, end, ROPE_PREVIEW_BELOW);
  const coils = Math.max(0, ropeCoils(extending + length + joins) - ropeCoils(extending) - ropeCoils(joins));
  return { from, length, below, extending, joins, coils };
}

/** Unroll a rope ladder `length` tiles down from (tx, ty). */
export function hangRope(world: World, tx: number, ty: number, length: number): void {
  for (let i = 0; i < length; i++) world.setTile(tx, ty + i, Tile.Rope);
}

/**
 * A rope tile at (tx, ty) was just cut (broken): the part above the cut keeps hanging, and the
 * part below rolls up. Returns how many coils come free: the whole rope (counting the cut tile)
 * took ropeCoils of its length, and the part above keeps ropeCoils of its own, so a cut never
 * gives back more coils than the rope took. Cutting the top tile rolls all of it up. A cut
 * partway down a coil leaves the rest of that coil with the part above as slack, and the cut
 * opened the tile under its end, so it unrolls back down into the gap (see RopeSlack).
 */
export function cutRope(world: World, tx: number, ty: number): number {
  let above = 0;
  while (world.getTile(tx, ty - 1 - above) === Tile.Rope) above++;
  let below = 0;
  for (let y = ty + 1; world.getTile(tx, y) === Tile.Rope; y++) {
    world.setTile(tx, y, Tile.Air);
    below++;
  }
  return ropeCoils(above + 1 + below) - ropeCoils(above);
}

/** Tiles of rope still rolled up on a rope `length` tiles long: the coils it took hold this much more. */
export function ropeSlack(length: number): number {
  return ropeCoils(length) * ROPE_LENGTH - length;
}

/**
 * If a rope's bottom end is right above (tx, ty) and that tile is open air, the rope unrolls down
 * into the open from there, up to its slack (see ropeSlack). Its length still rolls back up into
 * the coils it took. Returns how many tiles it unrolled.
 */
export function unrollSlack(world: World, tx: number, ty: number): number {
  if (world.getTile(tx, ty) !== Tile.Air || world.getTile(tx, ty - 1) !== Tile.Rope) return 0;
  const { top } = ropeSpan(world, tx, ty - 1);
  const more = openBelow(world, tx, ty, ropeSlack(ty - top));
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

/**
 * What the cursor says before a rope coil is used: "Rope ladder: 20 m, ends 7 m above the floor"
 * for a new rope, "Rope ladder: 40 m (+20 m), reaches the floor" for one it extends.
 */
export function ropePlanText(plan: RopePlan): string {
  const end =
    plan.joins > 0 ? 'joins the rope below' : plan.below === 0 ? 'reaches the floor' : plan.below >= ROPE_PREVIEW_BELOW ? `the drop goes on past its end` : `ends ${plan.below} m above the floor`;
  const length = plan.extending > 0 ? `${plan.extending + plan.length} m (+${plan.length} m)` : `${plan.length} m`;
  return `Rope ladder: ${length}, ${end}`;
}

/** Why a rope coil used on a rope does nothing (see ropeExtension). */
export const ROPE_AT_FLOOR = 'The rope already reaches the floor';

// --- The drill ---

/** Tiles the drill can still break: what's left of the coal burning now, plus every carried coal's worth. */
export function drillTilesLeft(charge: number, coal: number): number {
  return charge + coal * DRILL_TILES_PER_COAL;
}
