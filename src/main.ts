import {
  GEN_FRAME_BUDGET_MS,
  HOTBAR_SIZE,
  MAX_FRAME_TIME,
  PICKAXES,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  SURFACE_LEVEL,
  TILE_SIZE,
  UPDATE_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import {
  brushNeighbours,
  DEBUG,
  DEBUG_KEYS,
  debugHelpLines,
  giveDebugKit,
  nextInstantMine,
  type InstantMine,
} from './debug';
import { ItemDrop, updateDrops } from './entities/itemDrop';
import { Player } from './entities/player';
import { consumeWheel, endInputStep, initInput, isDown, mouse, wasPressed } from './input';
import { Camera } from './render/camera';
import { Particles } from './render/particles';
import { Renderer } from './render/renderer';
import { canPlace, tryPlace } from './systems/building';
import { nearbyStations } from './systems/crafting';
import { Inventory } from './systems/inventory';
import { itemDef, type ItemId } from './systems/items';
import { checkMine, Mining, type BrokenTile } from './systems/mining';
import { drawDebugInfo, drawDepthMeter, drawHotbar, drawToasts, Toasts } from './ui/hud';
import { InventoryPanel } from './ui/menus';
import { generateWorldSteps, type GenProgress } from './world/generate';
import { LightMap } from './world/lighting';
import { Tile, tileDef, type TileId } from './world/tiles';
import { fellTreeAbove } from './world/trees';
import { World } from './world/world';

const STEP = 1 / UPDATE_HZ;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const camera = new Camera();
camera.setView(renderer.viewWidth, renderer.viewHeight);
initInput(canvas);

const world = new World(WORLD_WIDTH, WORLD_HEIGHT, readSeed());
const generation = generateWorldSteps(world);
let genStatus: GenProgress = { label: 'Starting', progress: 0 };
let generating = true;
let worldHash = '';
let player = new Player(0, 0);
const inventory = Inventory.withStartingItems();
const inventoryPanel = new InventoryPanel();
const mining = new Mining();
const particles = new Particles();
let drops: ItemDrop[] = [];
let lightMap: LightMap | null = null;
const toasts = new Toasts();
let instantMine: InstantMine = 'off';
let fullbright = false;
/** F3 overlay: FPS, seed, position, controls. Starts open in debug mode. */
let showOverlay = DEBUG;

let accumulator = 0;
let lastTime = 0;
// FPS counter: frames counted over half-second windows, plus smoothed time spent per frame.
let fps = 0;
let fpsFrames = 0;
let fpsSince = 0;
let frameWorkMs = 0;

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
      lightMap = new LightMap(world);
      camera.centerOn(player.centerX, player.centerY);
      camera.clampTo(world.width * TILE_SIZE, world.height * TILE_SIZE);
      toasts.show('Press F3 for controls and debug info', 6);
      return;
    }
    genStatus = next.value;
  }
}

const anyDown = (...codes: string[]): boolean => codes.some(isDown);
const anyPressed = (...codes: string[]): boolean => codes.some(wasPressed);

/** Tile under the mouse pointer. */
function cursorTile(): [number, number] {
  const x = Math.round(camera.x) + mouse.x / renderer.scale;
  const y = Math.round(camera.y) + mouse.y / renderer.scale;
  return [Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)];
}

function update(dt: number): void {
  // Hotbar selection: keys 1..9, 0 and the mouse wheel.
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    if (wasPressed(`Digit${(i + 1) % 10}`)) inventory.selected = i;
  }
  inventory.scrollSelection(consumeWheel());
  if (wasPressed('F3')) showOverlay = !showOverlay;

  if (DEBUG) {
    if (wasPressed(DEBUG_KEYS.give)) {
      giveDebugKit(inventory);
      toasts.show('Debug: materials added');
    }
    if (wasPressed(DEBUG_KEYS.fly)) player.setFlying(!player.flying, world);
    if (wasPressed(DEBUG_KEYS.instantMine)) instantMine = nextInstantMine(instantMine);
    if (wasPressed(DEBUG_KEYS.fullbright)) fullbright = !fullbright;
  }

  const right = anyDown('KeyD', 'ArrowRight');
  const left = anyDown('KeyA', 'ArrowLeft');
  player.update(dt, world, {
    move: (right ? 1 : 0) - (left ? 1 : 0),
    jumpPressed: anyPressed('Space', 'KeyW', 'ArrowUp'),
    jumpHeld: anyDown('Space', 'KeyW', 'ArrowUp'),
    climb: (anyDown('KeyS', 'ArrowDown') ? 1 : 0) - (anyDown('KeyW', 'ArrowUp', 'Space') ? 1 : 0),
    fast: anyDown('ShiftLeft', 'ShiftRight'),
  });

  // E / Tab toggles the inventory + crafting panel (Esc also closes it). It pauses mining
  // and building; the mouse works the panel instead.
  if (anyPressed('KeyE', 'Tab') || (inventoryPanel.open && wasPressed('Escape'))) {
    inventoryPanel.open = !inventoryPanel.open;
    if (!inventoryPanel.open) {
      const leftover = inventory.returnCursor();
      if (leftover) dropAtPlayer(leftover.item, leftover.count);
    }
  }

  const [tx, ty] = cursorTile();
  if (inventoryPanel.open) {
    mining.update(dt, world, player, tx, ty, false, 0); // lets any hint fade out
    if (wasPressed('MouseLeft')) {
      const shift = anyDown('ShiftLeft', 'ShiftRight');
      const stations = nearbyStations(world, player.centerX, player.centerY);
      const crafted = inventoryPanel.click(canvas, renderer.scale, mouse.x, mouse.y, shift, inventory, stations);
      if (crafted) toasts.gained(crafted.output, crafted.count);
    }
  } else {
    const held = isDown('MouseLeft');
    const tier = inventory.bestPickaxeTier();
    const broken = mining.update(dt, world, player, tx, ty, held, tier, instantMine !== 'off');
    if (broken) onTileBroken(broken);
    if (held) {
      for (const [dx, dy] of brushNeighbours(instantMine)) {
        const extra = mining.breakInstantly(world, player, tx + dx, ty + dy, tier);
        if (extra) onTileBroken(extra);
      }
    }
    if (wasPressed('MouseRight')) tryPlace(world, player, inventory, tx, ty);
  }

  drops = updateDrops(drops, dt, world, player, inventory, (item, count) => toasts.gained(item, count));
  lightMap?.update(); // relight around any tiles that changed this step
  particles.update(dt, world);
  toasts.update(dt);
  camera.follow(player.centerX, player.centerY, dt);
  camera.clampTo(world.width * TILE_SIZE, world.height * TILE_SIZE);
}

function onTileBroken({ tx, ty, tile }: BrokenTile): void {
  shatter(tx, ty, tile);
  // Cutting a trunk brings down the rest of the tree above the cut.
  if (tile === Tile.Wood) {
    for (const felled of fellTreeAbove(world, tx, ty)) shatter(felled.tx, felled.ty, felled.tile);
  }
}

function dropAtPlayer(item: ItemId, count: number): void {
  const drop = new ItemDrop(item, count, player.centerX, player.centerY);
  drop.vx = player.facing * 120;
  drops.push(drop);
}

/** Particles and the item drop for a tile that just broke. */
function shatter(tx: number, ty: number, tile: TileId): void {
  const def = tileDef(tile);
  particles.breakBurst(tx, ty, def.color);
  if (def.drop) drops.push(new ItemDrop(def.drop, 1, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE));
}

/** Outline the tile under the cursor: white if it can be mined, red if not. */
function drawCursor(camX: number, camY: number): void {
  const [tx, ty] = cursorTile();
  const check = checkMine(world, player, tx, ty, inventory.bestPickaxeTier());
  if (check !== 'empty') {
    renderer.drawTileOutline(tx, ty, check === 'ok' ? '#ffffff' : '#ff4040', camX, camY);
    return;
  }
  // Empty tile: a faint outline where the selected block could be placed.
  const stack = inventory.selectedStack;
  const tile = stack ? itemDef(stack.item).placeTile : null;
  if (tile !== null && canPlace(world, player, tx, ty, tile)) {
    renderer.drawTileOutline(tx, ty, 'rgba(255, 255, 255, 0.45)', camX, camY);
  }
}

/** alpha (0..1) is how far we are between the last update step and the next one. */
function render(alpha: number): void {
  const camX = Math.round(lerp(camera.prevX, camera.x, alpha));
  const camY = Math.round(lerp(camera.prevY, camera.y, alpha));
  renderer.drawWorld(world, camX, camY);
  for (const crack of mining.cracks(world)) renderer.drawCracks(crack.tx, crack.ty, crack.stage, camX, camY);
  renderer.drawDrops(drops, alpha, camX, camY);
  renderer.drawPlayer(player, lerp(player.prevX, player.x, alpha), lerp(player.prevY, player.y, alpha), camX, camY);
  renderer.drawParticles(particles, camX, camY);
  if (lightMap && !fullbright) {
    const glowX = lerp(player.prevX, player.x, alpha) + PLAYER_WIDTH / 2;
    const glowY = lerp(player.prevY, player.y, alpha) + PLAYER_HEIGHT / 2;
    renderer.drawLight(lightMap, camX, camY, glowX, glowY);
  }
  if (!inventoryPanel.open) drawCursor(camX, camY);
  if (mining.hint) renderer.drawHint(mining.hint, camX, camY);
  if (inventoryPanel.open) {
    const stations = nearbyStations(world, player.centerX, player.centerY);
    inventoryPanel.draw(renderer.ctx, renderer.itemAtlas, renderer.scale, mouse.x, mouse.y, inventory, stations);
  } else {
    drawHotbar(renderer.ctx, renderer.itemAtlas, inventory, renderer.scale);
  }
  drawToasts(renderer.ctx, toasts, renderer.scale);
  // Depth is measured at the player's feet: standing on the surface level reads 0 m.
  drawDepthMeter(renderer.ctx, Math.floor((player.y + PLAYER_HEIGHT) / TILE_SIZE) - SURFACE_LEVEL, renderer.scale);
  if (showOverlay) drawOverlay();
}

/** F3 debug overlay. */
function drawOverlay(): void {
  const tx = Math.floor(player.centerX / TILE_SIZE);
  const ty = Math.floor(player.centerY / TILE_SIZE);
  const tier = inventory.bestPickaxeTier();
  const light = lightMap ? lightMap.level(tx, ty) : 0;
  const debugLines = DEBUG ? debugHelpLines(player.flying, instantMine, fullbright) : [];
  drawDebugInfo(renderer.ctx, [
    `FPS ${fps}   frame ${frameWorkMs.toFixed(1)} ms`,
    `Seed ${world.seed}   World hash ${worldHash}`,
    `Player tile (${tx}, ${ty})   Light ${light}`,
    `Pickaxe: ${tier >= 0 ? PICKAXES[tier].name : 'none'} (tier ${tier})`,
    'A/D or ←/→: move   Space, W or ↑: jump',
    'Left mouse: mine   Right mouse: place   1–0 or wheel: select',
    'E or Tab: inventory + crafting (shift-click: hotbar ↔ bag)',
    'F3: hide this overlay',
    ...debugLines,
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
  const workStart = performance.now();
  accumulator += Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = now;
  while (accumulator >= STEP) {
    update(STEP);
    endInputStep();
    accumulator -= STEP;
  }
  render(accumulator / STEP);

  frameWorkMs += (performance.now() - workStart - frameWorkMs) * 0.1;
  fpsFrames++;
  if (now - fpsSince >= 500) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
    fpsFrames = 0;
    fpsSince = now;
  }
}

requestAnimationFrame(frame);
