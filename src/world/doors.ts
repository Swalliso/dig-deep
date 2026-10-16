import { Tile, type TileId } from './tiles';
import type { World } from './world';

// Doors are the first object bigger than one tile: a top and a bottom tile, one above the
// other. Open and closed are separate tiles (closed blocks movement and light, open doesn't),
// so toggling a door swaps both of its tiles.

const OTHER_STATE: Partial<Record<TileId, TileId>> = {
  [Tile.DoorClosedTop]: Tile.DoorOpenTop,
  [Tile.DoorClosedBottom]: Tile.DoorOpenBottom,
  [Tile.DoorOpenTop]: Tile.DoorClosedTop,
  [Tile.DoorOpenBottom]: Tile.DoorClosedBottom,
};

export function isDoor(tile: number): boolean {
  return OTHER_STATE[tile as TileId] !== undefined;
}

function isTop(tile: number): boolean {
  return tile === Tile.DoorClosedTop || tile === Tile.DoorOpenTop;
}

/** The bottom tile of the door that (tx, ty) belongs to, or null if it isn't a door. */
export function doorBottom(world: World, tx: number, ty: number): [number, number] | null {
  const tile = world.getTile(tx, ty);
  if (!isDoor(tile)) return null;
  return isTop(tile) ? [tx, ty + 1] : [tx, ty];
}

export function isDoorOpen(world: World, bx: number, by: number): boolean {
  return world.getTile(bx, by) === Tile.DoorOpenBottom;
}

/**
 * Open or close the door whose bottom tile is (bx, by). Closing is refused (returns false) if
 * `blocked` says something stands in the doorway.
 */
export function toggleDoor(world: World, bx: number, by: number, blocked: (bx: number, by: number) => boolean): boolean {
  const bottom = world.getTile(bx, by);
  const top = world.getTile(bx, by - 1);
  const closing = bottom === Tile.DoorOpenBottom;
  if (closing && blocked(bx, by)) return false;
  const nextBottom = OTHER_STATE[bottom];
  if (nextBottom === undefined || isTop(bottom)) return false;
  world.setTile(bx, by, nextBottom);
  // The top half normally matches; a lone bottom half (its top was replaced) still toggles.
  const nextTop = OTHER_STATE[top];
  if (nextTop !== undefined && isTop(top)) world.setTile(bx, by - 1, nextTop);
  return true;
}

/**
 * Where the rest of a door was, given the half at (tx, ty) that just broke (it's already gone
 * from the world), if that tile is still the matching half. Breaking a door removes both.
 */
export function doorPartner(world: World, tx: number, ty: number, broken: TileId): [number, number] | null {
  if (!isDoor(broken)) return null;
  const [px, py] = isTop(broken) ? [tx, ty + 1] : [tx, ty - 1];
  const partner = world.getTile(px, py);
  return isDoor(partner) && isTop(partner) !== isTop(broken) ? [px, py] : null;
}
