import { CHUNK_SIZE } from '../config';
import { Tile, type TileId } from './tiles';

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
