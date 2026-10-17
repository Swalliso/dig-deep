import * as sfx from '../audio/sfx';
import { BUILD_SHA, CHANNEL } from '../channel';
import { BAG_SIZE, CHEST_SLOTS, CRAFT_MANY, DEPOSIT_ALL_HOTBAR, HOTBAR_SIZE, PICKAXES } from '../config';
import { depositAll, lootAll, moveToChest, moveToInventory, quickStack, type Chest } from '../systems/chests';
import {
  availableCount,
  canCraft,
  craftTimes,
  missingIngredients,
  RECIPE_GROUPS,
  RECIPES,
  type Recipe,
  type RecipeGroup,
  type Station,
} from '../systems/crafting';
import { clickSlotIn, type Inventory, type ItemStack } from '../systems/inventory';
import { itemDef, type ItemId } from '../systems/items';
import { DIFFICULTIES, difficultyName, type Difficulty } from '../systems/health';
import { readBackup } from '../systems/backup';
import { SAVE_VERSION, type SaveData, type WorldMeta } from '../systems/save';
import type { PixelScale, Settings } from '../systems/settings';
import { tileDef } from '../world/tiles';
import { CONTROLS, keyList, mainKey } from './controls';
import { drawSlot, drawStack, shadowText, SLOT, SLOT_GAP } from './hud';

// Inventory + crafting panel (opened with E or Tab, or by right-clicking a chest). Sizes are in
// UI units; one unit is `u` screen pixels, normally the game's pixel scale, shrunk if the
// window is too small.
//
//   +-----------------------+  +------------------------------------+
//   | Inventory     [trash] |  | Crafting          [ ] Craftable only|
//   | hotbar                |  | Blocks                             |
//   | bag (3 rows)          |  |  recipe        recipe              |
//   +-----------------------+  | Tools ...                          |
//   +-----------------------+  |                                    |
//   | Chest  [Loot][Dep][QS]|  |                                    |
//   | 2 rows                |  | Near: Workbench, 1 chest           |
//   +-----------------------+  +------------------------------------+
//
// The chest panel only shows while a chest is open. Recipes sit in two columns, or one long
// column when that lets everything be drawn bigger (tall, narrow windows).

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ChestButton = 'loot' | 'deposit' | 'stack';

interface Layout {
  u: number;
  inventory: Rect;
  chest: Rect;
  crafting: Rect;
  /** One per inventory slot; row 0 is the hotbar. */
  slots: Rect[];
  trash: Rect;
  chestSlots: Rect[];
  buttons: { id: ChestButton; rect: Rect }[];
  filter: Rect;
  /** Headings of the recipe groups being shown, with the top-left of their text. */
  groups: { group: RecipeGroup; x: number; y: number }[];
  /** The recipes being shown (all of them, or only the craftable ones). */
  recipes: { recipe: Recipe; rect: Rect }[];
  /** Top of the "Near:" line at the bottom of the crafting panel. */
  footerY: number;
}

const COLS = 10;
const ROWS = (HOTBAR_SIZE + BAG_SIZE) / COLS;
const CHEST_ROWS = Math.ceil(CHEST_SLOTS / COLS);
const PAD = 6;
const TITLE = 12;
const INV_HEADER = SLOT + 2; // the inventory's title row holds the trash slot
const CHEST_HEADER = 14; // the chest's title row holds its buttons
const HOTBAR_GAP = 5; // extra space between the hotbar row and the bag
const BUTTON_H = 11;
const BUTTON_GAP = 3;
const FILTER_W = 52; // checkbox and its label
const RECIPE_W = 140;
const RECIPE_H = 19;
const RECIPE_GAP = 4; // between the two recipe columns
const GROUP_H = 9; // a group's heading above its recipes
const FOOTER = 9;
const PANEL_GAP = 8;
/** Monospace text at 5 units is about this many units per character (sizes the buttons). */
const CHAR_W = 3;

const STATION_NAMES: Record<Station, string> = { workbench: 'Workbench', furnace: 'Furnace' };
const GROUP_NAMES: Record<RecipeGroup, string> = { blocks: 'Blocks', tools: 'Tools', materials: 'Materials', stations: 'Stations' };
const BUTTONS: { id: ChestButton; label: string; tip: string[] }[] = [
  { id: 'loot', label: 'Loot all', tip: ['Take everything out of the chest.'] },
  {
    id: 'deposit',
    label: 'Deposit all',
    tip: [DEPOSIT_ALL_HOTBAR ? 'Put everything you carry in the chest.' : 'Put everything in your bag in the chest.', ...(DEPOSIT_ALL_HOTBAR ? [] : ['The hotbar stays with you.'])],
  },
  { id: 'stack', label: 'Quick stack', tip: ['Put in only the items this chest already holds.', `${keyList('quickStack')}: quick stack into every chest nearby.`] },
];
const CHEST_ACTIONS: Record<ChestButton, (inventory: Inventory, chest: Chest) => number> = {
  loot: (inventory, chest) => lootAll(chest, inventory),
  deposit: depositAll,
  stack: quickStack,
};
const WHITE = '#fff';
const LIGHT = '#d6d6d6';
const GREY = '#8a8a8a';
const RED = '#ff6b6b';

/** Height of a recipe list (headings plus rows) with `cols` recipes per row. */
function listHeight(recipes: readonly Recipe[], cols: number): number {
  let h = 0;
  for (const group of RECIPE_GROUPS) {
    const n = recipes.filter((r) => r.group === group).length;
    if (n > 0) h += GROUP_H + Math.ceil(n / cols) * RECIPE_H;
  }
  return h;
}

function computeLayout(width: number, height: number, scale: number, shown: readonly Recipe[]): Layout {
  const gridW = COLS * SLOT + (COLS - 1) * SLOT_GAP;
  const gridH = ROWS * SLOT + (ROWS - 1) * SLOT_GAP + HOTBAR_GAP;
  const chestGridH = CHEST_ROWS * SLOT + (CHEST_ROWS - 1) * SLOT_GAP;
  const leftW = gridW + PAD * 2;
  const invH = PAD * 2 + INV_HEADER + gridH;
  const chestH = PAD * 2 + CHEST_HEADER + chestGridH;
  const leftH = invH + PANEL_GAP + chestH;

  // Sized for the full recipe list, so filtering doesn't move anything.
  const fit = (cols: number) => {
    const craftW = PAD * 2 + cols * RECIPE_W + (cols - 1) * RECIPE_GAP;
    const craftH = PAD * 2 + TITLE + listHeight(RECIPES, cols) + FOOTER;
    const totalW = leftW + PANEL_GAP + craftW;
    const totalH = Math.max(leftH, craftH);
    const u = Math.max(1, Math.min(scale, Math.floor(width / (totalW + 8)), Math.floor(height / (totalH + 40))));
    return { cols, craftW, craftH, totalW, totalH, u };
  };
  const wide = fit(2);
  const tall = fit(1);
  const { cols, craftW, craftH, totalW, totalH, u } = tall.u > wide.u ? tall : wide;
  const x0 = Math.round((width - totalW * u) / 2);
  const y0 = Math.round((height - totalH * u) / 2);
  const at = (x: number, y: number, w: number, h: number): Rect => ({ x: x0 + x * u, y: y0 + y * u, w: w * u, h: h * u });

  const slots: Rect[] = [];
  for (let i = 0; i < HOTBAR_SIZE + BAG_SIZE; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    slots.push(at(PAD + col * (SLOT + SLOT_GAP), PAD + INV_HEADER + row * (SLOT + SLOT_GAP) + (row > 0 ? HOTBAR_GAP : 0), SLOT, SLOT));
  }

  const chestY = invH + PANEL_GAP;
  const chestSlots: Rect[] = [];
  for (let i = 0; i < CHEST_SLOTS; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    chestSlots.push(at(PAD + col * (SLOT + SLOT_GAP), chestY + PAD + CHEST_HEADER + row * (SLOT + SLOT_GAP), SLOT, SLOT));
  }
  const buttons: Layout['buttons'] = [];
  let bx = leftW - PAD;
  for (const button of [...BUTTONS].reverse()) {
    const w = button.label.length * CHAR_W + 6;
    bx -= w;
    buttons.unshift({ id: button.id, rect: at(bx, chestY + PAD - 1, w, BUTTON_H) });
    bx -= BUTTON_GAP;
  }

  const craftX = leftW + PANEL_GAP;
  const groups: Layout['groups'] = [];
  const recipes: Layout['recipes'] = [];
  let y = PAD + TITLE;
  for (const group of RECIPE_GROUPS) {
    const inGroup = shown.filter((r) => r.group === group);
    if (inGroup.length === 0) continue;
    groups.push({ group, x: x0 + (craftX + PAD) * u, y: y0 + (y + 2) * u });
    y += GROUP_H;
    inGroup.forEach((recipe, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      recipes.push({ recipe, rect: at(craftX + PAD + col * (RECIPE_W + RECIPE_GAP), y + row * RECIPE_H, RECIPE_W, RECIPE_H - 1) });
    });
    y += Math.ceil(inGroup.length / cols) * RECIPE_H;
  }

  return {
    u,
    inventory: at(0, 0, leftW, invH),
    chest: at(0, chestY, leftW, chestH),
    crafting: at(craftX, 0, craftW, craftH),
    slots,
    trash: at(leftW - PAD - SLOT, 4, SLOT, SLOT),
    chestSlots,
    buttons,
    filter: at(craftX + craftW - PAD - FILTER_W, 3, FILTER_W, 9),
    groups,
    recipes,
    footerY: y0 + (craftH - PAD - FOOTER + 3) * u,
  };
}

const hit = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** What the panel shows and works on. */
export interface PanelState {
  inventory: Inventory;
  /** Stations within the player's station range. */
  stations: ReadonlySet<Station>;
  /** Chests within the player's station range; crafting can use what's in them. */
  chests: readonly Chest[];
  /** The player's station range in tiles (for tooltips). */
  stationRange: number;
  /** The chest opened with right-click, if any. */
  chest: Chest | null;
}

/** What a left click in the panel did. */
export type PanelClick =
  | { kind: 'slot' }
  | { kind: 'crafted'; recipe: Recipe; batches: number }
  | { kind: 'cantCraft' }
  | { kind: 'button'; moved: number }
  | { kind: 'filter' };

export class InventoryPanel {
  open = false;
  /** "Craftable only": hide recipes that can't be made right now. */
  craftableOnly = false;

  /** Is canvas pixel (mx, my) over the panel? Clicks there don't reach the world. */
  covers(canvas: HTMLCanvasElement, scale: number, mx: number, my: number, state: PanelState): boolean {
    if (!this.open) return false;
    const layout = this.layout(canvas.width, canvas.height, scale, state);
    return hit(layout.inventory, mx, my) || hit(layout.crafting, mx, my) || (state.chest !== null && hit(layout.chest, mx, my));
  }

  /** Left click at canvas pixel (mx, my) while the panel is open. Null if it missed everything. */
  click(canvas: HTMLCanvasElement, scale: number, mx: number, my: number, shift: boolean, state: PanelState): PanelClick | null {
    const { inventory, chest } = state;
    const layout = this.layout(canvas.width, canvas.height, scale, state);
    const slot = layout.slots.findIndex((r) => hit(r, mx, my));
    if (slot >= 0) {
      // Shift-click moves the stack into the open chest, or between hotbar and bag.
      if (shift && !inventory.cursor) {
        if (chest) moveToChest(inventory, slot, chest);
        else inventory.quickMove(slot);
      } else {
        inventory.clickSlot(slot);
      }
      return { kind: 'slot' };
    }
    if (chest) {
      const chestSlot = layout.chestSlots.findIndex((r) => hit(r, mx, my));
      if (chestSlot >= 0) {
        if (shift && !inventory.cursor) moveToInventory(chest, chestSlot, inventory);
        else inventory.cursor = clickSlotIn(chest.slots, chestSlot, inventory.cursor);
        return { kind: 'slot' };
      }
      const button = layout.buttons.find((b) => hit(b.rect, mx, my));
      if (button) return { kind: 'button', moved: CHEST_ACTIONS[button.id](inventory, chest) };
    }
    if (hit(layout.trash, mx, my)) {
      inventory.clickTrash();
      return { kind: 'slot' };
    }
    if (hit(layout.filter, mx, my)) {
      this.craftableOnly = !this.craftableOnly;
      return { kind: 'filter' };
    }
    const row = layout.recipes.find((r) => hit(r.rect, mx, my));
    if (!row) return null;
    const batches = craftTimes(inventory, row.recipe, state.stations, state.chests, shift ? CRAFT_MANY : 1);
    return batches > 0 ? { kind: 'crafted', recipe: row.recipe, batches } : { kind: 'cantCraft' };
  }

  draw(ctx: CanvasRenderingContext2D, itemAtlas: HTMLCanvasElement, scale: number, mx: number, my: number, state: PanelState): void {
    const { inventory, chest } = state;
    const layout = this.layout(ctx.canvas.width, ctx.canvas.height, scale, state);
    const { u } = layout;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    /** Tooltip for whatever the mouse is over. Slot tooltips hide while a stack is held. */
    let tip: TipLine[] | null = null;
    const slotTip = (stack: ItemStack | null): void => {
      if (stack && !inventory.cursor) tip = itemTip(stack.item);
    };

    // Inventory grid and the trash slot.
    drawPanel(ctx, layout.inventory, u);
    panelTitle(ctx, 'Inventory', layout.inventory, u);
    layout.slots.forEach((r, i) => {
      const over = hit(r, mx, my);
      if (over) slotTip(inventory.slots[i]);
      drawSlot(ctx, itemAtlas, inventory.slots[i], r.x, r.y, u, over ? 'hover' : i === inventory.selected ? 'selected' : 'normal');
    });
    const overTrash = hit(layout.trash, mx, my);
    drawSlot(ctx, itemAtlas, inventory.trash, layout.trash.x, layout.trash.y, u, overTrash ? 'hover' : 'normal');
    if (!inventory.trash) drawTrashCan(ctx, layout.trash, u);
    if (overTrash) tip = trashTip(inventory.trash);

    if (chest) {
      drawPanel(ctx, layout.chest, u);
      panelTitle(ctx, 'Chest', layout.chest, u);
      layout.chestSlots.forEach((r, i) => {
        const over = hit(r, mx, my);
        if (over) slotTip(chest.slots[i]);
        drawSlot(ctx, itemAtlas, chest.slots[i], r.x, r.y, u, over ? 'hover' : 'normal');
      });
      for (const { id, rect } of layout.buttons) {
        const button = BUTTONS.find((b) => b.id === id)!;
        const over = hit(rect, mx, my);
        if (over) tip = [{ text: button.label, color: WHITE, big: true }, ...button.tip.map((text) => ({ text, color: LIGHT }))];
        drawButton(ctx, rect, button.label, over, u);
      }
    }

    // Recipes, grouped, with the filter toggle and what's nearby.
    drawPanel(ctx, layout.crafting, u);
    panelTitle(ctx, 'Crafting', layout.crafting, u);
    const overFilter = hit(layout.filter, mx, my);
    drawCheckbox(ctx, layout.filter, 'Craftable only', this.craftableOnly, overFilter, u);
    if (overFilter) tip = [{ text: 'Craftable only', color: WHITE, big: true }, { text: 'Show only what you can craft right now.', color: LIGHT }];
    ctx.font = `${5 * u}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const { group, x, y } of layout.groups) shadowText(ctx, GROUP_NAMES[group], x, y, GREY, u);
    if (layout.recipes.length === 0) {
      shadowText(ctx, 'Nothing you can craft here yet.', layout.crafting.x + PAD * u, layout.crafting.y + (PAD + TITLE + 2) * u, GREY, u);
    }
    for (const { recipe, rect } of layout.recipes) {
      const over = hit(rect, mx, my);
      if (over) tip = recipeTip(recipe, state);
      drawRecipe(ctx, itemAtlas, rect, u, recipe, state, over);
    }
    const near = [...[...state.stations].map((s) => STATION_NAMES[s])];
    if (state.chests.length > 0) near.push(`${state.chests.length} chest${state.chests.length > 1 ? 's' : ''}`);
    ctx.font = `${5 * u}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    shadowText(ctx, `Near: ${near.join(', ') || 'no stations or chests'}`, layout.crafting.x + PAD * u, layout.footerY, GREY, u);

    if (tip) drawTooltip(ctx, tip, mx, my, u);
    if (inventory.cursor) drawStack(ctx, itemAtlas, inventory.cursor, mx - 8 * u, my - 8 * u, 16, u);
    ctx.restore();
  }

  private layout(width: number, height: number, scale: number, state: PanelState): Layout {
    const shown = this.craftableOnly ? RECIPES.filter((r) => canCraft(state.inventory, r, state.stations, state.chests)) : RECIPES;
    return computeLayout(width, height, scale, shown);
  }
}

function drawPanel(ctx: CanvasRenderingContext2D, r: Rect, u: number): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(r.x - u, r.y - u, r.w + 2 * u, r.h + 2 * u);
  ctx.fillStyle = 'rgba(18, 18, 26, 0.92)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

function panelTitle(ctx: CanvasRenderingContext2D, text: string, r: Rect, u: number): void {
  ctx.font = `${7 * u}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  shadowText(ctx, text, r.x + PAD * u, r.y + 4 * u, WHITE, u);
}

function drawButton(ctx: CanvasRenderingContext2D, r: Rect, label: string, hovered: boolean, u: number): void {
  ctx.fillStyle = hovered ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.font = `${5 * u}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + u / 2, WHITE, u);
}

function drawCheckbox(ctx: CanvasRenderingContext2D, r: Rect, label: string, on: boolean, hovered: boolean, u: number): void {
  const box = 7 * u;
  const by = r.y + u;
  ctx.fillStyle = hovered ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(r.x, by, box, box);
  ctx.fillStyle = 'rgba(10, 10, 16, 0.95)';
  ctx.fillRect(r.x + u, by + u, box - 2 * u, box - 2 * u);
  if (on) {
    ctx.fillStyle = '#7ddc6a';
    ctx.fillRect(r.x + 2 * u, by + 2 * u, box - 4 * u, box - 4 * u);
  }
  ctx.font = `${5 * u}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  shadowText(ctx, label, r.x + box + 3 * u, by + u, hovered ? WHITE : LIGHT, u);
}

/** A small grey bin, drawn in the empty trash slot. */
function drawTrashCan(ctx: CanvasRenderingContext2D, r: Rect, u: number): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  const at = (x: number, y: number, w: number, h: number): void => ctx.fillRect(r.x + x * u, r.y + y * u, w * u, h * u);
  at(8, 4, 4, 1); // handle
  at(5, 5, 10, 2); // lid
  at(6, 8, 8, 8); // bin
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  at(8, 9, 1, 6);
  at(11, 9, 1, 6);
}

/** One recipe row: bright if craftable; otherwise grey with what's missing in red. */
function drawRecipe(
  ctx: CanvasRenderingContext2D,
  itemAtlas: HTMLCanvasElement,
  r: Rect,
  u: number,
  recipe: Recipe,
  state: PanelState,
  hovered: boolean,
): void {
  const { inventory, stations, chests } = state;
  const ok = canCraft(inventory, recipe, stations, chests);
  ctx.fillStyle = ok ? (hovered ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.1)') : hovered ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = ok ? 1 : 0.55;
  drawStack(ctx, itemAtlas, { item: recipe.output, count: recipe.count }, r.x + u, r.y + u, 16, u);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `${6 * u}px monospace`;
  shadowText(ctx, itemDef(recipe.output).name, r.x + 20 * u, r.y + 2 * u, ok ? WHITE : GREY, u);

  // Ingredients (and station), each piece coloured by whether it's satisfied.
  ctx.font = `${5 * u}px monospace`;
  const missing = new Set(missingIngredients(inventory, recipe, chests).map((m) => m.item));
  const pieces: [string, string][] = [];
  recipe.ingredients.forEach(({ item, count }, i) => {
    if (i > 0) pieces.push([', ', GREY]);
    pieces.push([`${count} ${itemDef(item).name}`, missing.has(item) ? RED : ok ? LIGHT : GREY]);
  });
  if (recipe.station) {
    pieces.push([' @ ', GREY]);
    pieces.push([STATION_NAMES[recipe.station], stations.has(recipe.station) ? (ok ? LIGHT : GREY) : RED]);
  }
  let x = r.x + 20 * u;
  for (const [text, color] of pieces) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, r.y + 10 * u);
    x += ctx.measureText(text).width;
  }
}

// --- Tooltips ---

interface TipLine {
  text: string;
  color: string;
  /** The heading: a bigger font. */
  big?: boolean;
}

/** "Places: Dirt (solid block)", or null if the item can't be placed. */
function placesLine(item: ItemId): TipLine | null {
  const tile = itemDef(item).placeTile;
  if (tile === null) return null;
  const def = tileDef(tile);
  return { text: `Places: ${def.name} (${def.solid ? 'solid block' : 'walk-through'})`, color: LIGHT };
}

/** An item's extra tooltip lines (how it works, its limits). */
function detailLines(item: ItemId): TipLine[] {
  return (itemDef(item).details ?? []).map((text) => ({ text, color: LIGHT }));
}

/** Name, what it does, what it places and where it's crafted. */
function itemTip(item: ItemId): TipLine[] {
  const def = itemDef(item);
  const lines: TipLine[] = [
    { text: def.name, color: WHITE, big: true },
    { text: def.description, color: LIGHT },
    ...detailLines(item),
  ];
  if (def.pickaxeTier !== undefined) lines.push({ text: `Mining speed ${PICKAXES[def.pickaxeTier].speed}x`, color: LIGHT });
  const places = placesLine(item);
  if (places) lines.push(places);
  const recipe = RECIPES.find((r) => r.output === item);
  if (recipe) lines.push({ text: recipe.station ? `Crafted at a ${STATION_NAMES[recipe.station]}` : 'Crafted by hand', color: GREY });
  return lines;
}

/** Like an item's tooltip, plus the station and each ingredient with how many you have. */
function recipeTip(recipe: Recipe, state: PanelState): TipLine[] {
  const { inventory, stations, chests } = state;
  const def = itemDef(recipe.output);
  const lines: TipLine[] = [
    { text: recipe.count > 1 ? `${def.name} x${recipe.count}` : def.name, color: WHITE, big: true },
    { text: def.description, color: LIGHT },
    ...detailLines(recipe.output),
  ];
  if (def.pickaxeTier !== undefined) lines.push({ text: `Mining speed ${PICKAXES[def.pickaxeTier].speed}x`, color: LIGHT });
  const places = placesLine(recipe.output);
  if (places) lines.push(places);
  if (recipe.station) {
    const near = stations.has(recipe.station);
    lines.push({ text: `Needs a ${STATION_NAMES[recipe.station]} within ${state.stationRange} tiles${near ? '' : ' (none near)'}`, color: near ? LIGHT : RED });
  } else {
    lines.push({ text: 'No station needed', color: LIGHT });
  }
  for (const { item, count } of recipe.ingredients) {
    const carried = inventory.count(item);
    const stored = availableCount(inventory, item, chests) - carried;
    const have = `have ${carried}${stored > 0 ? ` + ${stored} in chests` : ''}`;
    lines.push({ text: `${count} ${itemDef(item).name}: ${have}`, color: carried + stored >= count ? LIGHT : RED });
  }
  lines.push({ text: `Click: craft 1   ${mainKey('modifier')}-click: craft ${CRAFT_MANY}`, color: GREY });
  return lines;
}

function trashTip(trashed: ItemStack | null): TipLine[] {
  if (!trashed) {
    return [
      { text: 'Trash', color: WHITE, big: true },
      { text: 'Put a stack here to throw it away.', color: LIGHT },
      { text: 'You can take the last one back.', color: GREY },
    ];
  }
  return [
    { text: `Trash: ${itemDef(trashed.item).name}`, color: WHITE, big: true },
    { text: 'Click to take it back.', color: LIGHT },
    { text: 'The next stack you trash replaces it.', color: GREY },
  ];
}

/** A box of lines next to the mouse, kept on screen. */
function drawTooltip(ctx: CanvasRenderingContext2D, lines: TipLine[], mx: number, my: number, u: number): void {
  const font = (line: TipLine): string => `${(line.big ? 6 : 5) * u}px monospace`;
  const lineH = (line: TipLine): number => (line.big ? 9 : 7) * u;
  let w = 0;
  for (const line of lines) {
    ctx.font = font(line);
    w = Math.max(w, ctx.measureText(line.text).width);
  }
  const pad = 4 * u;
  const boxW = w + pad * 2;
  const boxH = lines.reduce((h, line) => h + lineH(line), 0) + pad * 2 - u;
  const { width, height } = ctx.canvas;
  let x = mx + 10 * u;
  let y = my + 10 * u;
  if (x + boxW > width) x = Math.max(0, mx - 6 * u - boxW);
  if (y + boxH > height) y = Math.max(0, height - boxH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(x - u, y - u, boxW + 2 * u, boxH + 2 * u);
  ctx.fillStyle = 'rgba(10, 10, 16, 0.95)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let ty = y + pad;
  for (const line of lines) {
    ctx.font = font(line);
    shadowText(ctx, line.text, x + pad, ty, line.color, u);
    ty += lineH(line);
  }
}

// --- Title, controls, settings and pause screens (HTML on top of the canvas) ---

/** What the Settings screen edits. */
export interface SettingsHooks {
  settings: Settings;
  /** Called after every change; `settings` has already been updated. */
  onChange: () => void;
}

export interface TitleOptions {
  /** Every saved world, most recently played first. */
  worlds: WorldMeta[];
  /** Pre-filled seed text for a new world (from `?seed=`), or ''. */
  seedText: string;
  /** A message to show under the title, e.g. that a world couldn't be loaded. */
  note?: string;
  onPlay: (world: WorldMeta) => void;
  /** Start a new world with this name, seed text ('' means a random seed) and difficulty. */
  onCreate: (name: string, seedText: string, difficulty: Difficulty) => void;
  /** Delete a world (the screen has already asked to confirm); resolves to the worlds left. */
  onDelete: (world: WorldMeta) => Promise<WorldMeta[]>;
  /** Debug mode only: an extra button that marks the most recent world as an older version. */
  onMarkOutdated?: (world: WorldMeta) => void;
  /** Download a world's backup file; rejects if its save can't be read. */
  onExport: (world: WorldMeta) => Promise<void>;
  /**
   * Store an imported save as a new world, or in place of `replace` (the screen has already
   * asked to confirm). Resolves to the name it was stored under and every world afterwards.
   */
  onImport: (save: SaveData, replace: WorldMeta | null) => Promise<{ name: string; worlds: WorldMeta[] }>;
  settings: SettingsHooks;
}

export interface PauseOptions {
  /** Why the game paused, shown under the heading (e.g. the window lost focus). */
  note?: string;
  onResume: () => void;
  /** Resolves once the save is written; rejects if it failed. */
  onSave: () => Promise<void>;
  /** Save, then go to the title. Rejects if the save failed; the game then stays open. */
  onQuit: () => Promise<void>;
  /** Go to the title without saving (offered after a failed Save & quit). */
  onQuitWithoutSaving: () => void;
  /** Download a backup of the world as it is right now (works even when saving doesn't). */
  onExport: () => void;
  /** The world's difficulty, which can be changed here without regenerating the world. */
  difficulty: { value: Difficulty; set: (difficulty: Difficulty) => void };
  settings: SettingsHooks;
  /** Debug mode only: a switch that makes every save fail. */
  failSaves?: { on: boolean; set: (on: boolean) => void };
}

/** A line under a screen's heading: news (good) or a problem. */
interface Notice {
  text: string;
  good: boolean;
}


/** The HTML menus. Only one screen shows at a time; hide() clears it. */
export class Menus {
  private readonly root: HTMLElement;
  /** Where Esc goes from the screen showing (Controls and Settings go back), if anywhere. */
  private onBack: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  hide(): void {
    this.onBack = null;
    this.root.className = '';
    this.root.replaceChildren();
  }

  /** Esc: go back a screen if the one showing has a Back button. Returns false if it doesn't. */
  back(): boolean {
    if (!this.onBack) return false;
    this.onBack();
    return true;
  }

  /** Title: Continue (the most recent world), Worlds, New world, Controls and Settings. */
  showTitle(options: TitleOptions): void {
    const { worlds } = options;
    const menu = this.open('title');
    menu.append(el('h1', 'DIG DEEP'), el('p', 'dig · collect · craft · build', 'sub'));
    if (CHANNEL === 'dev') menu.append(el('p', BUILD_SHA ? `DEV BUILD · ${BUILD_SHA}` : 'DEV BUILD', 'devtag'));

    const latest = worlds[0];
    const resume = button('Continue', () => latest && options.onPlay(latest));
    if (latest) resume.append(el('span', `${latest.name} · ${worldDetail(latest)}`, 'detail'));
    resume.disabled = !latest || latest.version !== SAVE_VERSION;
    menu.append(resume);
    if (options.note) menu.append(el('p', options.note, 'note'));

    const reopen = (): void => this.showTitle(options);
    const list = button(`Worlds (${worlds.length})`, () => this.showWorlds(options));
    const fresh = button('New world', () => this.showNewWorld(options));
    menu.append(
      list,
      fresh,
      button('Controls', () => this.showControls(reopen)),
      button('Settings', () => this.showSettings(options.settings, 'title', reopen)),
    );

    if (options.onMarkOutdated && latest && latest.version === SAVE_VERSION) {
      const mark = options.onMarkOutdated;
      menu.append(button(`Debug: mark "${latest.name}" as an older version`, () => mark(latest), 'small'));
    }
    (resume.disabled ? fresh : resume).focus();
  }

  /**
   * Every world: click one to play it. Export downloads a backup and Delete asks for a second
   * click. Import backup reads a backup file and asks how to add it.
   */
  showWorlds(options: TitleOptions, notice?: Notice): void {
    const menu = this.open('title');
    menu.classList.add('worlds');
    menu.append(el('h2', 'Worlds'));
    if (notice) menu.append(el('p', notice.text, notice.good ? 'note good' : 'note'));
    const list = el('div', '', 'world-list');
    if (options.worlds.length === 0) list.append(el('p', 'No worlds yet.', 'detail'));
    for (const world of options.worlds) {
      const row = el('div', '', 'world-row');
      const play = button(world.name, () => options.onPlay(world), 'play');
      play.append(el('span', worldDetail(world), 'detail'));
      play.disabled = world.version !== SAVE_VERSION;
      const exportButton = button('Export', () => {
        options.onExport(world).catch(() => (exportButton.textContent = 'Export failed'));
      }, 'small');
      exportButton.disabled = world.version !== SAVE_VERSION;
      exportButton.setAttribute('aria-label', `Export ${world.name}`);
      let confirming = false;
      const remove = button('Delete', () => {
        if (!confirming) {
          confirming = true;
          remove.textContent = 'Delete? Click again';
          remove.classList.add('danger');
          return;
        }
        remove.disabled = true;
        void options.onDelete(world).then((worlds) => {
          const next = { ...options, worlds, note: undefined };
          if (worlds.length > 0) this.showWorlds(next);
          else this.showTitle(next);
        });
      }, 'small');
      remove.setAttribute('aria-label', `Delete ${world.name}`);
      row.append(play, exportButton, remove);
      list.append(row);
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      if (!file) return;
      file.text().then(
        (text) => this.importBackup(text, options),
        () => this.showWorlds(options, { text: "Couldn't read that file.", good: false }),
      );
    });
    const importButton = button('Import backup…', () => picker.click());
    const back = button('Back', () => this.showTitle(options));
    menu.append(list, importButton, picker, back);
    this.onBack = () => this.showTitle(options);
    (list.querySelector('button:not(:disabled)') as HTMLButtonElement | null ?? importButton).focus();
  }

  /** A backup file's text: say why it can't be imported, or ask how to import it. */
  importBackup(text: string, options: TitleOptions): void {
    const read = readBackup(text);
    if (read.kind === 'ok') this.showImport(options, read.save);
    else this.showWorlds(options, { text: read.reason, good: false });
  }

  /**
   * How to import a backup: as a new world, or in place of a world with the same seed (most
   * likely the one it was exported from). Replacing asks for a second click.
   */
  private showImport(options: TitleOptions, save: SaveData): void {
    const menu = this.open('title');
    menu.classList.add('worlds');
    const name = save.name ?? 'Imported world';
    menu.append(el('h2', 'Import world'), el('p', `${name} · seed ${save.seed} · saved ${timeAgo(save.savedAt)}`, 'detail'));
    const buttons: HTMLButtonElement[] = [];
    const finish = (replace: WorldMeta | null): void => {
      for (const b of buttons) b.disabled = true;
      options.onImport(save, replace).then(
        (done) => this.showWorlds({ ...options, worlds: done.worlds }, { text: `Imported "${done.name}".`, good: true }),
        () => this.showWorlds(options, { text: "Couldn't import it: the browser wouldn't store it.", good: false }),
      );
    };
    const add = button('Add as a new world', () => finish(null));
    buttons.push(add);
    menu.append(add);
    const sameSeed = options.worlds.filter((w) => w.seed === save.seed);
    if (sameSeed.length > 0) menu.append(el('p', 'Or replace a world with the same seed. Its current save is lost.', 'detail'));
    for (const world of sameSeed) {
      let confirming = false;
      const replace = button(`Replace "${world.name}"`, () => {
        if (!confirming) {
          confirming = true;
          replace.textContent = `Replace "${world.name}"? Click again`;
          replace.classList.add('danger');
          return;
        }
        finish(world);
      });
      replace.append(el('span', worldDetail(world), 'detail'));
      buttons.push(replace);
      menu.append(replace);
    }
    const cancel = button('Cancel', () => this.showWorlds(options));
    buttons.push(cancel);
    menu.append(cancel);
    this.onBack = () => this.showWorlds(options);
    add.focus();
  }

  /** Name, seed and difficulty for a new world. */
  showNewWorld(options: TitleOptions): void {
    const menu = this.open('title');
    menu.append(el('h2', 'New world'));
    const name = textField('world-name', 'Name', `World ${options.worlds.length + 1}`, '');
    const seed = textField('seed', 'Seed (number or any text)', 'random', options.seedText);
    let difficulty: Difficulty = 'normal';
    const picker = difficultyPicker(difficulty, (d) => (difficulty = d));
    const create = button('Create world', () =>
      options.onCreate(name.input.value.trim() || name.input.placeholder, seed.input.value, difficulty),
    );
    for (const field of [name.input, seed.input]) {
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') create.click();
      });
    }
    menu.append(name.label, name.input, seed.label, seed.input, picker, create, button('Back', () => this.showTitle(options)));
    this.onBack = () => this.showTitle(options);
    name.input.focus();
  }

  showControls(onBack: () => void): void {
    const menu = this.open('title');
    menu.append(el('h2', 'Controls'));
    const table = document.createElement('table');
    for (const [action, keys] of CONTROLS) {
      const row = table.insertRow();
      row.insertCell().textContent = action;
      row.insertCell().textContent = keys;
    }
    const back = button('Back', onBack);
    menu.append(table, back);
    this.onBack = onBack;
    back.focus();
  }

  /** Volumes, screen shake, reduced flashes, pixel scale, the FPS counter and the minimap. Every change applies and saves at once. */
  showSettings(hooks: SettingsHooks, kind: 'title' | 'pause', onBack: () => void): void {
    const { settings, onChange } = hooks;
    const menu = this.open(kind);
    menu.classList.add('settings');
    const master = slider('set-master', 'Master volume', settings.masterVolume, (v) => {
      settings.masterVolume = v;
      onChange();
    });
    const effects = slider('set-sfx', 'Sound effects', settings.sfxVolume, (v) => {
      settings.sfxVolume = v;
      onChange();
    });
    const shake = toggle('set-shake', 'Screen shake', settings.screenShake, (on) => {
      settings.screenShake = on;
      onChange();
    });
    const flashes = toggle('set-flashes', 'Reduced flashes', settings.reducedFlashes, (on) => {
      settings.reducedFlashes = on;
      onChange();
    });
    const scales: [PixelScale, string][] = [
      ['auto', 'Auto'],
      [2, '2x'],
      [3, '3x'],
    ];
    const scale = choices('Pixel scale', scales, settings.pixelScale, (value) => {
      settings.pixelScale = value;
      onChange();
    });
    const fps = toggle('set-fps', 'FPS counter', settings.showFps, (on) => {
      settings.showFps = on;
      onChange();
    });
    const minimap = toggle('set-minimap', 'Minimap', settings.showMinimap, (on) => {
      settings.showMinimap = on;
      onChange();
    });
    menu.append(el('h2', 'Settings'), master.row, effects.row, shake, flashes, scale, fps, minimap, button('Back', onBack));
    this.onBack = onBack;
    master.input.focus();
  }

  showPause(options: PauseOptions): void {
    const menu = this.open('pause');
    menu.append(el('h2', 'Paused'));
    if (options.note) menu.append(el('p', options.note, 'detail'));
    const resume = button('Resume', options.onResume);
    const save = button('Save', () => {
      save.disabled = true;
      save.textContent = 'Saving…';
      options
        .onSave()
        .then(() => (save.textContent = 'Saved ✓'))
        .catch(() => (save.textContent = 'Save failed, try again'))
        .finally(() => (save.disabled = false));
    });
    const settings = button('Settings', () => this.showSettings(options.settings, 'pause', () => this.showPause(options)));
    // Save & quit only leaves once the save is written. If it fails the game stays open, and
    // the player can try again, export a backup, or quit without saving (two clicks).
    const problem = el('p', '', 'note');
    problem.hidden = true;
    let quitAnyway: HTMLButtonElement | null = null;
    const quit = button('Save & quit', () => {
      quit.disabled = true;
      quit.textContent = 'Saving…';
      options.onQuit().catch(() => {
        quit.disabled = false;
        quit.textContent = 'Save & quit (try again)';
        problem.textContent = "Couldn't save the world, so the game is still open. Try again, or export a backup first.";
        problem.hidden = false;
        if (quitAnyway) return;
        let confirming = false;
        const anyway = button('Quit without saving', () => {
          if (!confirming) {
            confirming = true;
            anyway.textContent = 'Quit without saving? Click again';
            anyway.classList.add('danger');
            return;
          }
          options.onQuitWithoutSaving();
        }, 'small');
        quitAnyway = anyway;
        menu.insertBefore(anyway, debugRow);
      });
    });
    const difficulty = options.difficulty;
    const picker = difficultyPicker(difficulty.value, (d) => {
      difficulty.value = d;
      difficulty.set(d);
    });
    menu.append(resume, save, button('Export backup', options.onExport), settings, picker, quit, problem);
    const fail = options.failSaves;
    const debugRow = fail ? toggle('set-fail-saves', 'Debug: saves fail', fail.on, (on) => fail.set(on)) : null;
    if (debugRow) menu.append(debugRow);
    resume.focus();
  }

  private open(kind: 'title' | 'pause'): HTMLElement {
    const menu = el('div', '', 'menu');
    this.onBack = null;
    this.root.className = `open ${kind}`;
    this.root.replaceChildren(menu);
    return menu;
  }
}

/** Offer `text` to the player as a file download. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text: string, onClick: () => void, className = ''): HTMLButtonElement {
  const node = el('button', text, className);
  node.type = 'button';
  node.addEventListener('click', () => {
    sfx.uiClick();
    onClick();
  });
  return node;
}

/** A labelled one-line text input. */
function textField(id: string, label: string, placeholder: string, value: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.id = id;
  input.placeholder = placeholder;
  input.value = value;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 40;
  const name = el('label', label);
  name.htmlFor = id;
  return { label: name, input };
}

/** One line of the Settings screen: a name on the left, its control on the right. */
function settingRow(label: string, control: HTMLElement, forId = ''): HTMLDivElement {
  const row = el('div', '', 'setting');
  const name = el('label', label);
  if (forId) name.htmlFor = forId;
  row.append(name, control);
  return row;
}

/** 0..100% slider for a 0..1 value. */
function slider(id: string, label: string, value: number, onInput: (value: number) => void): { row: HTMLDivElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.value = String(Math.round(value * 100));
  const shown = el('span', `${input.value}%`, 'value');
  input.addEventListener('input', () => {
    shown.textContent = `${input.value}%`;
    onInput(Number(input.value) / 100);
  });
  // A click at the new level when the slider is let go, so you can hear it.
  input.addEventListener('change', () => sfx.uiClick());
  const control = el('div', '', 'control');
  control.append(input, shown);
  return { row: settingRow(label, control, id), input };
}

function toggle(id: string, label: string, value: boolean, onToggle: (on: boolean) => void): HTMLDivElement {
  let on = value;
  const show = (): void => {
    node.textContent = on ? 'On' : 'Off';
    node.setAttribute('aria-pressed', String(on));
  };
  const node = button('', () => {
    on = !on;
    show();
    onToggle(on);
  });
  node.id = id;
  show();
  return settingRow(label, node, id);
}

/** A row of buttons where exactly one is picked. */
function choices<T>(label: string, options: [T, string][], value: T, onPick: (value: T) => void): HTMLDivElement {
  const group = el('div', '', 'choices');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const buttons = options.map(([option, text]) => {
    const node = button(text, () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === node));
      onPick(option);
    });
    node.setAttribute('aria-pressed', String(option === value));
    return node;
  });
  group.append(...buttons);
  return settingRow(label, group);
}

/** Normal / Cozy buttons with a line saying what the picked one means. */
function difficultyPicker(value: Difficulty, onPick: (difficulty: Difficulty) => void): HTMLDivElement {
  const box = el('div', '', 'difficulty');
  const about = el('p', '', 'detail');
  const describe = (d: Difficulty): void => {
    about.textContent = DIFFICULTIES.find((x) => x.id === d)?.description ?? '';
  };
  const row = choices(
    'World',
    DIFFICULTIES.map((d): [Difficulty, string] => [d.id, d.name]),
    value,
    (d) => {
      describe(d);
      onPick(d);
    },
  );
  describe(value);
  box.append(row, about);
  return box;
}

/** "seed 42 · saved 5 min ago", or why the world can't be loaded. */
function worldDetail(world: WorldMeta): string {
  if (world.version !== SAVE_VERSION) {
    if (world.version < 0) return "this save can't be read";
    return `saved by ${world.version < SAVE_VERSION ? 'an older' : 'a newer'} version, can't be loaded`;
  }
  const difficulty = world.difficulty ? `${difficultyName(world.difficulty)} · ` : '';
  return `${difficulty}seed ${world.seed} · saved ${timeAgo(world.savedAt)}`;
}

function timeAgo(time: number): string {
  const s = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
}
