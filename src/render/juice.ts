import {
  BREAK_FLASH_ALPHA,
  BREAK_FLASH_ALPHA_MAX,
  BREAK_FLASH_ALPHA_PER_HARDNESS,
  SHAKE_DECAY,
  SHAKE_MAX,
  SHAKE_PER_HARDNESS,
  SPARKLE_DURATION,
  SPARKLE_PERIOD,
  TILE_SIZE,
} from '../config';

// Cosmetic feedback: screen shake, break flashes and ore glints. None of it touches the game
// state, so Math.random is fine here.

/** Shakes the view a little when tiles break. */
export class ScreenShake {
  /** View offset in whole world px for this update step. */
  x = 0;
  y = 0;
  /** 0..1; the view moves up to SHAKE_MAX px times this. */
  private trauma = 0;

  /** A tile of this hardness broke. Breaks don't add up: it shakes at least this hard. */
  hit(hardness: number): void {
    this.trauma = Math.max(this.trauma, Math.min(1, hardness * SHAKE_PER_HARDNESS));
  }

  /** Call once per update step. */
  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
    const size = this.trauma * SHAKE_MAX;
    this.x = size > 0 ? Math.round((Math.random() * 2 - 1) * size) : 0;
    this.y = size > 0 ? Math.round((Math.random() * 2 - 1) * size) : 0;
  }
}

/** A broken tile drawn white for one frame. */
export interface BreakFlash {
  tx: number;
  ty: number;
  alpha: number;
  /** Set once it's been drawn; it's dropped at the next update step. */
  drawn: boolean;
}

/** Opacity of the flash when a tile of this hardness breaks. */
export function breakFlashAlpha(hardness: number): number {
  return Math.min(BREAK_FLASH_ALPHA_MAX, BREAK_FLASH_ALPHA + hardness * BREAK_FLASH_ALPHA_PER_HARDNESS);
}

export interface Sparkle {
  /** Pixel inside the tile (1..TILE_SIZE - 2, so a 3 x 3 glint fits). */
  x: number;
  y: number;
  /** 0..1, rising and falling over the glint. */
  strength: number;
}

/**
 * The glint on an ore tile at `time` seconds, or null between glints. Each tile glints once
 * per SPARKLE_PERIOD at a moment of its own, at a new spot each time. Deterministic, so it
 * needs no stored state.
 */
export function oreSparkle(tx: number, ty: number, time: number): Sparkle | null {
  const h = hash(tx, ty);
  const cycles = time / SPARKLE_PERIOD + (h & 0xffff) / 0x10000;
  const into = (cycles - Math.floor(cycles)) * SPARKLE_PERIOD;
  if (into >= SPARKLE_DURATION) return null;
  const spot = hash(h, Math.floor(cycles));
  const span = TILE_SIZE - 2;
  return {
    x: 1 + (spot % span),
    y: 1 + ((spot >>> 8) % span),
    strength: Math.sin((Math.PI * into) / SPARKLE_DURATION),
  };
}

function hash(a: number, b: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
