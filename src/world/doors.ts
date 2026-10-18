import { Tile, type TileId } from './tiles';
import type { World } from './world';

// Doors are the first object bigger than one tile: a top and a bottom tile, one above the
// other. Open and closed are separate tiles (closed blocks movement and light, open doesn't),
// so toggling a door swaps both of its tiles. A door is hinged on the left or the right, picked
// when it's placed, and the hinge is part of the tile id, so it's kept while open or closed.

export type DoorHinge = 'left' | 'right';

/** Each hinge's tiles: closed top and bottom, then open top and bottom. */
const DOOR_TILES: Record<DoorHinge, readonly [TileId, TileId, TileId, TileId]> = {
  left: [Tile.DoorClosedTop, Tile.DoorClosedBottom, Tile.DoorOpenTop, Tile.DoorOpenBottom],
  right: [Tile.DoorRightClosedTop, Tile.DoorRightClosedBottom, Tile.DoorRightOpenTop, Tile.DoorRightOpenBottom],
};

const OTHER_STATE: Partial<Record<TileId, TileId>> = {};
const TOPS = new Set<number>();
const OPEN_BOTTOMS = new Set<number>();
for (const [closedTop, closedBottom, openTop, openBottom] of Object.values(DOOR_TILES)) {
  OTHER_STATE[closedTop] = openTop;
  OTHER_STATE[closedBottom] = openBottom;
  OTHER_STATE[openTop] = closedTop;
  OTHER_STATE[openBottom] = closedBottom;
  TOPS.add(closedTop).add(openTop);
  OPEN_BOTTOMS.add(openBottom);
}

/** The top and bottom tiles of a closed door with this hinge, as it's placed. */
export function closedDoorTiles(hinge: DoorHinge): [top: TileId, bottom: TileId] {
  return [DOOR_TILES[hinge][0], DOOR_TILES[hinge][1]];
}

/** A door placed by a player facing right opens to the right, so it's hinged on the right. */
export function hingeFacing(facing: 1 | -1): DoorHinge {
  return facing > 0 ? 'right' : 'left';
}

export function isDoor(tile: number): boolean {
  return OTHER_STATE[tile as TileId] !== undefined;
}

function isTop(tile: number): boolean {
  return TOPS.has(tile);
}

/** The bottom tile of the door that (tx, ty) belongs to, or null if it isn't a door. */
export function doorBottom(world: World, tx: number, ty: number): [number, number] | null {
  const tile = world.getTile(tx, ty);
  if (!isDoor(tile)) return null;
  return isTop(tile) ? [tx, ty + 1] : [tx, ty];
}

export function isDoorOpen(world: World, bx: number, by: number): boolean {
  return OPEN_BOTTOMS.has(world.getTile(bx, by));
}

/**
 * Open or close the door whose bottom tile is (bx, by). Closing is refused (returns false) if
 * `blocked` says something stands in the doorway.
 */
export function toggleDoor(world: World, bx: number, by: number, blocked: (bx: number, by: number) => boolean): boolean {
  const bottom = world.getTile(bx, by);
  const top = world.getTile(bx, by - 1);
  const closing = OPEN_BOTTOMS.has(bottom);
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
