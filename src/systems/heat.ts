import { HEAT_COOL_RATE, HEAT_GRACE, HEAT_HURT_INTERVAL } from '../config';
import type { DreadStatus } from './dread';

// Heat (Phase 14b): standing in a hot zone (near lava or hot rock, see world/heat.ts) is safe for
// a short grace, then burns. It's a zone, not a meter: the HUD's safety line under the dread
// meter says when the player is in one and how long until it burns. Timed on the session clock;
// Cozy worlds don't burn.

/** Where the player stands as far as heat goes. */
export type HeatSafety = 'cool' | 'hot' | 'lava';

export class Heat {
  /** Seconds spent in a hot zone, 0..HEAT_GRACE; it burns once the grace is used up. */
  exposure = 0;
  /** Session clock time of the next burn while the grace is used up. */
  burnAt = 0;

  /** Seconds left before it burns (0 when it's burning). */
  get graceLeft(): number {
    return Math.max(0, HEAT_GRACE - this.exposure);
  }

  get burning(): boolean {
    return this.exposure >= HEAT_GRACE;
  }

  /**
   * One simulation step of `dt` seconds at clock time `now`. In a hot zone (lava counts) the
   * grace runs out; out of one it comes back HEAT_COOL_RATE times as fast. Returns true when it
   * should burn the player now: as the grace runs out, then every HEAT_HURT_INTERVAL while they
   * stay. `enabled` false (Cozy) keeps it at 0.
   */
  update(dt: number, now: number, safety: HeatSafety, enabled: boolean): boolean {
    if (!enabled || safety === 'cool') {
      this.exposure = enabled ? Math.max(0, this.exposure - dt * HEAT_COOL_RATE) : 0;
      return false;
    }
    const wasBurning = this.burning;
    this.exposure = Math.min(HEAT_GRACE, this.exposure + dt);
    if (!this.burning) return false;
    if (!wasBurning) {
      this.burnAt = now + HEAT_HURT_INTERVAL;
      return true;
    }
    if (now < this.burnAt) return false;
    this.burnAt += HEAT_HURT_INTERVAL;
    return true;
  }
}

/**
 * The safety line under the dread meter while heat matters (it takes the line over from dread),
 * or null when the player is cool and the grace is full.
 */
export function heatStatus(safety: HeatSafety, heat: Heat): DreadStatus | null {
  if (safety === 'lava') return { text: 'In lava! Get out!', tone: 'danger' };
  if (safety === 'hot') {
    if (heat.burning) return { text: 'Burning: get out of the heat!', tone: 'danger' };
    return { text: `Too hot here: burns in ${Math.ceil(heat.graceLeft)} s. Bricks keep heat out.`, tone: 'heat' };
  }
  if (heat.exposure > 0) return { text: 'Out of the heat: cooling off', tone: 'safe' };
  return null;
}
