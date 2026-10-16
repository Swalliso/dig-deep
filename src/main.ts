import { initAudio, setVolumes } from './audio/sfx';
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
  deleteWorld,
  listWorlds,
  markWorldOutdated,
  nextWorldId,
  readWorld,
  restoreDrops,
  restoreExplored,
  restoreInventory,
  restoreTileEntities,
  savedTileEntities,
  SAVE_VERSION,
  writeWorld,
  type SaveData,
  type WorldMeta,
} from './systems/save';
import { loadSettings, saveSettings } from './systems/settings';
import { Menus, type SettingsHooks } from './ui/menus';
import { generateWorldSteps, parseSeed, type GenProgress } from './world/generate';
import { World } from './world/world';

// Boot and the main loop: title screen → generating/loading → playing ⇄ paused.

const STEP = 1 / UPDATE_HZ;

/** Which world slot a game saves to, and the world's name. */
interface Slot {
  id: string;
  name: string;
}

type Screen =
  | { kind: 'title' }
  | {
      kind: 'loading';
      world: World;
      steps: Generator<GenProgress, void, void>;
      status: GenProgress;
      save: SaveData | null;
      slot: Slot;
    }
  | { kind: 'playing'; game: Game }
  | { kind: 'paused'; game: Game };

const canvas = document.getElementById('game') as HTMLCanvasElement;
const settings = loadSettings();
const renderer = new Renderer(canvas);
renderer.setPixelScale(settings.pixelScale);
initInput(canvas);
initAudio();
setVolumes(settings.masterVolume, settings.sfxVolume);
const menus = new Menus(document.getElementById('ui') as HTMLElement);
/** The Settings screen edits `settings` in place; every change is applied and saved at once. */
const settingsHooks: SettingsHooks = { settings, onChange: applySettings };
/** `?seed=` pre-fills the title screen's seed field. */
const urlSeed = new URLSearchParams(location.search).get('seed') ?? '';

let screen: Screen = { kind: 'title' };
/** The world being played (or last played). */
let activeSlot: Slot | null = null;
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

function applySettings(): void {
  saveSettings(settings);
  setVolumes(settings.masterVolume, settings.sfxVolume);
  renderer.setPixelScale(settings.pixelScale);
  if (screen.kind === 'playing' || screen.kind === 'paused') screen.game.resize();
}

async function saveGame(game: Game): Promise<void> {
  const slot = activeSlot;
  if (!slot) return;
  const snap = snapshot(game);
  const save = createSave(game.world, game.player, game.inventory, game.drops, game.tileEntities, { explored: game.explored, name: slot.name });
  await writeWorld(slot.id, save);
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
  const chests = JSON.stringify(savedTileEntities(game.tileEntities));
  return `${world.revision}|${game.explored.revision}|${Math.round(player.x)},${Math.round(player.y)}|${inventory.selected}|${JSON.stringify(inventory.slots)}|${ground}|${chests}`;
}

/** `note` is shown under the title (e.g. why a world couldn't be loaded). */
async function showTitle(note?: string): Promise<void> {
  screen = { kind: 'title' };
  const worlds = await listWorlds();
  if (screen.kind !== 'title') return;
  menus.showTitle({
    worlds,
    seedText: urlSeed,
    note,
    onPlay: (world) => void playWorld(world),
    onCreate: (name, seedText) =>
      void listWorlds().then((current) => startLoading(parseSeed(seedText), null, { id: nextWorldId(current.map((w) => w.id)), name })),
    onDelete: async (world) => {
      await deleteWorld(world.id).catch(() => {});
      return listWorlds();
    },
    onMarkOutdated: DEBUG ? (world) => void markWorldOutdated(world.id).then(() => showTitle()) : undefined,
    settings: settingsHooks,
  });
}

/** Load a saved world, or go back to the title saying why it can't be. */
async function playWorld(world: WorldMeta): Promise<void> {
  const status = await readWorld(world.id);
  if (screen.kind !== 'title') return;
  if (status.kind === 'ok') {
    startLoading(status.save.seed, status.save, { id: world.id, name: world.name });
    return;
  }
  const why =
    status.kind === 'outdated'
      ? `was saved by ${status.version < SAVE_VERSION ? 'an older' : 'a newer'} version`
      : status.kind === 'none'
        ? 'has no save'
        : "couldn't be read";
  void showTitle(`"${world.name}" ${why}, so it can't be loaded.`);
}

/** Generate the world from its seed (the loading screen shows progress), then apply the save if any. */
function startLoading(seed: number, save: SaveData | null, slot: Slot): void {
  menus.hide();
  const world = new World(WORLD_WIDTH, WORLD_HEIGHT, seed);
  screen = { kind: 'loading', world, steps: generateWorldSteps(world), status: { label: 'Starting', progress: 0 }, save, slot };
}

function finishLoading(world: World, save: SaveData | null, slot: Slot): void {
  let game: Game;
  try {
    if (save) applySavedChunks(world, save);
    game = new Game(
      world,
      renderer,
      settings,
      save
        ? {
            player: save.player,
            inventory: restoreInventory(save),
            drops: restoreDrops(save, world),
            tileEntities: restoreTileEntities(save, world),
            explored: restoreExplored(save, world),
          }
        : {},
    );
  } catch {
    void showTitle(`"${slot.name}" couldn't be loaded.`);
    return;
  }
  activeSlot = slot;
  screen = { kind: 'playing', game };
  accumulator = 0;
  autosave(game); // a new world is saved straight away, so it's in the list after a reload
}

function pause(game: Game): void {
  screen = { kind: 'paused', game };
  autosave(game);
  menus.showPause({
    onResume: () => resume(game),
    onSave: () => saveGame(game),
    onQuit: () => void saveGame(game).finally(() => showTitle()),
    settings: settingsHooks,
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
  const wasPlaying = screen.kind === 'playing';

  switch (screen.kind) {
    case 'title':
      // The HTML title screen covers everything. Esc backs out of Controls or Settings.
      if (wasPressed('Escape')) menus.back();
      break;
    case 'loading':
      stepLoading(screen);
      break;
    case 'paused':
      screen.game.render(1, stats());
      // Esc backs out of Settings, or resumes from the pause menu.
      if (wasPressed('Escape') && !menus.back()) resume(screen.game);
      break;
    case 'playing':
      play(screen.game, dt);
      break;
  }
  // Unless the whole frame was play, drop any input so it doesn't fire when play starts (the
  // Esc that resumes from the pause menu would pause again on the next frame).
  if (!wasPlaying || screen.kind !== 'playing') {
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
  // Esc pauses, unless it's closing the inventory panel or the map (the game handles those).
  if (wasPressed('Escape') && !game.capturesEscape) {
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
      finishLoading(loading.world, loading.save, loading.slot);
      return;
    }
    loading.status = next.value;
  }
  renderer.drawLoading(loading.status);
}

void showTitle();
requestAnimationFrame(frame);
