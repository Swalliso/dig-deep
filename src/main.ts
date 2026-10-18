import { initAudio, setAmbience, setVolumes } from './audio/sfx';
import {
  AUTOSAVE_INTERVAL,
  GEN_FRAME_BUDGET_MS,
  MAX_FRAME_TIME,
  SAVE_CHANGES_AFTER,
  UPDATE_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './config';
import { DEBUG, debugState } from './debug';
import { bombsFromSave } from './entities/bomb';
import { flaresFromSave } from './entities/flare';
import { Game, type FrameStats } from './game';
import { actionPressed, consumeWheel, endInputStep, initInput } from './input';
import { Renderer } from './render/renderer';
import { backupFileName, backupText } from './systems/backup';
import type { PauseReason } from './systems/clock';
import {
  applySavedChunks,
  createSave,
  deleteWorld,
  listWorlds,
  markWorldOutdated,
  nextWorldId,
  readWorld,
  restoreDifficulty,
  restoreDrops,
  restoreExplored,
  restoreFallTop,
  restoreHealth,
  restoreInventory,
  restorePlayTime,
  restoreProfile,
  restoreTileEntities,
  savedState,
  SAVE_VERSION,
  writeWorld,
  type SaveData,
  type SurvivalState,
  type WorldMeta,
} from './systems/save';
import { restoreBed, restoreSatchels } from './systems/death';
import { Lifts } from './systems/lifts';
import { Dread } from './systems/dread';
import { restorePinnedRecipe } from './systems/goal';
import { MapPins } from './systems/mapPins';
import type { Difficulty } from './systems/health';
import { computeStats } from './systems/stats';
import { loadSettings, saveSettings } from './systems/settings';
import { downloadText, Menus, type SettingsHooks, type TitleOptions } from './ui/menus';
import { generateWorldSteps, NEW_WORLD_PROFILE, parseSeed, type GenProgress } from './world/generate';
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
      /** A new world's difficulty (a save brings its own). */
      difficulty: Difficulty;
    }
  | { kind: 'playing'; game: Game }
  /** The pause menu, opened with Esc or because the window lost focus. */
  | { kind: 'paused'; game: Game; reason: 'menu' | 'focus' };

/** `window.digDeep` in debug mode, for scripted checks from the browser console. */
interface DebugHook {
  readonly screen: Screen['kind'];
  /** The game being played or paused, or null. */
  readonly game: Game | null;
  /** What's pausing the world (the pause menu, focus loss, the panel or the map), or null. */
  readonly pausedBy: PauseReason | null;
  /** Date.now() of the last successful save, or 0. */
  readonly lastSavedAt: number;
  /** Debug switches (failSaves). */
  readonly state: typeof debugState;
  /** Save the current game now. */
  save(): Promise<void>;
  /** The backup file text Export backup would download for the current game, or null. */
  backupText(): string | null;
  /** Read backup text as if it was picked with Import backup (shows the Worlds or Import screen). */
  importBackup(text: string): Promise<void>;
}

declare global {
  interface Window {
    digDeep?: DebugHook;
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const settings = loadSettings();
const renderer = new Renderer(canvas);
renderer.setPixelScale(settings.pixelScale);
initInput(canvas);
initAudio();
setVolumes(settings.masterVolume, settings.sfxVolume, settings.ambienceVolume);
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
  const game = currentGame();
  if (game) game.resize();
});

/** The game being played or paused, if any. */
function currentGame(): Game | null {
  return screen.kind === 'playing' || screen.kind === 'paused' ? screen.game : null;
}

// Hiding or leaving the page saves too (best effort), so a reload loses as little as possible.
function saveIfInGame(): void {
  const game = currentGame();
  if (game) void saveGame(game).catch(() => {});
}
window.addEventListener('pagehide', saveIfInGame);
// Losing focus or hiding the tab pauses (and saves); the player resumes from the pause menu.
// Not in debug mode, so scripted checks keep running in a background preview pane.
window.addEventListener('blur', () => pauseForFocus());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !pauseForFocus()) saveIfInGame();
});

/** Pause because the window lost focus. Returns false if the game wasn't playing (or in debug mode). */
function pauseForFocus(): boolean {
  if (DEBUG || screen.kind !== 'playing') return false;
  pause(screen.game, 'focus');
  return true;
}

function applySettings(): void {
  saveSettings(settings);
  setVolumes(settings.masterVolume, settings.sfxVolume, settings.ambienceVolume);
  renderer.setPixelScale(settings.pixelScale);
  currentGame()?.resize();
}

/**
 * Health, difficulty, bed, satchels, cave-ins, dread, flares, the pinned recipe, the map pins,
 * when the Heart of the Deep was claimed, the respawn choice and lift cages (Phase 15), and
 * bombs (Phase 16): the game's saved state beyond the player and inventory.
 */
function survival(game: Game): SurvivalState {
  const { health, difficulty, bed, satchels, caveIns, dread, flares, pinnedRecipe, mapPins, heartClaimedAt, respawnAt, lifts, bombs } = game;
  return { health, difficulty, bed, satchels, caveIns, dread, flares, pinnedRecipe, mapPins, heartClaimedAt, respawnAt, lifts, bombs };
}

/** The game as a save, right now. */
function currentSave(game: Game, slot: Slot): SaveData {
  return createSave(game.world, game.savedPlayer, game.inventory, game.drops, game.tileEntities, {
    explored: game.explored,
    name: slot.name,
    playTime: game.clock.time,
    survival: survival(game),
  });
}

async function saveGame(game: Game): Promise<void> {
  const slot = activeSlot;
  if (!slot) return;
  if (debugState.failSaves) throw new Error('Debug: saves are set to fail');
  const snap = snapshot(game);
  await writeWorld(slot.id, currentSave(game, slot));
  lastSavedAt = Date.now();
  savedSnapshot = snap;
}

/** Save without waiting, telling the player if it fails. */
function autosave(game: Game): void {
  sinceAutosave = 0;
  saveGame(game).catch(() => game.toasts.show('Could not save the game'));
}

/**
 * Cheap summary of everything a save holds (except the play time), to tell whether there's
 * anything new to save. The tiles and the map are covered by their revision numbers, and
 * everything else by savedState(), so any state added to saves is noticed here too. Positions
 * are rounded to whole pixels, so a still player or a resting item doesn't count as a change.
 */
function snapshot(game: Game): string {
  const state = savedState(game.savedPlayer, game.inventory, game.drops, game.tileEntities, survival(game));
  const rounded = JSON.stringify(state, (_key, value: unknown) => (typeof value === 'number' ? Math.round(value) : value));
  return `${game.world.revision}|${game.explored.revision}|${rounded}`;
}

/** `note` is shown under the title (e.g. why a world couldn't be loaded). */
async function showTitle(note?: string): Promise<void> {
  screen = { kind: 'title' };
  setAmbience(null, 0);
  const worlds = await listWorlds();
  if (screen.kind !== 'title') return;
  menus.showTitle(titleOptions(worlds, note));
}

function titleOptions(worlds: WorldMeta[], note?: string): TitleOptions {
  return {
    worlds,
    seedText: urlSeed,
    note,
    onPlay: (world) => void playWorld(world),
    onCreate: (name, seedText, difficulty) =>
      void listWorlds().then((current) =>
        startLoading(parseSeed(seedText), null, { id: nextWorldId(current.map((w) => w.id)), name }, difficulty),
      ),
    onDelete: async (world) => {
      await deleteWorld(world.id).catch(() => {});
      return listWorlds();
    },
    onMarkOutdated: DEBUG ? (world) => void markWorldOutdated(world.id).then(() => showTitle()) : undefined,
    onExport: exportStoredWorld,
    onImport: importWorld,
    settings: settingsHooks,
  };
}

/** Download a saved world's backup file. */
async function exportStoredWorld(world: WorldMeta): Promise<void> {
  const status = await readWorld(world.id);
  if (status.kind !== 'ok') throw new Error(`"${world.name}" can't be read`);
  downloadText(backupFileName(world.name), backupText({ ...status.save, name: world.name }));
}

/**
 * Store an imported save: in a new slot (renamed if its name is taken), or in place of
 * `replace`. Resolves to the name it got and every world afterwards.
 */
async function importWorld(save: SaveData, replace: WorldMeta | null): Promise<{ name: string; worlds: WorldMeta[] }> {
  const worlds = await listWorlds();
  const id = replace ? replace.id : nextWorldId(worlds.map((w) => w.id));
  let name = save.name ?? `World ${id}`;
  if (!replace && worlds.some((w) => w.name === name)) name = `${name} (imported)`;
  await writeWorld(id, { ...save, name });
  return { name, worlds: await listWorlds() };
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

/**
 * Generate the world from its seed (the loading screen shows progress), then apply the save if
 * any. A saved world is generated with the profile it was made with (classic for worlds from
 * before Phase 12); a new one with NEW_WORLD_PROFILE. `difficulty` is for a new world.
 */
function startLoading(seed: number, save: SaveData | null, slot: Slot, difficulty: Difficulty = 'normal'): void {
  menus.hide();
  const world = new World(WORLD_WIDTH, WORLD_HEIGHT, seed);
  screen = { kind: 'loading', world, steps: generateWorldSteps(world, save ? restoreProfile(save) : NEW_WORLD_PROFILE), status: { label: 'Starting', progress: 0 }, save, slot, difficulty };
}

function finishLoading(world: World, save: SaveData | null, slot: Slot, difficulty: Difficulty): void {
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
            fallTop: restoreFallTop(save),
            inventory: restoreInventory(save),
            drops: restoreDrops(save, world),
            tileEntities: restoreTileEntities(save, world),
            explored: restoreExplored(save, world),
            playTime: restorePlayTime(save),
            difficulty: restoreDifficulty(save),
            health: restoreHealth(save, computeStats().maxHealth),
            bed: restoreBed(save.bed, world),
            satchels: restoreSatchels(save.satchels, world),
            caveIns: save.caveIns,
            dread: Dread.fromSave(save.dread),
            flares: flaresFromSave(save.flares),
            pinnedRecipe: restorePinnedRecipe(save.pinnedRecipe),
            mapPins: MapPins.fromSave(save.mapPins, world),
            heartClaimedAt: typeof save.heartClaimedAt === 'number' && Number.isFinite(save.heartClaimedAt) ? save.heartClaimedAt : null,
            respawnAt: save.respawnAt === 'camp' ? 'camp' : 'bed',
            lifts: new Lifts(world, save.lifts),
            bombs: bombsFromSave(save.bombs),
          }
        : { difficulty },
    );
  } catch {
    void showTitle(`"${slot.name}" couldn't be loaded.`);
    return;
  }
  activeSlot = slot;
  screen = { kind: 'playing', game };
  accumulator = 0;
  autosave(game); // a new world is saved straight away, so it's in the list after a reload
  // Loading finished while the player was in another window: start paused.
  if (!document.hasFocus()) pauseForFocus();
}

function pause(game: Game, reason: 'menu' | 'focus'): void {
  game.endTyping(); // keys go to the pause menu, not a pin name
  setAmbience(null, 0); // the game sets it again when it's back
  screen = { kind: 'paused', game, reason };
  autosave(game);
  menus.showPause({
    note: reason === 'focus' ? 'The game paused because its window lost focus.' : undefined,
    onResume: () => resume(game),
    onSave: () => saveGame(game),
    onQuit: () =>
      saveGame(game).then(() => {
        // Unless the player resumed while the save was being written.
        if (screen.kind === 'paused' && screen.game === game) void showTitle();
      }),
    onQuitWithoutSaving: () => void showTitle(),
    onExport: () => exportLive(game),
    difficulty: { value: game.difficulty, set: (d) => game.setDifficulty(d) },
    settings: settingsHooks,
    failSaves: DEBUG ? { on: debugState.failSaves, set: (on) => (debugState.failSaves = on) } : undefined,
  });
}

function resume(game: Game): void {
  menus.hide();
  screen = { kind: 'playing', game };
  accumulator = 0;
}

/** Download a backup of the game as it is now, saved or not. */
function exportLive(game: Game): void {
  const slot = activeSlot;
  if (slot) downloadText(backupFileName(slot.name), backupText(currentSave(game, slot)));
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
      if (actionPressed('pause')) menus.back();
      break;
    case 'loading':
      stepLoading(screen);
      break;
    case 'paused':
      screen.game.render(1, stats());
      // Esc backs out of Settings, or resumes from the pause menu.
      if (actionPressed('pause') && !menus.back()) resume(screen.game);
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
  if (actionPressed('pause') && !game.capturesEscape) {
    endInputStep();
    pause(game, 'menu');
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
  // These count while the panel or map is open too, so changes made there are saved.
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
      finishLoading(loading.world, loading.save, loading.slot, loading.difficulty);
      return;
    }
    loading.status = next.value;
  }
  renderer.drawLoading(loading.status);
}

if (DEBUG) {
  window.digDeep = {
    get screen() {
      return screen.kind;
    },
    get game() {
      return currentGame();
    },
    get pausedBy() {
      return screen.kind === 'paused' ? screen.reason : screen.kind === 'playing' ? screen.game.pausedBy : null;
    },
    get lastSavedAt() {
      return lastSavedAt;
    },
    state: debugState,
    save: () => {
      const game = currentGame();
      return game ? saveGame(game) : Promise.resolve();
    },
    backupText: () => {
      const game = currentGame();
      return game && activeSlot ? backupText(currentSave(game, activeSlot)) : null;
    },
    importBackup: async (text) => {
      if (screen.kind !== 'title') throw new Error('Backups are imported from the title screen');
      menus.importBackup(text, titleOptions(await listWorlds()));
    },
  };
}

void showTitle();
requestAnimationFrame(frame);
