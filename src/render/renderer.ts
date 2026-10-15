import {
  CHUNK_CACHE_LIMIT,
  CHUNK_SIZE,
  DROP_SIZE,
  HINT_DURATION,
  PLAYER_WIDTH,
  SCALE_3X_MIN_HEIGHT,
  SKY_BOTTOM_COLOR,
  SKY_TOP_COLOR,
  TILE_SIZE,
} from '../config';
import type { ItemDrop } from '../entities/itemDrop';
import type { Player } from '../entities/player';
import { itemDef } from '../systems/items';
import type { Hint } from '../systems/mining';
import type { GenProgress } from '../world/generate';
import { Tile } from '../world/tiles';
import type { World } from '../world/world';
import type { Particles } from './particles';
import { buildCrackAtlas, buildTileAtlas } from './textures';

const CHUNK_PX = CHUNK_SIZE * TILE_SIZE;

interface CachedChunk {
  /** null when the chunk is entirely air. */
  canvas: HTMLCanvasElement | null;
  version: number;
  lastUsed: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Device pixels per world pixel (2 or 3). */
  scale = 2;
  /** Tile textures; tile id N at x = N * TILE_SIZE. Also used for item icons. */
  readonly atlas: HTMLCanvasElement;
  private readonly cracks: HTMLCanvasElement;
  private readonly chunkCache = new Map<number, CachedChunk>();
  private cacheWorld: World | null = null;
  private frame = 0;
  private sky: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.atlas = buildTileAtlas();
    this.cracks = buildCrackAtlas();
    this.resize();
  }

  /** Match the canvas to the window in device pixels and pick the pixel scale. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    this.scale = this.canvas.height >= SCALE_3X_MIN_HEIGHT ? 3 : 2;
    this.sky = null;
  }

  /** View size in world pixels. */
  get viewWidth(): number {
    return this.canvas.width / this.scale;
  }

  get viewHeight(): number {
    return this.canvas.height / this.scale;
  }

  /** Draw the sky and tiles. (camX, camY) is the view's top-left in whole world pixels. */
  drawWorld(world: World, camX: number, camY: number): void {
    const { ctx } = this;
    if (this.cacheWorld !== world) {
      this.chunkCache.clear();
      this.cacheWorld = world;
    }
    this.frame++;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGradient();
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Chunks overlapping the view plus a 1-tile margin.
    const cx0 = Math.max(0, Math.floor((camX - TILE_SIZE) / CHUNK_PX));
    const cy0 = Math.max(0, Math.floor((camY - TILE_SIZE) / CHUNK_PX));
    const cx1 = Math.min(world.chunksX - 1, Math.floor((camX + this.viewWidth + TILE_SIZE) / CHUNK_PX));
    const cy1 = Math.min(world.chunksY - 1, Math.floor((camY + this.viewHeight + TILE_SIZE) / CHUNK_PX));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const image = this.chunkImage(world, cx, cy);
        if (image) ctx.drawImage(image, cx * CHUNK_PX - camX, cy * CHUNK_PX - camY);
      }
    }
    this.evictChunks();
  }

  // The draw* methods below use world px and expect drawWorld's transform to still be set.

  /** Crack overlay on a tile being mined; stage is 1..CRACK_STAGES. */
  drawCracks(tx: number, ty: number, stage: number, camX: number, camY: number): void {
    const S = TILE_SIZE;
    this.ctx.drawImage(this.cracks, (stage - 1) * S, 0, S, S, tx * S - camX, ty * S - camY, S, S);
  }

  /** 1-px outline around a tile. */
  drawTileOutline(tx: number, ty: number, color: string, camX: number, camY: number): void {
    const { ctx } = this;
    const x = tx * TILE_SIZE - camX;
    const y = ty * TILE_SIZE - camY;
    const S = TILE_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, S, 1);
    ctx.fillRect(x, y + S - 1, S, 1);
    ctx.fillRect(x, y + 1, 1, S - 2);
    ctx.fillRect(x + S - 1, y + 1, 1, S - 2);
  }

  drawDrops(drops: readonly ItemDrop[], alpha: number, camX: number, camY: number): void {
    for (const drop of drops) {
      const x = Math.round(drop.prevX + (drop.x - drop.prevX) * alpha) - camX;
      const y = Math.round(drop.prevY + (drop.y - drop.prevY) * alpha) - camY;
      const icon = itemDef(drop.item).iconTile;
      this.ctx.drawImage(this.atlas, icon * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, x, y, DROP_SIZE, DROP_SIZE);
    }
  }

  drawParticles(particles: Particles, camX: number, camY: number): void {
    const { ctx } = this;
    for (const p of particles.list) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x) - camX, Math.round(p.y) - camY, p.size, p.size);
    }
  }

  /** Short message above a tile, fading out over its last half second. */
  drawHint(hint: Hint, camX: number, camY: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = Math.min(1, hint.timeLeft / Math.min(0.5, HINT_DURATION));
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const x = Math.round(hint.x) - camX;
    const y = Math.round(hint.y) - camY;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillText(hint.text, x + 0.5, y + 0.5);
    ctx.fillStyle = '#ffd7d7';
    ctx.fillText(hint.text, x, y);
    ctx.restore();
  }

  /** Draw the player at top-left (x, y) in world px. Call after drawWorld. */
  drawPlayer(player: Player, x: number, y: number, camX: number, camY: number): void {
    const { ctx } = this;
    ctx.save();
    // Draw facing right in a 12 x 28 box; mirror for facing left.
    ctx.translate(Math.round(x) - camX + (player.facing < 0 ? PLAYER_WIDTH : 0), Math.round(y) - camY);
    ctx.scale(player.facing, 1);

    // Legs: apart while walking (alternating) or in the air, together when standing.
    const walking = player.grounded && Math.abs(player.vx) > 20;
    const stride = !player.grounded || (walking && Math.floor(player.walkDistance / 6) % 2 === 0);
    ctx.fillStyle = '#3b3f58';
    if (stride) {
      ctx.fillRect(1, 20, 3, 8);
      ctx.fillRect(8, 20, 3, 8);
    } else {
      ctx.fillRect(3, 20, 3, 8);
      ctx.fillRect(6, 20, 3, 8);
    }
    ctx.fillStyle = '#2a2420';
    if (stride) {
      ctx.fillRect(1, 26, 3, 2);
      ctx.fillRect(8, 26, 4, 2);
    } else {
      ctx.fillRect(3, 26, 3, 2);
      ctx.fillRect(6, 26, 4, 2);
    }

    // Body and arm.
    ctx.fillStyle = '#c0482f';
    ctx.fillRect(2, 10, 8, 10);
    ctx.fillStyle = '#9a3622';
    ctx.fillRect(5, 11, 3, 7);
    ctx.fillStyle = '#e8b98a';
    ctx.fillRect(5, 18, 3, 2);

    // Head, hair, eye.
    ctx.fillStyle = '#e8b98a';
    ctx.fillRect(2, 2, 8, 8);
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(2, 1, 8, 3);
    ctx.fillRect(2, 4, 2, 3);
    ctx.fillStyle = '#1b1b24';
    ctx.fillRect(7, 5, 1, 2);
    ctx.restore();
  }

  drawLoading(status: GenProgress): void {
    const { ctx, canvas } = this;
    const u = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#121216';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${10 * u}px monospace`;
    ctx.fillText('Generating world…', cx, cy - 16 * u);

    const barW = Math.min(canvas.width * 0.6, 200 * u);
    const barH = 6 * u;
    ctx.fillStyle = '#33333b';
    ctx.fillRect(cx - barW / 2, cy - barH / 2, barW, barH);
    ctx.fillStyle = '#6fc24a';
    ctx.fillRect(cx - barW / 2, cy - barH / 2, barW * status.progress, barH);

    ctx.fillStyle = '#9a9aa6';
    ctx.font = `${6 * u}px monospace`;
    ctx.fillText(status.label, cx, cy + 12 * u);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  private skyGradient(): CanvasGradient {
    if (!this.sky) {
      this.sky = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      this.sky.addColorStop(0, SKY_TOP_COLOR);
      this.sky.addColorStop(1, SKY_BOTTOM_COLOR);
    }
    return this.sky;
  }

  /** Cached image of one chunk, re-rendered only when the chunk's version changes. */
  private chunkImage(world: World, cx: number, cy: number): HTMLCanvasElement | null {
    const key = cy * world.chunksX + cx;
    const version = world.chunkVersions[key];
    let entry = this.chunkCache.get(key);
    if (!entry || entry.version !== version) {
      entry = { canvas: this.renderChunk(world, cx, cy, entry?.canvas ?? null), version, lastUsed: 0 };
      this.chunkCache.set(key, entry);
    }
    entry.lastUsed = this.frame;
    return entry.canvas;
  }

  private renderChunk(world: World, cx: number, cy: number, reuse: HTMLCanvasElement | null): HTMLCanvasElement | null {
    let canvas = reuse;
    let ctx: CanvasRenderingContext2D | null = null;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = cx * CHUNK_SIZE + lx;
        const ty = cy * CHUNK_SIZE + ly;
        if (!world.inBounds(tx, ty)) continue;
        const id = world.getTile(tx, ty);
        if (id === Tile.Air) continue;
        if (!ctx) {
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = CHUNK_PX;
            canvas.height = CHUNK_PX;
          }
          ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D not supported');
          ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
        }
        ctx.drawImage(this.atlas, id * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, lx * TILE_SIZE, ly * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    return ctx ? canvas : null;
  }

  /** Drop the least recently drawn chunk images once the cache is over its limit. */
  private evictChunks(): void {
    if (this.chunkCache.size <= CHUNK_CACHE_LIMIT) return;
    const entries = [...this.chunkCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of entries) {
      if (this.chunkCache.size <= CHUNK_CACHE_LIMIT || entry.lastUsed === this.frame) break;
      this.chunkCache.delete(key);
    }
  }
}
