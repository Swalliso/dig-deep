import { CHUNK_SIZE, EXPLORE_RADIUS } from '../config';
import type { World } from './world';

/** Anything that can say how lit a tile is (the LightMap; tests use a stand-in). */
export interface LightSource {
  level(tx: number, ty: number): number;
}

/**
 * Which tiles the player has seen, for the map's fog of war. Kept per chunk (CHUNK_SIZE²
 * bytes, 1 = seen), and a chunk's array only exists once something in it has been seen, so
 * saves store just those chunks.
 */
export class ExploredMap {
  readonly width: number;
  readonly height: number;
  /** Chunk index (as in World.chunks) → 1 byte per tile. */
  readonly chunks = new Map<number, Uint8Array>();
  /** Bumped whenever a tile is seen for the first time, so saving can tell something changed. */
  revision = 0;
  /** Called with every tile seen for the first time (the map image paints it). */
  onExplore: ((tx: number, ty: number) => void) | null = null;
  private readonly chunksX: number;

  constructor(world: World) {
    this.width = world.width;
    this.height = world.height;
    this.chunksX = world.chunksX;
  }

  isExplored(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    const chunk = this.chunks.get(this.chunkIndex(tx, ty));
    return chunk !== undefined && chunk[(ty % CHUNK_SIZE) * CHUNK_SIZE + (tx % CHUNK_SIZE)] === 1;
  }

  /** Mark a tile seen. Returns true if it hadn't been. */
  mark(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    const index = this.chunkIndex(tx, ty);
    let chunk = this.chunks.get(index);
    if (!chunk) {
      chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
      this.chunks.set(index, chunk);
    }
    const i = (ty % CHUNK_SIZE) * CHUNK_SIZE + (tx % CHUNK_SIZE);
    if (chunk[i]) return false;
    chunk[i] = 1;
    this.revision++;
    this.onExplore?.(tx, ty);
    return true;
  }

  /**
   * Look around: every lit tile in the rectangle (tx0, ty0)..(tx1, ty1) (the screen) is seen,
   * and so is every tile within EXPLORE_RADIUS of tile (px, py) (the player), lit or not.
   */
  look(light: LightSource, tx0: number, ty0: number, tx1: number, ty1: number, px: number, py: number): void {
    for (let ty = Math.max(0, ty0); ty <= Math.min(this.height - 1, ty1); ty++) {
      for (let tx = Math.max(0, tx0); tx <= Math.min(this.width - 1, tx1); tx++) {
        if (light.level(tx, ty) > 0) this.mark(tx, ty);
      }
    }
    const r = EXPLORE_RADIUS;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) this.mark(px + dx, py + dy);
    }
  }

  /** Debug: see everything. */
  revealAll(): void {
    for (let ty = 0; ty < this.height; ty++) for (let tx = 0; tx < this.width; tx++) this.mark(tx, ty);
  }

  /** Every tile seen so far, chunk by chunk (for painting the whole map at once). */
  forEachExplored(visit: (tx: number, ty: number) => void): void {
    for (const [index, chunk] of this.chunks) {
      const cx = (index % this.chunksX) * CHUNK_SIZE;
      const cy = Math.floor(index / this.chunksX) * CHUNK_SIZE;
      for (let i = 0; i < chunk.length; i++) if (chunk[i]) visit(cx + (i % CHUNK_SIZE), cy + Math.floor(i / CHUNK_SIZE));
    }
  }

  private chunkIndex(tx: number, ty: number): number {
    return Math.floor(ty / CHUNK_SIZE) * this.chunksX + Math.floor(tx / CHUNK_SIZE);
  }
}
