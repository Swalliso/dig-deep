export class Camera {
  /** Top-left corner of the view, in world pixels. */
  x = 0;
  y = 0;
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

  centerOn(x: number, y: number): void {
    this.x = x - this.viewWidth / 2;
    this.y = y - this.viewHeight / 2;
  }

  get centerX(): number {
    return this.x + this.viewWidth / 2;
  }

  get centerY(): number {
    return this.y + this.viewHeight / 2;
  }

  /** Keep the view inside a world of the given pixel size. */
  clampTo(worldWidth: number, worldHeight: number): void {
    this.x = Math.min(Math.max(this.x, 0), Math.max(0, worldWidth - this.viewWidth));
    this.y = Math.min(Math.max(this.y, 0), Math.max(0, worldHeight - this.viewHeight));
  }
}
