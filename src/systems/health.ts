import { FALL_DAMAGE_PER_TILE, HURT_PROTECTION, REGEN_DELAY, REGEN_INTERVAL } from '../config';

// Health: hit points, hurt protection and regeneration, all timed on the session clock (so
// nothing ticks while the game is paused), plus the world's difficulty and fall damage.

/**
 * A world's difficulty. Cozy has no damage at all (so heat and lava don't hurt), no cave-ins
 * (gravel never falls) and no dread; Normal has them. Worlds from before Phase 11b load as Cozy.
 */
export type Difficulty = 'cozy' | 'normal';

export const DIFFICULTIES: readonly { id: Difficulty; name: string; description: string }[] = [
  { id: 'normal', name: 'Normal', description: 'Falls, falling gravel, the dark, heat and lava hurt. Dying leaves your bag in a satchel.' },
  { id: 'cozy', name: 'Cozy', description: 'Nothing can hurt you, gravel never falls, the dark holds no dread and heat never burns. Build and explore at your own pace.' },
];

export function difficultyName(difficulty: Difficulty): string {
  return difficulty === 'cozy' ? 'Cozy' : 'Normal';
}

/** What hurt the player. */
export type DamageCause =
  | { kind: 'fall'; tiles: number }
  | { kind: 'gravel' }
  | { kind: 'dread' }
  | { kind: 'heat' }
  | { kind: 'lava' }
  | { kind: 'bomb' }
  | { kind: 'debug' };

/** "You fell 24 m." */
export function deathCauseText(cause: DamageCause): string {
  if (cause.kind === 'fall') return `You fell ${Math.round(cause.tiles)} m.`;
  if (cause.kind === 'gravel') return 'Falling gravel crushed you.';
  if (cause.kind === 'dread') return 'The dark got to you.';
  if (cause.kind === 'heat') return 'The heat got to you.';
  if (cause.kind === 'lava') return 'You touched lava.';
  if (cause.kind === 'bomb') return 'You were too close to a bomb.';
  return 'Debug damage finished you off.';
}

/** HP lost landing after a fall of `tiles` (from the top of the arc), with `safeTiles` free. */
export function fallDamage(tiles: number, safeTiles: number): number {
  return tiles <= safeTiles ? 0 : Math.ceil((tiles - safeTiles) * FALL_DAMAGE_PER_TILE - 1e-9);
}

/** What a hit did. */
export type HurtResult = 'ignored' | 'hurt' | 'died';

/** The part of Health that's saved. Times are on the session clock (seconds of play). */
export interface SavedHealth {
  hp: number;
  /** Damage is ignored until this time. */
  protectedUntil: number;
  /** When the next HP comes back (if not full). */
  regenAt: number;
}

export class Health {
  hp: number;
  protectedUntil = 0;
  regenAt = 0;
  /** Debug god mode: no damage. Not saved. */
  god = false;

  constructor(hp: number) {
    this.hp = hp;
  }

  /** Is damage being ignored right now (just hurt, or just respawned)? */
  isProtected(now: number): boolean {
    return now < this.protectedUntil;
  }

  /**
   * Take `amount` damage at clock time `now`. Ignored in Cozy worlds, in god mode and while
   * protected; otherwise starts HURT_PROTECTION and restarts the regeneration delay.
   */
  hurt(amount: number, now: number, difficulty: Difficulty): HurtResult {
    if (amount <= 0 || this.hp <= 0 || this.god || difficulty === 'cozy' || this.isProtected(now)) return 'ignored';
    this.hp = Math.max(0, this.hp - Math.ceil(amount));
    this.protectedUntil = now + HURT_PROTECTION;
    this.regenAt = now + REGEN_DELAY;
    return this.hp === 0 ? 'died' : 'hurt';
  }

  /**
   * Regenerate up to `maxHp`: 1 HP every REGEN_INTERVAL once REGEN_DELAY has passed without
   * damage. While `canRegen` is false (out of established light) nothing comes back, and the
   * next HP is held at least REGEN_INTERVAL away.
   */
  update(now: number, maxHp: number, canRegen = true): void {
    if (this.hp > maxHp) this.hp = maxHp;
    if (!canRegen) {
      this.regenAt = Math.max(this.regenAt, now + REGEN_INTERVAL);
      return;
    }
    while (this.hp > 0 && this.hp < maxHp && now >= this.regenAt) {
      this.hp++;
      this.regenAt += REGEN_INTERVAL;
    }
  }

  /** Back to full, protected for `protection` seconds from `now` (respawning, or the debug heal). */
  refill(maxHp: number, now: number, protection: number): void {
    this.hp = maxHp;
    this.protectedUntil = now + protection;
    this.regenAt = now;
  }

  saved(): SavedHealth {
    return { hp: this.hp, protectedUntil: this.protectedUntil, regenAt: this.regenAt };
  }

  /** Health from a save, or full health if it's missing or unreadable. */
  static fromSave(saved: unknown, maxHp: number): Health {
    const s = saved as Partial<SavedHealth> | undefined;
    const health = new Health(maxHp);
    if (!s || typeof s !== 'object') return health;
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    // A save from the moment of death can't be loaded dead: it comes back with 1 HP.
    if (num(s.hp)) health.hp = Math.min(maxHp, Math.max(1, Math.round(s.hp)));
    if (num(s.protectedUntil)) health.protectedUntil = s.protectedUntil;
    if (num(s.regenAt)) health.regenAt = s.regenAt;
    return health;
  }
}
