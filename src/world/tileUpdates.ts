import type { World } from './world';

/** Rechecks one tile; may queue more tiles with TileUpdates.add. */
export type TileVisitor = (tx: number, ty: number) => void;

/**
 * Active tile updates (Phase 12): a queue of tiles to recheck. Every tile change queues the
 * tile and its eight neighbours (diagonals too: supports hold gravel diagonally above them);
 * process() works through the queue in order with a per-step budget, so a big collapse spreads
 * over several steps instead of stalling one, and nothing ever looks at the whole world. Cave-ins use it now; torch burnout and liquids can later.
 * A tile is queued at most once at a time. Keys are ty * width + tx, like tile entities.
 */
export class TileUpdates {
  private readonly world: World;
  private queue: number[] = [];
  private head = 0;
  private readonly queued = new Set<number>();

  constructor(world: World) {
    this.world = world;
    world.onTileChange((tx, ty) => this.touch(tx, ty));
  }

  /** Tiles waiting to be rechecked. */
  get size(): number {
    return this.queue.length - this.head;
  }

  /** Queue (tx, ty) and its eight neighbours. */
  touch(tx: number, ty: number): void {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.add(tx + dx, ty + dy);
  }

  /** Queue (tx, ty) unless it's already waiting or out of bounds. */
  add(tx: number, ty: number): void {
    if (!this.world.inBounds(tx, ty)) return;
    const key = ty * this.world.width + tx;
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.queue.push(key);
  }

  /** Recheck up to `budget` tiles, oldest first. Returns how many were rechecked. */
  process(budget: number, visit: TileVisitor): number {
    const { width } = this.world;
    let done = 0;
    while (done < budget && this.head < this.queue.length) {
      const key = this.queue[this.head++];
      this.queued.delete(key);
      visit(key % width, Math.floor(key / width));
      done++;
    }
    if (this.head === this.queue.length) {
      this.queue = [];
      this.head = 0;
    } else if (this.head > 4096) {
      this.queue = this.queue.slice(this.head);
      this.head = 0;
    }
    return done;
  }

  /** The waiting tiles' keys, oldest first (for saving). */
  pending(): number[] {
    return this.queue.slice(this.head);
  }

  /** Forget every waiting tile. */
  clear(): void {
    this.queue = [];
    this.head = 0;
    this.queued.clear();
  }
}
