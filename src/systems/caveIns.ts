import {
  GRAVEL_DAMAGE_BASE,
  GRAVEL_DAMAGE_MAX,
  GRAVEL_DAMAGE_TILES,
  GRAVEL_WARN_TIME,
  GRAVITY,
  MAX_FALL_SPEED,
  MAX_FALLING_BLOCKS,
  SPAN_MAX,
  SUPPORT_REACH,
  TILE_SIZE,
} from '../config';
import { beamFooting, columnBottom, columnHeld, columnTiles, holdsLoose, isLoose, worldGetter, type TileGetter } from '../world/supports';
import { isSolid, Tile, tileDef, type TileId } from '../world/tiles';
import type { TileUpdates } from '../world/tileUpdates';
import type { World } from '../world/world';

// Cave-ins (Phase 12), plus beams breaking when their footing goes: gravel with nothing holding it up shakes for GRAVEL_WARN_TIME, then falls
// as blocks that land as gravel again. Rechecks come from the active tile updates (a change
// queues its neighbours), so gravel nobody disturbs never moves. In Cozy worlds cave-ins are off:
// gravel never starts shaking (any shaking stops), and blocks already falling land without hurting.
//
// Saving: a shaking tile is still a gravel tile in the world, and a falling block isn't a tile at
// all (its tile is air), so saving the warnings and the falling blocks with the tiles keeps every
// bit of gravel exactly once. They're saved as they are, on the session clock, and carry on after
// loading; so are the tiles still waiting for a recheck.

/** A block of gravel on its way down. x is its column; y is its top in world px. */
export interface FallingBlock {
  tx: number;
  y: number;
  /** y at the last step, for drawing between steps. */
  prevY: number;
  vy: number;
  /** y where it started falling, for the damage. */
  startY: number;
  tile: TileId;
}

/** How the game hears about cave-ins, and tells them where the player is. */
export interface CaveInHooks {
  /** Does a block with its top-left at (x, y) in world px touch the player? */
  touchesPlayer(x: number, y: number): boolean;
  /**
   * A block didn't land as a tile: it hit the player (`onPlayer`), or landed where something
   * else is. It becomes an item, so nothing is lost. `fell` is how many tiles it fell.
   */
  burst(block: FallingBlock, onPlayer: boolean, fell: number): void;
  /** A block landed as a tile at (tx, ty). */
  landed(tx: number, ty: number, tile: TileId, fell: number): void;
  /** A loose column (bottom tile at tx, ty) started shaking. */
  warned(tx: number, ty: number): void;
  /** A beam with nothing under it broke (its tile is air now): drop it as an item. */
  beamBroke(tx: number, ty: number, tile: TileId): void;
}

/** The cave-in state that's saved. Times are on the session clock. */
export interface SavedCaveIns {
  /** Shaking tiles and when they fall. */
  warnings: { tx: number; ty: number; at: number }[];
  falling: { tx: number; y: number; vy: number; startY: number; tile: TileId }[];
  /** Tiles waiting for a recheck. */
  pending: { tx: number; ty: number }[];
}

/** HP a falling block does to the player after falling `tiles` tiles. */
export function gravelDamage(tiles: number): number {
  return Math.min(GRAVEL_DAMAGE_MAX, GRAVEL_DAMAGE_BASE + Math.floor(Math.max(0, tiles) / GRAVEL_DAMAGE_TILES));
}

/**
 * Does the tile at (tx, ty) stop a falling block? Any solid tile does (gravel too: landing on
 * hanging gravel disturbs it, and they fall on together), and so does an anchored support. A
 * support that isn't anchored can't hold anything, so blocks fall through it.
 */
export function stopsFalling(get: TileGetter, tx: number, ty: number): boolean {
  return isSolid(get(tx, ty)) || holdsLoose(get, tx, ty);
}

export class CaveIns {
  private readonly world: World;
  private readonly updates: TileUpdates;
  private readonly get: TileGetter;
  /** Shaking tiles: key (ty * width + tx) → session time they fall. */
  readonly warnings = new Map<number, number>();
  falling: FallingBlock[] = [];
  /** Off in Cozy worlds. */
  private enabled: boolean;

  constructor(world: World, updates: TileUpdates, enabled: boolean, saved?: SavedCaveIns) {
    this.world = world;
    this.updates = updates;
    this.get = worldGetter(world);
    this.enabled = enabled;
    if (saved) this.restore(saved);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Turn cave-ins on (Normal) or off (Cozy). Turning them off stops every shaking tile. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.warnings.clear();
  }

  /** Is the tile at (tx, ty) shaking? */
  isWarning(tx: number, ty: number): boolean {
    return this.warnings.has(ty * this.world.width + tx);
  }

  /** Shaking tiles, for drawing. */
  warningTiles(): [number, number][] {
    const { width } = this.world;
    return [...this.warnings.keys()].map((key) => [key % width, Math.floor(key / width)]);
  }

  /**
   * One step: recheck queued tiles (up to `budget`), drop columns whose warning is over, and
   * move the falling blocks. `now` is the session clock.
   */
  update(dt: number, now: number, budget: number, hooks: CaveInHooks): void {
    this.updates.process(budget, (tx, ty) => this.recheck(tx, ty, now, hooks));
    this.dropDue(now);
    this.moveFalling(dt, hooks);
  }

  /** Recheck one tile: start or stop a loose column's warning, and pass changes up through supports. */
  private recheck(tx: number, ty: number, now: number, hooks: CaveInHooks): void {
    const { get } = this;
    const id = get(tx, ty);
    const support = tileDef(id).support;
    if (support === 'post') {
      if (!beamFooting(get, tx, ty)) {
        // Its footing is gone: it breaks, and so does each beam above it in turn (the change
        // queues the one above), like a felled tree. Not a cave-in, so in Cozy worlds too.
        this.world.setTile(tx, ty, Tile.Air);
        hooks.beamBroke(tx, ty, id);
        return;
      }
      // A beam: whatever it holds is at the top of its column, straight up or diagonally.
      this.queueAbove(tx, ty);
    } else if (support === 'span') {
      // A crossbeam or platform: it can change what its row holds up to SPAN_MAX tiles along.
      this.queueAbove(tx, ty);
      for (const dir of [-1, 1]) {
        for (let d = 1; d <= SPAN_MAX && tileDef(get(tx + dir * d, ty)).support === 'span'; d++) this.queueAbove(tx + dir * d, ty);
      }
    }
    if (!isLoose(id) || !this.enabled) return;
    const bottom = columnBottom(get, tx, ty);
    const column = columnTiles(get, tx, bottom);
    const { width } = this.world;
    if (columnHeld(get, tx, ty)) {
      for (const [x, y] of column) this.warnings.delete(y * width + x);
      return;
    }
    let started = false;
    for (const [x, y] of column) {
      const key = y * width + x;
      if (this.warnings.has(key)) continue;
      this.warnings.set(key, now + GRAVEL_WARN_TIME);
      started = true;
    }
    if (started) hooks.warned(tx, bottom);
  }

  /** Queue the tiles a support at (tx, ty) could hold: right above it and SUPPORT_REACH to each side. */
  private queueAbove(tx: number, ty: number): void {
    for (let d = -SUPPORT_REACH; d <= SUPPORT_REACH; d++) this.updates.add(tx + d, ty - 1);
  }

  /** Columns whose warning is over fall, bottom tile first, while there's room for more blocks. */
  private dropDue(now: number): void {
    if (this.warnings.size === 0) return;
    const { world, get } = this;
    const due: number[] = [];
    for (const [key, at] of this.warnings) if (at <= now) due.push(key);
    // Bottom first, so a column's blocks start together, one above the other.
    due.sort((a, b) => b - a);
    for (const key of due) {
      const tx = key % world.width;
      const ty = Math.floor(key / world.width);
      const id = get(tx, ty);
      if (!isLoose(id) || columnHeld(get, tx, ty) || !this.enabled) {
        this.warnings.delete(key);
        continue;
      }
      if (this.falling.length >= MAX_FALLING_BLOCKS) return; // keeps shaking until there's room
      this.warnings.delete(key);
      const y = ty * TILE_SIZE;
      this.falling.push({ tx, y, prevY: y, vy: 0, startY: y, tile: id });
      world.setTile(tx, ty, Tile.Air);
    }
  }

  /** Move every falling block; it lands on the first tile below that stops it (see stopsFalling). */
  private moveFalling(dt: number, hooks: CaveInHooks): void {
    if (this.falling.length === 0) return;
    const { world, get } = this;
    // Lowest first, so a block lands before the one right above it moves onto it.
    this.falling.sort((a, b) => b.y - a.y);
    const still: FallingBlock[] = [];
    for (const block of this.falling) {
      block.prevY = block.y;
      block.vy = Math.min(block.vy + GRAVITY * dt, MAX_FALL_SPEED);
      let y = block.y + block.vy * dt;
      // Rows the block's bottom moves into this step, checked top to bottom.
      let landRow: number | null = null;
      const firstRow = Math.ceil((block.y + TILE_SIZE) / TILE_SIZE - 1e-6);
      const lastRow = Math.floor((y + TILE_SIZE - 1e-6) / TILE_SIZE);
      for (let row = firstRow; row <= lastRow; row++) {
        if (stopsFalling(get, block.tx, row)) {
          landRow = row - 1;
          y = landRow * TILE_SIZE;
          break;
        }
      }
      block.y = y;
      const fell = (block.y - block.startY) / TILE_SIZE;
      if (this.enabled && hooks.touchesPlayer(block.tx * TILE_SIZE, block.y)) {
        hooks.burst(block, true, fell);
        continue;
      }
      if (landRow === null) {
        if (block.y > world.height * TILE_SIZE) continue; // can't happen: bedrock holds everything
        still.push(block);
        continue;
      }
      if (get(block.tx, landRow) === Tile.Air && world.inBounds(block.tx, landRow) && !hooks.touchesPlayer(block.tx * TILE_SIZE, block.y)) {
        world.setTile(block.tx, landRow, block.tile);
        hooks.landed(block.tx, landRow, block.tile, fell);
      } else {
        hooks.burst(block, false, fell);
      }
    }
    this.falling = still;
  }

  /** The state to save (copies). */
  saved(): SavedCaveIns {
    const { width } = this.world;
    return {
      warnings: [...this.warnings].map(([key, at]) => ({ tx: key % width, ty: Math.floor(key / width), at })),
      falling: this.falling.map((b) => ({ tx: b.tx, y: b.y, vy: b.vy, startY: b.startY, tile: b.tile })),
      pending: this.updates.pending().map((key) => ({ tx: key % width, ty: Math.floor(key / width) })),
    };
  }

  /** Put saved state back. Anything that doesn't fit the world (no gravel where a warning was) is skipped. */
  private restore(saved: SavedCaveIns): void {
    const { world } = this;
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const tileAt = (tx: unknown, ty: unknown): boolean => Number.isInteger(tx) && Number.isInteger(ty) && world.inBounds(tx as number, ty as number);
    for (const w of Array.isArray(saved.warnings) ? saved.warnings : []) {
      if (!w || !tileAt(w.tx, w.ty) || !num(w.at) || !isLoose(world.getTile(w.tx, w.ty))) continue;
      this.warnings.set(w.ty * world.width + w.tx, w.at);
    }
    for (const b of Array.isArray(saved.falling) ? saved.falling : []) {
      if (!b || !Number.isInteger(b.tx) || b.tx < 0 || b.tx >= world.width || !num(b.y) || !num(b.vy) || !num(b.startY)) continue;
      if (!isLoose(b.tile)) continue;
      const y = Math.min(Math.max(b.y, 0), (world.height - 1) * TILE_SIZE);
      this.falling.push({ tx: b.tx, y, prevY: y, vy: Math.max(0, Math.min(b.vy, MAX_FALL_SPEED)), startY: Math.min(b.startY, y), tile: b.tile });
    }
    for (const p of Array.isArray(saved.pending) ? saved.pending : []) {
      if (p && tileAt(p.tx, p.ty)) this.updates.add(p.tx, p.ty);
    }
  }
}
