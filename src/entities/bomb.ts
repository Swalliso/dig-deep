import { BOMB_FUSE, BOMB_GRAVITY, BOMB_THROW_SPEED, TILE_SIZE } from '../config';
import { isSolid } from '../world/tiles';
import type { World } from '../world/world';

// Thrown bombs (Phase 16): they fly under gravity like flares, stick to the first solid tile they
// touch and go off when their fuse (seconds of play, so nothing burns down while paused) runs
// out. What a blast breaks is in systems/tools.ts; game.ts sets it off.

/** Most px a bomb moves per collision check, so it can't pass through a tile. */
const STEP = 4;

export interface Bomb {
  /** Tells bombs apart while they're drawn; not saved. */
  id: number;
  /** Its centre, world px. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** The tile it's stuck to, or null while it's flying (or falling, after that tile went). */
  stuckTo: { tx: number; ty: number } | null;
  /** Seconds until it goes off. */
  fuse: number;
  /** The best pickaxe tier carried when it was thrown: the blast breaks what that could mine. */
  tier: number;
}

/** The part of a bomb that's saved. */
export interface SavedBomb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuckTo: { tx: number; ty: number } | null;
  fuse: number;
  tier: number;
}

let nextId = 1;

function newBomb(x: number, y: number, vx: number, vy: number, stuckTo: Bomb['stuckTo'], fuse: number, tier: number): Bomb {
  return { id: nextId++, x, y, prevX: x, prevY: y, vx, vy, stuckTo, fuse, tier };
}

/** A bomb thrown from (x, y) toward (targetX, targetY), at BOMB_THROW_SPEED, by a player whose best pickaxe is `tier`. */
export function throwBomb(x: number, y: number, targetX: number, targetY: number, tier: number): Bomb {
  const dx = targetX - x;
  const dy = targetY - y;
  const length = Math.hypot(dx, dy) || 1;
  return newBomb(x, y, (dx / length) * BOMB_THROW_SPEED, (dy / length) * BOMB_THROW_SPEED, null, BOMB_FUSE, tier);
}

/** The tile a bomb is in: the middle of its blast. */
export function bombTile(bomb: Bomb): [number, number] {
  return [Math.floor(bomb.x / TILE_SIZE), Math.floor(bomb.y / TILE_SIZE)];
}

/**
 * Move every bomb and burn its fuse for one step of `dt` seconds. Returns the bombs still
 * fused and the ones whose fuse ran out this step (for the game to set off).
 */
export function updateBombs(bombs: readonly Bomb[], dt: number, world: World): { live: Bomb[]; exploded: Bomb[] } {
  const live: Bomb[] = [];
  const exploded: Bomb[] = [];
  for (const bomb of bombs) {
    bomb.prevX = bomb.x;
    bomb.prevY = bomb.y;
    bomb.fuse -= dt;
    // The tile it stuck to was mined (or blown up): it drops.
    if (bomb.stuckTo && !isSolid(world.getTile(bomb.stuckTo.tx, bomb.stuckTo.ty))) {
      bomb.stuckTo = null;
      bomb.vx = 0;
      bomb.vy = 0;
    }
    if (!bomb.stuckTo) fly(bomb, dt, world);
    (bomb.fuse > 0 ? live : exploded).push(bomb);
  }
  return { live, exploded };
}

function fly(bomb: Bomb, dt: number, world: World): void {
  bomb.vy += BOMB_GRAVITY * dt;
  const steps = Math.max(1, Math.ceil((Math.hypot(bomb.vx, bomb.vy) * dt) / STEP));
  for (let i = 0; i < steps; i++) {
    const x = bomb.x + (bomb.vx * dt) / steps;
    const y = bomb.y + (bomb.vy * dt) / steps;
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (isSolid(world.getTile(tx, ty))) {
      bomb.stuckTo = { tx, ty };
      bomb.vx = 0;
      bomb.vy = 0;
      return;
    }
    bomb.x = x;
    bomb.y = y;
  }
}

export function savedBombs(bombs: readonly Bomb[]): SavedBomb[] {
  return bombs.map(({ x, y, vx, vy, stuckTo, fuse, tier }) => ({ x, y, vx, vy, stuckTo: stuckTo && { ...stuckTo }, fuse, tier }));
}

/** Bombs from a save, skipping anything unreadable. */
export function bombsFromSave(saved: unknown): Bomb[] {
  if (!Array.isArray(saved)) return [];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const bombs: Bomb[] = [];
  for (const s of saved as Partial<SavedBomb>[]) {
    if (!s || !num(s.x) || !num(s.y) || !num(s.fuse) || s.fuse <= 0 || !num(s.tier)) continue;
    const stuck = s.stuckTo && num(s.stuckTo.tx) && num(s.stuckTo.ty) ? { tx: s.stuckTo.tx, ty: s.stuckTo.ty } : null;
    bombs.push(newBomb(s.x, s.y, num(s.vx) ? s.vx : 0, num(s.vy) ? s.vy : 0, stuck, Math.min(BOMB_FUSE, s.fuse), Math.floor(s.tier)));
  }
  return bombs;
}
