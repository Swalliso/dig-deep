import { MAP_CAVE_COLOR, MAP_SKY_COLOR } from '../config';
import type { ExploredMap } from '../world/explored';
import { Tile, TILE_COUNT, tileDef } from '../world/tiles';
import type { World } from '../world/world';

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Map colour per tile id (air is coloured by where it is; see paint). */
const TILE_RGB: RGB[] = Array.from({ length: TILE_COUNT }, (_, id) => (id === Tile.Air ? [0, 0, 0] : rgb(tileDef(id).color)));
const SKY = rgb(MAP_SKY_COLOR);
const CAVE = rgb(MAP_CAVE_COLOR);

/**
 * The map's picture: one pixel per tile, showing only tiles the player has seen (the rest stay
 * transparent). Painted once from the explored tiles, then kept up to date as tiles are seen
 * or change. Call flush() before drawing it, to copy the changed part onto the canvas.
 */
export class MapImage {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly world: World;
  private dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(world: World, explored: ExploredMap) {
    this.world = world;
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.width;
    this.canvas.height = world.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.image = ctx.createImageData(world.width, world.height);
    explored.forEachExplored((tx, ty) => this.paint(tx, ty));
    explored.onExplore = (tx, ty) => this.paint(tx, ty);
    world.onTileChange((tx, ty) => {
      if (explored.isExplored(tx, ty)) this.paint(tx, ty);
    });
  }

  /** Copy every pixel painted since the last flush onto the canvas. */
  flush(): void {
    const d = this.dirty;
    if (!d) return;
    this.dirty = null;
    this.ctx.putImageData(this.image, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
  }

  private paint(tx: number, ty: number): void {
    const tile = this.world.getTile(tx, ty);
    // Air above the ground's original surface is sky; below it, it's a cave or a dug-out space.
    const [r, g, b] = tile === Tile.Air ? (ty < this.world.surface[tx] ? SKY : CAVE) : TILE_RGB[tile];
    const i = (ty * this.world.width + tx) * 4;
    const data = this.image.data;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
    const d = this.dirty;
    if (!d) this.dirty = { x0: tx, y0: ty, x1: tx, y1: ty };
    else {
      d.x0 = Math.min(d.x0, tx);
      d.y0 = Math.min(d.y0, ty);
      d.x1 = Math.max(d.x1, tx);
      d.y1 = Math.max(d.y1, ty);
    }
  }
}
