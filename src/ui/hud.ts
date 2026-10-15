import { HOTBAR_SIZE, TILE_SIZE } from '../config';
import type { Inventory, ItemStack } from '../systems/inventory';
import { itemDef, itemIndex } from '../systems/items';

/** Small text panel in the top-left corner, drawn in screen pixels. */
export function drawDebugInfo(ctx: CanvasRenderingContext2D, lines: string[]): void {
  const dpr = window.devicePixelRatio || 1;
  const size = Math.round(13 * dpr);
  const lineHeight = Math.round(17 * dpr);
  const pad = Math.round(6 * dpr);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${size}px monospace`;
  ctx.textBaseline = 'top';
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(pad, pad, width + pad * 2, lines.length * lineHeight + pad * 2);
  ctx.fillStyle = '#fff';
  lines.forEach((line, i) => ctx.fillText(line, pad * 2, pad * 2 + i * lineHeight));
  ctx.restore();
}

/** Text with a 1-unit drop shadow. Uses the current font, alignment and baseline. */
export function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, u: number): void {
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + u / 2, y + u / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * Item icon in a `size`-unit square at (x, y) in screen pixels, with its count in the bottom
 * right corner when more than one. `u` is screen pixels per UI unit.
 */
export function drawStack(
  ctx: CanvasRenderingContext2D,
  itemAtlas: HTMLCanvasElement,
  stack: ItemStack,
  x: number,
  y: number,
  size: number,
  u: number,
): void {
  ctx.imageSmoothingEnabled = false;
  const i = itemIndex(stack.item);
  ctx.drawImage(itemAtlas, i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, x, y, size * u, size * u);
  if (stack.count > 1) {
    ctx.font = `bold ${6 * u}px monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    shadowText(ctx, String(stack.count), x + (size + 1) * u, y + (size + 2) * u, '#fff', u);
  }
}

export const SLOT = 20; // inventory slot size in UI units (1 unit = 1 world px at the current pixel scale)
export const SLOT_GAP = 2;

/** One inventory slot frame (and its contents) with its top-left at (x, y) screen px. */
export function drawSlot(
  ctx: CanvasRenderingContext2D,
  itemAtlas: HTMLCanvasElement,
  stack: ItemStack | null,
  x: number,
  y: number,
  u: number,
  state: 'normal' | 'selected' | 'hover',
): void {
  ctx.fillStyle = state === 'selected' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(x - u, y - u, (SLOT + 2) * u, (SLOT + 2) * u);
  ctx.fillStyle = state === 'normal' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(40, 40, 52, 0.9)';
  ctx.fillRect(x, y, SLOT * u, SLOT * u);
  if (stack) drawStack(ctx, itemAtlas, stack, x + 2 * u, y + 2 * u, 16, u);
}

/** Hotbar centred along the bottom: item icons, stack counts, selected slot highlighted. */
export function drawHotbar(ctx: CanvasRenderingContext2D, itemAtlas: HTMLCanvasElement, inventory: Inventory, u: number): void {
  const { width, height } = ctx.canvas;
  const total = (HOTBAR_SIZE * SLOT + (HOTBAR_SIZE - 1) * SLOT_GAP) * u;
  const x0 = Math.round((width - total) / 2);
  const y0 = height - (SLOT + 6) * u;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const x = x0 + i * (SLOT + SLOT_GAP) * u;
    drawSlot(ctx, itemAtlas, inventory.slots[i], x, y0, u, i === inventory.selected ? 'selected' : 'normal');
    ctx.font = `${5 * u}px monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(String((i + 1) % 10), x + u, y0 + u);
  }

  // Name of the selected item above the bar.
  const selected = inventory.selectedStack;
  if (selected) {
    ctx.font = `${7 * u}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    shadowText(ctx, itemDef(selected.item).name, width / 2, y0 - 3 * u, '#fff', u);
  }
  ctx.restore();
}
