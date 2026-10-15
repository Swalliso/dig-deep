import {
  AUTOSAVE_INTERVAL,
  GEN_FRAME_BUDGET_MS,
  MAX_FRAME_TIME,
  SAVE_CHANGES_AFTER,
  UPDATE_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import { DEBUG } from './debug';
import { Game, type FrameStats } from './game';
import { consumeWheel, endInputStep, initInput, wasPressed } from './input';
import { Renderer } from './render/renderer';
import {
  applySavedChunks,
  createSave,
  markSaveOutdated,
  readSave,
  restoreDrops,
  restoreInventory,
  writeSave,
  type SaveData,
  type SaveStatus,
} from './systems/save';
import { Menus } from './ui/menus';
import { generateWorldSteps, parseSeed, type GenProgress } from './world/generate';
import { World } from './world/world';

// Boot and the main loop: title screen → generating/loading → playing ⇄ paused.

const STEP = 1 / UPDATE_HZ;

type Screen =
  | { kind: 'title' }
  | { kind: 'loading'; world: World; steps: Generator<GenProgress, void, void>; status: GenProgress; save: SaveData | null }
  | { kind: 'playing'; game: Game }
  | { kind: 'paused'; game: Game };

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
initInput(canvas);
const menus = new Menus(document.getElementById('ui') as HTMLElement);
/** `?seed=` pre-fills the title screen's seed field. */
const urlSeed = new URLSearchParams(location.search).get('seed') ?? '';

let screen: Screen = { kind: 'title' };
let lastSavedAt = 0;
let sinceAutosave = 0;
let sinceChangeCheck = 0;
/** What the game looked like at the last save; see snapshot(). */
let savedSnapshot = '';
let accumulator = 0;
let lastTime = 0;
// FPS counter: frames counted over half-second windows, plus smoothed time spent per frame.
let fps = 0;
let fpsFrames = 0;
let fpsSince = 0;
let frameWorkMs = 0;

window.addEventListener('resize', () => {
  renderer.resize();
  if (screen.kind === 'playing' || screen.kind === 'paused') screen.game.resize();
});

// Hiding or leaving the page saves too (best effort), so a reload loses as little as possible.
function saveIfInGame(): void {
  if (screen.kind === 'playing' || screen.kind === 'paused') void saveGame(screen.game).catch(() => {});
}
window.addEventListener('pagehide', saveIfInGame);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveIfInGame();
});

async function saveGame(game: Game): Promise<void> {
  const snap = snapshot(game);
  await writeSave(createSave(game.world, game.player, game.inventory, game.drops));
  lastSavedAt = Date.now();
  savedSnapshot = snap;
}

/** Save without waiting, telling the player if it fails. */
function autosave(game: Game): void {
  sinceAutosave = 0;
  saveGame(game).catch(() => game.toasts.show('Could not save the game'));
}

/** Cheap summary of everything a save holds, to tell whether there's anything new to save. */
function snapshot(game: Game): string {
  const { world, player, inventory, drops } = game;
  const ground = drops.map((d) => `${d.item}:${d.count}@${Math.round(d.x)},${Math.round(d.y)}`).join(';');
  return `${world.revision}|${Math.round(player.x)},${Math.round(player.y)}|${inventory.selected}|${JSON.stringify(inventory.slots)}|${ground}`;
}

/** `override` replaces what's read from storage (used when a save turns out to be unreadable). */
async function showTitle(override?: SaveStatus): Promise<void> {
  screen = { kind: 'title' };
  const save = override ?? (await readSave());
  if (screen.kind !== 'title') return;
  menus.showTitle({
    save,
    seedText: urlSeed,
    onContinue: () => {
      if (save.kind === 'ok') startLoading(save.save.seed, save.save);
    },
    onNewWorld: (text) => startLoading(parseSeed(text), null),
    onMarkOutdated: DEBUG ? () => void markSaveOutdated().then(() => showTitle()) : undefined,
  });
}

/** Generate the world from its seed (the loading screen shows progress), then apply the save if any. */
function startLoading(seed: number, save: SaveData | null): void {
  menus.hide();
  const world = new World(WORLD_WIDTH, WORLD_HEIGHT, seed);
  screen = { kind: 'loading', world, steps: generateWorldSteps(world), status: { label: 'Starting', progress: 0 }, save };
}

function finishLoading(world: World, save: SaveData | null): void {
  let game: Game;
  try {
    if (save) applySavedChunks(world, save);
    game = new Game(
      world,
      renderer,
      save ? { player: save.player, inventory: restoreInventory(save), drops: restoreDrops(save, world) } : {},
    );
  } catch {
    void showTitle({ kind: 'broken' });
    return;
  }
  screen = { kind: 'playing', game };
  accumulator = 0;
  autosave(game); // a new world is saved straight away, so Continue works after a reload
}

function pause(game: Game): void {
  screen = { kind: 'paused', game };
  autosave(game);
  menus.showPause({
    onResume: () => resume(game),
    onSave: () => saveGame(game),
    onQuit: () => void saveGame(game).finally(() => showTitle()),
  });
}

function resume(game: Game): void {
  menus.hide();
  screen = { kind: 'playing', game };
  accumulator = 0;
}

function stats(): FrameStats {
  return { fps, frameMs: frameWorkMs, lastSavedAt };
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const workStart = performance.now();
  const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = now;

  switch (screen.kind) {
    case 'title':
      break; // the HTML title screen covers everything
    case 'loading':
      stepLoading(screen);
      break;
    case 'paused':
      screen.game.render(1, stats());
      if (wasPressed('Escape')) resume(screen.game);
      break;
    case 'playing':
      play(screen.game, dt);
      break;
  }
  // Outside play, drop any input so it doesn't fire when play starts.
  if (screen.kind !== 'playing') {
    endInputStep();
    consumeWheel();
  }

  frameWorkMs += (performance.now() - workStart - frameWorkMs) * 0.1;
  fpsFrames++;
  if (now - fpsSince >= 500) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
    fpsFrames = 0;
    fpsSince = now;
  }
}

function play(game: Game, dt: number): void {
  // Esc pauses, unless it's closing the inventory panel (the game handles that).
  if (wasPressed('Escape') && !game.inventoryPanel.open) {
    endInputStep();
    pause(game);
    game.render(1, stats());
    return;
  }
  accumulator += dt;
  while (accumulator >= STEP) {
    game.update(STEP);
    endInputStep();
    accumulator -= STEP;
  }
  game.render(accumulator / STEP, stats());

  // Autosave every AUTOSAVE_INTERVAL, and save any changes within SAVE_CHANGES_AFTER seconds.
  sinceAutosave += dt;
  sinceChangeCheck += dt;
  if (sinceAutosave >= AUTOSAVE_INTERVAL) {
    autosave(game);
  } else if (sinceChangeCheck >= SAVE_CHANGES_AFTER) {
    sinceChangeCheck = 0;
    if (snapshot(game) !== savedSnapshot) autosave(game);
  }
}

/** Run world generation for up to one frame's budget. */
function stepLoading(loading: Extract<Screen, { kind: 'loading' }>): void {
  const start = performance.now();
  while (performance.now() - start < GEN_FRAME_BUDGET_MS) {
    const next = loading.steps.next();
    if (next.done) {
      finishLoading(loading.world, loading.save);
      return;
    }
    loading.status = next.value;
  }
  renderer.drawLoading(loading.status);
}

void showTitle();
requestAnimationFrame(frame);
