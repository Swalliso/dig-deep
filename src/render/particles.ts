import {
  BREAK_PARTICLES_MAX,
  BREAK_PARTICLES_MIN,
  DUST_DRAG,
  DUST_LIFETIME,
  DUST_PARTICLES_MAX,
  DUST_PARTICLES_MIN,
  DUST_RISE,
  DUST_SPEED,
  PARTICLE_GRAVITY,
  PARTICLE_LIFETIME,
  PARTICLE_SPEED,
  TILE_SIZE,
} from '../config';
import { isSolid } from '../world/tiles';
import type { World } from '../world/world';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** Life at the start; fading particles use it for their opacity. */
  maxLife: number;
  color: string;
  size: number;
  /** px/s^2, downward. */
  gravity: number;
  /** 1/s; slows the particle down (0 = no drag). */
  drag: number;
  /** Fade out over its life instead of vanishing at the end. */
  fade: boolean;
}

/** Short-lived cosmetic bits. Uses Math.random: particles never affect the game state. */
export class Particles {
  readonly list: Particle[] = [];

  /** Burst of chips from a broken tile, in shades of the tile's color. */
  breakBurst(tx: number, ty: number, color: string): void {
    const count = BREAK_PARTICLES_MIN + Math.floor(Math.random() * (BREAK_PARTICLES_MAX - BREAK_PARTICLES_MIN + 1));
    const shades = [color, shade(color, 0.75), shade(color, 1.2)];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = PARTICLE_SPEED * (0.4 + Math.random() * 0.6);
      const life = PARTICLE_LIFETIME * (0.6 + Math.random() * 0.4);
      this.list.push({
        x: (tx + 0.2 + Math.random() * 0.6) * TILE_SIZE,
        y: (ty + 0.2 + Math.random() * 0.6) * TILE_SIZE,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - PARTICLE_SPEED * 0.5,
        life,
        maxLife: life,
        color: shades[i % shades.length],
        size: Math.random() < 0.5 ? 1 : 2,
        gravity: PARTICLE_GRAVITY,
        drag: 0,
        fade: false,
      });
    }
  }

  /**
   * Dust kicked up to both sides of (x, y), the middle of the player's feet. `strength` (0..1)
   * sets how much; `color` is the ground's color.
   */
  dustPuff(x: number, y: number, strength: number, color: string): void {
    const count = Math.round(DUST_PARTICLES_MIN + (DUST_PARTICLES_MAX - DUST_PARTICLES_MIN) * strength);
    const shades = [shade(color, 1.3), shade(color, 1.6), '#d8d2c8'];
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const life = DUST_LIFETIME * (0.6 + Math.random() * 0.4);
      this.list.push({
        x: x + side * Math.random() * 4,
        y: y - 1 - Math.random() * 2,
        vx: side * DUST_SPEED * (0.4 + Math.random() * 0.6) * (0.6 + 0.4 * strength),
        vy: -DUST_RISE * (0.5 + Math.random()),
        life,
        maxLife: life,
        color: shades[i % shades.length],
        size: Math.random() < 0.6 ? 1 : 2,
        gravity: 0,
        drag: DUST_DRAG,
        fade: true,
      });
    }
  }

  /** One speck of dust trickling down from under tile (tx, ty): shaking gravel's warning. */
  trickle(tx: number, ty: number, color: string): void {
    const life = 0.5 + Math.random() * 0.4;
    this.list.push({
      x: (tx + 0.15 + Math.random() * 0.7) * TILE_SIZE,
      y: (ty + 1) * TILE_SIZE,
      vx: (Math.random() - 0.5) * 6,
      vy: 10 + Math.random() * 20,
      life,
      maxLife: life,
      color: Math.random() < 0.5 ? shade(color, 1.2) : '#d8d2c8',
      size: 1,
      gravity: PARTICLE_GRAVITY * 0.25,
      drag: 0,
      fade: true,
    });
  }

  update(dt: number, world: World): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const keep = Math.exp(-p.drag * dt);
        p.vx *= keep;
        p.vy *= keep;
      }
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      if (isSolid(world.getTile(Math.floor(nx / TILE_SIZE), Math.floor(ny / TILE_SIZE)))) {
        // Bounce lightly off whatever it hit.
        p.vx *= 0.4;
        p.vy *= -0.3;
      } else {
        p.x = nx;
        p.y = ny;
      }
    }
  }
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.min(255, Math.round(((n >> shift) & 255) * factor));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}
