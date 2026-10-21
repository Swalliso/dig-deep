import { CHUNK_SIZE } from '../config';
import { Tile, type TileId } from './tiles';

/** The Heart of the Deep's place in a world (tile coordinates). */
export interface HeartSite {
  /** The Heart itself. */
  tx: number;
  ty: number;
  /** Its heartstone chamber, walls included. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The cavern around the chamber: its columns and its top row (it reaches down to the floor). */
  cavernX0: number;
  cavernX1: number;
  cavernY0: number;
}

/** Strata v3 worlds (package B1): the first cave mouth, near the spawn, and the cavern it leads to. */
export interface FirstCavernSite {
  /** A standing spot on the surface beside the mouth, where the walk down starts. */
  mouthTx: number;
  mouthTy: number;
  /** The cavern: a ragged ellipse around (cx, cy) with these radii. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Hears about every tile change, after the new tile is in place. */
export type TileListener = (tx: number, ty: number) => void;

/**
 * Fixed-size tile grid stored as CHUNK_SIZE x CHUNK_SIZE chunks of Uint8Array tile ids.
 * Each chunk has a version number that bumps on every change, so caches (rendering now,
 * saving later) can tell which chunks are stale.
 */
export class World {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly chunks: Uint8Array[];
  readonly chunkVersions: Uint32Array;
  /** Surface row (topmost grass/dirt tile) per column, filled in by generation. */
  readonly surface: Int16Array;
  spawnTx = 0;
  spawnTy = 0;
  /** The generation profile the world was made with (see generate.ts); set by generation. */
  profile: { name: string; version: number } = { name: 'classic', version: 1 };
  /**
   * Strata worlds (Phase 14a): for each boundary between two strata, top to bottom, the first row
   * of the stratum below it, per column (see strata.ts). Empty for worlds without strata. Filled
   * in by generation, so a loaded world gets them back from its seed.
   */
  strataTops: Int16Array[] = [];
  /**
   * Strata v2 worlds (Phase 14b): where the Heart of the Deep is (the Heart's own tile, its
   * heartstone chamber and the cavern around it), or null. Filled in by generation, like strataTops.
   */
  heart: HeartSite | null = null;
  /**
   * Strata v3 worlds (package B1): the first cave mouth and its cavern, or null. Filled in by
   * generation, like strataTops.
   */
  firstCavern: FirstCavernSite | null = null;
  /** Called after any tile changes. Lighting and tile entities listen here (see onTileChange). */
  private readonly tileListeners: TileListener[] = [];
  /**
   * Chunks changed since the world was generated. Saves store only these; everything else
   * regenerates from the seed. Generation clears it when it finishes.
   */
  readonly changedChunks = new Set<number>();
  /** Bumped on every tile change, so callers can cheaply tell whether anything changed. */
  revision = 0;

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.chunksX = Math.ceil(width / CHUNK_SIZE);
    this.chunksY = Math.ceil(height / CHUNK_SIZE);
    this.chunks = [];
    for (let i = 0; i < this.chunksX * this.chunksY; i++) {
      this.chunks.push(new Uint8Array(CHUNK_SIZE * CHUNK_SIZE));
    }
    this.chunkVersions = new Uint32Array(this.chunksX * this.chunksY);
    this.surface = new Int16Array(width);
  }

  /** Call `listener` after every tile change from now on. */
  onTileChange(listener: TileListener): void {
    this.tileListeners.push(listener);
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /** Out-of-bounds reads return Bedrock so nothing can leave the world. */
  getTile(tx: number, ty: number): TileId {
    if (!this.inBounds(tx, ty)) return Tile.Bedrock;
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const chunk = this.chunks[cy * this.chunksX + cx];
    return chunk[(ty - cy * CHUNK_SIZE) * CHUNK_SIZE + (tx - cx * CHUNK_SIZE)] as TileId;
  }

  /** Out-of-bounds writes are ignored. */
  setTile(tx: number, ty: number, id: TileId): void {
    if (!this.inBounds(tx, ty)) return;
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const ci = cy * this.chunksX + cx;
    const i = (ty - cy * CHUNK_SIZE) * CHUNK_SIZE + (tx - cx * CHUNK_SIZE);
    const chunk = this.chunks[ci];
    if (chunk[i] === id) return;
    chunk[i] = id;
    this.chunkVersions[ci]++;
    this.changedChunks.add(ci);
    this.revision++;
    for (const listener of this.tileListeners) listener(tx, ty);
  }

  /** FNV-1a hash of every tile. Same seed must give the same hash. */
  hash(): number {
    let h = 0x811c9dc5;
    for (let ty = 0; ty < this.height; ty++) {
      for (let tx = 0; tx < this.width; tx++) {
        h ^= this.getTile(tx, ty);
        h = Math.imul(h, 0x01000193);
      }
    }
    return h >>> 0;
  }
}
