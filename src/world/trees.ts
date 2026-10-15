import { TREE_FELL_RADIUS } from '../config';
import { Tile, type TileId } from './tiles';
import type { World } from './world';

export interface FelledTile {
  tx: number;
  ty: number;
  tile: TileId;
}

/**
 * Call after the trunk tile at (tx, ty) has been broken: removes the rest of the tree above
 * it (the trunk above the break, and the canopy of leaves touching that trunk). The stump
 * below stays. Returns every tile removed so the caller can spawn drops and particles.
 */
export function fellTreeAbove(world: World, tx: number, ty: number): FelledTile[] {
  const removed: FelledTile[] = [];
  const remove = (x: number, y: number, tile: TileId): void => {
    world.setTile(x, y, Tile.Air);
    removed.push({ tx: x, ty: y, tile });
  };

  // Trunk above the break.
  const trunk: [number, number][] = [[tx, ty]];
  for (let y = ty - 1; world.getTile(tx, y) === Tile.Wood; y--) {
    remove(tx, y, Tile.Wood);
    trunk.push([tx, y]);
  }

  // Canopy: leaves touching the removed trunk, and leaves touching those.
  const queue: [number, number][] = [];
  const visit = (x: number, y: number): void => {
    if (Math.abs(x - tx) > TREE_FELL_RADIUS || world.getTile(x, y) !== Tile.Leaves) return;
    remove(x, y, Tile.Leaves);
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
