import { DREAD_DRAIN_TIME, DREAD_HURT_INTERVAL, DREAD_RISE_TIME, DREAD_SAFE_LIGHT } from '../config';

// Dread: darkness hurts. It builds up while the player stands in the dark and drains in light;
// when it's full the player loses health. Timed on the session clock, so it stands still while
// the game is paused. Cozy worlds have none.

/**
 * How lit the player's tile is, for dread and healing:
 * - 'dark': below DREAD_SAFE_LIGHT, so dread rises;
 * - 'carried': bright enough only thanks to light the player brings (the held lantern), so dread
 *   drains but health doesn't come back;
 * - 'established': the world's own light (sky, torches) is bright enough: dread drains and
 *   health regenerates.
 */
export type LightSafety = 'dark' | 'carried' | 'established';

/** `level` is the tile's light with moving lights, `established` without them. */
export function lightSafety(level: number, established: number): LightSafety {
  if (established >= DREAD_SAFE_LIGHT) return 'established';
  return level >= DREAD_SAFE_LIGHT ? 'carried' : 'dark';
}

/** What the HUD says about the dark: how things stand and why. `tone` picks its color. */
export interface DreadStatus {
  text: string;
  tone: 'danger' | 'warning' | 'carried' | 'safe';
}

/**
 * The HUD line under the dread meter, or null when there's nothing to say (in established light
 * with no dread and full health). `healing` means health is below full; `carrier` names the
 * carried light ('Lantern', 'Flare').
 */
export function dreadStatus(safety: LightSafety, level: number, healing: boolean, carrier = 'Lantern'): DreadStatus | null {
  if (safety === 'dark') {
    return level >= 1
      ? { text: 'Dread is full: losing health. Get to light!', tone: 'danger' }
      : { text: 'Too dark here: dread is rising', tone: 'warning' };
  }
  if (safety === 'carried') {
    const what = level > 0 ? `${carrier} light: dread fading` : `${carrier} light keeps dread away`;
    return { text: healing ? `${what}, but only torchlight heals` : what, tone: 'carried' };
  }
  if (level > 0) return { text: healing ? 'Lit: dread fading, healing' : 'Lit: dread fading', tone: 'safe' };
  return healing ? { text: 'Lit: healing', tone: 'safe' } : null;
}

/** The part of Dread that's saved. */
export interface SavedDread {
  /**
   * 0 (none) to 100 (full). In percent so autosave, which compares whole numbers, notices it
   * rising or falling.
   */
  percent: number;
  /** Session clock time of the next hit while full. */
  hurtAt: number;
}

export class Dread {
  level = 0;
  hurtAt = 0;

  get full(): boolean {
    return this.level >= 1;
  }

  /**
   * One simulation step of `dt` seconds at clock time `now`. Rises in the dark (filling in
   * DREAD_RISE_TIME), drains in light (in DREAD_DRAIN_TIME) and stays at 0 when `enabled` is
   * false (Cozy). Returns true when a full meter should hurt the player now: DREAD_HURT_INTERVAL
   * after it fills, then every DREAD_HURT_INTERVAL while it stays full.
   */
  update(dt: number, now: number, safety: LightSafety, enabled: boolean): boolean {
    if (!enabled) {
      this.level = 0;
      return false;
    }
    if (safety !== 'dark') {
      this.level = Math.max(0, this.level - dt / DREAD_DRAIN_TIME);
      return false;
    }
    const wasFull = this.full;
    this.level = Math.min(1, this.level + dt / DREAD_RISE_TIME);
    if (!this.full) return false;
    if (!wasFull) {
      this.hurtAt = now + DREAD_HURT_INTERVAL;
      return false;
    }
    if (now < this.hurtAt) return false;
    this.hurtAt += DREAD_HURT_INTERVAL;
    return true;
  }

  saved(): SavedDread {
    return { percent: this.level * 100, hurtAt: this.hurtAt };
  }

  /** Dread from a save, or none if it's missing or unreadable. */
  static fromSave(saved: unknown): Dread {
    const dread = new Dread();
    const s = saved as Partial<SavedDread> | undefined;
    if (!s || typeof s !== 'object') return dread;
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (num(s.percent)) dread.level = Math.min(1, Math.max(0, s.percent / 100));
    if (num(s.hurtAt)) dread.hurtAt = s.hurtAt;
    return dread;
  }
}
