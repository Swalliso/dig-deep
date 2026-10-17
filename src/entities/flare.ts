import { FLARE_FADE, FLARE_GRAVITY, FLARE_LIGHT, FLARE_THROW_SPEED, FLARE_TIME, TILE_SIZE } from '../config';
import { isSolid } from '../world/tiles';
import type { World } from '../world/world';

// Thrown flares: they fly under gravity, stick to the first solid tile they touch and burn for
// FLARE_TIME seconds of play (simulation steps, so nothing burns while paused). Each one is a
// moving light in the LightMap while it burns (game.ts keeps those in step).

/** Most px a flare moves per collision check, so it can't pass through a tile. */
const STEP = 4;

export interface Flare {
  /** For its moving light's id; not saved. */
  id: number;
  /** Its burning tip, world px. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** The tile it's stuck to, or null while it's flying (or falling, after that tile went). */
  stuckTo: { tx: number; ty: number } | null;
  /** Seconds of burning left. */
  timeLeft: number;
}

/** The part of a flare that's saved. */
export interface SavedFlare {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuckTo: { tx: number; ty: number } | null;
  timeLeft: number;
}

let nextId = 1;

function newFlare(x: number, y: number, vx: number, vy: number, stuckTo: Flare['stuckTo'], timeLeft: number): Flare {
  return { id: nextId++, x, y, prevX: x, prevY: y, vx, vy, stuckTo, timeLeft };
}

/** A flare thrown from (x, y) toward (targetX, targetY), at FLARE_THROW_SPEED. */
export function throwFlare(x: number, y: number, targetX: number, targetY: number): Flare {
  const dx = targetX - x;
  const dy = targetY - y;
  const length = Math.hypot(dx, dy) || 1;
  return newFlare(x, y, (dx / length) * FLARE_THROW_SPEED, (dy / length) * FLARE_THROW_SPEED, null, FLARE_TIME);
}

/** How bright a flare is now: FLARE_LIGHT, dimming over its last FLARE_FADE seconds. */
export function flareLevel(flare: Flare): number {
  return Math.max(1, Math.ceil(FLARE_LIGHT * Math.min(1, flare.timeLeft / FLARE_FADE)));
}

/** Move and burn every flare for one step of `dt` seconds. Returns the ones still burning. */
export function updateFlares(flares: Flare[], dt: number, world: World): Flare[] {
  for (const flare of flares) {
    flare.prevX = flare.x;
    flare.prevY = flare.y;
    flare.timeLeft -= dt;
    // The tile it stuck to was mined (or fell): it drops.
    if (flare.stuckTo && !isSolid(world.getTile(flare.stuckTo.tx, flare.stuckTo.ty))) {
      flare.stuckTo = null;
      flare.vx = 0;
      flare.vy = 0;
    }
    if (flare.stuckTo) continue;
    flare.vy += FLARE_GRAVITY * dt;
    const steps = Math.max(1, Math.ceil((Math.hypot(flare.vx, flare.vy) * dt) / STEP));
    for (let i = 0; i < steps; i++) {
      const x = flare.x + (flare.vx * dt) / steps;
      const y = flare.y + (flare.vy * dt) / steps;
      const tx = Math.floor(x / TILE_SIZE);
      const ty = Math.floor(y / TILE_SIZE);
      if (isSolid(world.getTile(tx, ty))) {
        flare.stuckTo = { tx, ty };
        flare.vx = 0;
        flare.vy = 0;
        break;
      }
      flare.x = x;
      flare.y = y;
    }
  }
  return flares.filter((f) => f.timeLeft > 0);
}

export function savedFlares(flares: readonly Flare[]): SavedFlare[] {
  return flares.map(({ x, y, vx, vy, stuckTo, timeLeft }) => ({ x, y, vx, vy, stuckTo: stuckTo && { ...stuckTo }, timeLeft }));
}

/** Flares from a save, skipping anything unreadable. */
export function flaresFromSave(saved: unknown): Flare[] {
  if (!Array.isArray(saved)) return [];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const flares: Flare[] = [];
  for (const s of saved as Partial<SavedFlare>[]) {
    if (!s || !num(s.x) || !num(s.y) || !num(s.timeLeft) || s.timeLeft <= 0) continue;
    const stuck = s.stuckTo && num(s.stuckTo.tx) && num(s.stuckTo.ty) ? { tx: s.stuckTo.tx, ty: s.stuckTo.ty } : null;
    flares.push(newFlare(s.x, s.y, num(s.vx) ? s.vx : 0, num(s.vy) ? s.vy : 0, stuck, Math.min(FLARE_TIME, s.timeLeft)));
  }
  return flares;
}
