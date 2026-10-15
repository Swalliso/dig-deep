import {
  GEN_FRAME_BUDGET_MS,
  MAX_FRAME_TIME,
  SURFACE_LEVEL,
  TILE_SIZE,
  UPDATE_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import { Player } from './entities/player';
import { endInputStep, initInput, isDown, wasPressed } from './input';
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
let player = new Player(0, 0);

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
      player = new Player(world.spawnTx, world.spawnTy);
      camera.centerOn(player.centerX, player.centerY);
      camera.clampTo(world.width * TILE_SIZE, world.height * TILE_SIZE);
      return;
    }
    genStatus = next.value;
  }
}

const anyDown = (...codes: string[]): boolean => codes.some(isDown);
const anyPressed = (...codes: string[]): boolean => codes.some(wasPressed);

function update(dt: number): void {
  const right = anyDown('KeyD', 'ArrowRight');
  const left = anyDown('KeyA', 'ArrowLeft');
  player.update(dt, world, {
    move: (right ? 1 : 0) - (left ? 1 : 0),
    jumpPressed: anyPressed('Space', 'KeyW', 'ArrowUp'),
    jumpHeld: anyDown('Space', 'KeyW', 'ArrowUp'),
  });
  camera.follow(player.centerX, player.centerY, dt);
  camera.clampTo(world.width * TILE_SIZE, world.height * TILE_SIZE);
}

/** alpha (0..1) is how far we are between the last update step and the next one. */
function render(alpha: number): void {
  const camX = Math.round(lerp(camera.prevX, camera.x, alpha));
  const camY = Math.round(lerp(camera.prevY, camera.y, alpha));
  renderer.drawWorld(world, camX, camY);
  renderer.drawPlayer(player, lerp(player.prevX, player.x, alpha), lerp(player.prevY, player.y, alpha), camX, camY);

  const tx = Math.floor(player.centerX / TILE_SIZE);
  const ty = Math.floor(player.centerY / TILE_SIZE);
  drawDebugInfo(renderer.ctx, [
    `Seed ${world.seed}   World hash ${worldHash}`,
    `Player tile (${tx}, ${ty})   Depth ${ty - SURFACE_LEVEL} m`,
    'A/D or ←/→: move   Space, W or ↑: jump',
  ]);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
    endInputStep();
    accumulator -= STEP;
  }
  render(accumulator / STEP);
}

requestAnimationFrame(frame);
