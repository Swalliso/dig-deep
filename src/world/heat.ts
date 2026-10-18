import { TILE_HEAT, TILE_INSULATES } from './tiles';
import type { World } from './world';

// Heat (Phase 14b): lava and hot rock heat the tiles around them. A source's tile has its heat
// level (TileDef.heat); each step to a neighbouring tile loses one level, through air and rock
// alike, but never into or through an insulating tile (bricks, heartstone, closed doors). A tile
// with any heat is in a hot zone. Heat reaches only a few tiles, so it's worked out on demand for
// a box (the player's tiles, or the screen) instead of being kept for the whole world.

/** Farthest heat travels from its source, in tiles. */
export const HEAT_REACH = Math.max(0, ...TILE_HEAT) - 1;

/** Heat levels over a box of tiles, row by row. */
export interface HeatField {
  x0: number;
  y0: number;
  width: number;
  height: number;
  heat: Uint8Array;
}

/** The heat level of tile (tx, ty) in `field`, or 0 outside it. */
export function heatIn(field: HeatField, tx: number, ty: number): number {
  const x = tx - field.x0;
  const y = ty - field.y0;
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return 0;
  return field.heat[y * field.width + x];
}

/**
 * Heat over the tiles x0..x1, y0..y1. Sources up to HEAT_REACH tiles outside the box count too,
 * and so do paths that leave it, so every tile in the box gets its exact level.
 */
export function heatField(world: World, x0: number, y0: number, x1: number, y1: number): HeatField {
  const R = HEAT_REACH;
  const bx0 = x0 - R;
  const by0 = y0 - R;
  const width = x1 - x0 + 1 + 2 * R;
  const height = y1 - y0 + 1 + 2 * R;
  const heat = new Uint8Array(Math.max(0, width * height));
  const field: HeatField = { x0: bx0, y0: by0, width, height, heat };
  if (R <= 0) return field;
  // Sources first, then spread outward, as in a breadth-first search: each tile gets the
  // highest level any source reaches it with.
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const level = TILE_HEAT[world.getTile(bx0 + x, by0 + y)];
      if (level === 0) continue;
      heat[y * width + x] = level;
      queue.push(y * width + x);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const next = heat[i] - 1;
    if (next <= 0) continue;
    const x = i % width;
    const y = (i - x) / width;
    const visit = (nx: number, ny: number): void => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const ni = ny * width + nx;
      if (next <= heat[ni] || TILE_INSULATES[world.getTile(bx0 + nx, by0 + ny)]) return;
      heat[ni] = next;
      queue.push(ni);
    };
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }
  return field;
}

/** The hottest tile in x0..x1, y0..y1 (0: none of it is in a hot zone). */
export function maxHeat(world: World, x0: number, y0: number, x1: number, y1: number): number {
  const field = heatField(world, x0, y0, x1, y1);
  let max = 0;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) max = Math.max(max, heatIn(field, tx, ty));
  return max;
}
