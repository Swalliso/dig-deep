import {
  CAMERA_FAST_MULTIPLIER,
  CAMERA_FLY_SPEED,
  GEN_FRAME_BUDGET_MS,
  MAX_FRAME_TIME,
  SURFACE_LEVEL,
  TILE_SIZE,
  UPDATE_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import { initInput, isDown } from './input';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { drawDebugInfo } from './ui/hud';
import { generateWorldSteps, type GenProgress } from './world/generate';
import { World } from './world/world';

const STEP = 1 / UPDATE_HZ;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const camera = new Camera();
camera.setView(renderer.viewWidth, renderer.viewHeight);
initInput();

const world = new World(WORLD_WIDTH, WORLD_HEIGHT, readSeed());
const generation = generateWorldSteps(world);
let genStatus: GenProgress = { label: 'Starting', progress: 0 };
let generating = true;
let worldHash = '';

let accumulator = 0;
let lastTime = 0;

window.addEventListener('resize', () => {
  renderer.resize();
  camera.setView(renderer.viewWidth, renderer.viewHeight);
  camera.clampTo(world.width * TILE_SIZE, world.height * TILE_SIZE);
});

/**
 * Seed comes from `?seed=` in the URL. Without one, pick a random seed and write it into the
 * URL so a reload regenerates the same world. (The title screen's seed field replaces this
 * in Phase 6.)
 */
function readSeed(): number {
  const params = new URLSearchParams(location.search);
  const raw = params.get('seed')?.trim();
  if (raw) {
    const n = Number(raw);
    return Number.isInteger(n) ? n >>> 0 : hashString(raw);
  }
  const seed = Math.floor(Math.random() * 1_000_000_000);
  params.set('seed', String(seed));
  history.replaceState(null, '', `${location.pathname}?${params}`);
  return seed;
}

/** Text seeds ("hello") become numbers via FNV-1a. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Run world generation for up to one frame's budget. */
function stepGeneration(): void {
  const start = performance.now();
  while (performance.now() - start < GEN_FRAME_BUDGET_MS) {
    const next = generation.next();
    if (next.done) {
      generating = false;
      worldHash = world.hash().toString(16).padStart(8, '0');
      camera.centerOn((world.spawnTx + 0.5) * TILE_SIZE, (world.spawnTy + 0.5) * TILE_SIZE);
      camera.clampTo(world.width * TILE_SIZE, world.height * TILE_SIZE);
      return;
    }
    genStatus = next.value;
  }
}

function update(dt: number): void {
  // Phase 1: free-flying camera on the arrow keys.
  let dx = 0;
  let dy = 0;
  if (isDown('ArrowLeft')) dx -= 1;
  if (isDown('ArrowRight')) dx += 1;
  if (isDown('ArrowUp')) dy -= 1;
  if (isDown('ArrowDown')) dy += 1;
  const fast = isDown('ShiftLeft') || isDown('ShiftRight');
  const speed = CAMERA_FLY_SPEED * (fast ? CAMERA_FAST_MULTIPLIER : 1);
  camera.x += dx * speed * dt;
  camera.y += dy * speed * dt;
  camera.clampTo(world.width * TILE_SIZE, world.height * TILE_SIZE);
}

function render(): void {
  renderer.drawWorld(world, camera);
  const tx = Math.floor(camera.centerX / TILE_SIZE);
  const ty = Math.floor(camera.centerY / TILE_SIZE);
  drawDebugInfo(renderer.ctx, [
    `Seed ${world.seed}   World hash ${worldHash}`,
    `View centre tile (${tx}, ${ty})   Depth ${ty - SURFACE_LEVEL} m`,
    'Arrow keys: fly   Shift: fast',
  ]);
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (generating) {
    stepGeneration();
    renderer.drawLoading(genStatus);
    lastTime = now;
    return;
  }
  accumulator += Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = now;
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }
  render();
}

requestAnimationFrame(frame);
