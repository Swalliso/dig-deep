import { HOTBAR_SIZE, TILE_SIZE } from '../config';
import type { Inventory } from '../systems/inventory';
import { itemDef } from '../systems/items';

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

const SLOT = 20; // hotbar slot size in UI units (1 unit = 1 world px at the current pixel scale)
const GAP = 2;

/** Hotbar centred along the bottom: item icons, stack counts, selected slot highlighted. */
export function drawHotbar(ctx: CanvasRenderingContext2D, atlas: HTMLCanvasElement, inventory: Inventory, scale: number): void {
  const { width, height } = ctx.canvas;
  const u = scale;
  const total = (HOTBAR_SIZE * SLOT + (HOTBAR_SIZE - 1) * GAP) * u;
  const x0 = Math.round((width - total) / 2);
  const y0 = height - (SLOT + 6) * u;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const x = x0 + i * (SLOT + GAP) * u;
    const selected = i === inventory.selected;
    ctx.fillStyle = selected ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x - u, y0 - u, (SLOT + 2) * u, (SLOT + 2) * u);
    ctx.fillStyle = selected ? 'rgba(40, 40, 52, 0.9)' : 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x, y0, SLOT * u, SLOT * u);

    ctx.font = `${5 * u}px monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(String((i + 1) % 10), x + u, y0 + u);

    const stack = inventory.slots[i];
    if (!stack) continue;
    const icon = itemDef(stack.item).iconTile;
    ctx.drawImage(atlas, icon * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE, x + 2 * u, y0 + 2 * u, 16 * u, 16 * u);
    if (stack.count > 1) {
      ctx.font = `bold ${6 * u}px monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#000';
      ctx.fillText(String(stack.count), x + (SLOT - 1) * u + u / 2, y0 + SLOT * u + u / 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(stack.count), x + (SLOT - 1) * u, y0 + SLOT * u);
    }
  }

  // Name of the selected item above the bar.
  const selected = inventory.selectedStack;
  if (selected) {
    ctx.font = `${7 * u}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#000';
    ctx.fillText(itemDef(selected.item).name, width / 2 + u / 2, y0 - 3 * u + u / 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(itemDef(selected.item).name, width / 2, y0 - 3 * u);
  }
  ctx.restore();
}
