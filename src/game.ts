import { HOTBAR_SIZE, PICKAXES, PLAYER_HEIGHT, PLAYER_WIDTH, SURFACE_LEVEL, TILE_SIZE } from './config';
import { brushNeighbours, DEBUG, DEBUG_KEYS, debugHelpLines, giveDebugKit, nextInstantMine, type InstantMine } from './debug';
import { ItemDrop, updateDrops } from './entities/itemDrop';
import { Player } from './entities/player';
import { consumeWheel, isDown, mouse, wasPressed } from './input';
import { Camera } from './render/camera';
import { Particles } from './render/particles';
import type { Renderer } from './render/renderer';
import { canPlace, tryPlace } from './systems/building';
import { nearbyStations } from './systems/crafting';
import { Inventory } from './systems/inventory';
import { itemDef, type ItemId } from './systems/items';
import { checkMine, Mining, type BrokenTile } from './systems/mining';
import { drawDebugInfo, drawDepthMeter, drawHotbar, drawToasts, Toasts } from './ui/hud';
import { InventoryPanel } from './ui/menus';
import { LightMap } from './world/lighting';
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

/** One play session in one world: everything that updates and draws while playing. */
export class Game {
  readonly world: World;
  readonly player: Player;
  readonly inventory: Inventory;
  readonly inventoryPanel = new InventoryPanel();
  readonly toasts = new Toasts();
  private readonly renderer: Renderer;
  private readonly camera = new Camera();
  private readonly mining = new Mining();
  private readonly particles = new Particles();
  private readonly lightMap: LightMap;
  private readonly worldHash: string;
  private dropList: ItemDrop[];
  private instantMine: InstantMine = 'off';
  private fullbright = false;
  /** F3 overlay: FPS, seed, position, controls. Starts open in debug mode. */
  private showOverlay = DEBUG;

  constructor(world: World, renderer: Renderer, start: GameStart = {}) {
    this.world = world;
    this.renderer = renderer;
    this.player = new Player(world.spawnTx, world.spawnTy);
    if (start.player) this.player.placeAt(start.player.x, start.player.y);
    this.inventory = start.inventory ?? Inventory.withStartingItems();
    this.dropList = start.drops ?? [];
    this.lightMap = new LightMap(world);
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

  /** Call after the renderer has resized. */
  resize(): void {
    this.camera.setView(this.renderer.viewWidth, this.renderer.viewHeight);
    this.clampCamera();
  }

  update(dt: number): void {
    const { world, player, inventory, inventoryPanel, mining, toasts } = this;

    // Hotbar selection: keys 1..9, 0 and the mouse wheel.
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (wasPressed(`Digit${(i + 1) % 10}`)) inventory.selected = i;
    }
    inventory.scrollSelection(consumeWheel());
    if (wasPressed('F3')) this.showOverlay = !this.showOverlay;

    if (DEBUG) {
      if (wasPressed(DEBUG_KEYS.give)) {
        giveDebugKit(inventory);
        toasts.show('Debug: materials added');
      }
      if (wasPressed(DEBUG_KEYS.fly)) player.setFlying(!player.flying, world);
      if (wasPressed(DEBUG_KEYS.instantMine)) this.instantMine = nextInstantMine(this.instantMine);
      if (wasPressed(DEBUG_KEYS.fullbright)) this.fullbright = !this.fullbright;
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
        if (leftover) this.dropAtPlayer(leftover.item, leftover.count);
      }
    }

    const [tx, ty] = this.cursorTile();
    if (inventoryPanel.open) {
      mining.update(dt, world, player, tx, ty, false, 0); // lets any hint fade out
      if (wasPressed('MouseLeft')) {
        const shift = anyDown('ShiftLeft', 'ShiftRight');
        const stations = nearbyStations(world, player.centerX, player.centerY);
        const crafted = inventoryPanel.click(this.renderer.canvas, this.renderer.scale, mouse.x, mouse.y, shift, inventory, stations);
        if (crafted) toasts.gained(crafted.output, crafted.count);
      }
    } else {
      const held = isDown('MouseLeft');
      const tier = inventory.bestPickaxeTier();
      const broken = mining.update(dt, world, player, tx, ty, held, tier, this.instantMine !== 'off');
      if (broken) this.onTileBroken(broken);
      if (held) {
        for (const [dx, dy] of brushNeighbours(this.instantMine)) {
          const extra = mining.breakInstantly(world, player, tx + dx, ty + dy, tier);
          if (extra) this.onTileBroken(extra);
        }
      }
      if (wasPressed('MouseRight')) tryPlace(world, player, inventory, tx, ty);
    }

    this.dropList = updateDrops(this.dropList, dt, world, player, inventory, (item, count) => toasts.gained(item, count));
    this.lightMap.update(); // relight around any tiles that changed this step
    this.particles.update(dt, world);
    toasts.update(dt);
    this.camera.follow(player.centerX, player.centerY, dt);
    this.clampCamera();
  }

  /** alpha (0..1) is how far we are between the last update step and the next one. */
  render(alpha: number, stats: FrameStats): void {
    const { renderer, player, camera, inventory } = this;
    const camX = Math.round(lerp(camera.prevX, camera.x, alpha));
    const camY = Math.round(lerp(camera.prevY, camera.y, alpha));
    const px = lerp(player.prevX, player.x, alpha);
    const py = lerp(player.prevY, player.y, alpha);

    renderer.drawWorld(this.world, camX, camY);
    for (const crack of this.mining.cracks(this.world)) renderer.drawCracks(crack.tx, crack.ty, crack.stage, camX, camY);
    renderer.drawDrops(this.drops, alpha, camX, camY);
    renderer.drawPlayer(player, px, py, camX, camY);
    renderer.drawParticles(this.particles, camX, camY);
    if (!this.fullbright) renderer.drawLight(this.lightMap, camX, camY, px + PLAYER_WIDTH / 2, py + PLAYER_HEIGHT / 2);
    if (!this.inventoryPanel.open) this.drawCursor(camX, camY);
    if (this.mining.hint) renderer.drawHint(this.mining.hint, camX, camY);
    if (this.inventoryPanel.open) {
      const stations = nearbyStations(this.world, player.centerX, player.centerY);
      this.inventoryPanel.draw(renderer.ctx, renderer.itemAtlas, renderer.scale, mouse.x, mouse.y, inventory, stations);
    } else {
      drawHotbar(renderer.ctx, renderer.itemAtlas, inventory, renderer.scale);
    }
    drawToasts(renderer.ctx, this.toasts, renderer.scale);
    // Depth is measured at the player's feet: standing on the surface level reads 0 m.
    drawDepthMeter(renderer.ctx, Math.floor((player.y + PLAYER_HEIGHT) / TILE_SIZE) - SURFACE_LEVEL, renderer.scale);
    if (this.showOverlay) this.drawOverlay(stats);
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
    this.shatter(tx, ty, tile);
    // Cutting a trunk brings down the rest of the tree above the cut.
    if (tile === Tile.Wood) {
      for (const felled of fellTreeAbove(this.world, tx, ty)) this.shatter(felled.tx, felled.ty, felled.tile);
    }
  }

  /** Particles and the item drop for a tile that just broke. */
  private shatter(tx: number, ty: number, tile: TileId): void {
    const def = tileDef(tile);
    this.particles.breakBurst(tx, ty, def.color);
    if (def.drop) this.dropList.push(new ItemDrop(def.drop, 1, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE));
  }

  private dropAtPlayer(item: ItemId, count: number): void {
    const drop = new ItemDrop(item, count, this.player.centerX, this.player.centerY);
    drop.vx = this.player.facing * 120;
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
    drawDebugInfo(this.renderer.ctx, [
      `FPS ${stats.fps}   frame ${stats.frameMs.toFixed(1)} ms   saved ${saved}`,
      `Seed ${this.world.seed}   World hash ${this.worldHash}`,
      `Player tile (${tx}, ${ty})   Light ${this.lightMap.level(tx, ty)}`,
      `Pickaxe: ${tier >= 0 ? PICKAXES[tier].name : 'none'} (tier ${tier})`,
      'A/D or ←/→: move   Space, W or ↑: jump',
      'Left mouse: mine   Right mouse: place   1–0 or wheel: select',
      'E or Tab: inventory + crafting (shift-click: hotbar ↔ bag)',
      'Esc: pause   F3: hide this overlay',
      ...debugLines,
    ]);
  }
}
