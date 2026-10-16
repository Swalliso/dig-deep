import * as sfx from './audio/sfx';
import {
  CLIMB_STEP_DISTANCE,
  DIG_TICK_INTERVAL,
  DROP_THROW_SPEED,
  EXPLORE_INTERVAL,
  FOOTSTEP_DISTANCE,
  HOTBAR_SIZE,
  LAND_FULL_SPEED,
  LAND_MIN_SPEED,
  PICKAXES,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  REACH,
  SURFACE_LEVEL,
  TILE_SIZE,
} from './config';
import {
  brushNeighbours,
  DEBUG,
  DEBUG_KEYS,
  debugHelpLines,
  giveDebugKit,
  nextInstantMine,
  placeLadderShaft,
  placeOreSampler,
  type InstantMine,
} from './debug';
import { ItemDrop, updateDrops } from './entities/itemDrop';
import { Player } from './entities/player';
import { consumeWheel, isDown, mouse, wasPressed } from './input';
import { Camera } from './render/camera';
import { breakFlashAlpha, ScreenShake, type BreakFlash } from './render/juice';
import { MapImage } from './render/mapImage';
import { Particles } from './render/particles';
import type { Renderer } from './render/renderer';
import { canPlace, itemForTile, overlapsPlayer, tilesOnLine, tryPlace } from './systems/building';
import { chestAt, nearbyChests, quickStackAll, type Chest } from './systems/chests';
import { nearbyStations } from './systems/crafting';
import { Inventory } from './systems/inventory';
import { itemDef, type ItemId } from './systems/items';
import { checkMine, inReach, Mining, type BrokenTile } from './systems/mining';
import { saveSettings, type Settings } from './systems/settings';
import { drawDebugInfo, drawDepthMeter, drawFpsCounter, drawHotbar, drawToasts, Toasts } from './ui/hud';
import { drawMinimap, FullMap, type MapInput, type MapMarkers } from './ui/map';
import { InventoryPanel, type PanelState } from './ui/menus';
import { ExploredMap } from './world/explored';
import { doorBottom, doorPartner, isDoorOpen, toggleDoor } from './world/doors';
import { LightMap } from './world/lighting';
import { TileEntities, type TileEntity } from './world/tileEntities';
import { Tile, tileDef, type TileId } from './world/tiles';
import { fellTreeAbove } from './world/trees';
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
}

/** Numbers from the main loop shown on the F3 overlay. */
export interface FrameStats {
  fps: number;
  frameMs: number;
  /** Date.now() of the last successful save, or 0. */
  lastSavedAt: number;
}

const anyDown = (...codes: string[]): boolean => codes.some(isDown);
const anyPressed = (...codes: string[]): boolean => codes.some(wasPressed);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Player controls while the full map is open. */
const STAND_STILL = { move: 0, jumpPressed: false, jumpHeld: false, climb: 0 };

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
  /** Seconds of play (stops while paused); times the ore glints. */
  private time = 0;
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
  /** The chest shown next to the inventory (opened with right-click), if any. */
  private openChest: { tx: number; ty: number } | null = null;
  /**
   * Drag-building: true while a right-button hold that started on the world (not on a chest
   * or the panel) is going on. Each step places along the cursor's path since the last step.
   */
  private building = false;
  private lastBuildTile: [number, number] = [0, 0];
  /** Tiles placed during this hold (keys ty * width + tx), so a tile mined meanwhile isn't refilled. */
  private readonly builtThisHold = new Set<number>();

  constructor(world: World, renderer: Renderer, settings: Settings, start: GameStart = {}) {
    this.world = world;
    this.renderer = renderer;
    this.settings = settings;
    this.player = new Player(world.spawnTx, world.spawnTy);
    if (start.player) this.player.placeAt(start.player.x, start.player.y);
    this.inventory = start.inventory ?? Inventory.withStartingItems();
    this.dropList = start.drops ?? [];
    this.tileEntities = start.tileEntities ?? new TileEntities(world);
    // Whatever removes a chest (mining, or a debug patch over it) spills its contents.
    this.tileEntities.onRemove = (tx, ty, entity) => this.spill(tx, ty, entity);
    this.lightMap = new LightMap(world);
    this.explored = start.explored ?? new ExploredMap(world);
    this.mapImage = new MapImage(world, this.explored);
    this.worldHash = world.hash().toString(16).padStart(8, '0');
    this.camera.setView(renderer.viewWidth, renderer.viewHeight);
    this.camera.centerOn(this.player.centerX, this.player.centerY);
    this.clampCamera();
    this.toasts.show('Press F3 for controls and debug info', 6);
  }

  /** Items lying on the ground. */
  get drops(): readonly ItemDrop[] {
    return this.dropList;
  }

  /** Is Esc going to close something in the game (the panel or the map) rather than pause? */
  get capturesEscape(): boolean {
    return this.inventoryPanel.open || this.fullMap.open;
  }

  /** Call after the renderer has resized. */
  resize(): void {
    this.camera.setView(this.renderer.viewWidth, this.renderer.viewHeight);
    this.clampCamera();
  }

  update(dt: number): void {
    const { world, player, inventory, mining, toasts } = this;
    this.time += dt;
    this.flashes = this.flashes.filter((f) => !f.drawn);

    if (wasPressed('F3')) this.showOverlay = !this.showOverlay;
    // M opens the full map (closing the inventory panel); M or Esc closes it. While it's open the
    // player stands still, and the mouse wheel, dragging and the movement keys move the map.
    if (wasPressed('KeyM') || (this.fullMap.open && wasPressed('Escape'))) this.toggleMap();
    if (wasPressed('KeyN')) {
      this.settings.showMinimap = !this.settings.showMinimap;
      saveSettings(this.settings);
    }
    const mapOpen = this.fullMap.open;

    // Hotbar selection: keys 1..9, 0 and the mouse wheel.
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (wasPressed(`Digit${(i + 1) % 10}`)) inventory.selected = i;
    }
    if (!mapOpen) inventory.scrollSelection(consumeWheel());

    if (DEBUG) {
      if (wasPressed(DEBUG_KEYS.give)) {
        giveDebugKit(inventory);
        toasts.show('Debug: materials added');
      }
      if (wasPressed(DEBUG_KEYS.fly)) player.setFlying(!player.flying, world);
      if (wasPressed(DEBUG_KEYS.instantMine)) this.instantMine = nextInstantMine(this.instantMine);
      if (wasPressed(DEBUG_KEYS.fullbright)) this.fullbright = !this.fullbright;
      if (wasPressed(DEBUG_KEYS.ores)) {
        const [ox, oy] = this.cursorTile();
        placeOreSampler(world, ox, oy);
      }
      if (wasPressed(DEBUG_KEYS.ladderShaft) && !mapOpen) {
        const [lx, ly] = this.cursorTile();
        toasts.show(`Debug: ${placeLadderShaft(world, lx, ly)} m ladder shaft`);
      }
      if (wasPressed(DEBUG_KEYS.revealMap)) {
        this.explored.revealAll();
        toasts.show('Debug: whole map revealed');
      }
    }

    const right = anyDown('KeyD', 'ArrowRight');
    const left = anyDown('KeyA', 'ArrowLeft');
    player.update(dt, world, mapOpen ? STAND_STILL : {
      move: (right ? 1 : 0) - (left ? 1 : 0),
      jumpPressed: anyPressed('Space', 'KeyW', 'ArrowUp'),
      jumpHeld: anyDown('Space', 'KeyW', 'ArrowUp'),
      climb: (anyDown('KeyS', 'ArrowDown') ? 1 : 0) - (anyDown('KeyW', 'ArrowUp') ? 1 : 0),
      fast: anyDown('ShiftLeft', 'ShiftRight'),
    });
    this.playerFeedback();

    if (mapOpen) {
      this.fullMap.update(dt, this.mapInput(), this.renderer.canvas.width, this.renderer.canvas.height, this.renderer.scale, world.width, world.height);
      mining.update(dt, world, player, 0, 0, false, 0); // lets any hint fade out
      this.digTickIn = 0;
      this.building = false;
    } else {
      this.handlePlayInput(dt);
    }

    this.dropList = updateDrops(this.dropList, dt, world, player, inventory, (item, count) => {
      toasts.gained(item, count);
      sfx.pickup();
    });
    this.lightMap.update(); // relight around any tiles that changed this step
    this.exploreIn -= dt;
    if (this.exploreIn <= 0) {
      this.exploreIn = EXPLORE_INTERVAL;
      this.lookAround();
    }
    this.particles.update(dt, world);
    this.shake.update(dt);
    toasts.update(dt);
    this.camera.follow(player.centerX, player.centerY, dt);
    this.clampCamera();
  }

  /** Keys and mouse while playing (not while the full map is open): the panel, mining, building. */
  private handlePlayInput(dt: number): void {
    const { world, player, inventory, inventoryPanel, mining, toasts } = this;
    if (wasPressed('KeyQ')) this.throwSelected();
    if (wasPressed('KeyC')) this.quickStackNearby();

    // E / Tab toggles the inventory + crafting panel (Esc also closes it). It pauses mining
    // and building; the mouse works the panel instead.
    if (anyPressed('KeyE', 'Tab') || (inventoryPanel.open && wasPressed('Escape'))) {
      if (inventoryPanel.open) this.closePanel();
      else inventoryPanel.open = true;
    }
    // An open chest closes when it's broken or the player walks out of reach.
    const open = this.openChest;
    if (open && !(this.chestAt(open.tx, open.ty) && inReach(player, open.tx, open.ty))) this.openChest = null;

    const [tx, ty] = this.cursorTile();
    const { canvas, scale } = this.renderer;
    // Right-clicking a chest in reach opens it (unless the click is on the panel), and on a door
    // opens or closes it. Otherwise a right press on the world starts drag-building, which
    // lasts until the button is let go.
    if (wasPressed('MouseRight') && !inventoryPanel.covers(canvas, scale, mouse.x, mouse.y, this.panelState())) {
      if (this.chestAt(tx, ty) && inReach(player, tx, ty)) {
        this.openChest = { tx, ty };
        inventoryPanel.open = true;
        sfx.uiClick();
      } else if (!inventoryPanel.open && this.useDoor(tx, ty)) {
        // opened or closed it
      } else if (!inventoryPanel.open) {
        this.building = true;
        this.lastBuildTile = [tx, ty];
        this.builtThisHold.clear();
      }
    }

    if (inventoryPanel.open) {
      this.building = false;
      mining.update(dt, world, player, tx, ty, false, 0); // lets any hint fade out
      this.digTickIn = 0;
      if (wasPressed('MouseLeft')) {
        const shift = anyDown('ShiftLeft', 'ShiftRight');
        const click = inventoryPanel.click(canvas, scale, mouse.x, mouse.y, shift, this.panelState());
        if (click?.kind === 'crafted') {
          toasts.gained(click.recipe.output, click.recipe.count * click.batches);
          sfx.craft();
        } else if (click) {
          sfx.uiClick();
        }
      }
    } else {
      const held = isDown('MouseLeft');
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
      if (this.building) {
        const [lx, ly] = this.lastBuildTile;
        for (const [bx, by] of tilesOnLine(lx, ly, tx, ty)) this.buildAt(bx, by);
        this.lastBuildTile = [tx, ty];
        // Checked after placing, so a click shorter than one step still places once.
        if (!isDown('MouseRight')) this.building = false;
      }
      if (wasPressed('MouseMiddle')) this.pickBlock(tx, ty);
    }

  }

  /** alpha (0..1) is how far we are between the last update step and the next one. */
  render(alpha: number, stats: FrameStats): void {
    const { renderer, player, camera, inventory } = this;
    const shake = this.settings.screenShake ? this.shake : { x: 0, y: 0 };
    const camX = Math.round(lerp(camera.prevX, camera.x, alpha)) + shake.x;
    const camY = Math.round(lerp(camera.prevY, camera.y, alpha)) + shake.y;
    const px = lerp(player.prevX, player.x, alpha);
    const py = lerp(player.prevY, player.y, alpha);
    const glowX = px + PLAYER_WIDTH / 2;
    const glowY = py + PLAYER_HEIGHT / 2;

    renderer.drawWorld(this.world, camX, camY);
    for (const crack of this.mining.cracks(this.world)) renderer.drawCracks(crack.tx, crack.ty, crack.stage, camX, camY);
    renderer.drawDrops(this.drops, alpha, camX, camY);
    renderer.drawPlayer(player, px, py, camX, camY);
    renderer.drawParticles(this.particles, camX, camY);
    if (!this.fullbright) renderer.drawLight(this.lightMap, camX, camY, glowX, glowY);
    renderer.drawSparkles(this.world, this.fullbright ? null : this.lightMap, this.time, camX, camY, glowX, glowY);
    renderer.drawFlashes(this.flashes, camX, camY);
    if (!this.inventoryPanel.open) this.drawCursor(camX, camY);
    if (this.mining.hint) renderer.drawHint(this.mining.hint, camX, camY);
    if (this.inventoryPanel.open) {
      this.inventoryPanel.draw(renderer.ctx, renderer.itemAtlas, renderer.scale, mouse.x, mouse.y, this.panelState());
    } else {
      drawHotbar(renderer.ctx, renderer.itemAtlas, inventory, renderer.scale);
      if (this.settings.showMinimap && !this.fullMap.open) drawMinimap(renderer.ctx, this.mapImage, this.mapMarkers(glowX, glowY), renderer.scale);
    }
    drawToasts(renderer.ctx, this.toasts, renderer.scale);
    // Depth is measured at the player's feet: standing on the surface level reads 0 m.
    drawDepthMeter(renderer.ctx, Math.floor((player.y + PLAYER_HEIGHT) / TILE_SIZE) - SURFACE_LEVEL, renderer.scale);
    if (this.fullMap.open) this.fullMap.draw(renderer.ctx, this.mapImage, this.mapMarkers(glowX, glowY), renderer.scale);
    if (this.showOverlay) this.drawOverlay(stats);
    else if (this.settings.showFps) drawFpsCounter(renderer.ctx, stats.fps, renderer.scale);
  }

  /** Open the full map (closing the inventory panel), or close it. */
  private toggleMap(): void {
    if (this.fullMap.open) {
      this.fullMap.open = false;
      return;
    }
    if (this.inventoryPanel.open) this.closePanel();
    this.building = false;
    this.fullMap.show(this.player.centerX, this.player.centerY);
    sfx.uiClick();
  }

  /** This step's input for the open map. Uses up the mouse wheel. */
  private mapInput(): MapInput {
    return {
      wheel: consumeWheel(),
      mouseX: mouse.x,
      mouseY: mouse.y,
      dragging: isDown('MouseLeft'),
      panX: (anyDown('KeyD', 'ArrowRight') ? 1 : 0) - (anyDown('KeyA', 'ArrowLeft') ? 1 : 0),
      panY: (anyDown('KeyS', 'ArrowDown') ? 1 : 0) - (anyDown('KeyW', 'ArrowUp') ? 1 : 0),
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
    const partner = doorPartner(this.world, tx, ty, tile);
    if (partner) {
      this.world.setTile(partner[0], partner[1], Tile.Air);
      this.particles.breakBurst(partner[0], partner[1], tileDef(tile).color);
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
    const chests = nearbyChests(world, this.tileEntities, player.centerX, player.centerY);
    if (chest && !chests.includes(chest)) chests.push(chest);
    return { inventory: this.inventory, stations: nearbyStations(world, player.centerX, player.centerY), chests, chest };
  }

  private closePanel(): void {
    this.inventoryPanel.open = false;
    this.openChest = null;
    const leftover = this.inventory.returnCursor();
    if (leftover) this.dropAtPlayer(leftover.item, leftover.count);
  }

  /** Drag-building: place the selected block at (tx, ty) unless this hold already did. */
  private buildAt(tx: number, ty: number): void {
    const key = ty * this.world.width + tx;
    if (this.builtThisHold.has(key) || !tryPlace(this.world, this.player, this.inventory, tx, ty)) return;
    this.builtThisHold.add(key);
    sfx.place(tileDef(this.world.getTile(tx, ty)).material, this.pan(tx));
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
    const chests = nearbyChests(world, this.tileEntities, player.centerX, player.centerY);
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
    this.flashes.push({ tx, ty, alpha: breakFlashAlpha(def.hardness), drawn: false });
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
    return ((tx + 0.5) * TILE_SIZE - this.player.centerX) / (REACH * TILE_SIZE);
  }

  /** Throw items forward from the player. They stay there until the player walks away and comes back. */
  private dropAtPlayer(item: ItemId, count: number): void {
    const drop = new ItemDrop(item, count, this.player.centerX, this.player.centerY);
    drop.vx = this.player.facing * DROP_THROW_SPEED;
    drop.waitForPlayerToLeave = true;
    this.dropList.push(drop);
  }

  /** Outline the tile under the cursor: white if it can be mined, red if not. */
  private drawCursor(camX: number, camY: number): void {
    const [tx, ty] = this.cursorTile();
    const check = checkMine(this.world, this.player, tx, ty, this.inventory.bestPickaxeTier());
    if (check !== 'empty') {
      this.renderer.drawTileOutline(tx, ty, check === 'ok' ? '#ffffff' : '#ff4040', camX, camY);
      return;
    }
    // Empty tile: a faint outline where the selected block could be placed.
    const stack = this.inventory.selectedStack;
    const tile = stack ? itemDef(stack.item).placeTile : null;
    if (tile !== null && canPlace(this.world, this.player, tx, ty, tile)) {
      this.renderer.drawTileOutline(tx, ty, 'rgba(255, 255, 255, 0.45)', camX, camY);
    }
  }

  /** F3 debug overlay. */
  private drawOverlay(stats: FrameStats): void {
    const { player } = this;
    const tx = Math.floor(player.centerX / TILE_SIZE);
    const ty = Math.floor(player.centerY / TILE_SIZE);
    const tier = this.inventory.bestPickaxeTier();
    const saved = stats.lastSavedAt ? `${Math.round((Date.now() - stats.lastSavedAt) / 1000)} s ago` : 'not yet';
    const debugLines = DEBUG ? debugHelpLines(player.flying, this.instantMine, this.fullbright) : [];
    const percent = (volume: number): string => `${Math.round(volume * 100)}%`;
    drawDebugInfo(this.renderer.ctx, [
      `FPS ${stats.fps}   frame ${stats.frameMs.toFixed(1)} ms   saved ${saved}`,
      `Audio ${sfx.audioStatus()}   master ${percent(this.settings.masterVolume)}   SFX ${percent(this.settings.sfxVolume)}`,
      `Seed ${this.world.seed}   World hash ${this.worldHash}`,
      `Player tile (${tx}, ${ty})   Light ${this.lightMap.level(tx, ty)}`,
      `Pickaxe: ${tier >= 0 ? PICKAXES[tier].name : 'none'} (tier ${tier})`,
      'A/D or ←/→: move   Space, W or ↑: jump   W/S on a ladder: climb   S + Space: drop through',
      'Left mouse: mine   Right mouse: place (hold to sweep), open chest or door   Middle: pick block',
      '1–0 or wheel: select   Q: drop stack   C: quick stack to nearby chests',
      'E or Tab: inventory + crafting (shift-click: move stack, craft 10)',
      'M: map   N: minimap   Esc: pause   F3: hide this overlay',
      ...debugLines,
    ]);
  }
}
