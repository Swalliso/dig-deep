import * as sfx from './audio/sfx';
import {
  BEAM_MAX_HEIGHT,
  CLIMB_STEP_DISTANCE,
  DAMAGE_NUMBER_TIME,
  DEATH_SCREEN_DELAY,
  DIG_TICK_INTERVAL,
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
  HEART_SHAKE_TIME,
  HURT_FLASH_ALPHA,
  HURT_FLASH_TIME,
  HURT_PROTECTION,
  LAND_FULL_SPEED,
  LANTERN_LIGHT,
  LAND_MIN_SPEED,
  PICKAXES,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROTECTION_ALPHA,
  PROTECTION_BLINK,
  RESPAWN_PROTECTION,
  SATCHEL_SIZE,
  SPAN_MAX,
  SURFACE_LEVEL,
  TILE_SIZE,
  TILE_UPDATE_BUDGET,
} from './config';
import {
  brushNeighbours,
  DEBUG,
  debugHelpLines,
  giveDebugKit,
  nextInstantMine,
  placeLadderShaft,
  placeGravelPocket,
  placeOreSampler,
  type InstantMine,
} from './debug';
import { flareLevel, throwFlare, updateFlares, type Flare } from './entities/flare';
import { ItemDrop, updateDrops } from './entities/itemDrop';
import { Player } from './entities/player';
import { actionDown, actionPressed, consumeWheel, HOTBAR_ACTIONS, mouse } from './input';
import { Camera } from './render/camera';
import { breakFlashAlpha, ScreenShake, type BreakFlash } from './render/juice';
import { MapImage } from './render/mapImage';
import { Particles } from './render/particles';
import type { Renderer } from './render/renderer';
import { canPlace, itemForTile, overlapsPlayer, primaryAction, tilesOnLine, tryPlace, type PrimaryAction } from './systems/building';
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
  type Satchel,
} from './systems/death';
import { deathCauseText, difficultyName, fallDamage, Health, type DamageCause, type Difficulty } from './systems/health';
import { Inventory } from './systems/inventory';
import { itemDef, type ItemId } from './systems/items';
import { checkMine, inReach, Mining, type BrokenTile } from './systems/mining';
import { hintSeen, markHintSeen, type HintId } from './systems/hints';
import { saveSettings, type Settings } from './systems/settings';
import { ladderGrabHint, mainKey, overlayHelpLines, respawnPrompt } from './ui/controls';
import { drawDebugInfo, drawDepthMeter, drawFpsCounter, drawHotbar, drawToasts, Toasts } from './ui/hud';
import { drawMinimap, FullMap, type MapInput, type MapMarkers } from './ui/map';
import { InventoryPanel, type PanelState } from './ui/menus';
import { directionText, drawDeathScreen, drawDreadMeter, drawHearts, drawHudLine, offsetText } from './ui/vitals';
import { bedLeft, bedPartner, isBed, isWholeBed } from './world/beds';
import { ExploredMap } from './world/explored';
import { doorBottom, doorPartner, isDoorOpen, toggleDoor } from './world/doors';
import { profileLabel } from './world/generate';
import { LightMap } from './world/lighting';
import { beamFooting, columnHeld, holdsLoose, isLoose, isSupport, supportEffect, withTile, worldGetter, type SupportEffect } from './world/supports';
import { TileEntities, type TileEntity } from './world/tileEntities';
import { Tile, tileDef, type TileId } from './world/tiles';
import { fellTreeAbove } from './world/trees';
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
  /** Bags left where the player died, oldest first. */
  satchels: Satchel[];
  /** Showing after a death until the player presses the respawn key (the world is paused). */
  deathScreen: DeathScreen | null = null;
  /** Active tile updates: tiles to recheck after nearby changes (cave-ins use them). */
  readonly tileUpdates: TileUpdates;
  /** Shaking and falling gravel (off in Cozy worlds). */
  readonly caveIns: CaveIns;
  /** Builds up in the dark and hurts when full (none in Cozy worlds). */
  readonly dread: Dread;
  /** How lit the player's tile was at the last simulation step. */
  private safety: LightSafety = 'established';
  private flareList: Flare[];
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
    this.satchels = start.satchels ?? [];
    this.dread = start.dread ?? new Dread();
    this.flareList = start.flares ?? [];
    this.inventory = start.inventory ?? Inventory.withStartingItems();
    this.dropList = start.drops ?? [];
    this.tileEntities = start.tileEntities ?? new TileEntities(world);
    // Whatever removes a chest (mining, or a debug patch over it) spills its contents.
    this.tileEntities.onRemove = (tx, ty, entity) => this.spill(tx, ty, entity);
    this.lightMap = new LightMap(world);
    this.tileUpdates = new TileUpdates(world);
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

  /** Is Esc going to close something in the game (the panel or the map) rather than pause? */
  get capturesEscape(): boolean {
    return this.inventoryPanel.open || this.fullMap.open;
  }

  /** What pauses the world from inside the game (the inventory panel or the full map), or null. */
  get pausedBy(): PauseReason | null {
    if (this.deathScreen) return 'dead';
    if (this.inventoryPanel.open) return 'panel';
    if (this.fullMap.open) return 'map';
    return null;
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
  }

  /** Keys, the map and the panel: everything that takes input while the player is alive. */
  private handleInput(dt: number): void {
    this.handleKeys();
    if (this.fullMap.open) {
      const { canvas, scale } = this.renderer;
      this.fullMap.update(dt, this.mapInput(), canvas.width, canvas.height, scale, this.world.width, this.world.height);
    } else {
      this.handlePanelInput();
    }
  }

  /** Keys that work whether or not the world is paused: the overlay, map, hotbar, panel and cheats. */
  private handleKeys(): void {
    const { inventory, inventoryPanel } = this;
    if (actionPressed('overlay')) this.showOverlay = !this.showOverlay;
    // M opens the full map (closing the inventory panel); M or Esc closes it. While it's open the
    // mouse wheel, dragging and the movement keys move the map.
    if (actionPressed('map') || (this.fullMap.open && actionPressed('pause'))) this.toggleMap();
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
    if (actionPressed('inventory') || (inventoryPanel.open && actionPressed('pause'))) {
      if (inventoryPanel.open) {
        this.closePanel();
      } else {
        inventoryPanel.open = true;
        this.openChest = this.nearestChestInReach();
      }
    }
  }

  private debugKeys(): void {
    const { world, player, toasts } = this;
    if (actionPressed('debugGive')) {
      giveDebugKit(this.inventory);
      toasts.show('Debug: materials added');
    }
    if (actionPressed('debugFly')) player.setFlying(!player.flying, world);
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
        this.openChest = { tx, ty };
        inventoryPanel.open = true;
        sfx.uiClick();
      } else if (!inventoryPanel.open && !this.useBed(tx, ty)) {
        this.useDoor(tx, ty);
      }
    }

    if (inventoryPanel.open && actionPressed('click')) {
      const click = inventoryPanel.click(canvas, scale, mouse.x, mouse.y, actionDown('modifier'), this.panelState());
      if (click?.kind === 'crafted') {
        toasts.gained(click.recipe.output, click.recipe.count * click.batches);
        sfx.craft();
      } else if (click) {
        sfx.uiClick();
      }
    }
  }

  /** One step of the world: the player, mining and building, drops, and everything else timed. */
  private simulate(dt: number): void {
    const { world, player } = this;
    this.clock.advance(dt);
    player.update(dt, world, {
      move: (actionDown('moveRight') ? 1 : 0) - (actionDown('moveLeft') ? 1 : 0),
      jumpPressed: actionPressed('jump'),
      jumpHeld: actionDown('jump'),
      climb: (actionDown('climbDown') ? 1 : 0) - (actionDown('climbUp') ? 1 : 0),
      fast: actionDown('modifier'),
    });
    this.playerFeedback();
    this.checkFall();
    this.feelTheDark(dt);
    // Health only comes back in the world's own light (not the lantern's).
    this.health.update(this.clock.time, player.stats.maxHealth, this.safety === 'established');
    if (this.deathScreen) return; // the fall was fatal: the rest waits for the respawn
    this.useHeldItem(dt);
    this.caveIns.update(dt, this.clock.time, TILE_UPDATE_BUDGET, this.caveInHooks);
    if (this.deathScreen) return; // crushed: the rest waits for the respawn
    this.trickleDust(dt);
    this.updateSatchels();
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
    }
    if (actionPressed('use') && this.leftAction === 'throw') this.throwFlareAt(tx, ty);
    const held = this.leftAction === 'dig' && actionDown('use');
    const tier = inventory.bestPickaxeTier();
    const instant = this.instantMine !== 'off';
    const broken = mining.update(dt, world, player, tx, ty, held, tier, instant);
    if (broken) this.onTileBroken(broken);
    else this.digTick(dt, held && !instant && checkMine(world, player, tx, ty, tier) === 'ok', tx, ty);
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
    renderer.drawSatchels(this.satchels, this.clock.time, camX, camY);
    // Dead: the player isn't drawn (they're already back at the bed, off screen).
    if (!this.deathScreen) renderer.drawPlayer(player, px, py, camX, camY, this.playerAlpha(), inventory.selectedStack?.item === 'lantern');
    renderer.drawParticles(this.particles, camX, camY);
    if (!this.fullbright) renderer.drawLight(this.lightMap, camX, camY, glowX, glowY);
    renderer.drawGlowTint(this.world, this.lightMap, this.clock.time, !reduced, camX, camY);
    if (!reduced) renderer.drawSparkles(this.world, this.fullbright ? null : this.lightMap, this.clock.time, camX, camY, glowX, glowY);
    renderer.drawFlashes(this.flashes, camX, camY);
    this.drawDreadVignette();
    for (const f of this.floaters) {
      const t = (this.clock.time - f.at) / f.duration;
      renderer.drawFloatingText(f.text, f.x, f.y - t * 12, f.color, Math.min(1, 3 * (1 - t)), camX, camY);
    }
    if (!this.inventoryPanel.open && !this.deathScreen) this.drawCursor(camX, camY);
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
      drawHotbar(renderer.ctx, renderer.itemAtlas, inventory, renderer.scale);
      if (this.settings.showMinimap && !this.fullMap.open) drawMinimap(renderer.ctx, this.mapImage, this.mapMarkers(glowX, glowY), renderer.scale);
    }
    drawToasts(renderer.ctx, this.toasts, renderer.scale);
    const hudBottom = this.fullMap.open ? 6 * renderer.scale : this.drawVitals(sinceHit);
    // Depth is measured at the player's feet: standing on the surface level reads 0 m.
    drawDepthMeter(renderer.ctx, Math.floor((player.y + PLAYER_HEIGHT) / TILE_SIZE) - SURFACE_LEVEL, renderer.scale);
    if (this.fullMap.open) this.fullMap.draw(renderer.ctx, this.mapImage, this.mapMarkers(glowX, glowY), renderer.scale);
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
      if (dread.level > 0 || safety !== 'established') {
        const carrier = this.inventory.selectedStack?.item === 'lantern' ? 'Lantern' : 'Flare';
        const status = dreadStatus(safety, dread.level, health.hp < player.stats.maxHealth, carrier);
        y = drawDreadMeter(renderer.ctx, dread.level, status, this.settings.reducedFlashes ? 0 : this.heartbeat(), y, u);
      }
    }
    const satchel = this.nearestSatchel();
    if (satchel) {
      const dx = (satchel.x + SATCHEL_SIZE / 2 - player.centerX) / TILE_SIZE;
      const dy = (satchel.y + SATCHEL_SIZE / 2 - player.centerY) / TILE_SIZE;
      const more = this.satchels.length > 1 ? ` (${this.satchels.length} satchels)` : '';
      y = drawHudLine(renderer.ctx, directionText('Satchel', dx, dy) + more, y, u, '#d9bfff');
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
      this.fullMap.open = false;
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
      chests: this.tileEntities.entries().map(({ tx, ty }) => ({ tx, ty })),
      bed: this.activeBed(),
      satchels: this.satchels.map((s) => ({ tx: (s.x + SATCHEL_SIZE / 2) / TILE_SIZE, ty: (s.y + SATCHEL_SIZE / 2) / TILE_SIZE })),
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
      this.toasts.show('Your bed is gone. Without one you respawn near the world spawn.', 4);
    }
    // Cutting a trunk brings down the rest of the tree above the cut.
    if (tile === Tile.Wood) {
      for (const felled of fellTreeAbove(this.world, tx, ty)) this.shatter(felled.tx, felled.ty, felled.tile);
    }
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
    };
  }

  private closePanel(): void {
    this.inventoryPanel.open = false;
    this.openChest = null;
    const leftover = this.inventory.returnCursor();
    if (leftover) this.dropAtPlayer(leftover.item, leftover.count);
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
    if (this.builtThisHold.has(key) || !tryPlace(this.world, this.player, this.inventory, tx, ty)) return;
    this.builtThisHold.add(key);
    const placed = this.world.getTile(tx, ty);
    if (placed === Tile.Beam || placed === Tile.Crossbeam) markHintSeen(this.supportHintId(placed));
    sfx.place(tileDef(this.world.getTile(tx, ty)).material, this.pan(tx));
    if (isBed(this.world.getTile(tx, ty))) this.toasts.show(`${mainKey('interact')} the bed to respawn there`, 4);
  }

  /** Right-click on a bed in reach: it becomes the respawn point. Returns false if (tx, ty) isn't a bed in reach. */
  private useBed(tx: number, ty: number): boolean {
    const left = bedLeft(this.world, tx, ty);
    if (!left || !inReach(this.player, tx, ty)) return false;
    const [lx, ly] = left;
    const already = this.bed?.tx === lx && this.bed.ty === ly;
    this.bed = { tx: lx, ty: ly };
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
    this.toasts.show(difficulty === 'cozy' ? 'Cozy: nothing can hurt you now, and gravel stays put' : 'Normal: falls, falling gravel and the dark hurt now', 3);
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
    if (satchel) this.satchels.push(satchel);
    const hadBed = this.activeBed() !== null;
    const bedWasSet = this.bed !== null;
    const spot = findRespawn(world, this.bed);
    if (!hadBed) this.bed = null; // a destroyed bed is forgotten; a blocked one is kept for next time
    const lines = [deathCauseText(cause)];
    const kept = inventory.slots.some((s) => s && itemDef(s.item).pickaxeTier !== undefined);
    lines.push(kept ? 'You kept your hotbar and every pickaxe.' : 'You kept your hotbar.');
    if (satchel) {
      const dx = (satchel.x + SATCHEL_SIZE / 2 - (spot.x + PLAYER_WIDTH / 2)) / TILE_SIZE;
      const dy = (satchel.y + SATCHEL_SIZE / 2 - (spot.y + PLAYER_HEIGHT / 2)) / TILE_SIZE;
      const n = satchelItemCount(satchel);
      lines.push(`Your bag (${n} item${n === 1 ? '' : 's'}) is in a satchel ${offsetText(dx, dy)} from where you wake up.`);
      lines.push('It is marked on the map, and waits there until you collect it.');
    } else {
      lines.push('Your bag was empty, so nothing was left behind.');
    }
    if (spot.atBed) lines.push('You wake up in your bed.');
    else if (hadBed) lines.push('Your bed is blocked, so you wake up near the world spawn.');
    else if (bedWasSet) lines.push('Your bed is gone, so you wake up near the world spawn.');
    else lines.push('You have no bed, so you wake up near the world spawn. Craft one at a workbench.');
    player.placeAt(spot.x, spot.y);
    this.health.refill(player.stats.maxHealth, this.clock.time, RESPAWN_PROTECTION);
    this.dread.level = 0;
    this.leftAction = null;
    this.touchingSatchels.clear();
    this.deathScreen = { lines, shownAt: performance.now() };
    sfx.death();
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
   * Carried light: the held lantern is a moving light on the player's tile, and each burning
   * flare one on its own tile. The light map only relights one when it moves to another tile
   * or changes brightness.
   */
  private updateCarriedLight(): void {
    const { lightMap } = this;
    if (this.inventory.selectedStack?.item === 'lantern') {
      const [tx, ty] = this.playerTile();
      lightMap.setMovingLight('lantern', tx, ty, LANTERN_LIGHT);
    } else {
      lightMap.removeMovingLight('lantern');
    }
    const burning = new Set<number>();
    for (const flare of this.flareList) {
      burning.add(flare.id);
      lightMap.setMovingLight(`flare${flare.id}`, Math.floor(flare.x / TILE_SIZE), Math.floor(flare.y / TILE_SIZE), flareLevel(flare));
    }
    for (const id of this.flareLights) if (!burning.has(id)) lightMap.removeMovingLight(`flare${id}`);
    this.flareLights.clear();
    for (const id of burning) this.flareLights.add(id);
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

  /** A removed chest's contents, popped out of its tile. */
  private spill(tx: number, ty: number, entity: TileEntity): void {
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
  }

  /** Dig ticks every DIG_TICK_INTERVAL while `digging` (holding the mine button on a minable tile). */
  private digTick(dt: number, digging: boolean, tx: number, ty: number): void {
    if (!digging) {
      this.digTickIn = 0; // the first hit on a tile ticks straight away
      return;
    }
    this.digTickIn -= dt;
    if (this.digTickIn > 0) return;
    this.digTickIn += DIG_TICK_INTERVAL;
    sfx.dig(tileDef(this.world.getTile(tx, ty)).hardness, this.pan(tx));
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
      return;
    }
    // Empty tile: a faint outline where the selected block could be placed.
    const stack = this.inventory.selectedStack;
    const tile = stack ? itemDef(stack.item).placeTile : null;
    if (tile !== null && canPlace(world, this.player, tx, ty, tile)) {
      if (this.caveIns.isEnabled && isSupport(tile)) this.drawSupportPreview(tx, ty, tile, camX, camY);
      else renderer.drawTileOutline(tx, ty, 'rgba(255, 255, 255, 0.45)', camX, camY);
    } else if (tile === Tile.Beam && world.inBounds(tx, ty) && inReach(this.player, tx, ty) && !beamFooting(worldGetter(world), tx, ty)) {
      // A beam can't go here only because there's nothing under it: say so (the first few times).
      renderer.drawTileOutline(tx, ty, '#ff9628', camX, camY);
      this.drawSupportHint('placeBeam', 'Beams stand on solid ground or on another beam', tx, ty, '#ffc080', camX, camY);
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
      `Play time ${this.clock.time.toFixed(1)} s   World ${this.pausedBy ? `paused (${this.pausedBy})` : 'running'}`,
      `Player tile (${tx}, ${ty})   Light ${this.lightMap.level(tx, ty)} (established ${this.lightMap.established(tx, ty)}, safe from ${DREAD_SAFE_LIGHT})   ${this.safety}   dread ${Math.round(this.dread.level * 100)}%`,
      `Pickaxe: ${tier >= 0 ? PICKAXES[tier].name : 'none'} (tier ${tier})`,
      `${difficultyName(this.difficulty)}   HP ${this.health.hp}/${player.stats.maxHealth}   protected ${protectedFor.toFixed(1)} s   fall ${fall}   bed ${this.activeBed() ? `(${this.bed!.tx}, ${this.bed!.ty})` : 'none'}   satchels ${this.satchels.length}`,
      `Cave-ins ${this.caveIns.isEnabled ? 'on' : 'off (Cozy)'}   shaking ${this.caveIns.warnings.size}   falling ${this.caveIns.falling.length}   rechecks queued ${this.tileUpdates.size}`,
      ...overlayHelpLines(),
      ...debugLines,
    ]);
  }
}
