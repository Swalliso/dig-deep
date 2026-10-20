import * as sfx from './audio/sfx';
import {
  AMBIENCE_DUCK,
  AMBIENCE_EVENT_GAPS,
  BANNER_FADE,
  BANNER_TIME,
  BEAM_MAX_HEIGHT,
  BOMB_DAMAGE,
  BOMB_MAX,
  CLIMB_STEP_DISTANCE,
  DAMAGE_NUMBER_TIME,
  DEATH_SCREEN_DELAY,
  DIG_TICK_INTERVAL,
  DRILL_SPEED,
  DRILL_TIER,
  DRILL_TILES_PER_COAL,
  DREAD_HEARTBEAT,
  DREAD_HEARTBEAT_SLOW,
  DREAD_PULSE_TIME,
  DREAD_WARN,
  DREAD_HURT,
  DREAD_SAFE_LIGHT,
  DREAD_VIGNETTE_ALPHA,
  DREAD_VIGNETTE_FROM,
  FLARE_MAX,
  DROP_THROW_SPEED,
  EXPLORE_INTERVAL,
  FOOTSTEP_DISTANCE,
  GRAVEL_DUST_RATE,
  GRAVEL_SHAKE_PX,
  HEART_BANNER_TIME,
  HEART_SHAKE_TIME,
  HEAT_GRACE,
  HEAT_HURT,
  HEAT_VIGNETTE_ALPHA,
  HURT_FLASH_ALPHA,
  HURT_FLASH_TIME,
  HURT_PROTECTION,
  LAND_FULL_SPEED,
  LANTERN_LIGHT,
  LAND_MIN_SPEED,
  LIGHT_FALLOFF_AIR,
  LAVA_HURT,
  PICKAXES,
  PLANT_CHECK_INTERVAL,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROTECTION_ALPHA,
  PROTECTION_BLINK,
  RESPAWN_PROTECTION,
  ROPE_LENGTH,
  ROPE_UNROLL_BUDGET,
  SATCHEL_SIZE,
  SPAN_MAX,
  SURFACE_LEVEL,
  TILE_SIZE,
  TILE_UPDATE_BUDGET,
  TORCH_LIGHT,
} from './config';
import {
  brushNeighbours,
  DEBUG,
  debugHelpLines,
  giveDebugKit,
  giveGearKit,
  heartSpot,
  nextInstantMine,
  nextStratumSpot,
  placeLadderShaft,
  placeLiftShaft,
  placeGravelPocket,
  placeLavaPool,
  placeOreSampler,
  type InstantMine,
} from './debug';
import { bombTile, throwBomb, updateBombs, type Bomb } from './entities/bomb';
import { flareLevel, throwFlare, updateFlares, type Flare } from './entities/flare';
import { ItemDrop, updateDrops } from './entities/itemDrop';
import { Player } from './entities/player';
import { actionDown, actionPressed, consumeWheel, HOTBAR_ACTIONS, mouse } from './input';
import { Camera } from './render/camera';
import { breakFlashAlpha, ScreenShake, type BreakFlash } from './render/juice';
import { MapImage } from './render/mapImage';
import { Particles } from './render/particles';
import type { PlayerLooks, Renderer } from './render/renderer';
import { campSpot, canPlace, itemForTile, overlapsPlayer, primaryAction, quickTorchSpot, tilesOnLine, tryPlace, type PrimaryAction } from './systems/building';
import { CaveIns, gravelDamage, type CaveInHooks, type SavedCaveIns } from './systems/caveIns';
import { chestAt, nearbyChests, quickStackAll, type Chest } from './systems/chests';
import { SessionClock, type PauseReason } from './systems/clock';
import { nearbyStations } from './systems/crafting';
import { Dread, dreadStatus, lightSafety, type LightSafety } from './systems/dread';
import {
  collectSatchel,
  dropSatchel,
  findRespawn,
  satchelItemCount,
  takeBag,
  touchesSatchel,
  type BedSpot,
  type RespawnChoice,
  type Satchel,
} from './systems/death';
import { goalStatus, recipeFor } from './systems/goal';
import { deathCauseText, difficultyName, fallDamage, Health, type DamageCause, type Difficulty } from './systems/health';
import { Inventory } from './systems/inventory';
import { itemDef, keptOnDeath, type ItemId } from './systems/items';
import { defaultStopName, Lifts, riderSpot, stopDepth, stopLanding, stopName, stopProblem, type Cage, type CageEvent, type LiftView, type StopSpot } from './systems/lifts';
import { MapPins } from './systems/mapPins';
import { checkMine, inReach, Mining, type BrokenTile } from './systems/mining';
import { hintSeen, markHintSeen, type HintId } from './systems/hints';
import { Heat, heatStatus, type HeatSafety } from './systems/heat';
import { saveSettings, type Settings } from './systems/settings';
import { computeStats, statChanges, type PlayerStats } from './systems/stats';
import { blastBreaks, blastHits, blastTiles, drillTilesLeft, hangRope, rollUpRope, ropePlan, ropePlanText, RopeSlack } from './systems/tools';
import { ladderGrabHint, mainKey, overlayHelpLines, respawnPrompt } from './ui/controls';
import { drawDebugInfo, drawDepthMeter, drawFpsCounter, drawHotbar, drawStratumBanner, drawToasts, Toasts } from './ui/hud';
import { goalHudLines } from './ui/guidance';
import { drawMinimap, FullMap, PIN_COLOR, type MapInput, type MapMarkers } from './ui/map';
import { depthText, LiftPanel } from './ui/liftPanel';
import { InventoryPanel, type PanelState } from './ui/menus';
import { directionText, drawDeathScreen, drawDreadMeter, drawHearts, drawHudLine, offsetText } from './ui/vitals';
import { bedLeft, bedPartner, isBed, isWholeBed } from './world/beds';
import { campPartners, campTopLeft, isCamp, isWholeCamp } from './world/camp';
import { ExploredMap } from './world/explored';
import { doorBottom, doorPartner, isDoorOpen, toggleDoor } from './world/doors';
import { CLASSIC_PROFILE, findProfile, profileLabel, type GenProfile } from './world/generate';
import { heatField, maxHeat, type HeatField } from './world/heat';
import { stopFits } from './world/lifts';
import { LightMap } from './world/lighting';
import { canPlantOn, growDuePlants, newPlant, plantGrowTime, plantStatus, plantStatusText, type PlantStatus } from './world/plants';
import { bannerTitle, depthRange, inFloatField, MAGMA, STRATA, StratumTracker, stratumAt, torchLight } from './world/strata';
import { beamFooting, columnHeld, holdsLoose, isLoose, isSupport, supportEffect, withTile, worldGetter, type SupportEffect } from './world/supports';
import { TileEntities, type TileEntity } from './world/tileEntities';
import { chanceDropFor, isLiquid, Tile, tileDef, type TileId } from './world/tiles';
import { fellTreeAbove, isTrunk } from './world/trees';
import { TileUpdates } from './world/tileUpdates';
import type { World } from './world/world';

/** Where a session starts: a fresh world (defaults) or a loaded save. */
export interface GameStart {
  /** Player top-left in world px; defaults to the world's spawn point. */
  player?: { x: number; y: number };
  /** Defaults to the starting kit. */
  inventory?: Inventory;
  /** Items lying on the ground; defaults to none. */
  drops?: ItemDrop[];
  /** Chest contents and other per-tile data; defaults to none. Must belong to this world. */
  tileEntities?: TileEntities;
  /** Tiles seen so far (the map's fog of war); defaults to none. Must belong to this world. */
  explored?: ExploredMap;
  /** Seconds already played in this world (where the session clock starts); defaults to 0. */
  playTime?: number;
  /** Defaults to Normal (a new world); saves from before Phase 11b pass Cozy. */
  difficulty?: Difficulty;
  /** Defaults to full health. */
  health?: Health;
  /** The respawn bed; defaults to none. */
  bed?: BedSpot | null;
  /** Satchels left where the player died; defaults to none. */
  satchels?: Satchel[];
  /** The top of the fall the player was in when saved (see Player.fallTop); defaults to none. */
  fallTop?: number | null;
  /** Shaking gravel, falling blocks and tiles waiting for a recheck; defaults to none. */
  caveIns?: SavedCaveIns;
  /** Defaults to none. */
  dread?: Dread;
  /** Burning flares; defaults to none. */
  flares?: Flare[];
  /** The pinned recipe (the next goal), by the item it makes; defaults to none. */
  pinnedRecipe?: ItemId | null;
  /** The player's map pins; defaults to none. */
  mapPins?: MapPins;
  /** Session clock time the Heart of the Deep was claimed; defaults to null (not yet). */
  heartClaimedAt?: number | null;
  /** Whether the bed or the camp was set as the respawn point last; defaults to the bed. */
  respawnAt?: RespawnChoice;
  /** Lift cages; defaults to none. Must belong to this world. */
  lifts?: Lifts;
  /** Bombs thrown and not gone off yet; defaults to none. */
  bombs?: Bomb[];
}

/** What the death screen says, shown until the player respawns. */
interface DeathScreen {
  lines: string[];
  /** performance.now() when the player died; the respawn key works after DEATH_SCREEN_DELAY. */
  shownAt: number;
}

/** Text floating up from a point in the world for a moment (the damage number, "Respawn point set"). */
interface Floater {
  text: string;
  color: string;
  /** World px. */
  x: number;
  y: number;
  /** Session clock time it appeared. */
  at: number;
  duration: number;
}

/** The latest hit, for its cues (red flash, shaking hearts). */
interface Hit {
  /** Session clock time. */
  at: number;
  hpBefore: number;
}

/** The support preview at the cursor, worked out again only when the cursor, the held tile or the world changes. */
interface SupportPreview {
  key: string;
  effect: SupportEffect;
  /** Placing: would the support itself be anchored? */
  anchored: boolean;
}

/** Numbers from the main loop shown on the F3 overlay. */
export interface FrameStats {
  fps: number;
  frameMs: number;
  /** Date.now() of the last successful save, or 0. */
  lastSavedAt: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** One play session in one world: everything that updates and draws while playing. */
export class Game {
  readonly world: World;
  readonly player: Player;
  readonly inventory: Inventory;
  readonly tileEntities: TileEntities;
  /** Tiles the player has seen, for the map. */
  readonly explored: ExploredMap;
  readonly inventoryPanel = new InventoryPanel();
  readonly fullMap = new FullMap();
  readonly toasts = new Toasts();
  /**
   * Seconds of simulated play. It only moves while nothing pauses the world, and everything
   * timed in the world runs on it: physics, drops, mining damage and healing, ore glints.
   */
  readonly clock: SessionClock;
  readonly health: Health;
  /** Cozy (no damage) or Normal. The pause menu can change it. */
  difficulty: Difficulty;
  /** The bed the player respawns at (its left tile), or null. */
  bed: BedSpot | null;
  /** Which of the bed and the camp was set as the respawn point last (Phase 15). */
  respawnAt: RespawnChoice;
  /** Lift cages, and the player's trip on one (Phase 15). */
  readonly lifts: Lifts;
  /** Opened by right-clicking a lift stop: pick a stop to ride to (it pauses the world). */
  readonly liftPanel = new LiftPanel();
  /** Bags left where the player died, oldest first. */
  satchels: Satchel[];
  /** Showing after a death until the player presses the respawn key (the world is paused). */
  deathScreen: DeathScreen | null = null;
  /** Active tile updates: tiles to recheck after nearby changes (cave-ins use them). */
  readonly tileUpdates: TileUpdates;
  /** Ropes whose end opened up, waiting to unroll into the new air. */
  private readonly ropeSlack: RopeSlack;
  /** Shaking and falling gravel (off in Cozy worlds). */
  readonly caveIns: CaveIns;
  /** Builds up in the dark and hurts when full (none in Cozy worlds). */
  readonly dread: Dread;
  /** The pinned recipe (the next goal) by the item it makes, or null: shown on the HUD and in the panel. */
  pinnedRecipe: ItemId | null;
  /** Named pins on the map; the tracked one shows its direction on the HUD. */
  readonly mapPins: MapPins;
  /** Session clock time the Heart of the Deep was claimed (the Sandbox's goal), or null. Saved. */
  heartClaimedAt: number | null;
  /** How long the player has stood in a hot zone (not saved: a reload starts the grace again). */
  readonly heat = new Heat();
  /** How the world was generated: its ores (for the goal's hints) and whether it has strata. */
  readonly profile: GenProfile;
  /** The stratum the player is in (strata worlds), for the entry banner, the ambience and F3. */
  private readonly stratum: StratumTracker;
  /** The entry banner of the stratum just entered, while it shows (UI time, like toasts). */
  private banner: { stratum: number; timeLeft: number } | null = null;
  /** Session clock time of the next ambient event (a drip, a creak...), or null to pick one. */
  private nextAmbientAt: number | null = null;
  /** Seconds until planted saplings and sprouts are next checked for growing. */
  private plantCheckIn = 0;
  /** How lit the player's tile was at the last simulation step. */
  private safety: LightSafety = 'established';
  /** Whether the player was in a hot zone or in lava at the last simulation step. */
  private heatSafety: HeatSafety = 'cool';
  /** Heat over the tiles on screen, for its haze; worked out again when the view or the world changes. */
  private heatView: { key: string; field: HeatField } | null = null;
  /** Seconds the Heart of the Deep's completion banner still shows (UI time), or 0. */
  private heartBanner = 0;
  /** One-time hints per session: damp torches, floatstone, heat, and where the Heart is. */
  private dampHintShown = false;
  private floatHintShown = false;
  private heatHintShown = false;
  private heartHintShown = false;
  private flareList: Flare[];
  private bombList: Bomb[];
  /**
   * Tiles the drill can still break on the coal it's burning now (it takes another from the
   * inventory when this runs out). Not saved: a reload loses at most part of one coal.
   */
  private drillCharge = 0;
  /** The player's stats when the inventory panel opened, to say what changing gear did when it closes. */
  private statsAtOpen: PlayerStats | null = null;
  /** Session clock time of the last heartbeat (dread near full), or -Infinity. */
  private lastBeatAt = -Infinity;
  /** The "dread" hint shows the first time dread builds up in a session. */
  private dreadHintShown = false;
  /** Flares whose moving light is in the light map, by id. */
  private readonly flareLights = new Set<number>();
  private readonly renderer: Renderer;
  /** Shared with the Settings screen, which changes it while the game is paused. */
  private readonly settings: Settings;
  private readonly camera = new Camera();
  private readonly mining = new Mining();
  private readonly particles = new Particles();
  private readonly shake = new ScreenShake();
  private flashes: BreakFlash[] = [];
  private readonly lightMap: LightMap;
  private readonly worldHash: string;
  private dropList: ItemDrop[];
  private instantMine: InstantMine = 'off';
  private fullbright = false;
  /** F3 overlay: FPS, seed, position, controls. Starts open in debug mode. */
  private showOverlay = DEBUG;
  /** Seconds until the next dig tick while the mine button is held on a tile. */
  private digTickIn = 0;
  /** player.walkDistance at the last footstep. */
  private lastStepAt = 0;
  /** player.climbDistance at the last rung sound. */
  private lastRungAt = 0;
  /** The map's picture, kept up to date as tiles are seen or change. */
  private readonly mapImage: MapImage;
  /** Seconds until the next look around (marking tiles seen). */
  private exploreIn = 0;
  /** The chest shown next to the inventory (opened with right-click or E), if any. */
  private openChest: { tx: number; ty: number } | null = null;
  /**
   * What the current left-button hold does, decided when it went down (see primaryAction), or
   * null when the button isn't held. Building places along the cursor's path since the last step.
   */
  private leftAction: PrimaryAction | null = null;
  private lastBuildTile: [number, number] = [0, 0];
  /** Tiles placed during this hold (keys ty * width + tx), so a tile mined meanwhile isn't refilled. */
  private readonly builtThisHold = new Set<number>();
  private floaters: Floater[] = [];
  private lastHit: Hit | null = null;
  /** The "hold W or S to grab" hint shows the first time the player falls past a ladder. */
  private ladderHintShown = false;
  /** Satchels the player was touching last step, so "inventory full" is said once per touch. */
  private touchingSatchels = new Set<Satchel>();
  /** The "loose gravel" hint shows the first time gravel starts shaking near the player. */
  private gravelHintShown = false;
  private supportPreview: SupportPreview | null = null;
  private readonly caveInHooks: CaveInHooks;
  /** The "one camp at a time" toast shows once per left-button hold. */
  private campRefusedThisHold = false;

  constructor(world: World, renderer: Renderer, settings: Settings, start: GameStart = {}) {
    this.world = world;
    this.renderer = renderer;
    this.settings = settings;
    this.player = new Player(world.spawnTx, world.spawnTy);
    this.clock = new SessionClock(start.playTime ?? 0);
    if (start.player) this.player.placeAt(start.player.x, start.player.y);
    this.player.fallTop = start.fallTop ?? null;
    this.health = start.health ?? new Health(this.player.stats.maxHealth);
    this.difficulty = start.difficulty ?? 'normal';
    this.bed = start.bed ?? null;
    this.respawnAt = start.respawnAt ?? 'bed';
    this.lifts = start.lifts ?? new Lifts();
    this.satchels = start.satchels ?? [];
    this.dread = start.dread ?? new Dread();
    this.flareList = start.flares ?? [];
    this.bombList = start.bombs ?? [];
    this.pinnedRecipe = start.pinnedRecipe ?? null;
    this.mapPins = start.mapPins ?? new MapPins();
    this.heartClaimedAt = start.heartClaimedAt ?? null;
    this.profile = findProfile(world.profile) ?? CLASSIC_PROFILE;
    this.stratum = new StratumTracker(world, ...this.playerTile());
    this.inventory = start.inventory ?? Inventory.withStartingItems();
    this.player.stats = computeStats(this.inventory.gearModifiers());
    this.dropList = start.drops ?? [];
    this.tileEntities = start.tileEntities ?? new TileEntities(world);
    // Whatever removes a chest (mining, or a debug patch over it) spills its contents.
    this.tileEntities.onRemove = (tx, ty, entity) => this.spill(tx, ty, entity);
    this.lightMap = new LightMap(world);
    this.tileUpdates = new TileUpdates(world);
    this.ropeSlack = new RopeSlack(world);
    this.caveIns = new CaveIns(world, this.tileUpdates, this.difficulty === 'normal', start.caveIns);
    this.caveInHooks = {
      touchesPlayer: (x, y) => this.blockTouchesPlayer(x, y),
      burst: (block, onPlayer, fell) => {
        if (onPlayer) this.hurt(gravelDamage(fell), { kind: 'gravel' });
        this.particles.breakBurst(block.tx, block.y / TILE_SIZE, tileDef(block.tile).color);
        const drop = tileDef(block.tile).drop;
        if (drop) this.dropList.push(new ItemDrop(drop, 1, (block.tx + 0.5) * TILE_SIZE, block.y + TILE_SIZE / 2));
        sfx.gravelLand(this.pan(block.tx));
      },
      landed: (tx, ty, tile) => {
        sfx.gravelLand(this.pan(tx));
        this.particles.dustPuff((tx + 0.5) * TILE_SIZE, (ty + 1) * TILE_SIZE, 0.5, tileDef(tile).color);
      },
      beamBroke: (tx, ty, tile) => {
        const def = tileDef(tile);
        sfx.breakTile(def.material, def.hardness, this.pan(tx));
        this.particles.breakBurst(tx, ty, def.color);
        if (def.drop) this.dropList.push(new ItemDrop(def.drop, 1, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE));
      },
      warned: (tx, ty) => {
        sfx.rumble(this.pan(tx));
        const near = Math.hypot((tx + 0.5) * TILE_SIZE - this.player.centerX, (ty + 0.5) * TILE_SIZE - this.player.centerY) < 20 * TILE_SIZE;
        if (near && !this.gravelHintShown) {
          this.gravelHintShown = true;
          this.toasts.show('Loose gravel falls when nothing holds it up. Beams and crossbeams (from planks) hold it.', 6);
        }
      },
    };
    this.explored = start.explored ?? new ExploredMap(world);
    this.mapImage = new MapImage(world, this.explored);
    this.worldHash = world.hash().toString(16).padStart(8, '0');
    this.camera.setView(renderer.viewWidth, renderer.viewHeight);
    this.camera.centerOn(this.player.centerX, this.player.centerY);
    this.clampCamera();
    this.toasts.show(`Press ${mainKey('overlay')} for controls and debug info`, 6);
  }

  /** Items lying on the ground. */
  get drops(): readonly ItemDrop[] {
    return this.dropList;
  }

  /** Flares thrown and still burning. */
  get flares(): readonly Flare[] {
    return this.flareList;
  }

  /** Bombs thrown and not gone off yet. */
  get bombs(): readonly Bomb[] {
    return this.bombList;
  }

  /** Is Esc going to close something in the game (the panel, the map or the lift panel) rather than pause? */
  get capturesEscape(): boolean {
    return this.inventoryPanel.open || this.fullMap.open || this.liftPanel.open;
  }

  /** What pauses the world from inside the game (the inventory panel, the full map or the lift panel), or null. */
  get pausedBy(): PauseReason | null {
    if (this.deathScreen) return 'dead';
    if (this.inventoryPanel.open) return 'panel';
    if (this.fullMap.open) return 'map';
    if (this.liftPanel.open) return 'lift';
    return null;
  }

  /**
   * Where a save puts the player: where they are, or, riding a lift, where the ride ends, so a
   * save made during a trip loads with the trip done (and the cage there; see Lifts.saved).
   */
  get savedPlayer(): { x: number; y: number; fallTop: number | null; centerX: number; centerY: number } {
    const { player } = this;
    const end = this.lifts.ride && this.rideEnd();
    if (!end) return player;
    return { x: end.x, y: end.y, fallTop: null, centerX: end.x + PLAYER_WIDTH / 2, centerY: end.y + PLAYER_HEIGHT / 2 };
  }

  /** Call after the renderer has resized. */
  resize(): void {
    this.camera.setView(this.renderer.viewWidth, this.renderer.viewHeight);
    this.clampCamera();
  }

  /**
   * One fixed step. The HUD, the inventory panel and the map take input every step, but the
   * world only moves (on the session clock) while neither the panel nor the map is open. The
   * pause menu and focus loss stop update() being called at all (see main.ts).
   */
  update(dt: number): void {
    // A break flash lasts one drawn frame, paused or not.
    this.flashes = this.flashes.filter((f) => !f.drawn);
    // Worn gear sets the stats (it only changes in the inventory panel, while the world is paused).
    this.player.stats = computeStats(this.inventory.gearModifiers());
    // The step that leaves the death screen doesn't simulate, so the respawn key (Space) doesn't jump too.
    const dead = this.deathScreen !== null;
    if (dead) {
      this.updateDeathScreen();
    } else {
      this.handleInput(dt);
    }
    if (this.pausedBy || dead) {
      this.leftAction = null;
      this.digTickIn = 0;
    } else {
      this.simulate(dt);
    }
    this.updateCarriedLight();
    this.lightMap.update(); // relight around any tiles that changed this step, and the lantern if it moved
    this.toasts.update(dt);
    this.updateStratum(dt);
  }

  /**
   * Strata worlds: show the entry banner when the player crosses into another stratum, and play
   * that stratum's ambience (quieter while the world is paused by the panel, map or death screen).
   */
  private updateStratum(dt: number): void {
    const entered = this.stratum.update(this.world, ...this.playerTile());
    if (entered !== null) {
      this.banner = { stratum: entered, timeLeft: BANNER_TIME };
      this.nextAmbientAt = null;
      if (entered === MAGMA) this.heartHint();
    }
    if (this.banner) {
      this.banner.timeLeft -= dt;
      if (this.banner.timeLeft <= 0) this.banner = null;
    }
    this.heartBanner = Math.max(0, this.heartBanner - dt);
    const s = this.stratum.current;
    sfx.setAmbience(s >= 0 ? STRATA[s].ambience : null, this.pausedBy || this.deathScreen ? AMBIENCE_DUCK : 1);
  }

  /**
   * The first time in a session the player reaches the Magma Layer: which way the Heart of the
   * Deep is (unless it's claimed), so it can be found without the map.
   */
  private heartHint(): void {
    const heart = this.world.heart;
    if (!heart || this.heartClaimedAt !== null || this.heartHintShown) return;
    this.heartHintShown = true;
    const dx = heart.tx + 0.5 - this.player.centerX / TILE_SIZE;
    const way = Math.abs(dx) < 15 ? 'right below you' : `about ${Math.round(Math.abs(dx))} m to the ${dx < 0 ? 'west (left)' : 'east (right)'}`;
    this.toasts.show(`Deep below, the Heart of the Deep pulses above the bedrock, ${way}. Its walls need an emberite pickaxe.`, 9);
  }

  /**
   * Now and then (on the session clock, so never while the world is paused), one of the
   * stratum's ambient events: a gust, a creak, a drip, a chime, a distant boom.
   */
  private ambientEvents(): void {
    const s = this.stratum.current;
    if (s < 0) return;
    const id = STRATA[s].ambience;
    const now = this.clock.time;
    if (this.nextAmbientAt !== null && now < this.nextAmbientAt) return;
    if (this.nextAmbientAt !== null) sfx.ambientEvent(id, Math.random() * 2 - 1);
    const [min, max] = AMBIENCE_EVENT_GAPS[id];
    this.nextAmbientAt = now + min + Math.random() * (max - min);
  }

  /** Every PLANT_CHECK_INTERVAL: grow the planted saplings and sprouts whose time has come, if they can (see growDuePlants). */
  private growPlants(dt: number): void {
    this.plantCheckIn -= dt;
    if (this.plantCheckIn > 0) return;
    this.plantCheckIn = PLANT_CHECK_INTERVAL;
    for (const [tx, ty] of growDuePlants(this.world, this.tileEntities, this.clock.time)) {
      // A rustle when it happens on screen.
      if (this.onScreen(tx, ty)) sfx.place('plant', this.pan(tx));
    }
  }

  /** Is tile (tx, ty) within a screen's view of the player? */
  private onScreen(tx: number, ty: number): boolean {
    const dx = Math.abs((tx + 0.5) * TILE_SIZE - this.player.centerX);
    const dy = Math.abs((ty + 0.5) * TILE_SIZE - this.player.centerY);
    return dx < this.renderer.viewWidth / 2 && dy < this.renderer.viewHeight / 2;
  }

  /** Keys, the map and the panel: everything that takes input while the player is alive. */
  private handleInput(dt: number): void {
    this.handleKeys();
    if (this.liftPanel.open) {
      this.updateLiftPanel();
    } else if (this.fullMap.open) {
      const { canvas, scale } = this.renderer;
      const pins = { pins: this.mapPins, explored: this.explored };
      this.fullMap.update(dt, this.mapInput(), canvas.width, canvas.height, scale, this.world.width, this.world.height, pins);
    } else {
      this.handlePanelInput();
    }
  }

  /** Keys that work whether or not the world is paused: the overlay, map, hotbar, panel and cheats. */
  private handleKeys(): void {
    const { inventory, inventoryPanel } = this;
    if (actionPressed('overlay')) this.showOverlay = !this.showOverlay;
    // The lift panel takes the mouse and Esc; the other keys wait until it closes.
    if (this.liftPanel.open) return;
    // M opens the full map (closing the inventory panel); M or Esc closes it. While it's open the
    // mouse wheel, dragging and the movement keys move the map.
    // While a pin name is being typed, Esc only stops the typing (the map handles it).
    if (actionPressed('map') || (this.fullMap.open && actionPressed('pause') && !this.fullMap.isEditing)) this.toggleMap();
    if (actionPressed('minimap')) {
      this.settings.showMinimap = !this.settings.showMinimap;
      saveSettings(this.settings);
    }

    // Hotbar selection: keys 1..9, 0 and the mouse wheel.
    HOTBAR_ACTIONS.forEach((action, i) => {
      if (actionPressed(action)) inventory.selected = i;
    });
    if (!this.fullMap.open) inventory.scrollSelection(consumeWheel());
    if (DEBUG) this.debugKeys();
    if (this.fullMap.open) return;

    if (actionPressed('dropStack')) this.throwSelected();
    if (actionPressed('quickStack')) this.quickStackNearby();
    // E / Tab toggles the inventory + crafting panel (Esc also closes it), opening the nearest
    // chest in reach alongside it. While it's open the world is paused and the mouse works the panel.
    // While the recipe search is being typed in, Esc only clears it (the panel handles that).
    if (actionPressed('inventory') || (inventoryPanel.open && actionPressed('pause') && !inventoryPanel.searching)) {
      if (inventoryPanel.open) {
        this.closePanel();
      } else {
        this.openPanel();
        this.openChest = this.nearestChestInReach();
      }
    }
  }

  private debugKeys(): void {
    const { world, player, toasts } = this;
    // Shift+G: the gear kit (a Shift tapped in the same step counts too).
    if (actionPressed('debugGive') && (actionDown('modifier') || actionPressed('modifier'))) {
      giveGearKit(this.inventory);
      toasts.show('Debug: gear kit added (every accessory, bombs, rope coils, a drill and coal)');
    } else if (actionPressed('debugGive')) {
      giveDebugKit(this.inventory);
      toasts.show('Debug: materials added');
    }
    if (actionPressed('debugFly')) {
      this.lifts.ride = null;
      player.setFlying(!player.flying, world);
    }
    if (actionPressed('debugInstantMine')) this.instantMine = nextInstantMine(this.instantMine);
    if (actionPressed('debugLighting')) this.fullbright = !this.fullbright;
    if (actionPressed('debugRevealMap')) {
      this.explored.revealAll();
      toasts.show('Debug: whole map revealed');
    }
    if (actionPressed('debugGodMode')) {
      this.health.god = !this.health.god;
      this.health.refill(player.stats.maxHealth, this.clock.time, 0);
      toasts.show(`Debug: god mode ${this.health.god ? 'on' : 'off'}, healed`);
    }
    // These change tiles at the cursor or hurt the player, so they need the world in view.
    if (this.pausedBy) return;
    if (actionPressed('debugDread')) {
      if (this.difficulty === 'cozy') toasts.show('Debug: Cozy worlds have no dread');
      else this.dread.level = this.dread.full ? 0 : 1;
    }
    if (actionPressed('debugHurt')) {
      if (this.difficulty === 'cozy') toasts.show('Debug: Cozy worlds take no damage');
      this.hurt(2, { kind: 'debug' });
    }
    if (actionPressed('debugOres')) {
      const [ox, oy] = this.cursorTile();
      placeOreSampler(world, ox, oy);
    }
    if (actionPressed('debugGravel')) {
      const [gx, gy] = this.cursorTile();
      placeGravelPocket(world, gx, gy);
      toasts.show(this.caveIns.isEnabled ? 'Debug: gravel at the cursor' : 'Debug: gravel at the cursor (Cozy: it never falls)');
    }
    if (actionPressed('debugLadderShaft')) {
      const [lx, ly] = this.cursorTile();
      toasts.show(`Debug: ${placeLadderShaft(world, lx, ly)} m ladder shaft`);
    }
    if (actionPressed('debugNextStratum')) this.debugNextStratum();
    if (actionPressed('debugLiftShaft')) {
      const [lx, ly] = this.cursorTile();
      const length = placeLiftShaft(world, this.tileEntities, lx, ly);
      toasts.show(length > 0 ? `Debug: ${length} m lift with stops (right-click one to ride)` : 'Debug: no room for a lift here');
    }
    if (actionPressed('debugHeart')) this.debugHeart();
    if (actionPressed('debugLava')) {
      const [lx, ly] = this.cursorTile();
      placeLavaPool(world, lx, ly);
      toasts.show(this.difficulty === 'cozy' ? 'Debug: lava at the cursor (Cozy: it never burns)' : 'Debug: lava at the cursor');
    }
    if (actionPressed('debugGrowPlants')) {
      let planted = 0;
      this.tileEntities.forEach((_tx, _ty, entity) => {
        if (entity.kind !== 'plant') return;
        entity.growAt = Math.min(entity.growAt, this.clock.time);
        planted++;
      });
      this.plantCheckIn = 0;
      toasts.show(planted > 0 ? `Debug: ${planted} planted sapling${planted === 1 ? '' : 's'} or spores grow now if they can (the rest start their time again)` : 'Debug: nothing planted');
    }
  }

  /** Debug: to the top of the next stratum down (from the bottom one, back to the world spawn). */
  private debugNextStratum(): void {
    const { player, camera, toasts } = this;
    const spot = nextStratumSpot(this.world, ...this.playerTile());
    this.lifts.ride = null;
    if (!spot) {
      toasts.show(`Debug: this world has no strata (it was made with ${profileLabel(this.world.profile)})`);
      return;
    }
    player.placeAt(spot.tx * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2, (spot.ty + 1) * TILE_SIZE - PLAYER_HEIGHT);
    camera.centerOn(player.centerX, player.centerY);
    this.clampCamera();
    camera.prevX = camera.x;
    camera.prevY = camera.y;
    toasts.show(`Debug: ${STRATA[spot.stratum].name}`);
  }

  /** Debug: onto the roof of the Heart of the Deep's chamber. */
  private debugHeart(): void {
    const { player, camera, toasts } = this;
    const spot = heartSpot(this.world);
    this.lifts.ride = null;
    if (!spot) {
      toasts.show(`Debug: this world has no Heart of the Deep (it was made with ${profileLabel(this.world.profile)})`);
      return;
    }
    player.placeAt(spot.tx * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2, (spot.ty + 1) * TILE_SIZE - PLAYER_HEIGHT);
    camera.centerOn(player.centerX, player.centerY);
    this.clampCamera();
    camera.prevX = camera.x;
    camera.prevY = camera.y;
    toasts.show('Debug: the Heart of the Deep, below you (its walls need the emberite pickaxe)', 4);
  }

  /** Right-click (chests and doors) and clicks in the open inventory panel. Not while the map is open. */
  private handlePanelInput(): void {
    const { player, inventoryPanel, toasts } = this;
    // An open chest closes when it's broken or the player walks out of reach.
    const open = this.openChest;
    if (open && !(this.chestAt(open.tx, open.ty) && inReach(player, open.tx, open.ty))) this.openChest = null;

    const [tx, ty] = this.cursorTile();
    const { canvas, scale } = this.renderer;
    // Right-click interacts: a chest in reach opens (unless the click is on the panel), and a
    // door opens or closes. It never places or mines anything.
    if (actionPressed('interact') && !inventoryPanel.covers(canvas, scale, mouse.x, mouse.y, this.panelState())) {
      if (this.chestAt(tx, ty) && inReach(player, tx, ty)) {
        if (!inventoryPanel.open) this.openPanel();
        this.openChest = { tx, ty };
        sfx.uiClick();
      } else if (!inventoryPanel.open && !this.lifts.ride && !this.useBed(tx, ty) && !this.useCamp(tx, ty) && !this.useLiftStop(tx, ty)) {
        this.useDoor(tx, ty);
      }
    }

    // Right-click on a recipe pins it as the goal (or unpins it).
    if (inventoryPanel.open && actionPressed('pin')) {
      const click = inventoryPanel.pinClick(canvas, scale, mouse.x, mouse.y, this.panelState());
      if (click?.kind === 'pin') this.pinRecipe(click.item);
    }
    if (inventoryPanel.open) inventoryPanel.updateSearch(actionPressed('confirm'), actionPressed('pause'));
    if (inventoryPanel.open && actionPressed('click')) {
      const click = inventoryPanel.click(canvas, scale, mouse.x, mouse.y, actionDown('modifier'), this.panelState());
      if (click?.kind === 'crafted') {
        toasts.gained(click.recipe.output, click.recipe.count * click.batches);
        sfx.craft();
      } else if (click?.kind === 'pin') {
        this.pinRecipe(click.item);
      } else if (click?.kind === 'gear') {
        sfx.equip();
      } else if (click?.kind === 'refused') {
        toasts.show(click.text, 4);
      } else if (click) {
        sfx.uiClick();
      }
    } else if (!inventoryPanel.open) {
      inventoryPanel.stopSearch();
    }
  }

  /** The lift panel's view of the lift it was opened at, or null if that stop or its rail is gone. */
  private liftView(): LiftView | null {
    const stop = this.liftPanel.stop;
    if (!stop || this.world.getTile(stop.sx, stop.sy) !== Tile.LiftStop) return null;
    return this.lifts.view(this.world, this.tileEntities, stop.sx, stop.sy);
  }

  /** The open lift panel: clicks on stops, renaming, scrolling and Esc. */
  private updateLiftPanel(): void {
    const { liftPanel, renderer } = this;
    const view = this.liftView();
    if (!view) {
      liftPanel.hide();
      return;
    }
    const input = {
      wheel: consumeWheel(),
      mouseX: mouse.x,
      mouseY: mouse.y,
      clicked: actionPressed('click'),
      confirm: actionPressed('confirm'),
      cancel: actionPressed('pause'),
    };
    const action = liftPanel.update(input, view, renderer.canvas.width, renderer.canvas.height, renderer.scale);
    if (!action) return;
    const here = view.stops[view.here];
    if (action.kind === 'close') {
      liftPanel.hide();
      sfx.uiClick();
    } else if (action.kind === 'rename') {
      this.tileEntities.set(here.sx, here.sy, { kind: 'liftStop', name: action.name });
      sfx.uiClick();
    } else if (action.kind === 'call') {
      liftPanel.hide();
      this.lifts.pickup = null;
      this.lifts.send(view.cage, here.sy);
      sfx.liftCall();
      this.toasts.show('Cage called: it is on its way to this stop', 3);
    } else {
      liftPanel.hide();
      this.startTrip(view.cage, here, action.to);
    }
  }

  /**
   * Ride from stop `from` to `to`: straight away if the cage is at `from`, or once it has come to
   * fetch the player (if they're still by the stop when it gets there).
   */
  private startTrip(cage: Cage, from: StopSpot, to: StopSpot): void {
    if (this.lifts.isAt(cage, from.sy)) {
      this.board(cage, to);
      return;
    }
    this.lifts.send(cage, from.sy);
    this.lifts.pickup = { cage: cage.id, from: { sx: from.sx, sy: from.sy }, to: { sx: to.sx, sy: to.sy } };
    sfx.liftCall();
    this.toasts.show(`The cage is on its way. Wait by the stop: it will take you to ${stopName(this.tileEntities, to.sx, to.sy)}.`, 4);
  }

  /** Step into the cage and set off for stop `to`. */
  private board(cage: Cage, to: StopSpot): void {
    const { player } = this;
    this.lifts.pickup = null;
    this.lifts.ride = { cage: cage.id, to: { sx: to.sx, sy: to.sy } };
    this.lifts.send(cage, to.sy);
    const spot = riderSpot(cage);
    player.rideTo(spot.x, spot.y);
    this.leftAction = null;
    sfx.liftStart(this.pan(cage.tx));
  }

  /** Where the ride ends: standing at the stop, or (if that's blocked now) in the cage, holding on to the rail. */
  private rideEnd(): { x: number; y: number; onRail: boolean } | null {
    const ride = this.lifts.ride;
    const cage = ride && this.lifts.cage(ride.cage);
    if (!ride || !cage) return null;
    if (stopProblem(this.world, ride.to, cage.tx) === null) return { ...stopLanding(ride.to), onRail: false };
    return { ...riderSpot({ ...cage, y: cage.target ?? cage.y }), onRail: true };
  }

  /**
   * One step of the lifts: cages move, and the player rides along, steps out at the end of a
   * trip, or boards a cage that has come to fetch them.
   */
  private updateLifts(dt: number): void {
    const { lifts, player } = this;
    for (const event of lifts.update(dt, this.world)) this.cageEvent(event);
    const ride = lifts.ride;
    const cage = ride && lifts.cage(ride.cage);
    if (cage) {
      const spot = riderSpot(cage);
      player.rideTo(spot.x, spot.y);
    }
  }

  /** What a cage's move means for the player: arriving, being stuck at a break, or losing its rail. */
  private cageEvent({ kind, cage }: CageEvent): void {
    const { lifts, player, toasts } = this;
    const riding = lifts.ride?.cage === cage.id;
    const fetching = lifts.pickup?.cage === cage.id;
    const onScreen = Math.abs((cage.tx + 0.5) * TILE_SIZE - player.centerX) < this.renderer.viewWidth / 2 && Math.abs(cage.y - player.centerY) < this.renderer.viewHeight / 2;
    const near = riding || onScreen;
    if (kind === 'rattle') {
      if (near) sfx.liftRattle(this.pan(cage.tx));
      return;
    }
    if (kind === 'arrived') {
      if (near || fetching) sfx.liftArrive(this.pan(cage.tx));
      if (riding) this.arrive();
      else if (fetching) this.fetched(cage);
      return;
    }
    // Stuck at a break in the rail, or its rail gone from under it: a rider holds on to the rail.
    if (riding) {
      const spot = riderSpot(cage);
      lifts.ride = null;
      player.placeAt(spot.x, spot.y);
      player.climbing = kind === 'stuck';
      toasts.show(kind === 'stuck' ? 'The rail is broken here, so the cage stopped. Climb the rail to get out.' : 'The rail under the cage is gone!', 5);
    } else if (fetching) {
      lifts.pickup = null;
      toasts.show("The cage can't get to you: its rail is broken on the way.", 4);
    }
  }

  /** The cage reached the end of the trip: step out at the stop. */
  private arrive(): void {
    const { player, lifts } = this;
    const ride = lifts.ride!;
    const cage = lifts.cage(ride.cage);
    const end = this.rideEnd();
    lifts.ride = null;
    if (!end || !cage) return;
    player.placeAt(end.x, end.y);
    if (end.onRail) {
      player.climbing = true;
      this.toasts.show("Something is in the way at that stop, so you can't step out. Climb the rail.", 4);
      return;
    }
    player.facing = ride.to.sx > cage.tx ? 1 : -1; // facing out of the cage
    const name = stopName(this.tileEntities, ride.to.sx, ride.to.sy);
    this.floaters.push({ text: name, color: '#ffe066', x: player.centerX, y: player.y - 4, at: this.clock.time, duration: 1.6 });
  }

  /** A cage called to fetch the player got there: they board if they're still by the stop. */
  private fetched(cage: Cage): void {
    const pickup = this.lifts.pickup!;
    this.lifts.pickup = null;
    if (this.deathScreen) return;
    if (inReach(this.player, pickup.from.sx, pickup.from.sy)) this.board(cage, pickup.to);
    else this.toasts.show('The cage came for you, but you had left the stop.', 3);
  }

  /** Right-click on a lift stop in reach: open the lift panel. Returns false if (tx, ty) isn't a lift stop in reach. */
  private useLiftStop(tx: number, ty: number): boolean {
    if (this.world.getTile(tx, ty) !== Tile.LiftStop || !inReach(this.player, tx, ty)) return false;
    const view = this.lifts.view(this.world, this.tileEntities, tx, ty);
    if (!view) {
      this.toasts.show('This lift stop has no lift rail beside it any more.', 3);
      return true;
    }
    this.leftAction = null;
    this.liftPanel.show(tx, ty, view);
    sfx.uiClick();
    return true;
  }

  /** Pin the recipe that makes `item` as the goal, or clear the goal (null). */
  private pinRecipe(item: ItemId | null): void {
    this.pinnedRecipe = item && recipeFor(item) ? item : null;
    sfx.uiClick();
    this.toasts.show(item ? `Goal pinned: ${itemDef(item).name}` : 'Goal cleared');
  }

  /** Stop typing a pin name, keeping it (the pause menu is opening). */
  endTyping(): void {
    this.fullMap.stopEditing(this.mapPins, true);
    this.liftPanel.stopRenaming();
    this.inventoryPanel.stopSearch();
  }

  /** One step of the world: the player, mining and building, drops, and everything else timed. */
  private simulate(dt: number): void {
    const { world, player } = this;
    this.clock.advance(dt);
    player.floating = !player.flying && inFloatField(world, ...this.playerTile());
    // Riding a lift, the cage moves the player (updateLifts); otherwise the usual physics.
    this.updateLifts(dt);
    if (!this.lifts.ride) {
      player.update(dt, world, {
        move: (actionDown('moveRight') ? 1 : 0) - (actionDown('moveLeft') ? 1 : 0),
        jumpPressed: actionPressed('jump'),
        jumpHeld: actionDown('jump'),
        climb: (actionDown('climbDown') ? 1 : 0) - (actionDown('climbUp') ? 1 : 0),
        fast: actionDown('modifier'),
      });
    }
    this.playerFeedback();
    this.checkFall();
    this.feelTheDark(dt);
    this.feelTheHeat(dt);
    this.noticeFloatstone();
    // Health only comes back in the world's own light (not the lantern's), out of the heat.
    this.health.update(this.clock.time, player.stats.maxHealth, this.safety === 'established' && this.heatSafety === 'cool');
    if (this.deathScreen) return; // the fall, the heat or lava was fatal: the rest waits for the respawn
    // No digging or building from a moving cage.
    if (this.lifts.ride) this.leftAction = null;
    else this.useHeldItem(dt);
    if (actionPressed('quickTorch')) this.quickTorch();
    this.caveIns.update(dt, this.clock.time, TILE_UPDATE_BUDGET, this.caveInHooks);
    if (this.deathScreen) return; // crushed: the rest waits for the respawn
    for (const end of this.ropeSlack.update(ROPE_UNROLL_BUDGET)) if (this.onScreen(end.tx, end.ty)) sfx.rope(this.pan(end.tx));
    const bombs = updateBombs(this.bombList, dt, world);
    this.bombList = bombs.live;
    for (const bomb of bombs.exploded) this.explode(bomb);
    if (this.deathScreen) return; // too close to a bomb
    this.trickleDust(dt);
    this.updateSatchels();
    this.growPlants(dt);
    this.ambientEvents();
    this.flareList = updateFlares(this.flareList, dt, world);

    this.dropList = updateDrops(this.dropList, dt, world, player, this.inventory, (item, count) => {
      this.toasts.gained(item, count);
      sfx.pickup();
    });
    this.floaters = this.floaters.filter((f) => this.clock.time - f.at < f.duration);
    this.exploreIn -= dt;
    if (this.exploreIn <= 0) {
      this.exploreIn = EXPLORE_INTERVAL;
      this.lookAround();
    }
    this.particles.update(dt, world);
    this.shake.update(dt);
    this.camera.follow(player.centerX, player.centerY, dt);
    this.clampCamera();
  }

  /** Left mouse uses what's held (the press decides whether the hold digs or builds); middle mouse picks a block. */
  private useHeldItem(dt: number): void {
    const { world, player, inventory, mining } = this;
    const [tx, ty] = this.cursorTile();
    if (actionPressed('use')) {
      const stack = inventory.selectedStack;
      this.leftAction = primaryAction(stack ? stack.item : null, world.getTile(tx, ty));
      this.lastBuildTile = [tx, ty];
      this.builtThisHold.clear();
      this.campRefusedThisHold = false;
    }
    if (actionPressed('use') && this.leftAction === 'throw') this.throwAt(tx, ty);
    if (actionPressed('use') && this.leftAction === 'rope') this.hangRopeAt(tx, ty);
    let held = this.leftAction === 'dig' && actionDown('use');
    let tier = inventory.bestPickaxeTier();
    // The drill (Phase 16) mines at least DRILL_TIER and much faster, while there's coal to burn.
    const drill = inventory.selectedStack?.item === 'drill';
    let speed: number | undefined;
    if (drill && held) {
      if (drillTilesLeft(this.drillCharge, inventory.count('coal')) > 0) {
        tier = Math.max(tier, DRILL_TIER);
        speed = DRILL_SPEED;
      } else {
        mining.say('The drill needs coal', tx, ty);
        held = false;
      }
    }
    const instant = this.instantMine !== 'off';
    const broken = mining.update(dt, world, player, tx, ty, held, tier, instant, speed);
    if (broken) {
      if (speed !== undefined) this.burnDrillFuel();
      this.onTileBroken(broken);
    } else {
      this.digTick(dt, held && !instant && checkMine(world, player, tx, ty, tier) === 'ok', tx, ty, speed !== undefined);
    }
    if (held) {
      for (const [dx, dy] of brushNeighbours(this.instantMine)) {
        const extra = mining.breakInstantly(world, player, tx + dx, ty + dy, tier);
        if (extra) this.onTileBroken(extra);
      }
    }
    if (this.leftAction === 'build') {
      const [lx, ly] = this.lastBuildTile;
      for (const [bx, by] of tilesOnLine(lx, ly, tx, ty)) this.buildAt(bx, by);
      this.lastBuildTile = [tx, ty];
    }
    // Checked after placing, so a click shorter than one step still places once.
    if (!actionDown('use')) this.leftAction = null;
    if (actionPressed('pickBlock')) this.pickBlock(tx, ty);
  }

  /** alpha (0..1) is how far we are between the last update step and the next one. */
  render(stepAlpha: number, stats: FrameStats): void {
    const { renderer, player, camera, inventory } = this;
    // A paused world shows its latest step, standing still (no interpolation, no shake).
    const alpha = this.pausedBy ? 1 : stepAlpha;
    const shake = this.settings.screenShake && !this.pausedBy ? this.shake : { x: 0, y: 0 };
    const camX = Math.round(lerp(camera.prevX, camera.x, alpha)) + shake.x;
    const camY = Math.round(lerp(camera.prevY, camera.y, alpha)) + shake.y;
    const px = lerp(player.prevX, player.x, alpha);
    const py = lerp(player.prevY, player.y, alpha);
    const glowX = px + PLAYER_WIDTH / 2;
    const glowY = py + PLAYER_HEIGHT / 2;

    const reduced = this.settings.reducedFlashes;
    renderer.drawWorld(this.world, camX, camY, this.clock.time);
    for (const crack of this.mining.cracks(this.world)) renderer.drawCracks(crack.tx, crack.ty, crack.stage, camX, camY);
    if (this.caveIns.isEnabled) {
      renderer.drawLooseMarks(this.unsupportedOnScreen(camX, camY), camX, camY);
      const jitter = this.settings.screenShake && !this.pausedBy ? GRAVEL_SHAKE_PX : 0;
      renderer.drawShaking(this.world, this.caveIns.warningTiles(), this.clock.time, jitter, camX, camY);
    }
    renderer.drawFallingBlocks(this.caveIns.falling, alpha, camX, camY);
    renderer.drawDrops(this.drops, alpha, camX, camY);
    renderer.drawFlares(this.flareList, alpha, this.clock.time, camX, camY);
    renderer.drawBombs(this.bombList, alpha, this.clock.time, camX, camY);
    renderer.drawSatchels(this.satchels, this.clock.time, camX, camY);
    // Dead: the player isn't drawn (they're already back at the bed, off screen).
    if (!this.deathScreen) renderer.drawPlayer(player, px, py, camX, camY, this.playerAlpha(), this.playerLooks());
    renderer.drawCages(this.lifts.cages, alpha, camX, camY);
    renderer.drawParticles(this.particles, camX, camY);
    if (!this.fullbright) renderer.drawLight(this.lightMap, camX, camY, glowX, glowY);
    renderer.drawGlowTint(this.world, this.lightMap, this.clock.time, !reduced, camX, camY);
    renderer.drawHeat(this.heatOnScreen(camX, camY), this.clock.time, !reduced, camX, camY);
    renderer.drawFloatMotes(this.world, this.clock.time, camX, camY);
    if (!reduced) renderer.drawSparkles(this.world, this.fullbright ? null : this.lightMap, this.clock.time, camX, camY, glowX, glowY);
    renderer.drawFlashes(this.flashes, camX, camY);
    this.drawDreadVignette();
    this.drawHeatVignette();
    for (const f of this.floaters) {
      const t = (this.clock.time - f.at) / f.duration;
      renderer.drawFloatingText(f.text, f.x, f.y - t * 12, f.color, Math.min(1, 3 * (1 - t)), camX, camY);
    }
    if (!this.inventoryPanel.open && !this.liftPanel.open && !this.deathScreen && !this.lifts.ride) this.drawCursor(camX, camY);
    if (this.mining.hint) renderer.drawHint(this.mining.hint, camX, camY);
    // A red flash over the screen when hurt (not with Reduced flashes; the number and hearts still show it).
    const sinceHit = this.lastHit ? this.clock.time - this.lastHit.at : Infinity;
    if (!reduced && sinceHit < HURT_FLASH_TIME) {
      renderer.ctx.save();
      renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderer.ctx.fillStyle = `rgba(200, 20, 20, ${HURT_FLASH_ALPHA * (1 - sinceHit / HURT_FLASH_TIME)})`;
      renderer.ctx.fillRect(0, 0, renderer.canvas.width, renderer.canvas.height);
      renderer.ctx.restore();
    }
    if (this.inventoryPanel.open) {
      this.inventoryPanel.draw(renderer.ctx, renderer.itemAtlas, renderer.scale, mouse.x, mouse.y, this.panelState());
    } else {
      drawHotbar(renderer.ctx, renderer.itemAtlas, inventory, renderer.scale, this.toolNote());
      if (this.settings.showMinimap && !this.fullMap.open) drawMinimap(renderer.ctx, this.mapImage, this.mapMarkers(glowX, glowY), renderer.scale);
    }
    drawToasts(renderer.ctx, this.toasts, renderer.scale);
    if (this.heartBanner > 0 && !this.inventoryPanel.open && !this.fullMap.open && !this.deathScreen) {
      const alpha = Math.min(1, (HEART_BANNER_TIME - this.heartBanner) / BANNER_FADE, this.heartBanner / BANNER_FADE);
      const when = `Claimed after ${playTimeText(this.heartClaimedAt ?? this.clock.time)} of play`;
      drawStratumBanner(renderer.ctx, 'The Heart of the Deep', when, alpha, renderer.scale, 'The deep is yours. Build on!');
    } else if (this.banner && !this.inventoryPanel.open && !this.fullMap.open && !this.deathScreen) {
      const { stratum, timeLeft } = this.banner;
      const alpha = Math.min(1, (BANNER_TIME - timeLeft) / BANNER_FADE, timeLeft / BANNER_FADE);
      const rule = STRATA[stratum].rule;
      const ruleText = rule && (!rule.needsDepths || this.profile.depths) ? rule.text : undefined;
      drawStratumBanner(renderer.ctx, bannerTitle(stratum), STRATA[stratum].finds, alpha, renderer.scale, ruleText);
    }
    const hudBottom = this.fullMap.open ? 6 * renderer.scale : this.drawVitals(sinceHit);
    // Depth is measured at the player's feet: standing on the surface level reads 0 m.
    drawDepthMeter(renderer.ctx, Math.floor((player.y + PLAYER_HEIGHT) / TILE_SIZE) - SURFACE_LEVEL, renderer.scale);
    if (this.fullMap.open) this.fullMap.draw(renderer.ctx, this.mapImage, this.mapMarkers(glowX, glowY), renderer.scale);
    const liftView = this.liftPanel.open ? this.liftView() : null;
    if (liftView) this.liftPanel.draw(renderer.ctx, liftView, mouse.x, mouse.y, renderer.scale);
    if (this.deathScreen) {
      const ready = performance.now() - this.deathScreen.shownAt >= DEATH_SCREEN_DELAY * 1000;
      drawDeathScreen(renderer.ctx, this.deathScreen.lines, ready ? respawnPrompt() : null, renderer.scale);
    }
    if (this.showOverlay) this.drawOverlay(stats);
    else if (this.settings.showFps) drawFpsCounter(renderer.ctx, stats.fps, renderer.scale, hudBottom);
  }

  /**
   * Hearts (or "Cozy world") and the way to the nearest satchel, top left. Returns the y (screen
   * px) below them. `sinceHit` is seconds since the latest hit.
   */
  private drawVitals(sinceHit: number): number {
    const { renderer, player, health } = this;
    const u = renderer.scale;
    let y: number;
    if (this.difficulty === 'cozy') {
      y = drawHudLine(renderer.ctx, 'Cozy world', 6 * u, u, '#cfe8c8');
    } else {
      const left = health.protectedUntil - this.clock.time;
      y = drawHearts(
        renderer.ctx,
        {
          hp: health.hp,
          maxHp: player.stats.maxHealth,
          // Measured against the longer of the two protections, so the bar never overflows.
          protection: left > 0 ? left / Math.max(HURT_PROTECTION, RESPAWN_PROTECTION) : 0,
          shakeFrom: this.lastHit?.hpBefore ?? 0,
          shake: Math.max(0, 1 - sinceHit / HEART_SHAKE_TIME),
        },
        u,
      );
      if (health.god) y = drawHudLine(renderer.ctx, 'God mode', y, u, '#ffe066');
      const { dread, safety } = this;
      // Heat takes the safety line over while it matters (it's a zone, not another meter).
      const heatLine = heatStatus(this.heatSafety, this.heat);
      if (dread.level > 0 || safety !== 'established' || heatLine) {
        const carrier = this.inventory.selectedStack?.item === 'lantern' ? 'Lantern' : player.stats.lightRadius > 0 ? 'Helmet' : 'Flare';
        const status = heatLine ?? dreadStatus(safety, dread.level, health.hp < player.stats.maxHealth, carrier);
        y = drawDreadMeter(renderer.ctx, dread.level, status, this.settings.reducedFlashes ? 0 : this.heartbeat(), y, u);
      }
    }
    if (player.floating) y = drawHudLine(renderer.ctx, 'Floatstone: gravity is lighter here', y, u, '#bfefff');
    // A lift trip, or a cage on its way to fetch the player.
    const trip = this.lifts.ride ?? this.lifts.pickup;
    if (trip) {
      const to = this.lifts.ride ? this.lifts.ride.to : this.lifts.pickup!.from;
      const name = stopName(this.tileEntities, to.sx, to.sy);
      const text = this.lifts.ride ? `Lift: riding to ${name} (${depthText(stopDepth(to.sy))})` : `Lift: the cage is on its way to ${name}`;
      y = drawHudLine(renderer.ctx, text, y, u, '#e0e4ea');
    }
    const satchel = this.nearestSatchel();
    if (satchel) {
      const dx = (satchel.x + SATCHEL_SIZE / 2 - player.centerX) / TILE_SIZE;
      const dy = (satchel.y + SATCHEL_SIZE / 2 - player.centerY) / TILE_SIZE;
      const more = this.satchels.length > 1 ? ` (${this.satchels.length} satchels)` : '';
      y = drawHudLine(renderer.ctx, directionText('Satchel', dx, dy) + more, y, u, '#d9bfff');
    }
    const pin = this.mapPins.trackedPin;
    if (pin) {
      const dx = pin.tx + 0.5 - player.centerX / TILE_SIZE;
      const dy = pin.ty + 0.5 - player.centerY / TILE_SIZE;
      y = drawHudLine(renderer.ctx, directionText(pin.name, dx, dy), y, u, PIN_COLOR);
    }
    // The goal (the panel shows it while it's open).
    const goal = this.pinnedRecipe ? recipeFor(this.pinnedRecipe) : null;
    if (goal && !this.inventoryPanel.open) {
      const { world } = this;
      const range = player.stats.stationRange;
      const chests = nearbyChests(world, this.tileEntities, player.centerX, player.centerY, range);
      const status = goalStatus(goal, this.inventory, nearbyStations(world, player.centerX, player.centerY, range), chests, this.profile);
      for (const [text, color] of goalHudLines(status)) y = drawHudLine(renderer.ctx, text, y, u, color);
    }
    return y;
  }

  /** 0..1: the latest heartbeat's thump, fading over DREAD_PULSE_TIME. */
  private heartbeat(): number {
    return Math.max(0, 1 - (this.clock.time - this.lastBeatAt) / DREAD_PULSE_TIME);
  }

  /** Darkness closing in from the screen edges as dread builds (it pulses when full, unless Reduced flashes). */
  private drawDreadVignette(): void {
    const level = this.dread.level;
    if (level <= DREAD_VIGNETTE_FROM) return;
    const strength = (level - DREAD_VIGNETTE_FROM) / (1 - DREAD_VIGNETTE_FROM);
    const pulse = this.settings.reducedFlashes ? 0 : this.heartbeat();
    this.renderer.drawVignette(DREAD_VIGNETTE_ALPHA * strength, pulse * (this.dread.full ? 0.35 : 0.15));
  }

  /** Orange closing in from the screen edges as a hot zone's grace runs out (no pulse, so Reduced flashes needs nothing). */
  private drawHeatVignette(): void {
    if (this.difficulty === 'cozy' || this.heat.exposure <= 0) return;
    const strength = this.heatSafety === 'lava' ? 1 : this.heat.exposure / HEAT_GRACE;
    this.renderer.drawVignette(HEAT_VIGNETTE_ALPHA * strength, 0, [190, 70, 0]);
  }

  /** Heat over the tiles on screen (with a tile to spare around it), cached until the view or the world changes. */
  private heatOnScreen(camX: number, camY: number): HeatField {
    const tx0 = Math.floor(camX / TILE_SIZE) - 1;
    const ty0 = Math.floor(camY / TILE_SIZE) - 1;
    const tx1 = Math.floor((camX + this.renderer.viewWidth) / TILE_SIZE) + 1;
    const ty1 = Math.floor((camY + this.renderer.viewHeight) / TILE_SIZE) + 1;
    const key = `${tx0},${ty0},${tx1},${ty1},${this.world.revision}`;
    if (this.heatView?.key !== key) this.heatView = { key, field: heatField(this.world, tx0, ty0, tx1, ty1) };
    return this.heatView.field;
  }

  /** What the player has on: the held lantern and the worn gear that shows. */
  private playerLooks(): PlayerLooks {
    const { inventory } = this;
    const boots = inventory.wearing('spring_boots') ? 'spring_boots' : inventory.wearing('padded_boots') ? 'padded_boots' : null;
    const icon = boots && itemDef(boots).icon;
    return {
      lantern: inventory.selectedStack?.item === 'lantern',
      helmet: inventory.wearing('miner_helmet'),
      boots: icon && typeof icon === 'object' ? icon.color : null,
      claws: inventory.wearing('climbing_claws'),
    };
  }

  /**
   * A line under the held item's name on the hotbar for the tools (Phase 16), so what they'll do
   * shows before they're used: the drill's fuel, the rope's length, what a bomb breaks.
   */
  private toolNote(): string | null {
    const { inventory } = this;
    const item = inventory.selectedStack?.item;
    if (item === 'drill') {
      const coal = inventory.count('coal');
      const left = drillTilesLeft(this.drillCharge, coal);
      return left > 0 ? `Fuel: ${coal} coal, about ${left} tiles of drilling` : 'No coal: the drill needs coal to run';
    }
    if (item === 'rope_coil') return `Hangs a rope ladder up to ${ROPE_LENGTH} m down from an edge`;
    if (item === 'bomb') {
      const tier = inventory.bestPickaxeTier();
      return tier >= 0 ? `Blasts 3 x 3: what your ${PICKAXES[tier].name.toLowerCase()} pickaxe can mine` : 'Blasts 3 x 3, but breaks nothing without a pickaxe';
    }
    return null;
  }

  /** How opaque to draw the player: protection blinks it, or (Reduced flashes) shows it see-through. */
  private playerAlpha(): number {
    const left = this.health.protectedUntil - this.clock.time;
    if (left <= 0 || this.difficulty === 'cozy') return 1;
    if (this.settings.reducedFlashes) return PROTECTION_ALPHA;
    return Math.floor(left / PROTECTION_BLINK) % 2 === 0 ? 1 : 0.25;
  }

  /** Open the full map (closing the inventory panel), or close it. */
  private toggleMap(): void {
    if (this.fullMap.open) {
      this.fullMap.hide(this.mapPins);
      return;
    }
    if (this.inventoryPanel.open) this.closePanel();
    this.leftAction = null;
    this.fullMap.show(this.player.centerX, this.player.centerY);
    sfx.uiClick();
  }

  /** This step's input for the open map. Uses up the mouse wheel. */
  private mapInput(): MapInput {
    return {
      wheel: consumeWheel(),
      mouseX: mouse.x,
      mouseY: mouse.y,
      dragging: actionDown('click'),
      panX: (actionDown('moveRight') ? 1 : 0) - (actionDown('moveLeft') ? 1 : 0),
      panY: (actionDown('climbDown') ? 1 : 0) - (actionDown('climbUp') ? 1 : 0),
      clicked: actionPressed('click'),
      pin: actionPressed('pin'),
      confirm: actionPressed('confirm'),
      cancel: actionPressed('pause'),
    };
  }

  /** Mark tiles seen: the lit ones on screen, and everything near the player. */
  private lookAround(): void {
    const { camera, renderer, player } = this;
    this.explored.look(
      this.lightMap,
      Math.floor(camera.x / TILE_SIZE),
      Math.floor(camera.y / TILE_SIZE),
      Math.floor((camera.x + renderer.viewWidth) / TILE_SIZE),
      Math.floor((camera.y + renderer.viewHeight) / TILE_SIZE),
      Math.floor(player.centerX / TILE_SIZE),
      Math.floor(player.centerY / TILE_SIZE),
    );
  }

  /** What the map and minimap mark. (x, y) is the player's centre as drawn this frame. */
  private mapMarkers(x: number, y: number): MapMarkers {
    return {
      playerX: x,
      playerY: y,
      spawn: { tx: this.world.spawnTx, ty: this.world.spawnTy },
      chests: this.tileEntities.entries().flatMap(({ tx, ty, entity }) => (entity.kind === 'chest' ? [{ tx, ty }] : [])),
      bed: this.activeBed(),
      satchels: this.satchels.map((s) => ({ tx: (s.x + SATCHEL_SIZE / 2) / TILE_SIZE, ty: (s.y + SATCHEL_SIZE / 2) / TILE_SIZE })),
      heart: this.world.heart && this.explored.isExplored(this.world.heart.tx, this.world.heart.ty) ? { tx: this.world.heart.tx, ty: this.world.heart.ty } : null,
      camp: this.campAt(),
      liftStops: this.tileEntities.entries().flatMap(({ tx, ty, entity }) => (entity.kind === 'liftStop' ? [{ tx, ty, name: entity.name }] : [])),
      pins: this.mapPins.pins,
      trackedPin: this.mapPins.tracked,
    };
  }

  private clampCamera(): void {
    this.camera.clampTo(this.world.width * TILE_SIZE, this.world.height * TILE_SIZE);
  }

  /** Tile under the mouse pointer. */
  private cursorTile(): [number, number] {
    const x = Math.round(this.camera.x) + mouse.x / this.renderer.scale;
    const y = Math.round(this.camera.y) + mouse.y / this.renderer.scale;
    return [Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)];
  }

  private onTileBroken({ tx, ty, tile }: BrokenTile): void {
    this.shake.hit(tileDef(tile).hardness);
    this.digTickIn = DIG_TICK_INTERVAL; // leave room for the break sound before the next tick
    this.shatter(tx, ty, tile);
    // Breaking either half of a door removes the other half (one door drops, from this half).
    const partner = doorPartner(this.world, tx, ty, tile) ?? bedPartner(this.world, tx, ty, tile);
    if (partner) {
      this.world.setTile(partner[0], partner[1], Tile.Air);
      this.particles.breakBurst(partner[0], partner[1], tileDef(tile).color);
    }
    if (isBed(tile) && this.bed && this.bed.ty === ty && this.bed.tx === (tile === Tile.BedLeft ? tx : tx - 1)) {
      this.bed = null;
      this.toasts.show(this.campAt() ? 'Your bed is gone. You will respawn at your camp.' : 'Your bed is gone. Without one you respawn near the world spawn.', 4);
    }
    // Breaking any part of the camp packs up all of it (one camp kit drops, from this part).
    if (isCamp(tile)) {
      for (const [px, py] of campPartners(this.world, tx, ty, tile)) {
        this.world.setTile(px, py, Tile.Air);
        this.particles.breakBurst(px, py, tileDef(tile).color);
      }
      const after = this.activeBed() ? 'in your bed' : 'near the world spawn';
      this.toasts.show(`Camp packed up. Until you set it up again, you respawn ${after}.`, 4);
    }
    // Cutting a trunk (or a giant mushroom's stem) brings down the rest of it above the cut.
    if (isTrunk(tile)) {
      for (const felled of fellTreeAbove(this.world, tx, ty, tile)) this.shatter(felled.tx, felled.ty, felled.tile);
    }
    if (tile === Tile.HeartCore && this.heartClaimedAt === null) this.claimHeart(tx, ty);
    // Breaking any part of a rope ladder rolls the whole rope back up into coils.
    if (tile === Tile.Rope) {
      const coils = rollUpRope(this.world, tx, ty);
      this.dropList.push(new ItemDrop('rope_coil', coils, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE));
    }
  }

  /**
   * The Heart of the Deep was broken for the first time: the Sandbox's goal. A banner, a chord and a
   * burst of sparks mark the moment; the world carries on as before (the Heart drops as an item).
   */
  private claimHeart(tx: number, ty: number): void {
    this.heartClaimedAt = this.clock.time;
    this.heartBanner = HEART_BANNER_TIME;
    sfx.heartClaimed();
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2]]) this.particles.breakBurst(tx + dx, ty + dy, '#ffb066');
    this.floaters.push({ text: 'The Heart of the Deep!', color: '#ffd27a', x: (tx + 0.5) * TILE_SIZE, y: ty * TILE_SIZE - 4, at: this.clock.time, duration: 3 });
    this.toasts.show('You claimed the Heart of the Deep, the bottom of the world. Place it at home: it glows. Keep building!', 8);
  }

  /** The chest at (tx, ty), or null if that tile isn't a chest. */
  private chestAt(tx: number, ty: number): Chest | null {
    return chestAt(this.world, this.tileEntities, tx, ty);
  }

  /**
   * What the inventory panel shows: nearby stations and chests, and the open chest. The open
   * chest always counts for crafting, even when it's in reach but past STATION_RANGE.
   */
  private panelState(): PanelState {
    const { world, player } = this;
    const chest = this.openChest ? this.chestAt(this.openChest.tx, this.openChest.ty) : null;
    const range = player.stats.stationRange;
    const chests = nearbyChests(world, this.tileEntities, player.centerX, player.centerY, range);
    if (chest && !chests.includes(chest)) chests.push(chest);
    return {
      inventory: this.inventory,
      stations: nearbyStations(world, player.centerX, player.centerY, range),
      chests,
      chest,
      stationRange: range,
      pinned: this.pinnedRecipe,
      pickaxeTier: this.inventory.bestPickaxeTier(),
      profile: this.profile,
      stats: player.stats,
    };
  }

  private openPanel(): void {
    this.inventoryPanel.open = true;
    this.statsAtOpen = this.player.stats;
  }

  /**
   * Close the inventory panel: a held stack is put away (what doesn't fit drops at the player),
   * and if changing gear changed any stats, a toast says how, so nothing changes unexplained.
   */
  private closePanel(): void {
    this.inventoryPanel.open = false;
    this.inventoryPanel.stopSearch();
    this.openChest = null;
    const leftover = this.inventory.returnCursor();
    if (leftover) this.dropAtPlayer(leftover.item, leftover.count);
    const before = this.statsAtOpen;
    this.statsAtOpen = null;
    const after = computeStats(this.inventory.gearModifiers());
    for (const change of before ? statChanges(before, after) : []) this.toasts.show(`Gear: ${change}`, 4);
  }

  /** The chest in reach nearest the player, for E to open with the inventory, or null. */
  private nearestChestInReach(): { tx: number; ty: number } | null {
    const { player } = this;
    const ptx = Math.floor(player.centerX / TILE_SIZE);
    const pty = Math.floor(player.centerY / TILE_SIZE);
    let best: { tx: number; ty: number } | null = null;
    let bestDistance = Infinity;
    const reach = Math.ceil(player.stats.reach);
    for (let ty = pty - reach - 1; ty <= pty + reach + 1; ty++) {
      for (let tx = ptx - reach - 1; tx <= ptx + reach + 1; tx++) {
        if (!this.chestAt(tx, ty) || !inReach(player, tx, ty)) continue;
        const distance = Math.hypot((tx + 0.5) * TILE_SIZE - player.centerX, (ty + 0.5) * TILE_SIZE - player.centerY);
        if (distance < bestDistance) {
          best = { tx, ty };
          bestDistance = distance;
        }
      }
    }
    return best;
  }

  /** Drag-building: place the selected block at (tx, ty) unless this hold already did. */
  private buildAt(tx: number, ty: number): void {
    const key = ty * this.world.width + tx;
    if (this.builtThisHold.has(key)) return;
    // Only one camp can stand at a time (it's the one you move around).
    const camp = this.campAt();
    if (this.inventory.selectedStack?.item === 'camp_kit' && camp) {
      if (!this.campRefusedThisHold && campSpot(this.world, this.player, tx, ty)) {
        this.campRefusedThisHold = true;
        this.toasts.show(`You already have a camp (${depthText(camp.ty + 2 - SURFACE_LEVEL)}). Break it to pack it up, then set it up here.`, 4);
      }
      return;
    }
    if (!tryPlace(this.world, this.player, this.inventory, tx, ty)) return;
    this.builtThisHold.add(key);
    const placed = this.world.getTile(tx, ty);
    if (placed === Tile.LiftStop) this.placedLiftStop(tx, ty);
    if (isCamp(placed)) this.setUpCamp(tx, ty);
    if (placed === Tile.Beam || placed === Tile.Crossbeam) markHintSeen(this.supportHintId(placed));
    if (tileDef(placed).plant) this.tileEntities.set(tx, ty, newPlant(this.clock.time, plantGrowTime(Math.random())));
    sfx.place(tileDef(this.world.getTile(tx, ty)).material, this.pan(tx));
    if (placed === Tile.Torch) this.noticeDamp(tx, ty);
    if (isBed(this.world.getTile(tx, ty))) this.toasts.show(`${mainKey('interact')} the bed to respawn there`, 4);
  }

  /** A lift stop was just placed: give it a name, and say how to use it the first time. */
  private placedLiftStop(tx: number, ty: number): void {
    const name = defaultStopName(this.world, this.tileEntities, tx, ty);
    this.tileEntities.set(tx, ty, { kind: 'liftStop', name });
    this.toasts.show(`Lift stop "${name}": ${mainKey('interact').toLowerCase()} it to call the cage and ride. Build more stops along the rail.`, 5);
  }

  /** A camp was just set up with a part at (tx, ty): it's the camp now, and the respawn point. */
  private setUpCamp(tx: number, ty: number): void {
    const [cx, cy] = campTopLeft(this.world, tx, ty)!;
    this.tileEntities.set(cx, cy, { kind: 'camp' });
    this.respawnAt = 'camp';
    sfx.bedSet();
    this.floaters.push({ text: 'Respawn point: camp', color: '#ffd0a0', x: (cx + 1) * TILE_SIZE, y: cy * TILE_SIZE - 2, at: this.clock.time, duration: 2 });
    this.toasts.show(`Camp set up (${depthText(cy + 2 - SURFACE_LEVEL)}): it's a workbench and a furnace, and you'll respawn here. Break it to pack it up and move it.`, 6);
  }

  /** The camp's top-left tile, if one is set up and whole. */
  private campAt(): BedSpot | null {
    let found: BedSpot | null = null;
    this.tileEntities.forEach((tx, ty, entity) => {
      if (entity.kind === 'camp' && isWholeCamp(this.world, tx, ty)) found = { tx, ty };
    });
    return found;
  }

  /** Right-click on the camp in reach: it becomes the respawn point. Returns false if (tx, ty) isn't the camp in reach. */
  private useCamp(tx: number, ty: number): boolean {
    const top = campTopLeft(this.world, tx, ty);
    if (!top || !inReach(this.player, tx, ty)) return false;
    const already = this.respawnAt === 'camp';
    this.respawnAt = 'camp';
    sfx.bedSet();
    const [cx, cy] = top;
    this.floaters.push({ text: already ? 'Already your respawn point' : 'Respawn point: camp', color: '#ffd0a0', x: (cx + 1) * TILE_SIZE, y: cy * TILE_SIZE - 2, at: this.clock.time, duration: 1.6 });
    if (!already) this.toasts.show('Respawn point set: you will wake up at your camp', 3);
    return true;
  }

  /** Right-click on a bed in reach: it becomes the respawn point. Returns false if (tx, ty) isn't a bed in reach. */
  private useBed(tx: number, ty: number): boolean {
    const left = bedLeft(this.world, tx, ty);
    if (!left || !inReach(this.player, tx, ty)) return false;
    const [lx, ly] = left;
    const already = this.bed?.tx === lx && this.bed.ty === ly && this.respawnAt === 'bed';
    this.bed = { tx: lx, ty: ly };
    this.respawnAt = 'bed';
    sfx.bedSet();
    this.floaters.push({
      text: already ? 'Already your bed' : 'Respawn point set',
      color: '#ffd0e6',
      x: (lx + 1) * TILE_SIZE,
      y: ly * TILE_SIZE - 2,
      at: this.clock.time,
      duration: 1.6,
    });
    if (!already) this.toasts.show('Respawn point set: you will wake up in this bed', 3);
    return true;
  }

  /** The bed the player respawns at, if it's still whole. */
  private activeBed(): BedSpot | null {
    return this.bed && isWholeBed(this.world, this.bed.tx, this.bed.ty) ? this.bed : null;
  }

  /** Change the world's difficulty (from the pause menu). */
  setDifficulty(difficulty: Difficulty): void {
    if (difficulty === this.difficulty) return;
    this.difficulty = difficulty;
    this.caveIns.setEnabled(difficulty === 'normal');
    this.toasts.show(difficulty === 'cozy' ? 'Cozy: nothing can hurt you now, and gravel stays put' : 'Normal: falls, falling gravel, the dark and heat hurt now', 3);
  }

  /** Take damage (ignored in Cozy worlds, in god mode and while protected). Dying shows the death screen. */
  hurt(amount: number, cause: DamageCause): void {
    const { health, player } = this;
    const before = health.hp;
    const result = health.hurt(amount, this.clock.time, this.difficulty);
    if (result === 'ignored') return;
    this.lastHit = { at: this.clock.time, hpBefore: before };
    this.floaters.push({
      text: `-${before - health.hp}`,
      color: '#ff6b5e',
      x: player.centerX,
      y: player.y - 2,
      at: this.clock.time,
      duration: DAMAGE_NUMBER_TIME,
    });
    sfx.hurt();
    this.shake.hit(2);
    if (result === 'died') this.die(cause);
  }

  /**
   * The player died: the bag (except pickaxes) goes into a satchel where they fell, and they
   * wake up at the bed (or near the world spawn) with full health and RESPAWN_PROTECTION.
   * All of that happens now, so a save made while the death screen shows is already the
   * respawned game; the screen only waits for the player to read it.
   */
  private die(cause: DamageCause): void {
    const { player, inventory, world } = this;
    const leftover = inventory.returnCursor();
    if (leftover) this.dropAtPlayer(leftover.item, leftover.count);
    const satchel = dropSatchel(player, takeBag(inventory));
    if (satchel) {
      this.liftOutOfLava(satchel);
      this.satchels.push(satchel);
    }
    const hadBed = this.activeBed() !== null;
    const bedWasSet = this.bed !== null;
    const camp = this.campAt();
    const spot = findRespawn(world, this.bed, camp, this.respawnAt);
    if (!hadBed) this.bed = null; // a destroyed bed is forgotten; a blocked one is kept for next time
    this.lifts.ride = null;
    this.lifts.pickup = null;
    this.liftPanel.hide();
    const lines = [deathCauseText(cause)];
    const kept = ['your hotbar'];
    if (inventory.gear.some((s) => s)) kept.push('your gear');
    if (inventory.slots.some((s) => s && keptOnDeath(s.item))) kept.push(inventory.count('drill') > 0 ? 'your pickaxes and drill' : 'every pickaxe');
    lines.push(`You kept ${kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}` : kept[0]}.`);
    if (satchel) {
      const dx = (satchel.x + SATCHEL_SIZE / 2 - (spot.x + PLAYER_WIDTH / 2)) / TILE_SIZE;
      const dy = (satchel.y + SATCHEL_SIZE / 2 - (spot.y + PLAYER_HEIGHT / 2)) / TILE_SIZE;
      const n = satchelItemCount(satchel);
      lines.push(`Your bag (${n} item${n === 1 ? '' : 's'}) is in a satchel ${offsetText(dx, dy)} from where you wake up.`);
      lines.push('It is marked on the map, and waits there until you collect it.');
    } else {
      lines.push('Your bag was empty, so nothing was left behind.');
    }
    const wantCamp = this.respawnAt === 'camp';
    if (spot.atCamp) lines.push(wantCamp ? 'You wake up at your camp.' : 'Your bed is gone or blocked, so you wake up at your camp.');
    else if (spot.atBed) lines.push(wantCamp ? 'Your camp is packed up or blocked, so you wake up in your bed.' : 'You wake up in your bed.');
    else if (camp && wantCamp) lines.push('Your camp is blocked, so you wake up near the world spawn.');
    else if (hadBed) lines.push('Your bed is blocked, so you wake up near the world spawn.');
    else if (bedWasSet) lines.push('Your bed is gone, so you wake up near the world spawn.');
    else lines.push('You have no bed or camp, so you wake up near the world spawn. Craft a bed at a workbench.');
    player.placeAt(spot.x, spot.y);
    this.health.refill(player.stats.maxHealth, this.clock.time, RESPAWN_PROTECTION);
    this.dread.level = 0;
    this.heat.exposure = 0;
    this.leftAction = null;
    this.touchingSatchels.clear();
    this.deathScreen = { lines, shownAt: performance.now() };
    sfx.death();
  }

  /** A satchel left in lava floats up to the first spot above it that's out of the lava, so it can be collected. */
  private liftOutOfLava(satchel: Satchel): void {
    const inLava = (): boolean => {
      for (const x of [satchel.x, satchel.x + SATCHEL_SIZE - 1]) {
        for (const y of [satchel.y, satchel.y + SATCHEL_SIZE - 1]) {
          if (isLiquid(this.world.getTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)))) return true;
        }
      }
      return false;
    };
    for (let i = 0; i < 8 && inLava(); i++) satchel.y -= TILE_SIZE;
  }

  /** On the death screen: the respawn key (after a moment) brings the view back to the player. */
  private updateDeathScreen(): void {
    if (!this.deathScreen || performance.now() - this.deathScreen.shownAt < DEATH_SCREEN_DELAY * 1000) return;
    if (!actionPressed('respawn') && !actionPressed('click')) return;
    this.deathScreen = null;
    this.camera.centerOn(this.player.centerX, this.player.centerY);
    this.clampCamera();
    this.camera.prevX = this.camera.x;
    this.camera.prevY = this.camera.y;
    sfx.uiClick();
  }

  /**
   * Carried light: the held lantern and the worn miner's helmet are moving lights on the player's
   * tile, and each burning flare one on its own tile. The light map only relights one when it moves to another tile
   * or changes brightness.
   */
  private updateCarriedLight(): void {
    const { lightMap } = this;
    const [tx, ty] = this.playerTile();
    if (this.inventory.selectedStack?.item === 'lantern') lightMap.setMovingLight('lantern', tx, ty, LANTERN_LIGHT);
    else lightMap.removeMovingLight('lantern');
    // The miner's helmet (Phase 16): carried light like the lantern's, while it's worn.
    const helmet = this.player.stats.lightRadius;
    if (helmet > 0) lightMap.setMovingLight('helmet', tx, ty, helmet * LIGHT_FALLOFF_AIR);
    else lightMap.removeMovingLight('helmet');
    const burning = new Set<number>();
    for (const flare of this.flareList) {
      burning.add(flare.id);
      lightMap.setMovingLight(`flare${flare.id}`, Math.floor(flare.x / TILE_SIZE), Math.floor(flare.y / TILE_SIZE), flareLevel(flare));
    }
    for (const id of this.flareLights) if (!burning.has(id)) lightMap.removeMovingLight(`flare${id}`);
    this.flareLights.clear();
    for (const id of burning) this.flareLights.add(id);
  }

  /**
   * Quick torch: place a carried torch at the cursor, or next to the player when the cursor spot
   * can't take one (see quickTorchSpot), without changing the selected item. Says why when it can't.
   */
  private quickTorch(): void {
    const { world, player, inventory, toasts } = this;
    if (inventory.count('torch') === 0) {
      toasts.show('No torches to place. Craft them from wood and coal.', 3);
      return;
    }
    const [cx, cy] = this.cursorTile();
    const spot = quickTorchSpot(world, player, cx, cy);
    if (!spot) {
      toasts.show('Nowhere to put a torch here: it needs a wall, floor or ceiling next to it', 3);
      return;
    }
    const [tx, ty] = spot;
    world.setTile(tx, ty, Tile.Torch);
    inventory.remove('torch', 1);
    sfx.place(tileDef(Tile.Torch).material, this.pan(tx));
    this.noticeDamp(tx, ty);
  }

  /** The first torch placed in damp air in a session: say why it's dim and what to use instead. */
  private noticeDamp(tx: number, ty: number): void {
    if (this.dampHintShown || torchLight(this.world, tx, ty) >= TORCH_LIGHT) return;
    this.dampHintShown = true;
    this.toasts.show("Damp air: torches don't light as far in the Fungal Hollows. Glowshrooms don't mind the damp: mine them and plant them along your way.", 8);
  }

  /** The first time in a session the player feels floatstone's pull: what it does and what it's good for. */
  private noticeFloatstone(): void {
    if (this.floatHintShown || !this.player.floating) return;
    this.floatHintShown = true;
    this.toasts.show('Floatstone lightens gravity near it: you jump higher and fall gently. Mine some to cushion a long drop.', 7);
  }

  /**
   * Heat (Phase 14b): standing in a hot zone uses up a short grace, then burns now and then;
   * touching lava hurts straight away. Neither hurts in Cozy worlds.
   */
  private feelTheHeat(dt: number): void {
    const { player, world } = this;
    const x0 = Math.floor(player.x / TILE_SIZE);
    const y0 = Math.floor(player.y / TILE_SIZE);
    const x1 = Math.floor((player.x + PLAYER_WIDTH - 0.001) / TILE_SIZE);
    const y1 = Math.floor((player.y + PLAYER_HEIGHT - 0.001) / TILE_SIZE);
    let lava = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isLiquid(world.getTile(tx, ty))) lava = true;
    this.heatSafety = lava ? 'lava' : maxHeat(world, x0, y0, x1, y1) > 0 ? 'hot' : 'cool';
    const normal = this.difficulty === 'normal';
    if (this.heatSafety !== 'cool' && !this.heatHintShown) {
      this.heatHintShown = true;
      this.toasts.show(
        normal
          ? 'Heat! Near lava and glowing hot rock you start to burn after a few seconds. Bricks and closed doors keep heat out: a sealed brick room stays cool.'
          : 'Heat: near lava and hot rock it would burn in a Normal world. Bricks and closed doors keep it out.',
        8,
      );
    }
    if (this.heat.update(dt, this.clock.time, this.heatSafety, normal, player.stats.heatHurtInterval)) this.burn(HEAT_HURT, { kind: 'heat' });
    if (lava && normal) this.burn(LAVA_HURT, { kind: 'lava' });
  }

  /** Damage from heat or lava, with a sizzle when it lands. */
  private burn(amount: number, cause: DamageCause): void {
    const before = this.health.hp;
    this.hurt(amount, cause);
    if (this.health.hp < before || this.deathScreen) sfx.sizzle();
  }

  /** Throw the held flare or bomb toward tile (tx, ty)'s centre. */
  private throwAt(tx: number, ty: number): void {
    const item = this.inventory.selectedStack?.item;
    if (item === 'flare') this.throwFlareAt(tx, ty);
    else if (item === 'bomb') this.throwBombAt(tx, ty);
  }

  /** Throw one of the held bombs from the player toward tile (tx, ty)'s centre. */
  private throwBombAt(tx: number, ty: number): void {
    const { player, inventory } = this;
    inventory.removeFromSlot(inventory.selected, 1);
    this.bombList.push(throwBomb(player.centerX, player.y + 8, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, inventory.bestPickaxeTier()));
    // Too many fused at once: the oldest goes off now.
    if (this.bombList.length > BOMB_MAX) this.explode(this.bombList.shift()!);
    sfx.bombThrow();
  }

  /**
   * A bomb goes off: every tile in the 3 x 3 around it that the thrower's best pickaxe could mine
   * breaks (with drops, felled trees and the rest, as if mined), and the player is hurt if close.
   */
  private explode(bomb: Bomb): void {
    const { world, player } = this;
    const [tx, ty] = bombTile(bomb);
    for (const [x, y] of blastTiles(world, tx, ty, bomb.tier)) {
      // An earlier break in this blast may have taken it already (a door's other half, a rope).
      if (!blastBreaks(world, x, y, bomb.tier)) continue;
      const tile = world.getTile(x, y);
      world.setTile(x, y, Tile.Air);
      this.onTileBroken({ tx: x, ty: y, tile });
    }
    this.particles.blast(bomb.x, bomb.y);
    if (!this.settings.reducedFlashes) {
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) this.flashes.push({ tx: x, ty: y, alpha: 0.7, drawn: false });
    }
    this.shake.hit(6);
    sfx.explosion(this.pan(tx));
    if (!this.deathScreen && blastHits(tx, ty, player.x, player.y)) this.hurt(BOMB_DAMAGE, { kind: 'bomb' });
  }

  /** Hang a rope ladder from (tx, ty) with the held rope coil, or say why it can't hang there. */
  private hangRopeAt(tx: number, ty: number): void {
    const { world, player, inventory } = this;
    if (inventory.selectedStack?.item !== 'rope_coil') return;
    const plan = ropePlan(world, player, tx, ty);
    if (!plan) {
      const why = !inReach(player, tx, ty) ? 'Too far away to hang a rope there' : 'A rope hangs from an empty spot with something solid right above it or beside it, like the lip of a shaft';
      this.toasts.show(why, 4);
      return;
    }
    hangRope(world, tx, ty, plan.length);
    inventory.removeFromSlot(inventory.selected, 1);
    sfx.rope(this.pan(tx));
  }

  /** Throw one of the held flares from the player toward tile (tx, ty)'s centre. */
  private throwFlareAt(tx: number, ty: number): void {
    const { player, inventory } = this;
    if (inventory.selectedStack?.item !== 'flare') return;
    inventory.removeFromSlot(inventory.selected, 1);
    const flare = throwFlare(player.centerX, player.y + 8, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
    this.flareList.push(flare);
    // Too many burning at once: the oldest goes out.
    if (this.flareList.length > FLARE_MAX) this.flareList.shift();
    sfx.flareThrow();
  }

  /** The tile at the player's centre: where light is measured for dread and healing. */
  private playerTile(): [number, number] {
    return [Math.floor(this.player.centerX / TILE_SIZE), Math.floor(this.player.centerY / TILE_SIZE)];
  }

  /** Dread rises in the dark, drains in light and hurts when full (not in Cozy worlds). */
  private feelTheDark(dt: number): void {
    const [tx, ty] = this.playerTile();
    this.safety = lightSafety(this.lightMap.level(tx, ty), this.lightMap.established(tx, ty));
    const now = this.clock.time;
    if (this.dread.update(dt, now, this.safety, this.difficulty === 'normal')) this.hurt(DREAD_HURT, { kind: 'dread' });
    const { level } = this.dread;
    // A heartbeat: slow and quiet as a warning, fast and loud when full. Out of the dark it stops.
    if (this.safety === 'dark' && level >= DREAD_WARN) {
      const gap = this.dread.full ? DREAD_HEARTBEAT : DREAD_HEARTBEAT_SLOW;
      if (now - this.lastBeatAt >= gap) {
        this.lastBeatAt = now;
        sfx.heartbeat(this.dread.full ? 1 : 0.5);
      }
    }
    if (!this.dreadHintShown && this.safety === 'dark' && level > 0.15) {
      this.dreadHintShown = true;
      this.toasts.show('The dark builds dread (the bar under your hearts). Get to light before it fills: a torch, a lantern or the sky.', 7);
    }
  }

  /** Fall damage on landing, and the ladder hint the first time the player falls past a ladder. */
  private checkFall(): void {
    const { player } = this;
    if (player.fallLanded > 0) {
      const damage = fallDamage(player.fallLanded, player.stats.safeFallTiles);
      if (damage > 0) this.hurt(damage, { kind: 'fall', tiles: player.fallLanded });
    }
    const falling = player.fallTop !== null && player.vy > 0 && player.y - player.fallTop > 2 * TILE_SIZE;
    if (!this.ladderHintShown && falling && player.onLadder(this.world)) {
      this.ladderHintShown = true;
      this.toasts.show(ladderGrabHint(), 4);
    }
    if (player.caughtByLadder) sfx.step('wood');
  }

  /** Touching a satchel empties it into the inventory, as far as there's room. */
  private updateSatchels(): void {
    const { player, inventory, toasts } = this;
    const touching = new Set<Satchel>();
    for (const satchel of this.satchels) {
      if (!touchesSatchel(player, satchel)) continue;
      touching.add(satchel);
      const firstTouch = !this.touchingSatchels.has(satchel);
      const moved = collectSatchel(satchel, inventory);
      if (moved > 0) {
        sfx.pickup();
        toasts.show(`Recovered ${moved} item${moved === 1 ? '' : 's'} from the satchel`);
      }
      if (satchel.stacks.length > 0 && (firstTouch || moved > 0)) {
        toasts.show(`Inventory full: ${satchelItemCount(satchel)} items stay in the satchel`, 3);
      }
    }
    this.touchingSatchels = touching;
    this.satchels = this.satchels.filter((s) => s.stacks.length > 0);
  }

  /** The satchel nearest the player, or null. */
  private nearestSatchel(): Satchel | null {
    let best: Satchel | null = null;
    let bestDistance = Infinity;
    for (const satchel of this.satchels) {
      const distance = Math.hypot(satchel.x - this.player.x, satchel.y - this.player.y);
      if (distance < bestDistance) {
        best = satchel;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Right-click on a door in reach: open it, or close it unless the player is in the doorway.
   * Returns false if (tx, ty) isn't a door in reach.
   */
  private useDoor(tx: number, ty: number): boolean {
    const bottom = doorBottom(this.world, tx, ty);
    if (!bottom || !inReach(this.player, tx, ty)) return false;
    const [bx, by] = bottom;
    const inDoorway = (): boolean => overlapsPlayer(this.player, bx, by) || overlapsPlayer(this.player, bx, by - 1);
    if (toggleDoor(this.world, bx, by, inDoorway)) sfx.door(isDoorOpen(this.world, bx, by), this.pan(bx));
    return true;
  }

  /** Middle click: put the block under the cursor in hand, if it's carried. */
  private pickBlock(tx: number, ty: number): void {
    const tile = this.world.getTile(tx, ty);
    const item = tile === Tile.Air || !this.world.inBounds(tx, ty) ? null : itemForTile(tile);
    if (!item) return;
    if (this.inventory.pick(item)) sfx.uiClick();
    else this.toasts.show(`No ${itemDef(item).name} to pick`);
  }

  /** Q: throw the selected hotbar stack forward. */
  private throwSelected(): void {
    const stack = this.inventory.selectedStack;
    if (!stack) return;
    this.inventory.slots[this.inventory.selected] = null;
    this.dropAtPlayer(stack.item, stack.count);
    sfx.uiClick();
  }

  /** C: quick stack into every chest in station range. */
  private quickStackNearby(): void {
    const { world, player, toasts } = this;
    const chests = nearbyChests(world, this.tileEntities, player.centerX, player.centerY, player.stats.stationRange);
    if (chests.length === 0) {
      toasts.show('No chests nearby');
      return;
    }
    const { moved, chests: used } = quickStackAll(this.inventory, chests);
    if (moved === 0) {
      toasts.show('Nothing to quick stack');
      return;
    }
    toasts.show(`Quick stacked ${moved} item${moved > 1 ? 's' : ''} into ${used} chest${used > 1 ? 's' : ''}`);
    sfx.uiClick();
  }

  /** A removed chest's contents, popped out of its tile. (A plant's entity just goes.) */
  private spill(tx: number, ty: number, entity: TileEntity): void {
    if (entity.kind !== 'chest') return;
    for (const stack of entity.slots) {
      if (stack) this.dropList.push(new ItemDrop(stack.item, stack.count, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE));
    }
  }

  /** Sound, flash, particles and the item drop for a tile that just broke. */
  private shatter(tx: number, ty: number, tile: TileId): void {
    const def = tileDef(tile);
    sfx.breakTile(def.material, def.hardness, this.pan(tx));
    if (!this.settings.reducedFlashes) this.flashes.push({ tx, ty, alpha: breakFlashAlpha(def.hardness), drawn: false });
    this.particles.breakBurst(tx, ty, def.color);
    if (def.drop) this.dropList.push(new ItemDrop(def.drop, 1, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE));
    // Leaves sometimes drop a sapling, and giant mushroom caps spores.
    const extra = chanceDropFor(tile, Math.random());
    if (extra) this.dropList.push(new ItemDrop(extra, 1, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE));
  }

  /**
   * Dig ticks every DIG_TICK_INTERVAL while `digging` (holding the mine button on a minable tile),
   * or the drill's whir twice as often.
   */
  private digTick(dt: number, digging: boolean, tx: number, ty: number, drilling = false): void {
    if (!digging) {
      this.digTickIn = 0; // the first hit on a tile ticks straight away
      return;
    }
    this.digTickIn -= dt;
    if (this.digTickIn > 0) return;
    const hardness = tileDef(this.world.getTile(tx, ty)).hardness;
    if (drilling) {
      this.digTickIn += DIG_TICK_INTERVAL / 2;
      sfx.drill(hardness, this.pan(tx));
    } else {
      this.digTickIn += DIG_TICK_INTERVAL;
      sfx.dig(hardness, this.pan(tx));
    }
  }

  /** The drill broke a tile: it burns a coal from the inventory every DRILL_TILES_PER_COAL tiles. */
  private burnDrillFuel(): void {
    if (this.drillCharge <= 0 && this.inventory.remove('coal', 1)) this.drillCharge = DRILL_TILES_PER_COAL;
    this.drillCharge = Math.max(0, this.drillCharge - 1);
  }

  /** Jump, landing and footstep sounds, and dust when landing hard. Call after the player moves. */
  private playerFeedback(): void {
    const { player, world } = this;
    if (player.jumped) sfx.jump();
    if (player.landingSpeed >= LAND_MIN_SPEED) {
      const ground = player.groundTile(world);
      const strength = Math.min(1, (player.landingSpeed - LAND_MIN_SPEED) / (LAND_FULL_SPEED - LAND_MIN_SPEED));
      sfx.land(tileDef(ground).material, strength);
      // Grass is only green on top; its dust is dirt.
      const dust = tileDef(ground === Tile.Grass ? Tile.Dirt : ground);
      if (ground !== Tile.Air) this.particles.dustPuff(player.centerX, player.y + PLAYER_HEIGHT, strength, dust.color);
      this.lastStepAt = player.walkDistance; // the landing was the footstep
    }
    // A rung sound every CLIMB_STEP_DISTANCE climbed on a ladder.
    if (!player.climbing) {
      this.lastRungAt = player.climbDistance;
    } else if (player.climbDistance - this.lastRungAt >= CLIMB_STEP_DISTANCE) {
      this.lastRungAt = player.climbDistance;
      sfx.step('wood');
    }
    if (!player.grounded || Math.abs(player.vx) < 1) {
      // Standing still: the first step comes after half a stride.
      this.lastStepAt = player.walkDistance - FOOTSTEP_DISTANCE / 2;
    } else if (player.walkDistance - this.lastStepAt >= FOOTSTEP_DISTANCE) {
      this.lastStepAt = player.walkDistance;
      sfx.step(tileDef(player.groundTile(world)).material);
    }
  }

  /** Stereo position (-1 left .. 1 right) of a sound from tile column tx, relative to the player. */
  private pan(tx: number): number {
    return ((tx + 0.5) * TILE_SIZE - this.player.centerX) / (this.player.stats.reach * TILE_SIZE);
  }

  /** Throw items forward from the player. They stay there until the player walks away and comes back. */
  private dropAtPlayer(item: ItemId, count: number): void {
    const drop = new ItemDrop(item, count, this.player.centerX, this.player.centerY);
    drop.vx = this.player.facing * DROP_THROW_SPEED;
    drop.waitForPlayerToLeave = true;
    this.dropList.push(drop);
  }

  /**
   * Outline the tile under the cursor: white if it can be mined, red if not. With cave-ins on,
   * a support under the cursor shows the gravel that would fall without it, and a support about
   * to be placed shows the gravel it would hold up.
   */
  private drawCursor(camX: number, camY: number): void {
    const { world, renderer } = this;
    const [tx, ty] = this.cursorTile();
    const check = checkMine(world, this.player, tx, ty, this.inventory.bestPickaxeTier());
    if (check !== 'empty') {
      renderer.drawTileOutline(tx, ty, check === 'ok' ? '#ffffff' : '#ff4040', camX, camY);
      const here = world.getTile(tx, ty);
      if (this.caveIns.isEnabled && isSupport(here)) this.drawRemovalWarning(tx, ty, here, camX, camY);
      this.drawPlantStatus(tx, ty, camX, camY);
      return;
    }
    // A rope coil: the rope it would unroll, and how far it reaches (Phase 16).
    const stack = this.inventory.selectedStack;
    if (stack?.item === 'rope_coil' && world.getTile(tx, ty) === Tile.Air && inReach(this.player, tx, ty)) {
      const plan = ropePlan(world, this.player, tx, ty);
      if (!plan) {
        renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
        renderer.drawFloatingText('A rope hangs from an edge: something solid above or beside', (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ffc080', 1, camX, camY);
        return;
      }
      for (let i = 0; i < plan.length; i++) renderer.drawTileOutline(tx, ty + i, i === 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.35)', camX, camY);
      renderer.drawFloatingText(ropePlanText(plan), (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ffe9b0', 1, camX, camY);
      return;
    }
    // Empty tile: a faint outline where the selected block could be placed.
    const tile = stack ? itemDef(stack.item).placeTile : null;
    const camp = tile === Tile.CampTopLeft ? this.campAt() : null;
    if (camp && world.getTile(tx, ty) === Tile.Air && inReach(this.player, tx, ty)) {
      // One camp at a time: say where the one there is.
      renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
      const text = `One camp at a time: pack up yours (${depthText(camp.ty + 2 - SURFACE_LEVEL)}) first`;
      renderer.drawFloatingText(text, (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ffc080', 1, camX, camY);
    } else if (tile === Tile.CampTopLeft && canPlace(world, this.player, tx, ty, tile)) {
      // The camp's whole 2 x 2 footprint.
      const [cx, cy] = campSpot(world, this.player, tx, ty)!;
      for (const [x, y] of [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]]) renderer.drawTileOutline(x, y, 'rgba(255, 255, 255, 0.45)', camX, camY);
    } else if (tile !== null && canPlace(world, this.player, tx, ty, tile)) {
      if (this.caveIns.isEnabled && isSupport(tile)) this.drawSupportPreview(tx, ty, tile, camX, camY);
      else renderer.drawTileOutline(tx, ty, 'rgba(255, 255, 255, 0.45)', camX, camY);
    } else if (tile === Tile.LiftStop && world.getTile(tx, ty) === Tile.Air && inReach(this.player, tx, ty) && !stopFits(world, tx, ty)) {
      renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
      renderer.drawFloatingText('Lift stops go beside a lift rail, on a floor', (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ffc080', 1, camX, camY);
    } else if (tile === Tile.CampTopLeft && world.getTile(tx, ty) === Tile.Air && inReach(this.player, tx, ty)) {
      renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
      renderer.drawFloatingText('The camp needs a 2 x 2 space on solid ground', (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ffc080', 1, camX, camY);
    } else if (tile === Tile.Beam && world.inBounds(tx, ty) && inReach(this.player, tx, ty) && !beamFooting(worldGetter(world), tx, ty)) {
      // A beam can't go here only because there's nothing under it: say so (the first few times).
      renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
      this.drawSupportHint('placeBeam', 'Beams stand on solid ground or on another beam', tx, ty, '#ffc080', camX, camY);
    } else if (tile !== null && isLiquid(world.getTile(tx, ty)) && inReach(this.player, tx, ty)) {
      // Lava can't be built in (or dug): say so, and what does work.
      renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
      renderer.drawFloatingText("Can't build in lava. Bricks over it keep the heat off.", (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ffc080', 1, camX, camY);
    } else if (tile !== null && world.getTile(tx, ty) === Tile.Air && inReach(this.player, tx, ty) && !canPlantOn(tile, world.getTile(tx, ty + 1))) {
      // A sapling or spores over the wrong ground: say what they grow on.
      const on = tileDef(tile).plant!.on.map((t) => tileDef(t).name.toLowerCase());
      renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
      const text = `${itemDef(stack!.item).name} only grow${stack!.item === 'sapling' ? 's' : ''} on ${on.join(' or ')}`;
      renderer.drawFloatingText(text, (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ffc080', 1, camX, camY);
    }
  }

  /** Which one-time hint covers placing `tile`. */
  private supportHintId(tile: TileId): HintId {
    return tileDef(tile).support === 'post' ? 'placeBeam' : 'placeSpan';
  }

  /**
   * A line of text over the cursor tile explaining a support, shown until the player has placed
   * one of that kind (then the item tooltip in the inventory keeps the details).
   */
  private drawSupportHint(id: HintId, text: string, tx: number, ty: number, color: string, camX: number, camY: number): void {
    if (hintSeen(id)) return;
    this.renderer.drawFloatingText(text, (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, color, 1, camX, camY);
  }

  /** The support preview for `tile` at (tx, ty) (Air: removing what's there), cached until something changes. */
  private previewAt(tx: number, ty: number, tile: TileId): SupportPreview {
    const key = `${tx},${ty},${tile},${this.world.revision}`;
    if (this.supportPreview?.key !== key) {
      const anchored = tile === Tile.Air || holdsLoose(withTile(this.world, tx, ty, tile), tx, ty);
      this.supportPreview = { key, effect: supportEffect(this.world, tx, ty, tile), anchored };
    }
    return this.supportPreview;
  }

  /**
   * Placing a support: green tiles are gravel it would hold up, orange ones loose gravel nearby
   * that would still hang free. The cursor is green when the support is anchored, orange when not,
   * with a line saying why.
   */
  private drawSupportPreview(tx: number, ty: number, tile: TileId, camX: number, camY: number): void {
    const { renderer } = this;
    const { effect, anchored } = this.previewAt(tx, ty, tile);
    // Platforms are mostly floors: they only get the preview when there's gravel about.
    if (tile === Tile.Platform && effect.stabilized.length === 0 && effect.unsupported.length === 0) {
      renderer.drawTileOutline(tx, ty, 'rgba(255, 255, 255, 0.45)', camX, camY);
      return;
    }
    for (const [x, y] of effect.stabilized) {
      renderer.drawTileTint(x, y, 'rgba(90, 230, 110, 0.3)', camX, camY);
      renderer.drawTileOutline(x, y, '#6be37a', camX, camY);
    }
    for (const [x, y] of effect.unsupported) renderer.drawTileOutline(x, y, 'rgba(255, 150, 40, 0.7)', camX, camY);
    renderer.drawTileOutline(tx, ty, anchored ? '#6be37a' : '#ff9628', camX, camY);
    const n = effect.stabilized.length;
    let text: string | null = null;
    if (!anchored) {
      text =
        tileDef(tile).support === 'post'
          ? `Too tall: beams hold things up to ${BEAM_MAX_HEIGHT} high`
          : `Not anchored: needs a wall, beam, ground or rock above within ${SPAN_MAX} tiles`;
    } else if (n > 0) {
      text = `Holds up ${n} gravel`;
    }
    if (text) this.drawSupportHint(this.supportHintId(tile), text, tx, ty, anchored ? '#a8f0b0' : '#ffc080', camX, camY);
  }

  /** A support under the cursor that holds gravel up: the gravel that would fall without it, in red. */
  private drawRemovalWarning(tx: number, ty: number, tile: TileId, camX: number, camY: number): void {
    const { renderer } = this;
    const { effect } = this.previewAt(tx, ty, Tile.Air);
    if (effect.endangered.length === 0) return;
    for (const [x, y] of effect.endangered) {
      renderer.drawTileTint(x, y, 'rgba(255, 60, 40, 0.3)', camX, camY);
      renderer.drawTileOutline(x, y, '#ff5040', camX, camY);
    }
    const text = `Load-bearing ${tileDef(tile).name.toLowerCase()}: ${effect.endangered.length} gravel would fall`;
    renderer.drawFloatingText(text, (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, '#ff9a8a', 1, camX, camY);
  }

  /** A planted sapling or sprout under the cursor: whether it's growing, or why it can't. */
  private drawPlantStatus(tx: number, ty: number, camX: number, camY: number): void {
    const status = plantStatus(this.world, tx, ty);
    if (!status || !this.tileEntities.get(tx, ty)) return;
    const text = plantStatusText(this.world.getTile(tx, ty), status);
    this.renderer.drawFloatingText(text, (tx + 0.5) * TILE_SIZE, ty * TILE_SIZE - 2, status === 'growing' ? '#a8f0b0' : '#ffc080', 1, camX, camY);
  }

  /** Loose tiles on screen that nothing holds up (the bottoms of their columns), for their dangling-pebble mark. */
  private unsupportedOnScreen(camX: number, camY: number): [number, number][] {
    const { world, renderer } = this;
    const get = worldGetter(world);
    const tiles: [number, number][] = [];
    const tx0 = Math.max(0, Math.floor(camX / TILE_SIZE));
    const ty0 = Math.max(0, Math.floor(camY / TILE_SIZE));
    const tx1 = Math.min(world.width - 1, Math.floor((camX + renderer.viewWidth) / TILE_SIZE));
    const ty1 = Math.min(world.height - 1, Math.floor((camY + renderer.viewHeight) / TILE_SIZE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isLoose(get(tx, ty)) && !isLoose(get(tx, ty + 1)) && !columnHeld(get, tx, ty)) tiles.push([tx, ty]);
      }
    }
    return tiles;
  }

  /** Dust trickling from under shaking gravel (always, whatever the shake and flash settings). */
  private trickleDust(dt: number): void {
    for (const [tx, ty] of this.caveIns.warningTiles()) {
      if (isLoose(this.world.getTile(tx, ty + 1))) continue; // only from a column's bottom
      if (Math.random() < GRAVEL_DUST_RATE * dt) this.particles.trickle(tx, ty, tileDef(this.world.getTile(tx, ty)).color);
    }
  }

  /** Does a falling block with its top-left at (x, y) overlap the player? (A pixel of slack on each side.) */
  private blockTouchesPlayer(x: number, y: number): boolean {
    const { player } = this;
    if (this.deathScreen) return false;
    return x + TILE_SIZE - 1 > player.x && x + 1 < player.x + PLAYER_WIDTH && y + TILE_SIZE - 1 > player.y && y + 1 < player.y + PLAYER_HEIGHT;
  }

  /** F3: the stratum at the player's tile, its depths, and where its boundaries are in this column. */
  private stratumLine(tx: number, ty: number): string {
    const s = stratumAt(this.world, tx, ty);
    if (s < 0) return 'Stratum: none (this world has no strata)';
    const tops = this.world.strataTops;
    const at = (row: number): string => `${row - SURFACE_LEVEL} m`;
    const top = s === 0 ? 'the surface' : at(tops[s - 1][tx]);
    const bottom = s < tops.length ? at(tops[s][tx]) : 'bedrock';
    return `Stratum: ${STRATA[s].name} (${depthRange(s)}; here ${top} to ${bottom})   ambience ${STRATA[s].ambience}   ${this.plantLine()}`;
  }

  /** F3: the strata's rules where the player is (Phase 14b), and the Heart of the Deep. */
  private rulesLine(tx: number, ty: number): string {
    const heart = this.world.heart;
    const claimed = this.heartClaimedAt === null ? 'not claimed' : `claimed at ${playTimeText(this.heartClaimedAt)}`;
    const heartText = heart ? `Heart (${heart.tx}, ${heart.ty}) ${claimed}` : 'no Heart';
    const heat = `${this.heatSafety}, grace ${this.heat.graceLeft.toFixed(1)} s`;
    return `Torch light here ${torchLight(this.world, tx, ty)}   floatstone ${this.player.floating ? 'yes' : 'no'}   heat ${heat}   ${heartText}`;
  }

  /** F3: the lifts (Phase 15), the camp and the respawn choice. */
  private liftLine(): string {
    const { lifts } = this;
    const moving = lifts.cages.filter((c) => c.target !== null).length;
    const ride = lifts.ride ? `riding to (${lifts.ride.to.sx}, ${lifts.ride.to.sy})` : lifts.pickup ? `cage fetching at (${lifts.pickup.from.sx}, ${lifts.pickup.from.sy})` : 'not riding';
    const camp = this.campAt();
    return `Lifts: ${lifts.cages.length} cage${lifts.cages.length === 1 ? '' : 's'} (${moving} moving), ${ride}   camp ${camp ? `(${camp.tx}, ${camp.ty})` : 'none'}   respawn at ${this.respawnAt}`;
  }

  /** F3: the worn gear and the stats it changes (Phase 16), the claws' grip and the tools in use. */
  private gearLine(): string {
    const { inventory, player } = this;
    const worn = inventory.gear.flatMap((s) => (s ? [itemDef(s.item).name] : []));
    const s = player.stats;
    const wall = player.onWall === 0 ? 'no' : player.onWall > 0 ? 'right' : 'left';
    return (
      `Gear: ${worn.join(', ') || 'none'}   reach ${s.reach}  stations ${s.stationRange}  pickup ${s.dropPullRange}  jump ${s.jumpVelocity}  ` +
      `safe fall ${s.safeFallTiles}  light ${s.lightRadius}  heat every ${s.heatHurtInterval} s  grip ${s.wallGrip} (on wall: ${wall})   ` +
      `bombs ${this.bombList.length}  drill charge ${this.drillCharge}`
    );
  }

  /** F3: the planted saplings and sprouts and how they stand, e.g. "plants 3 (2 growing, 1 noSky)". */
  private plantLine(): string {
    let n = 0;
    const counts = new Map<PlantStatus, number>();
    this.tileEntities.forEach((tx, ty, entity) => {
      if (entity.kind !== 'plant') return;
      n++;
      const status = plantStatus(this.world, tx, ty) ?? 'noGround';
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });
    const parts = [...counts].map(([status, count]) => `${count} ${status}`);
    return `plants ${n}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
  }

  /** F3 debug overlay. */
  private drawOverlay(stats: FrameStats): void {
    const { player } = this;
    const tx = Math.floor(player.centerX / TILE_SIZE);
    const ty = Math.floor(player.centerY / TILE_SIZE);
    const tier = this.inventory.bestPickaxeTier();
    const saved = stats.lastSavedAt ? `${Math.round((Date.now() - stats.lastSavedAt) / 1000)} s ago` : 'not yet';
    const debugLines = DEBUG ? debugHelpLines(player.flying, this.instantMine, this.fullbright, this.health.god) : [];
    const fall = player.fallTop === null ? 'none' : `${((player.y - player.fallTop) / TILE_SIZE).toFixed(1)} tiles`;
    const protectedFor = Math.max(0, this.health.protectedUntil - this.clock.time);
    const percent = (volume: number): string => `${Math.round(volume * 100)}%`;
    drawDebugInfo(this.renderer.ctx, [
      `FPS ${stats.fps}   frame ${stats.frameMs.toFixed(1)} ms   saved ${saved}`,
      `Audio ${sfx.audioStatus()}   master ${percent(this.settings.masterVolume)}   SFX ${percent(this.settings.sfxVolume)}`,
      `Seed ${this.world.seed}   World hash ${this.worldHash}   Generation ${profileLabel(this.world.profile)}`,
      this.stratumLine(tx, ty),
      `Play time ${this.clock.time.toFixed(1)} s   World ${this.pausedBy ? `paused (${this.pausedBy})` : 'running'}`,
      `Player tile (${tx}, ${ty})   Light ${this.lightMap.level(tx, ty)} (established ${this.lightMap.established(tx, ty)}, safe from ${DREAD_SAFE_LIGHT})   ${this.safety}   dread ${Math.round(this.dread.level * 100)}%`,
      `Pickaxe: ${tier >= 0 ? PICKAXES[tier].name : 'none'} (tier ${tier})`,
      `${difficultyName(this.difficulty)}   HP ${this.health.hp}/${player.stats.maxHealth}   protected ${protectedFor.toFixed(1)} s   fall ${fall}   bed ${this.activeBed() ? `(${this.bed!.tx}, ${this.bed!.ty})` : 'none'}   satchels ${this.satchels.length}`,
      `Goal ${this.pinnedRecipe ?? 'none'}   map pins ${this.mapPins.pins.length} (tracked ${this.mapPins.trackedPin?.name ?? 'none'})`,
      this.rulesLine(tx, ty),
      `Cave-ins ${this.caveIns.isEnabled ? 'on' : 'off (Cozy)'}   shaking ${this.caveIns.warnings.size}   falling ${this.caveIns.falling.length}   rechecks queued ${this.tileUpdates.size}`,
      this.liftLine(),
      this.gearLine(),
      ...overlayHelpLines(),
      ...debugLines,
    ]);
  }
}

/** "2 h 14 min", "35 min" or "40 s": seconds of play, for the Heart of the Deep's banner. */
export function playTimeText(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
