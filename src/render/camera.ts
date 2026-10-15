import { CAMERA_FOLLOW_RATE } from '../config';

export class Camera {
  /** Top-left corner of the view, in world pixels. */
  x = 0;
  y = 0;
  /** Position before the latest update, for render interpolation. */
  prevX = 0;
  prevY = 0;
  /** View size in world pixels. */
  viewWidth = 0;
  viewHeight = 0;

  /** Change the view size, keeping the same point at the centre. */
  setView(width: number, height: number): void {
    const cx = this.x + this.viewWidth / 2;
    const cy = this.y + this.viewHeight / 2;
    this.viewWidth = width;
    this.viewHeight = height;
    this.centerOn(cx, cy);
  }

  /** Jump straight to a point, with no smoothing. */
  centerOn(x: number, y: number): void {
    this.x = x - this.viewWidth / 2;
    this.y = y - this.viewHeight / 2;
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Ease the view centre toward a point; call once per update step. */
  follow(x: number, y: number, dt: number): void {
    this.prevX = this.x;
    this.prevY = this.y;
    const t = 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt);
    this.x += (x - this.viewWidth / 2 - this.x) * t;
    this.y += (y - this.viewHeight / 2 - this.y) * t;
  }

  /** Keep the view inside a world of the given pixel size. */
  clampTo(worldWidth: number, worldHeight: number): void {
    this.x = Math.min(Math.max(this.x, 0), Math.max(0, worldWidth - this.viewWidth));
    this.y = Math.min(Math.max(this.y, 0), Math.max(0, worldHeight - this.viewHeight));
  }
}
