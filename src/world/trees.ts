import { TREE_FELL_RADIUS } from '../config';
import { Tile, type TileId } from './tiles';
import type { World } from './world';

export interface FelledTile {
  tx: number;
  ty: number;
  tile: TileId;
}

/** What grows on top of each kind of trunk: leaves on a tree, a cap on a giant mushroom. */
const CROWNS: ReadonlyMap<TileId, TileId> = new Map<TileId, TileId>([
  [Tile.Wood, Tile.Leaves],
  [Tile.MushroomStem, Tile.MushroomCap],
]);

/** Is `tile` a trunk that fells what's above it when cut (a tree's wood, a giant mushroom's stem)? */
export function isTrunk(tile: TileId): boolean {
  return CROWNS.has(tile);
}

/**
 * Call after the trunk tile at (tx, ty) has been broken (`trunkTile`, wood by default, or a giant
 * mushroom's stem): removes the rest of the tree above it (the trunk above the break, and the
 * leaves or cap touching that trunk). The stump below stays. Returns every tile removed so the
 * caller can spawn drops and particles.
 */
export function fellTreeAbove(world: World, tx: number, ty: number, trunkTile: TileId = Tile.Wood): FelledTile[] {
  const crown = CROWNS.get(trunkTile);
  if (crown === undefined) return [];
  const removed: FelledTile[] = [];
  const remove = (x: number, y: number, tile: TileId): void => {
    world.setTile(x, y, Tile.Air);
    removed.push({ tx: x, ty: y, tile });
  };

  // Trunk above the break.
  const trunk: [number, number][] = [[tx, ty]];
  for (let y = ty - 1; world.getTile(tx, y) === trunkTile; y--) {
    remove(tx, y, trunkTile);
    trunk.push([tx, y]);
  }

  // Canopy: leaves (or cap) touching the removed trunk, and those touching them.
  const queue: [number, number][] = [];
  const visit = (x: number, y: number): void => {
    if (Math.abs(x - tx) > TREE_FELL_RADIUS || world.getTile(x, y) !== crown) return;
    remove(x, y, crown);
    queue.push([x, y]);
  };
  for (const [x, y] of trunk) {
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
  }
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }
  return removed;
}
