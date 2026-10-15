import { BUILD_SHA, CHANNEL } from '../channel';
import { BAG_SIZE, HOTBAR_SIZE } from '../config';
import { canCraft, craft, missingIngredients, RECIPES, type Recipe, type Station } from '../systems/crafting';
import type { Inventory } from '../systems/inventory';
import { itemDef } from '../systems/items';
import { SAVE_VERSION, type SaveStatus } from '../systems/save';
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

  /** Left click at canvas pixel (mx, my) while the panel is open. Returns the recipe crafted, if any. */
  click(
    canvas: HTMLCanvasElement,
    scale: number,
    mx: number,
    my: number,
    shift: boolean,
    inventory: Inventory,
    stations: ReadonlySet<Station>,
  ): Recipe | null {
    const layout = computeLayout(canvas.width, canvas.height, scale);
    const slot = layout.slots.findIndex((r) => hit(r, mx, my));
    if (slot >= 0) {
      if (shift && !inventory.cursor) inventory.quickMove(slot);
      else inventory.clickSlot(slot);
      return null;
    }
    const recipe = RECIPES[layout.recipes.findIndex((r) => hit(r, mx, my))];
    return recipe && craft(inventory, recipe, stations) ? recipe : null;
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

// --- Title, controls and pause screens (HTML on top of the canvas) ---

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
}

export interface PauseOptions {
  onResume: () => void;
  /** Resolves once the save is written; rejects if it failed. */
  onSave: () => Promise<void>;
  onQuit: () => void;
}

const CONTROLS: [string, string][] = [
  ['Move', 'A / D or ← / →'],
  ['Jump', 'Space, W or ↑'],
  ['Mine', 'Hold left mouse'],
  ['Place block', 'Right mouse'],
  ['Select hotbar slot', '1–0 or mouse wheel'],
  ['Inventory / crafting', 'E or Tab'],
  ['Pause', 'Esc'],
  ['Debug overlay', 'F3'],
];

/** The HTML menus. Only one screen shows at a time; hide() clears it. */
export class Menus {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  hide(): void {
    this.root.className = '';
    this.root.replaceChildren();
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
    menu.append(label, seed, fresh, button('Controls', () => this.showControls(() => this.showTitle(options))));

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
    back.focus();
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
    menu.append(resume, save, button('Quit to title', options.onQuit));
    resume.focus();
  }

  private open(kind: 'title' | 'pause'): HTMLElement {
    const menu = el('div', '', 'menu');
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
  node.addEventListener('click', onClick);
  return node;
}

function timeAgo(time: number): string {
  const s = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
}
