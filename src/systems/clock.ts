// The session clock and the pause policy. The simulation (physics, drops, mining damage and
// healing, ore glints, and later health and hazards) only moves on simulation steps, and every
// timed thing in it reads this one clock, so they all stop together whenever play is paused.

/**
 * What pauses the simulation: the pause menu, the window losing focus (or the tab being
 * hidden), the inventory/crafting panel, or the full map. The panel and the map still take
 * input while they're open; only the world stands still.
 */
export type PauseReason = 'menu' | 'focus' | 'panel' | 'map';

/** Seconds of simulated play in this world (saved with it). */
export class SessionClock {
  time: number;
  /** Simulation steps run this session. */
  steps = 0;

  constructor(time = 0) {
    this.time = time;
  }

  /** One simulation step of `dt` seconds has run. */
  advance(dt: number): void {
    this.time += dt;
    this.steps++;
  }
}
