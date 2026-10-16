import * as sfx from '../audio/sfx';
import { BUILD_SHA, CHANNEL } from '../channel';
import { BAG_SIZE, CHEST_SLOTS, CRAFT_MANY, DEPOSIT_ALL_HOTBAR, HOTBAR_SIZE, PICKAXES, STATION_RANGE } from '../config';
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
import { SAVE_VERSION, type SaveStatus } from '../systems/save';
import type { PixelScale, Settings } from '../systems/settings';
import { tileDef } from '../world/tiles';
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
  { id: 'stack', label: 'Quick stack', tip: ['Put in only the items this chest already holds.', 'C: quick stack into every chest nearby.'] },
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
  /** Stations within STATION_RANGE. */
  stations: ReadonlySet<Station>;
  /** Chests within STATION_RANGE; crafting can use what's in them. */
  chests: readonly Chest[];
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

/** Name, what it does, what it places and where it's crafted. */
function itemTip(item: ItemId): TipLine[] {
  const def = itemDef(item);
  const lines: TipLine[] = [
    { text: def.name, color: WHITE, big: true },
    { text: def.description, color: LIGHT },
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
  ];
  if (def.pickaxeTier !== undefined) lines.push({ text: `Mining speed ${PICKAXES[def.pickaxeTier].speed}x`, color: LIGHT });
  const places = placesLine(recipe.output);
  if (places) lines.push(places);
  if (recipe.station) {
    const near = stations.has(recipe.station);
    lines.push({ text: `Needs a ${STATION_NAMES[recipe.station]} within ${STATION_RANGE} tiles${near ? '' : ' (none near)'}`, color: near ? LIGHT : RED });
  } else {
    lines.push({ text: 'No station needed', color: LIGHT });
  }
  for (const { item, count } of recipe.ingredients) {
    const carried = inventory.count(item);
    const stored = availableCount(inventory, item, chests) - carried;
    const have = `have ${carried}${stored > 0 ? ` + ${stored} in chests` : ''}`;
    lines.push({ text: `${count} ${itemDef(item).name}: ${have}`, color: carried + stored >= count ? LIGHT : RED });
  }
  lines.push({ text: `Click: craft 1   Shift-click: craft ${CRAFT_MANY}`, color: GREY });
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
  /** What's in the save slot. */
  save: SaveStatus;
  /** Pre-filled seed text (from `?seed=`), or ''. */
  seedText: string;
  onContinue: () => void;
  /** Start a new world from the seed field's text ('' means random). */
  onNewWorld: (seedText: string) => void;
  /** Debug mode only: shown as an extra button when there's a save. */
  onMarkOutdated?: () => void;
  settings: SettingsHooks;
}

export interface PauseOptions {
  onResume: () => void;
  /** Resolves once the save is written; rejects if it failed. */
  onSave: () => Promise<void>;
  onQuit: () => void;
  settings: SettingsHooks;
}

const CONTROLS: [string, string][] = [
  ['Move', 'A / D or ← / →'],
  ['Jump', 'Space, W or ↑'],
  ['Mine', 'Hold left mouse'],
  ['Place block', 'Right mouse (hold and sweep to build)'],
  ['Pick block onto hotbar', 'Middle mouse'],
  ['Open chest', 'Right-click it'],
  ['Select hotbar slot', '1–0 or mouse wheel'],
  ['Drop selected stack', 'Q'],
  ['Quick stack to nearby chests', 'C'],
  ['Inventory / crafting', 'E or Tab'],
  ['Move stack (hotbar ↔ bag ↔ chest)', 'Shift-click'],
  ['Craft 10', 'Shift-click a recipe'],
  ['Pause', 'Esc'],
  ['Debug overlay', 'F3'],
];

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

  showTitle(options: TitleOptions): void {
    const { save } = options;
    const menu = this.open('title');
    menu.append(el('h1', 'DIG DEEP'), el('p', 'dig · collect · craft · build', 'sub'));
    if (CHANNEL === 'dev') menu.append(el('p', BUILD_SHA ? `DEV BUILD · ${BUILD_SHA}` : 'DEV BUILD', 'devtag'));

    const resume = button('Continue', options.onContinue);
    if (save.kind === 'ok') {
      resume.append(el('span', `seed ${save.save.seed} · saved ${timeAgo(save.save.savedAt)}`, 'detail'));
    } else {
      resume.disabled = true;
    }
    menu.append(resume);
    if (save.kind === 'outdated') {
      const which = save.version < SAVE_VERSION ? 'an older' : 'a newer';
      menu.append(el('p', `Save from ${which} version. Start a new world to keep playing.`, 'note'));
    } else if (save.kind === 'broken') {
      menu.append(el('p', "Your save couldn't be read. Start a new world to keep playing.", 'note'));
    }

    const seed = document.createElement('input');
    seed.id = 'seed';
    seed.placeholder = 'random';
    seed.value = options.seedText;
    seed.autocomplete = 'off';
    seed.spellcheck = false;
    const label = el('label', 'World seed (number or any text)');
    label.htmlFor = 'seed';

    // Starting over replaces the only save slot, so a working save needs a second click.
    let confirming = false;
    const fresh = button('New world', () => {
      if (save.kind === 'ok' && !confirming) {
        confirming = true;
        fresh.textContent = 'Replace your saved world? Click again';
        fresh.classList.add('danger');
        return;
      }
      options.onNewWorld(seed.value);
    });
    seed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') fresh.click();
    });
    const reopen = (): void => this.showTitle(options);
    menu.append(
      label,
      seed,
      fresh,
      button('Controls', () => this.showControls(reopen)),
      button('Settings', () => this.showSettings(options.settings, 'title', reopen)),
    );

    if (options.onMarkOutdated && save.kind === 'ok') {
      menu.append(button('Debug: mark save as an older version', options.onMarkOutdated, 'small'));
    }
    (save.kind === 'ok' ? resume : fresh).focus();
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

  /** Volumes, screen shake, pixel scale and the FPS counter. Every change applies and saves at once. */
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
    menu.append(el('h2', 'Settings'), master.row, effects.row, shake, scale, fps, button('Back', onBack));
    this.onBack = onBack;
    master.input.focus();
  }

  showPause(options: PauseOptions): void {
    const menu = this.open('pause');
    menu.append(el('h2', 'Paused'));
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
    menu.append(resume, save, settings, button('Quit to title', options.onQuit));
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

function timeAgo(time: number): string {
  const s = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
}
