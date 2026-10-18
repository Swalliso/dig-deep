import { TILE_SIZE } from '../config';
import { isFloor, Tile } from './tiles';
import type { World } from './world';

// Lift geometry (Phase 15): a lift is an unbroken column of lift rail, with lift stops on the
// tiles beside it. The cage that rides it lives in systems/lifts.ts.

export function isRail(tile: number): boolean {
  return tile === Tile.LiftRail;
}

/**
 * The rail column a lift stop at (sx, sy) belongs to: the rail tile beside it, on its left if
 * there's one on both sides. Null if neither side is rail.
 */
export function stopRail(world: World, sx: number, sy: number): number | null {
  if (isRail(world.getTile(sx - 1, sy))) return sx - 1;
  if (isRail(world.getTile(sx + 1, sy))) return sx + 1;
  return null;
}

/** Can a lift stop stand at (sx, sy)? It needs a rail beside it and a floor under it to step out onto. */
export function stopFits(world: World, sx: number, sy: number): boolean {
  return stopRail(world, sx, sy) !== null && isFloor(world, sx, sy + 1);
}

/** The top and bottom rows (inclusive) of the unbroken run of rail through (tx, ty), or null if (tx, ty) isn't rail. */
export function railSpan(world: World, tx: number, ty: number): { top: number; bottom: number } | null {
  if (!isRail(world.getTile(tx, ty))) return null;
  let top = ty;
  while (top > 0 && isRail(world.getTile(tx, top - 1))) top--;
  let bottom = ty;
  while (bottom < world.height - 1 && isRail(world.getTile(tx, bottom + 1))) bottom++;
  return { top, bottom };
}

/** Every lift stop belonging to rail column rx (see stopRail), top first. Scans the whole column. */
export function stopsOnColumn(world: World, rx: number): { sx: number; sy: number }[] {
  const stops: { sx: number; sy: number }[] = [];
  for (let sy = 0; sy < world.height; sy++) {
    for (const sx of [rx - 1, rx + 1]) {
      if (world.getTile(sx, sy) === Tile.LiftStop && stopRail(world, sx, sy) === rx) stops.push({ sx, sy });
    }
  }
  return stops;
}

/** The cage's floor (its bottom edge, world px) when it's level with a stop on row sy. */
export function floorAt(sy: number): number {
  return (sy + 1) * TILE_SIZE;
}

/** The tile row the cage's floor is in, for a floor at y world px (on a row's bottom edge, that row). */
export function floorRow(y: number): number {
  return Math.ceil(y / TILE_SIZE - 1e-6) - 1;
}
