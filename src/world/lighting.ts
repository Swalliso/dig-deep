import {
  LIGHT_FALLOFF_AIR,
  LIGHT_FALLOFF_AIR_DIAGONAL,
  LIGHT_FALLOFF_SOLID,
  LIGHT_FALLOFF_SOLID_DIAGONAL,
  LIGHT_MAX,
  PLAYER_GLOW,
  PLAYER_GLOW_FALLOFF,
  TORCH_LIGHT,
} from '../config';
import { isSolid, Tile } from './tiles';
import type { World } from './world';

/**
 * Faint glow around the player: the light level it adds to a tile whose centre is `distance`
 * tiles from the player's centre. Drawn on top of the light map, never stored in it.
 */
export function playerGlow(distance: number): number {
  return Math.max(0, PLAYER_GLOW - PLAYER_GLOW_FALLOFF * distance);
}

/** Farthest any light travels from its source, in tiles. */
const REACH = Math.ceil(Math.max(LIGHT_MAX, TORCH_LIGHT) / LIGHT_FALLOFF_AIR);

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Per-tile light level, 0 (black) to LIGHT_MAX (open sky).
 *
 * Sky light falls straight down each column to the first solid tile (which is lit too).
 * Torches glow at TORCH_LIGHT. From those sources light spreads to neighbouring tiles,
 * losing LIGHT_FALLOFF_AIR per open tile and LIGHT_FALLOFF_SOLID per solid one (a little more
 * for diagonal steps, which round the glow off).
 *
 * The whole map is computed once. After that, a tile change only relights the area within
 * REACH tiles of it (plus the stretch of its column whose sky light changed); light that
 * comes in from just outside that area is kept as it was, since it can't have changed.
 */
export class LightMap {
  readonly width: number;
  readonly height: number;
  readonly light: Uint8Array;
  /** Per column: first row that blocks sky light (world height if none). */
  private readonly skyRow: Int16Array;
  private readonly world: World;
  private dirty: Region | null = null;

  constructor(world: World) {
    this.world = world;
    this.width = world.width;
    this.height = world.height;
    this.light = new Uint8Array(this.width * this.height);
    this.skyRow = new Int16Array(this.width);
    for (let x = 0; x < this.width; x++) this.skyRow[x] = this.findSkyRow(x);
    this.relight({ x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 });
    world.onTileChange((tx, ty) => this.tileChanged(tx, ty));
  }

  /** Light level of a tile; 0 outside the world. */
  level(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return 0;
    return this.light[ty * this.width + tx];
  }

  /** Note a changed tile; the relighting happens in the next update(). */
  tileChanged(tx: number, ty: number): void {
    const before = this.skyRow[tx];
    const after = this.findSkyRow(tx);
    this.skyRow[tx] = after;
    // If the column's sky light now stops somewhere else, that whole stretch changed too.
    const top = before === after ? ty : Math.min(ty, before, after);
    const bottom = before === after ? ty : Math.max(ty, before, after);
    this.markDirty({ x0: tx - REACH, y0: top - REACH, x1: tx + REACH, y1: bottom + REACH });
  }

  /** Relight everything touched since the last call. Call once per update step. */
  update(): void {
    if (!this.dirty) return;
    const region = this.dirty;
    this.dirty = null;
    this.relight(region);
  }

  private markDirty(r: Region): void {
    const d = this.dirty;
    this.dirty = d
      ? { x0: Math.min(d.x0, r.x0), y0: Math.min(d.y0, r.y0), x1: Math.max(d.x1, r.x1), y1: Math.max(d.y1, r.y1) }
      : r;
  }

  private findSkyRow(x: number): number {
    for (let y = 0; y < this.height; y++) if (isSolid(this.world.getTile(x, y))) return y;
    return this.height;
  }

  private relight(region: Region): void {
    const { width: w, height: h, light, world } = this;
    const x0 = Math.max(0, region.x0);
    const y0 = Math.max(0, region.y0);
    const x1 = Math.min(w - 1, region.x1);
    const y1 = Math.min(h - 1, region.y1);
    const queue: number[] = [];

    // Reset the region to its own sources: sky above (and on) the first solid tile, torches.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const sky = y <= this.skyRow[x] ? LIGHT_MAX : 0;
        const torch = world.getTile(x, y) === Tile.Torch ? TORCH_LIGHT : 0;
        const i = y * w + x;
        light[i] = Math.max(sky, torch);
        if (light[i] > 0) queue.push(i);
      }
    }
    // Light shining in from the ring just outside the region.
    const edge = (x: number, y: number): void => {
      if (x >= 0 && y >= 0 && x < w && y < h && light[y * w + x] > 0) queue.push(y * w + x);
    };
    for (let x = x0; x <= x1; x++) {
      edge(x, y0 - 1);
      edge(x, y1 + 1);
    }
    for (let y = y0; y <= y1; y++) {
      edge(x0 - 1, y);
      edge(x1 + 1, y);
    }

    // Spread outward, only writing inside the region.
    const visit = (nx: number, ny: number, level: number, airCost: number, solidCost: number): void => {
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) return;
      const ni = ny * w + nx;
      const next = level - (isSolid(world.getTile(nx, ny)) ? solidCost : airCost);
      if (next > light[ni]) {
        light[ni] = next;
        queue.push(ni);
      }
    };
    const visitDiagonal = (x: number, y: number, dx: number, dy: number, level: number): void => {
      // Light can't squeeze diagonally between two solid corners.
      if (isSolid(world.getTile(x + dx, y)) && isSolid(world.getTile(x, y + dy))) return;
      visit(x + dx, y + dy, level, LIGHT_FALLOFF_AIR_DIAGONAL, LIGHT_FALLOFF_SOLID_DIAGONAL);
    };
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const level = light[i];
      if (level <= LIGHT_FALLOFF_AIR) continue;
      const x = i % w;
      const y = (i - x) / w;
      visit(x - 1, y, level, LIGHT_FALLOFF_AIR, LIGHT_FALLOFF_SOLID);
      visit(x + 1, y, level, LIGHT_FALLOFF_AIR, LIGHT_FALLOFF_SOLID);
      visit(x, y - 1, level, LIGHT_FALLOFF_AIR, LIGHT_FALLOFF_SOLID);
      visit(x, y + 1, level, LIGHT_FALLOFF_AIR, LIGHT_FALLOFF_SOLID);
      if (level <= LIGHT_FALLOFF_AIR_DIAGONAL) continue;
      visitDiagonal(x, y, -1, -1, level);
      visitDiagonal(x, y, 1, -1, level);
      visitDiagonal(x, y, -1, 1, level);
      visitDiagonal(x, y, 1, 1, level);
    }
  }
}
