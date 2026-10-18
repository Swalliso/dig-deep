import { Tile, type TileId } from './tiles';
import type { World } from './world';

// The camp (Phase 15): one 2 x 2 object that counts as a workbench, a furnace and a bed. Like a
// bed or a door it's a separate tile id per part, so each part draws its own quarter. The camp is
// remembered by its top-left tile, where its tile entity lives (see game.ts).

/** The camp's parts, in reading order: [dx, dy, tile] from its top-left. */
const PARTS: readonly (readonly [number, number, TileId])[] = [
  [0, 0, Tile.CampTopLeft],
  [1, 0, Tile.CampTopRight],
  [0, 1, Tile.CampBottomLeft],
  [1, 1, Tile.CampBottomRight],
];

export function isCamp(tile: number): boolean {
  return tile >= Tile.CampTopLeft && tile <= Tile.CampBottomRight;
}

/** Where a camp part sits in the camp: [dx, dy] from the top-left. */
function offset(tile: TileId): readonly [number, number] {
  const part = PARTS.find(([, , t]) => t === tile)!;
  return [part[0], part[1]];
}

/** The top-left tile of the camp that (tx, ty) belongs to, or null if it isn't a camp. */
export function campTopLeft(world: World, tx: number, ty: number): [number, number] | null {
  const tile = world.getTile(tx, ty);
  if (!isCamp(tile)) return null;
  const [dx, dy] = offset(tile);
  return [tx - dx, ty - dy];
}

/** Is there a whole camp with its top-left at (tx, ty)? */
export function isWholeCamp(world: World, tx: number, ty: number): boolean {
  return PARTS.every(([dx, dy, tile]) => world.getTile(tx + dx, ty + dy) === tile);
}

/** The tiles a camp with its top-left at (tx, ty) takes up, with the part that goes on each. */
export function campTiles(tx: number, ty: number): [number, number, TileId][] {
  return PARTS.map(([dx, dy, tile]) => [tx + dx, ty + dy, tile]);
}

/**
 * The rest of a camp, given the part at (tx, ty) that just broke (it's already gone from the
 * world): the other tiles that are still its matching parts. Breaking any part packs up the camp.
 */
export function campPartners(world: World, tx: number, ty: number, broken: TileId): [number, number][] {
  if (!isCamp(broken)) return [];
  const [dx, dy] = offset(broken);
  return campTiles(tx - dx, ty - dy)
    .filter(([x, y, tile]) => (x !== tx || y !== ty) && world.getTile(x, y) === tile)
    .map(([x, y]) => [x, y]);
}
