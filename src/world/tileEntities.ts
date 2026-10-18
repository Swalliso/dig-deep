import type { ItemStack } from '../systems/inventory';
import type { World } from './world';

/** What a chest tile holds: CHEST_SLOTS slots, empty ones null. */
export interface ChestData {
  kind: 'chest';
  slots: (ItemStack | null)[];
}

/** A planted sapling or mushroom sprout (Phase 14a): when it grows, once there's room. */
export interface PlantData {
  kind: 'plant';
  /** Session clock time it's due to grow. */
  growAt: number;
}

/** Data kept for one tile. Each kind belongs to one tile type (lift stops, torch timers later). */
export type TileEntity = ChestData | PlantData;

/**
 * Per-tile data, keyed by `ty * width + tx`. When a tile changes (broken, replaced, anything),
 * its entity is removed and `onRemove` hears about it, so a broken chest can spill its contents.
 */
export class TileEntities {
  /** Set by the game: called with every entity removed because its tile changed. */
  onRemove: ((tx: number, ty: number, entity: TileEntity) => void) | null = null;
  private readonly width: number;
  private readonly map = new Map<number, TileEntity>();

  constructor(world: World) {
    this.width = world.width;
    world.onTileChange((tx, ty) => this.tileChanged(tx, ty));
  }

  get size(): number {
    return this.map.size;
  }

  get(tx: number, ty: number): TileEntity | undefined {
    return this.map.get(ty * this.width + tx);
  }

  set(tx: number, ty: number, entity: TileEntity): void {
    this.map.set(ty * this.width + tx, entity);
  }

  /** Every entity with its tile, in key order (top row first), so saves come out the same each time. */
  entries(): { tx: number; ty: number; entity: TileEntity }[] {
    return [...this.map.keys()]
      .sort((a, b) => a - b)
      .map((key) => ({ tx: key % this.width, ty: Math.floor(key / this.width), entity: this.map.get(key)! }));
  }

  /** Visit every entity, in no particular order (cheaper than entries()). Don't change tiles while visiting. */
  forEach(visit: (tx: number, ty: number, entity: TileEntity) => void): void {
    for (const [key, entity] of this.map) visit(key % this.width, Math.floor(key / this.width), entity);
  }

  private tileChanged(tx: number, ty: number): void {
    const key = ty * this.width + tx;
    const entity = this.map.get(key);
    if (!entity) return;
    this.map.delete(key);
    this.onRemove?.(tx, ty, entity);
  }
}
