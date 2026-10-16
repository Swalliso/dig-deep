import {
  BACKGROUND_FILL_BELOW,
  BACKGROUND_SHADE,
  BACKGROUND_SHADE_DEPTH,
  BACKGROUND_STRIP_WIDTH,
  SURFACE_LEVEL,
  TILE_SIZE,
  type BackgroundLayerSpec,
} from '../config';
import { createRng, randInt, type Rng } from '../util/rng';

// Parallax background: procedural pixel-art strips (clouds, mountains, hills) that repeat
// sideways and scroll slower than the world, built once per world from its seed. The math
// (skyline shapes and scroll offsets) is pure so it can be tested; the strips are canvases.

type RGB = [number, number, number];

const SURFACE_PX = SURFACE_LEVEL * TILE_SIZE;

/** A built layer: its strip image and the strip row that lines up with the layer's horizon. */
export interface BackgroundLayer {
  spec: BackgroundLayerSpec;
  canvas: HTMLCanvasElement;
  horizonRow: number;
  /** CSS colour filling the view below the strip (skylines only); null for clouds. */
  fill: string | null;
}

/** How much darker a skyline layer is `depth` world px below its ridge (0..BACKGROUND_SHADE). */
export function depthShade(depth: number): number {
  return BACKGROUND_SHADE * Math.min(1, Math.max(0, depth) / BACKGROUND_SHADE_DEPTH);
}

/**
 * Skyline heights for one strip: `width` whole numbers in [min, max] that join up seamlessly
 * (the value after the last is the first), made of waves whose periods divide the width.
 * `ridged` gives sharp peaks (mountains); otherwise the skyline rolls (hills).
 */
export function periodicSkyline(rng: Rng, width: number, min: number, max: number, ridged: boolean): number[] {
  const waves = [1, 2, 3, 5, 8, 13, 21].map((k, i) => ({
    k,
    amp: (0.55 + 0.45 * rng()) / (i + 1) ** (ridged ? 0.7 : 1.1),
    phase: rng() * Math.PI * 2,
  }));
  const raw: number[] = [];
  for (let x = 0; x < width; x++) {
    let v = 0;
    for (const w of waves) {
      const a = (Math.PI * w.k * x) / width + w.phase;
      // |sin| repeats every width / k, and sin(2a) every width / k too, so the strip tiles.
      v += w.amp * (ridged ? 1 - 2 * Math.abs(Math.sin(a)) : Math.sin(2 * a));
    }
    raw.push(v);
  }
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  return raw.map((v) => Math.round(min + ((v - lo) / (hi - lo || 1)) * (max - min)));
}

/**
 * Where a layer's strip starts on screen (world px, in (-width, 0]) for a camera at camX. The
 * strip is drawn from there every `width` px across the view. `drift` adds a slow time-based
 * slide (clouds).
 */
export function parallaxX(camX: number, factor: number, width: number, drift = 0): number {
  const shift = camX * factor + drift;
  const offset = ((shift % width) + width) % width;
  return offset === 0 ? 0 : -offset;
}

/**
 * Screen y (world px from the top of the view) of a layer's horizon for a camera whose top is
 * at camY. With the view centred on the average surface, the horizon sits `lift` px above the
 * middle of the screen; moving the camera moves it by `factor` times as much.
 */
export function parallaxY(camY: number, factor: number, lift: number, viewHeight: number): number {
  const centredOnSurface = SURFACE_PX - viewHeight / 2;
  return viewHeight / 2 - lift - (camY - centredOnSurface) * factor;
}

/** Build every layer of a background set for the world with this seed. */
export function buildBackground(seed: number, specs: readonly BackgroundLayerSpec[]): BackgroundLayer[] {
  return specs.map((spec, i) => {
    const rng = createRng((seed ^ Math.imul(i + 101, 0x9e3779b9)) >>> 0);
    if (spec.kind === 'clouds') return buildClouds(spec, rng);
    return buildSkyline(spec, rng);
  });
}

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One strip's pixels; x wraps around so shapes crossing the edge come back on the other side. */
class Strip {
  readonly width: number;
  readonly height: number;
  readonly img: ImageData;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.img = new ImageData(width, height);
  }

  put(x: number, y: number, c: RGB, shade = 1): void {
    if (y < 0 || y >= this.height) return;
    const i = (y * this.width + (((x % this.width) + this.width) % this.width)) * 4;
    const d = this.img.data;
    d[i] = Math.min(255, c[0] * shade);
    d[i + 1] = Math.min(255, c[1] * shade);
    d[i + 2] = Math.min(255, c[2] * shade);
    d[i + 3] = 255;
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    ctx.putImageData(this.img, 0, 0);
    return canvas;
  }
}

/** Mountains (sharp peaks, snow on the highest) or hills (rolling, dotted with trees). */
function buildSkyline(spec: BackgroundLayerSpec, rng: Rng): BackgroundLayer {
  const W = BACKGROUND_STRIP_WIDTH;
  const treeRoom = spec.kind === 'hills' ? 12 : 0;
  const height = spec.maxHeight + treeRoom + BACKGROUND_FILL_BELOW;
  const horizonRow = height - BACKGROUND_FILL_BELOW;
  const strip = new Strip(W, height);
  const base = rgb(spec.color);
  const accent = rgb(spec.accent);
  const mountains = spec.kind === 'mountains';
  const skyline = periodicSkyline(rng, W, spec.minHeight, spec.maxHeight, mountains);
  const snowLine = spec.minHeight + 0.68 * (spec.maxHeight - spec.minHeight);

  for (let x = 0; x < W; x++) {
    const top = horizonRow - skyline[x];
    for (let y = top; y < height; y++) {
      // Darker further below the ridge, with a faint diagonal texture so big areas of one colour
      // still read as pixel art.
      strip.put(x, y, base, 1 - depthShade(y - top) - ((x * 3 + y * 5) % 23 === 0 ? 0.04 : 0));
    }
    if (mountains && skyline[x] > snowLine) {
      const depth = Math.round((skyline[x] - snowLine) * 0.4) + ((x * 7) % 3);
      for (let y = top; y < top + depth; y++) strip.put(x, y, accent);
    }
  }

  if (!mountains) {
    // Tree silhouettes standing on the skyline: round broadleaves and pointed conifers.
    for (let x = randInt(rng, 0, 12); x < W; x += randInt(rng, 5, 26)) {
      const ground = horizonRow - skyline[x];
      if (rng() < 0.5) {
        const r = randInt(rng, 2, 4);
        const cy = ground - randInt(rng, 2, 3) - r;
        for (let y = cy; y < ground; y++) strip.put(x, y, accent); // trunk
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) strip.put(x + dx, cy + dy, accent);
        }
      } else {
        const h = randInt(rng, 6, 11);
        for (let dy = 0; dy < h; dy++) {
          const half = Math.floor((dy * 3) / h + 0.5);
          for (let dx = -half; dx <= half; dx++) strip.put(x + dx, ground - h + dy, accent);
        }
      }
    }
  }
  const s = 1 - BACKGROUND_SHADE;
  const fill = `rgb(${Math.round(base[0] * s)}, ${Math.round(base[1] * s)}, ${Math.round(base[2] * s)})`;
  return { spec, canvas: strip.toCanvas(), horizonRow, fill };
}

/** Puffy clouds: a few overlapping circles each, white with a shaded underside. */
function buildClouds(spec: BackgroundLayerSpec, rng: Rng): BackgroundLayer {
  const W = BACKGROUND_STRIP_WIDTH;
  const height = spec.maxHeight + 24;
  const horizonRow = height;
  const strip = new Strip(W, height);
  const white = rgb(spec.color);
  const shade = rgb(spec.accent);
  const count = 7;
  for (let n = 0; n < count; n++) {
    const cx = Math.floor((n * W) / count) + randInt(rng, 0, Math.floor(W / count) - 40);
    const cy = horizonRow - randInt(rng, spec.minHeight + 12, spec.maxHeight);
    const puffs = randInt(rng, 3, 5);
    const bottom = cy + 4;
    for (let p = 0; p < puffs; p++) {
      const px = cx + p * randInt(rng, 6, 10);
      const r = randInt(rng, 5, 9) - (p === 0 || p === puffs - 1 ? 2 : 0);
      const py = cy + 2 - Math.floor(r / 2);
      for (let dy = -r; dy <= r; dy++) {
        const y = py + dy;
        if (y > bottom) continue; // flat bottoms
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          strip.put(px + dx, y, y >= bottom - 2 ? shade : white);
        }
      }
    }
  }
  return { spec, canvas: strip.toCanvas(), horizonRow, fill: null };
}
