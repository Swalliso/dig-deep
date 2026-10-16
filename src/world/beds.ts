import { Tile, type TileId } from './tiles';
import type { World } from './world';

// Beds: two tiles side by side, the head on the left and the foot on the right, like a door
// laid on its side (see doors.ts). The player's bed is where they respawn; it's remembered by
// its left tile.

export function isBed(tile: number): boolean {
  return tile === Tile.BedLeft || tile === Tile.BedRight;
}

/** The left tile of the bed that (tx, ty) belongs to, or null if it isn't a bed. */
export function bedLeft(world: World, tx: number, ty: number): [number, number] | null {
  const tile = world.getTile(tx, ty);
  if (!isBed(tile)) return null;
  return tile === Tile.BedLeft ? [tx, ty] : [tx - 1, ty];
}

/** Is there a whole bed with its left tile at (tx, ty)? */
export function isWholeBed(world: World, tx: number, ty: number): boolean {
  return world.getTile(tx, ty) === Tile.BedLeft && world.getTile(tx + 1, ty) === Tile.BedRight;
}

/**
 * Where the rest of a bed was, given the half at (tx, ty) that just broke (it's already gone
 * from the world), if that tile is still the matching half. Breaking a bed removes both.
 */
export function bedPartner(world: World, tx: number, ty: number, broken: TileId): [number, number] | null {
  if (!isBed(broken)) return null;
  const want = broken === Tile.BedLeft ? Tile.BedRight : Tile.BedLeft;
  const px = broken === Tile.BedLeft ? tx + 1 : tx - 1;
  return world.getTile(px, ty) === want ? [px, ty] : null;
}
