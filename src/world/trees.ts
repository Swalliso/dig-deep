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
 * mushroom's stem): removes the rest of the tree above it (the trunk above the break, and its
 * leaves or cap). The stump below stays. Its leaves are the ones joined to the removed trunk
 * (up to TREE_FELL_RADIUS columns out) that are nearer this tree's trunk than any other trunk of
 * the same kind, so a neighbour whose canopy touches it keeps its own (ties stay too). Returns
 * every tile removed so the caller can spawn drops and particles.
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
  // This tree's trunk, from the top of the felled part down to the bottom of the stump.
  const top = trunk[trunk.length - 1][1];
  let bottom = ty;
  while (world.getTile(tx, bottom + 1) === trunkTile) bottom++;

  // Canopy: leaves (or cap) touching the removed trunk, and those touching them.
  const canopy = new Map<number, [number, number]>();
  const queue: [number, number][] = [];
  const visit = (x: number, y: number): void => {
    const key = y * world.width + x;
    if (Math.abs(x - tx) > TREE_FELL_RADIUS || canopy.has(key) || world.getTile(x, y) !== crown) return;
    canopy.set(key, [x, y]);
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

  // Of those, it takes the ones nearer its own trunk than any other.
  const others = trunksNear(world, [...canopy.values()], trunkTile, (x, y) => x === tx && y >= top && y <= bottom);
  for (const [x, y] of canopy.values()) {
    const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
    const own = (x - tx) ** 2 + dy * dy;
    if (others.every(([ox, oy]) => (x - ox) ** 2 + (y - oy) ** 2 > own)) remove(x, y, crown);
  }
  return removed;
}

/**
 * Every `trunkTile` in the box around `tiles` widened by 2 x TREE_FELL_RADIUS on each side, minus
 * those `skip` says: every trunk that could be nearer one of those canopy tiles than the felled
 * tree's own.
 */
function trunksNear(world: World, tiles: [number, number][], trunkTile: TileId, skip: (x: number, y: number) => boolean): [number, number][] {
  if (tiles.length === 0) return [];
  const xs = tiles.map(([x]) => x);
  const ys = tiles.map(([, y]) => y);
  const r = 2 * TREE_FELL_RADIUS;
  const found: [number, number][] = [];
  for (let y = Math.min(...ys) - r; y <= Math.max(...ys) + r; y++) {
    for (let x = Math.min(...xs) - r; x <= Math.max(...xs) + r; x++) {
      if (world.getTile(x, y) === trunkTile && !skip(x, y)) found.push([x, y]);
    }
  }
  return found;
}
