import {
  CHUNK_CACHE_LIMIT,
  CHUNK_SIZE,
  DROP_SIZE,
  GLOW_PULSE,
  GLOW_PULSE_SPEED,
  GLOW_TINT_RADIUS,
  GLOW_TINT_STRENGTH,
  HINT_DURATION,
  LIGHT_MAX,
  PLAYER_WIDTH,
  SATCHEL_SIZE,
  SCALE_3X_MIN_HEIGHT,
  SKY_BOTTOM_COLOR,
  SKY_TOP_COLOR,
  SPARKLE_ALPHA,
  SPARKLE_MIN_LIGHT,
  SURFACE_BACKGROUND,
  TILE_SIZE,
  type StratumLook,
} from '../config';
import type { Flare } from '../entities/flare';
import type { ItemDrop } from '../entities/itemDrop';
import type { Player } from '../entities/player';
import type { FallingBlock } from '../systems/caveIns';
import type { Satchel } from '../systems/death';
import { itemIndex } from '../systems/items';
import type { Hint } from '../systems/mining';
import type { PixelScale } from '../systems/settings';
import type { GenProgress } from '../world/generate';
import { playerGlow, type LightMap } from '../world/lighting';
import { STRATA } from '../world/strata';
import { ORE_TILES, Tile, TILE_COUNT, tileDef } from '../world/tiles';
import type { World } from '../world/world';
import { oreSparkle, type BreakFlash } from './juice';
import { buildBackground, caveOffset, parallaxX, parallaxY, type BackgroundLayer } from './parallax';
import type { Particles } from './particles';
import { buildBackdropTile, buildCrackAtlas, buildItemAtlas, buildTileAtlas } from './textures';

const CHUNK_PX = CHUNK_SIZE * TILE_SIZE;
/** Per tile id: the color a glowing tile tints its surroundings, or null. */
const GLOW_RGB: ([number, number, number] | null)[] = Array.from({ length: TILE_COUNT }, (_, id) => {
  const hex = tileDef(id).glowColor;
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});
const IS_ORE = new Uint8Array(TILE_COUNT);
for (const ore of ORE_TILES) IS_ORE[ore] = 1;

/** How a stratum looks behind caves: its backdrop colour and its parallax layers, as repeating patterns. */
interface StratumScene {
  backdrop: string;
  layers: { layer: BackgroundLayer; pattern: CanvasPattern }[];
}

interface CachedChunk {
  /** null when the chunk is entirely air. */
  canvas: HTMLCanvasElement | null;
  version: number;
  lastUsed: number;
}

/** Pebbles drawn under loose tiles nothing holds up: [x, y, size] from the tile's bottom-left. */
const LOOSE_PEBBLES: readonly [number, number, number][] = [
  [3, 0, 2],
  [7, 0, 3],
  [12, 0, 2],
  [9, 5, 1],
];

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Device pixels per world pixel (2 or 3). */
  scale = 2;
  /** The pixel scale setting; 'auto' picks 2 or 3 by window height. Change with setPixelScale. */
  private pixelScale: PixelScale = 'auto';
  /** Tile textures; tile id N at x = N * TILE_SIZE. */
  readonly atlas: HTMLCanvasElement;
  /** Item icons; see buildItemAtlas. */
  readonly itemAtlas: HTMLCanvasElement;
  private readonly cracks: HTMLCanvasElement;
  private readonly chunkCache = new Map<number, CachedChunk>();
  private cacheWorld: World | null = null;
  /** Parallax layers behind the world, built for `cacheWorld` from its seed. */
  private background: BackgroundLayer[] = [];
  /**
   * Strata worlds: per stratum (index into STRATA), its backdrop colour and its parallax layers
   * as repeating patterns. Null for Topsoil, which keeps the dirt backdrop; empty for worlds
   * without strata.
   */
  private strataScenes: (StratumScene | null)[] = [];
  private frame = 0;
  private sky: CanvasGradient | null = null;
  private readonly backdrop: CanvasPattern | null;
  /** One pixel per visible tile holding its darkness; scaled up over the view. */
  private readonly lightCanvas: HTMLCanvasElement;
  private readonly lightCtx: CanvasRenderingContext2D;
  private lightImage: ImageData | null = null;
  /** One pixel per visible tile holding the colored glow added to it; scaled up smoothly. */
  private readonly glowCanvas: HTMLCanvasElement;
  private readonly glowCtx: CanvasRenderingContext2D;
  private glowImage: ImageData | null = null;
  private glowSums = new Float32Array(0);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.atlas = buildTileAtlas();
    this.itemAtlas = buildItemAtlas(this.atlas);
    this.cracks = buildCrackAtlas();
    this.backdrop = ctx.createPattern(buildBackdropTile(), 'repeat');
    this.lightCanvas = document.createElement('canvas');
    const lightCtx = this.lightCanvas.getContext('2d');
    if (!lightCtx) throw new Error('Canvas 2D not supported');
    this.lightCtx = lightCtx;
    this.glowCanvas = document.createElement('canvas');
    const glowCtx = this.glowCanvas.getContext('2d');
    if (!glowCtx) throw new Error('Canvas 2D not supported');
    this.glowCtx = glowCtx;
    this.resize();
  }

  /** Match the canvas to the window in device pixels and pick the pixel scale. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    this.scale = this.pixelScale !== 'auto' ? this.pixelScale : this.canvas.height >= SCALE_3X_MIN_HEIGHT ? 3 : 2;
    this.sky = null;
  }

  setPixelScale(pixelScale: PixelScale): void {
    if (pixelScale === this.pixelScale) return;
    this.pixelScale = pixelScale;
    this.resize();
  }

  /** View size in world pixels. */
  get viewWidth(): number {
    return this.canvas.width / this.scale;
  }

  get viewHeight(): number {
    return this.canvas.height / this.scale;
  }

  /**
   * Draw the sky, the parallax background, the underground backdrop and the tiles. (camX, camY)
   * is the view's top-left in whole world pixels; `time` (s) drifts the clouds.
   */
  drawWorld(world: World, camX: number, camY: number, time = 0): void {
    const { ctx } = this;
    if (this.cacheWorld !== world) {
      this.chunkCache.clear();
      this.cacheWorld = world;
      this.background = buildBackground(world.seed, SURFACE_BACKGROUND);
      this.strataScenes = world.strataTops.length === 0 ? [] : STRATA.map((stratum, s) => this.buildScene(world.seed, stratum.look, s));
    }
    this.frame++;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGradient();
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.drawBackground(camX, camY, time);
    this.drawBackdrop(world, camX, camY);

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

  /**
   * Parallax layers, back to front. Each strip repeats sideways across the view; skylines are
   * filled with their colour down to the bottom of the view, so nothing shows through below
   * them (the underground backdrop and the tiles cover that anyway).
   */
  private drawBackground(camX: number, camY: number, time: number): void {
    const { ctx } = this;
    const viewW = this.viewWidth;
    const viewH = this.viewHeight;
    for (const { spec, canvas, horizonRow, fill } of this.background) {
      const top = Math.round(parallaxY(camY, spec.factor, spec.lift, viewH)) - horizonRow;
      if (top >= viewH) continue;
      if (top + canvas.height > 0) {
        const x0 = Math.round(parallaxX(camX, spec.factor, canvas.width, time * (spec.drift ?? 0)));
        for (let x = x0; x < viewW; x += canvas.width) ctx.drawImage(canvas, x, top);
      }
      if (!fill) continue;
      const fillTop = Math.max(0, top + canvas.height);
      if (fillTop < viewH) {
        ctx.fillStyle = fill;
        ctx.fillRect(0, fillTop, Math.ceil(viewW), Math.ceil(viewH - fillTop));
      }
    }
  }

  /** A stratum's scene: its backdrop colour and its parallax layers as patterns (null for no look: Topsoil). */
  private buildScene(seed: number, look: StratumLook | null, salt: number): StratumScene | null {
    if (!look) return null;
    const layers = buildBackground(seed, look.background, salt).flatMap((layer) => {
      const pattern = this.ctx.createPattern(layer.canvas, 'repeat');
      return pattern ? [{ layer, pattern }] : [];
    });
    return { backdrop: look.backdrop, layers };
  }

  /**
   * Behind everything below each column's original surface, so dug-out spaces read as
   * underground instead of showing the sky: a dark dirt wall, or in a strata world, the dirt wall
   * down to the end of Topsoil and then each stratum's backdrop colour with its parallax layers
   * over it, between that column's stratum boundaries.
   */
  private drawBackdrop(world: World, camX: number, camY: number): void {
    if (!this.backdrop) return;
    const { ctx } = this;
    this.backdrop.setTransform(new DOMMatrix([1, 0, 0, 1, -camX, -camY]));
    const bottom = camY + this.viewHeight;
    const c0 = Math.max(0, Math.floor(camX / TILE_SIZE));
    const c1 = Math.min(world.width - 1, Math.floor((camX + this.viewWidth) / TILE_SIZE));
    const tops = world.strataTops;
    /** Fill each visible column between rows top(c) and end(c) (exclusive) with the current fill. */
    const fillColumns = (top: (c: number) => number, end: (c: number) => number): void => {
      for (let c = c0; c <= c1; c++) {
        const y0 = Math.max(top(c) * TILE_SIZE, camY);
        const y1 = Math.min(end(c) * TILE_SIZE, bottom);
        if (y0 < y1) ctx.fillRect(c * TILE_SIZE - camX, y0 - camY, TILE_SIZE, y1 - y0);
      }
    };
    ctx.fillStyle = this.backdrop;
    if (tops.length === 0) {
      fillColumns((c) => world.surface[c], () => world.height);
      return;
    }
    fillColumns((c) => world.surface[c], (c) => tops[0][c]);
    this.strataScenes.forEach((scene, s) => {
      if (!scene) return;
      const top = (c: number): number => tops[s - 1][c];
      const end = (c: number): number => (s < tops.length ? tops[s][c] : world.height);
      ctx.fillStyle = scene.backdrop;
      fillColumns(top, end);
      for (const { layer, pattern } of scene.layers) {
        const [ox, oy] = caveOffset(camX, camY, layer.spec.factor, layer.spec.lift);
        pattern.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
        ctx.fillStyle = pattern;
        fillColumns(top, end);
      }
    });
  }

  // The draw* methods below use world px and expect drawWorld's transform to still be set.

  /**
   * Darkness over every visible tile: a black overlay with alpha = 1 - light. (glowX, glowY)
   * is the player's centre in world px; tiles near it get at least the player's faint glow.
   * Flares shine brighter than the sky; past LIGHT_MAX a tile is simply fully lit.
   */
  drawLight(lightMap: LightMap, camX: number, camY: number, glowX: number, glowY: number): void {
    const tx0 = Math.floor(camX / TILE_SIZE);
    const ty0 = Math.floor(camY / TILE_SIZE);
    const tw = Math.ceil(this.viewWidth / TILE_SIZE) + 2;
    const th = Math.ceil(this.viewHeight / TILE_SIZE) + 2;
    if (!this.lightImage || this.lightImage.width !== tw || this.lightImage.height !== th) {
      this.lightCanvas.width = tw;
      this.lightCanvas.height = th;
      this.lightImage = this.lightCtx.createImageData(tw, th);
    }
    const data = this.lightImage.data;
    const gx = glowX / TILE_SIZE - 0.5;
    const gy = glowY / TILE_SIZE - 0.5;
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const glow = playerGlow(Math.hypot(tx0 + x - gx, ty0 + y - gy));
        const level = Math.min(LIGHT_MAX, Math.max(lightMap.level(tx0 + x, ty0 + y), glow));
        data[(y * tw + x) * 4 + 3] = 255 - Math.round((level * 255) / LIGHT_MAX);
      }
    }
    this.lightCtx.putImageData(this.lightImage, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.lightCanvas, tx0 * TILE_SIZE - camX, ty0 * TILE_SIZE - camY, tw * TILE_SIZE, th * TILE_SIZE);
  }

  /**
   * Colored glow around glowing tiles (glowshrooms, crystals), added over the darkness: each
   * one tints the lit tiles within GLOW_TINT_RADIUS with its color, fading with distance and
   * pulsing slowly unless `pulse` is false (Reduced flashes). Unlit tiles get none, so it
   * doesn't shine through rock. Draw after drawLight.
   */
  drawGlowTint(world: World, lightMap: LightMap, time: number, pulse: boolean, camX: number, camY: number): void {
    const R = GLOW_TINT_RADIUS;
    // The visible tiles, plus one on each side so the smooth scaling has neighbours at the edges.
    const tx0 = Math.floor(camX / TILE_SIZE) - 1;
    const ty0 = Math.floor(camY / TILE_SIZE) - 1;
    const tw = Math.ceil(this.viewWidth / TILE_SIZE) + 3;
    const th = Math.ceil(this.viewHeight / TILE_SIZE) + 3;
    if (this.glowSums.length !== tw * th * 3) this.glowSums = new Float32Array(tw * th * 3);
    const sums = this.glowSums;
    sums.fill(0);
    let any = false;
    // Sources up to R tiles off screen still tint what's on screen.
    for (let sy = ty0 - R; sy < ty0 + th + R; sy++) {
      for (let sx = tx0 - R; sx < tx0 + tw + R; sx++) {
        const color = GLOW_RGB[world.getTile(sx, sy)];
        if (!color) continue;
        any = true;
        const phase = ((sx * 73856093) ^ (sy * 19349663)) & 1023;
        const strength = GLOW_TINT_STRENGTH * (pulse ? 1 + GLOW_PULSE * Math.sin(time * GLOW_PULSE_SPEED + phase) : 1);
        for (let y = Math.max(ty0, sy - R); y <= Math.min(ty0 + th - 1, sy + R); y++) {
          for (let x = Math.max(tx0, sx - R); x <= Math.min(tx0 + tw - 1, sx + R); x++) {
            const d = Math.hypot(x - sx, y - sy);
            if (d >= R || lightMap.level(x, y) === 0) continue;
            const w = strength * (1 - d / R) * (1 - d / R);
            const i = ((y - ty0) * tw + (x - tx0)) * 3;
            // The brightest glow per channel, not the sum, so a cluster doesn't saturate and two
            // colors next to each other still blend.
            sums[i] = Math.max(sums[i], color[0] * w);
            sums[i + 1] = Math.max(sums[i + 1], color[1] * w);
            sums[i + 2] = Math.max(sums[i + 2], color[2] * w);
          }
        }
      }
    }
    if (!any) return;
    if (!this.glowImage || this.glowImage.width !== tw || this.glowImage.height !== th) {
      this.glowCanvas.width = tw;
      this.glowCanvas.height = th;
      this.glowImage = this.glowCtx.createImageData(tw, th);
    }
    const data = this.glowImage.data;
    for (let p = 0; p < tw * th; p++) {
      data[p * 4] = sums[p * 3];
      data[p * 4 + 1] = sums[p * 3 + 1];
      data[p * 4 + 2] = sums[p * 3 + 2];
      data[p * 4 + 3] = 255;
    }
    this.glowCtx.putImageData(this.glowImage, 0, 0);
    const { ctx } = this;
    ctx.save();
    // Added on top, so black adds nothing; smoothing turns the tile grid into a soft glow.
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.glowCanvas, tx0 * TILE_SIZE - camX, ty0 * TILE_SIZE - camY, tw * TILE_SIZE, th * TILE_SIZE);
    ctx.restore();
  }

  /**
   * Glints on visible ore tiles, as bright as the light on them (see drawLight for the glow
   * arguments). `lightMap` null means everything is fully lit. Draw after the darkness.
   */
  drawSparkles(world: World, lightMap: LightMap | null, time: number, camX: number, camY: number, glowX: number, glowY: number): void {
    const { ctx } = this;
    const tx0 = Math.max(0, Math.floor(camX / TILE_SIZE));
    const ty0 = Math.max(0, Math.floor(camY / TILE_SIZE));
    const tx1 = Math.min(world.width - 1, Math.floor((camX + this.viewWidth) / TILE_SIZE));
    const ty1 = Math.min(world.height - 1, Math.floor((camY + this.viewHeight) / TILE_SIZE));
    const gx = glowX / TILE_SIZE - 0.5;
    const gy = glowY / TILE_SIZE - 0.5;
    ctx.fillStyle = '#fffbea';
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!IS_ORE[world.getTile(tx, ty)]) continue;
        const sparkle = oreSparkle(tx, ty, time);
        if (!sparkle) continue;
        // Flares shine brighter than the sky: anything past LIGHT_MAX looks fully lit.
        const level = lightMap ? Math.min(LIGHT_MAX, Math.max(lightMap.level(tx, ty), playerGlow(Math.hypot(tx - gx, ty - gy)))) : LIGHT_MAX;
        if (level < SPARKLE_MIN_LIGHT) continue;
        const alpha = SPARKLE_ALPHA * sparkle.strength * (level / LIGHT_MAX);
        const x = tx * TILE_SIZE + sparkle.x - camX;
        const y = ty * TILE_SIZE + sparkle.y - camY;
        // A bright centre pixel, with arms while the glint is at its brightest.
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, 1, 1);
        if (sparkle.strength > 0.5) {
          ctx.globalAlpha = alpha * 0.55;
          ctx.fillRect(x - 1, y, 1, 1);
          ctx.fillRect(x + 1, y, 1, 1);
          ctx.fillRect(x, y - 1, 1, 1);
          ctx.fillRect(x, y + 1, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Dread closing in from the screen's edges: clear in the middle, a dark red at the corners
   * (red, so it shows even over a pitch-black cave) of strength `alpha`, plus `pulse` for the
   * heartbeat. Draws in screen space.
   */
  drawVignette(alpha: number, pulse: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) / 2);
    const r = Math.round(110 + 80 * pulse);
    g.addColorStop(0, `rgba(${r}, 0, 16, 0)`);
    g.addColorStop(0.6, `rgba(${r}, 0, 16, ${(alpha + pulse) * 0.35})`);
    g.addColorStop(1, `rgba(${r}, 0, 16, ${Math.min(1, alpha + pulse)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** Burning flares, between their last two steps: a red tube with a flickering white-hot tip. */
  drawFlares(flares: readonly Flare[], alpha: number, time: number, camX: number, camY: number): void {
    const { ctx } = this;
    for (const f of flares) {
      const x = Math.round(f.prevX + (f.x - f.prevX) * alpha) - camX;
      const y = Math.round(f.prevY + (f.y - f.prevY) * alpha) - camY;
      ctx.fillStyle = '#c8303f';
      ctx.fillRect(x - 1, y, 2, 4);
      const flicker = Math.floor(time * 20 + f.id * 7) % 3;
      ctx.fillStyle = flicker === 0 ? '#ffffff' : flicker === 1 ? '#ffe0a0' : '#ff9a7a';
      ctx.fillRect(x - 1, y - 2, 2, 2);
      ctx.fillStyle = 'rgba(255, 200, 160, 0.5)';
      ctx.fillRect(x - 2 + flicker, y - 3 - (flicker % 2), 1, 1);
    }
  }

  /** White flashes over tiles that just broke. Marks each one drawn. */
  drawFlashes(flashes: readonly BreakFlash[], camX: number, camY: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#fff';
    for (const flash of flashes) {
      ctx.globalAlpha = flash.alpha;
      ctx.fillRect(flash.tx * TILE_SIZE - camX, flash.ty * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE);
      flash.drawn = true;
    }
    ctx.globalAlpha = 1;
  }

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

  /** Falling gravel blocks, between their last two steps. */
  drawFallingBlocks(blocks: readonly FallingBlock[], alpha: number, camX: number, camY: number): void {
    for (const b of blocks) {
      const y = Math.round(b.prevY + (b.y - b.prevY) * alpha) - camY;
      this.ctx.drawImage(this.atlas, b.tile * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, b.tx * TILE_SIZE - camX, y, TILE_SIZE, TILE_SIZE);
    }
  }

  /**
   * Shaking gravel: drawn again a pixel off now and then (when `jitter`), with a still orange
   * outline that shows the warning without motion or flashing.
   */
  drawShaking(world: World, tiles: readonly [number, number][], time: number, jitter: number, camX: number, camY: number): void {
    const { ctx } = this;
    for (const [tx, ty] of tiles) {
      const tile = world.getTile(tx, ty);
      const x = tx * TILE_SIZE - camX;
      const y = ty * TILE_SIZE - camY;
      if (jitter > 0) {
        const phase = Math.floor(time * 24) + tx * 7 + ty * 3;
        const dx = ((phase % 3) - 1) * jitter;
        const dy = (((phase >> 1) % 2) - 0.5) * jitter;
        ctx.drawImage(this.atlas, tile * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, x + dx, y + Math.round(dy), TILE_SIZE, TILE_SIZE);
      }
      this.drawTileOutline(tx, ty, 'rgba(255, 150, 40, 0.85)', camX, camY);
    }
  }

  /**
   * Dangling pebbles under loose tiles nothing holds up (they'd fall if disturbed): a still
   * mark, so a risky ceiling can be spotted without sound, shake or flashes.
   */
  drawLooseMarks(tiles: readonly [number, number][], camX: number, camY: number): void {
    const { ctx } = this;
    for (const [tx, ty] of tiles) {
      const x = tx * TILE_SIZE - camX;
      const y = (ty + 1) * TILE_SIZE - camY;
      // Three pebbles hanging under the tile and one falling away, each with a dark rim.
      for (const [px, py, size] of LOOSE_PEBBLES) {
        ctx.fillStyle = '#1e1a16';
        ctx.fillRect(x + px - 1, y + py, size + 2, size + 1);
        ctx.fillStyle = '#c9bfae';
        ctx.fillRect(x + px, y + py, size, size);
      }
    }
  }

  /** A see-through fill over a tile, for the support preview. */
  drawTileTint(tx: number, ty: number, color: string, camX: number, camY: number): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(tx * TILE_SIZE - camX, ty * TILE_SIZE - camY, TILE_SIZE, TILE_SIZE);
  }

  drawDrops(drops: readonly ItemDrop[], alpha: number, camX: number, camY: number): void {
    for (const drop of drops) {
      const x = Math.round(drop.prevX + (drop.x - drop.prevX) * alpha) - camX;
      const y = Math.round(drop.prevY + (drop.y - drop.prevY) * alpha) - camY;
      const icon = itemIndex(drop.item);
      this.ctx.drawImage(this.itemAtlas, icon * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, x, y, DROP_SIZE, DROP_SIZE);
    }
  }

  drawParticles(particles: Particles, camX: number, camY: number): void {
    const { ctx } = this;
    for (const p of particles.list) {
      ctx.globalAlpha = p.fade ? Math.max(0, p.life / p.maxLife) : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x) - camX, Math.round(p.y) - camY, p.size, p.size);
    }
    ctx.globalAlpha = 1;
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

  /**
   * Satchels: a tied brown sack with a light strap, so it stands out from the ground. It
   * bobs a little (by `time`, s) to catch the eye.
   */
  drawSatchels(satchels: readonly Satchel[], time: number, camX: number, camY: number): void {
    const { ctx } = this;
    const S = SATCHEL_SIZE;
    for (const satchel of satchels) {
      const x = Math.round(satchel.x) - camX;
      const y = Math.round(satchel.y) - camY - (Math.sin(time * 3) > 0.6 ? 1 : 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y + 3, S, S - 3);
      ctx.fillRect(x + 2, y + 1, S - 4, 3);
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(x + 1, y + 4, S - 2, S - 5);
      ctx.fillStyle = '#a8743c';
      ctx.fillRect(x + 2, y + 4, 3, S - 6);
      ctx.fillStyle = '#6d4520';
      ctx.fillRect(x + 3, y + 2, S - 6, 2); // the tied neck
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 1, y + 6, S - 2, 1); // strap
    }
  }

  /** Text floating in the world centred on (x, y) world px, e.g. the "-2" when hurt. */
  drawFloatingText(text: string, x: number, y: number, color: string, alpha: number, camX: number, camY: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const sx = Math.round(x) - camX;
    const sy = Math.round(y) - camY;
    ctx.fillStyle = '#000';
    ctx.fillText(text, sx + 1, sy + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, sx, sy);
    ctx.restore();
  }

  /** Draw the player at top-left (x, y) in world px, `alpha` opaque. Call after drawWorld. */
  drawPlayer(player: Player, x: number, y: number, camX: number, camY: number, alpha = 1, lantern = false): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
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

    // A held lantern, hanging from the hand in front.
    if (lantern) {
      ctx.fillStyle = '#46484f';
      ctx.fillRect(9, 17, 1, 2);
      ctx.fillRect(8, 19, 5, 1);
      ctx.fillRect(8, 24, 5, 1);
      ctx.fillStyle = '#ffcf5a';
      ctx.fillRect(8, 20, 5, 4);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(10, 21, 1, 2);
    }
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
