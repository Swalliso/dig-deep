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
