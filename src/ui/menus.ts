import { BAG_SIZE, HOTBAR_SIZE } from '../config';
import { canCraft, craft, missingIngredients, RECIPES, type Recipe, type Station } from '../systems/crafting';
import type { Inventory } from '../systems/inventory';
import { itemDef } from '../systems/items';
import { drawSlot, drawStack, shadowText, SLOT, SLOT_GAP } from './hud';

// Inventory + crafting panel (opened with E or Tab). Sizes are in UI units; one unit is
// `u` screen pixels, normally the game's pixel scale, shrunk if the window is too small.

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  u: number;
  inventory: Rect;
  crafting: Rect;
  /** One per inventory slot; row 0 is the hotbar. */
  slots: Rect[];
  /** One per recipe, in RECIPES order. */
  recipes: Rect[];
}

const COLS = 10;
const ROWS = (HOTBAR_SIZE + BAG_SIZE) / COLS;
const PAD = 6;
const TITLE = 12;
const HOTBAR_GAP = 5; // extra space between the hotbar row and the bag
const RECIPE_W = 190;
const RECIPE_H = 19;
const PANEL_GAP = 8;

const STATION_NAMES: Record<Station, string> = { workbench: 'Workbench', furnace: 'Furnace' };
const GREY = '#8a8a8a';
const RED = '#ff6b6b';

function computeLayout(width: number, height: number, scale: number): Layout {
  const gridW = COLS * SLOT + (COLS - 1) * SLOT_GAP;
  const gridH = ROWS * SLOT + (ROWS - 1) * SLOT_GAP + HOTBAR_GAP;
  const invW = gridW + PAD * 2;
  const invH = TITLE + gridH + PAD * 2;
  const craftW = RECIPE_W + PAD * 2;
  const craftH = TITLE + RECIPES.length * RECIPE_H + PAD * 2;
  const totalW = invW + PANEL_GAP + craftW;
  const totalH = Math.max(invH, craftH);
  const u = Math.max(1, Math.min(scale, Math.floor(width / (totalW + 8)), Math.floor(height / (totalH + 40))));
  const x0 = Math.round((width - totalW * u) / 2);
  const y0 = Math.round((height - totalH * u) / 2);

  const slots: Rect[] = [];
  for (let i = 0; i < HOTBAR_SIZE + BAG_SIZE; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    slots.push({
      x: x0 + (PAD + col * (SLOT + SLOT_GAP)) * u,
      y: y0 + (PAD + TITLE + row * (SLOT + SLOT_GAP) + (row > 0 ? HOTBAR_GAP : 0)) * u,
      w: SLOT * u,
      h: SLOT * u,
    });
  }
  const craftX = x0 + (invW + PANEL_GAP) * u;
  const recipes = RECIPES.map((_, i) => ({
    x: craftX + PAD * u,
    y: y0 + (PAD + TITLE + i * RECIPE_H) * u,
    w: RECIPE_W * u,
    h: (RECIPE_H - 1) * u,
  }));
  return {
    u,
    inventory: { x: x0, y: y0, w: invW * u, h: invH * u },
    crafting: { x: craftX, y: y0, w: craftW * u, h: craftH * u },
    slots,
    recipes,
  };
}

const hit = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export class InventoryPanel {
  open = false;

  /** Left click at canvas pixel (mx, my) while the panel is open. */
  click(
    canvas: HTMLCanvasElement,
    scale: number,
    mx: number,
    my: number,
    shift: boolean,
    inventory: Inventory,
    stations: ReadonlySet<Station>,
  ): void {
    const layout = computeLayout(canvas.width, canvas.height, scale);
    const slot = layout.slots.findIndex((r) => hit(r, mx, my));
    if (slot >= 0) {
      if (shift && !inventory.cursor) inventory.quickMove(slot);
      else inventory.clickSlot(slot);
      return;
    }
    const recipe = layout.recipes.findIndex((r) => hit(r, mx, my));
    if (recipe >= 0) craft(inventory, RECIPES[recipe], stations);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    itemAtlas: HTMLCanvasElement,
    scale: number,
    mx: number,
    my: number,
    inventory: Inventory,
    stations: ReadonlySet<Station>,
  ): void {
    const layout = computeLayout(ctx.canvas.width, ctx.canvas.height, scale);
    const { u } = layout;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Inventory grid.
    drawPanel(ctx, layout.inventory, u);
    ctx.font = `${7 * u}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    shadowText(ctx, 'Inventory', layout.inventory.x + PAD * u, layout.inventory.y + 4 * u, '#fff', u);
    let hovered = -1;
    layout.slots.forEach((r, i) => {
      const over = hit(r, mx, my);
      if (over) hovered = i;
      const state = over ? 'hover' : i === inventory.selected ? 'selected' : 'normal';
      drawSlot(ctx, itemAtlas, inventory.slots[i], r.x, r.y, u, state);
    });

    // Recipe list.
    drawPanel(ctx, layout.crafting, u);
    ctx.font = `${7 * u}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    shadowText(ctx, 'Crafting', layout.crafting.x + PAD * u, layout.crafting.y + 4 * u, '#fff', u);
    const near = [...stations].map((s) => STATION_NAMES[s]).join(', ') || 'no stations';
    ctx.font = `${5 * u}px monospace`;
    ctx.textAlign = 'right';
    shadowText(ctx, `Near: ${near}`, layout.crafting.x + layout.crafting.w - PAD * u, layout.crafting.y + 6 * u, GREY, u);
    RECIPES.forEach((recipe, i) => drawRecipe(ctx, itemAtlas, layout.recipes[i], u, recipe, inventory, stations, hit(layout.recipes[i], mx, my)));

    // Name of the hovered item, then whatever the mouse is holding.
    const hoveredStack = hovered >= 0 ? inventory.slots[hovered] : null;
    if (hoveredStack && !inventory.cursor) {
      ctx.font = `${6 * u}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const text = itemDef(hoveredStack.item).name;
      const w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(10, 10, 16, 0.9)';
      ctx.fillRect(mx + 8 * u, my + 8 * u, w + 6 * u, 10 * u);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, mx + 11 * u, my + 10 * u);
    }
    if (inventory.cursor) drawStack(ctx, itemAtlas, inventory.cursor, mx - 8 * u, my - 8 * u, 16, u);
    ctx.restore();
  }
}

function drawPanel(ctx: CanvasRenderingContext2D, r: Rect, u: number): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(r.x - u, r.y - u, r.w + 2 * u, r.h + 2 * u);
  ctx.fillStyle = 'rgba(18, 18, 26, 0.92)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** One recipe row: bright if craftable; otherwise grey with what's missing in red. */
function drawRecipe(
  ctx: CanvasRenderingContext2D,
  itemAtlas: HTMLCanvasElement,
  r: Rect,
  u: number,
  recipe: Recipe,
  inventory: Inventory,
  stations: ReadonlySet<Station>,
  hovered: boolean,
): void {
  const ok = canCraft(inventory, recipe, stations);
  ctx.fillStyle = ok ? (hovered ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.1)') : 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = ok ? 1 : 0.55;
  drawStack(ctx, itemAtlas, { item: recipe.output, count: recipe.count }, r.x + u, r.y + u, 16, u);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `${6 * u}px monospace`;
  shadowText(ctx, itemDef(recipe.output).name, r.x + 20 * u, r.y + 2 * u, ok ? '#fff' : GREY, u);

  // Ingredients (and station), each piece coloured by whether it's satisfied.
  ctx.font = `${5 * u}px monospace`;
  const missing = new Set(missingIngredients(inventory, recipe).map((m) => m.item));
  const pieces: [string, string][] = [];
  recipe.ingredients.forEach(({ item, count }, i) => {
    if (i > 0) pieces.push([', ', GREY]);
    pieces.push([`${count} ${itemDef(item).name}`, missing.has(item) ? RED : ok ? '#d6d6d6' : GREY]);
  });
  if (recipe.station) {
    pieces.push(['  @ ', GREY]);
    pieces.push([STATION_NAMES[recipe.station], stations.has(recipe.station) ? (ok ? '#d6d6d6' : GREY) : RED]);
  }
  let x = r.x + 20 * u;
  for (const [text, color] of pieces) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, r.y + 10 * u);
    x += ctx.measureText(text).width;
  }
}
