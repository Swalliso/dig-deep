import {
  BREAK_PARTICLES_MAX,
  BREAK_PARTICLES_MIN,
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
  color: string;
  size: number;
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
      this.list.push({
        x: (tx + 0.2 + Math.random() * 0.6) * TILE_SIZE,
        y: (ty + 0.2 + Math.random() * 0.6) * TILE_SIZE,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - PARTICLE_SPEED * 0.5,
        life: PARTICLE_LIFETIME * (0.6 + Math.random() * 0.4),
        color: shades[i % shades.length],
        size: Math.random() < 0.5 ? 1 : 2,
      });
    }
  }

  update(dt: number, world: World): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy += PARTICLE_GRAVITY * dt;
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
