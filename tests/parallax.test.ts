import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_FILL_BELOW,
  BACKGROUND_SHADE,
  BACKGROUND_SHADE_DEPTH,
  BACKGROUND_STRIP_WIDTH,
  SURFACE_BACKGROUND,
  SURFACE_LEVEL,
  TILE_SIZE,
} from '../src/config';
import { depthShade, parallaxX, parallaxY, periodicSkyline } from '../src/render/parallax';
import { createRng } from '../src/util/rng';

const W = BACKGROUND_STRIP_WIDTH;

describe('parallax skylines', () => {
  it('stay inside their height range', () => {
    const skyline = periodicSkyline(createRng(1), W, 20, 70, false);
    expect(skyline).toHaveLength(W);
    expect(Math.min(...skyline)).toBe(20);
    expect(Math.max(...skyline)).toBe(70);
    expect(skyline.every(Number.isInteger)).toBe(true);
  });

  it('join up seamlessly where the strip repeats', () => {
    for (const ridged of [false, true]) {
      const skyline = periodicSkyline(createRng(7), W, 40, 150, ridged);
      // The step across the seam is no bigger than the steepest step inside the strip.
      const steps = skyline.slice(1).map((h, x) => Math.abs(h - skyline[x]));
      expect(Math.abs(skyline[0] - skyline[W - 1])).toBeLessThanOrEqual(Math.max(...steps));
    }
  });

  it('are the same for the same seed and differ between seeds', () => {
    const a = periodicSkyline(createRng(42), W, 0, 100, true);
    expect(periodicSkyline(createRng(42), W, 0, 100, true)).toEqual(a);
    expect(periodicSkyline(createRng(43), W, 0, 100, true)).not.toEqual(a);
  });
});

describe('parallax scrolling', () => {
  it('starts each strip within one strip width to the left of the view', () => {
    for (const camX of [0, 1, 500, 4000, 15999]) {
      for (const factor of [0.1, 0.45, 1]) {
        const x = parallaxX(camX, factor, W);
        expect(x).toBeLessThanOrEqual(0);
        expect(x).toBeGreaterThan(-W);
      }
    }
  });

  it('moves far layers slower than near ones, and factor 0 not at all', () => {
    expect(parallaxX(100, 0, W)).toBe(0);
    expect(parallaxX(100, 0.1, W)).toBeCloseTo(-10);
    expect(parallaxX(100, 0.5, W)).toBeCloseTo(-50);
    expect(parallaxX(W * 3 + 10, 1, W)).toBeCloseTo(-10); // wraps around
  });

  it('puts the horizon at the surface for a world-locked layer, and keeps it still at factor 0', () => {
    const viewH = 450;
    const surfacePx = SURFACE_LEVEL * TILE_SIZE;
    for (const camY of [0, surfacePx - viewH / 2, surfacePx + 2000]) {
      expect(parallaxY(camY, 1, 0, viewH)).toBeCloseTo(surfacePx - camY);
      expect(parallaxY(camY, 0, 30, viewH)).toBeCloseTo(viewH / 2 - 30);
    }
  });

  it('orders the surface set from far (slow) to near (fast)', () => {
    const factors = SURFACE_BACKGROUND.map((layer) => layer.factor);
    expect([...factors].sort((a, b) => a - b)).toEqual(factors);
    expect(factors.every((f) => f > 0 && f < 1)).toBe(true);
  });
});

describe('parallax shading', () => {
  it('darkens with depth below the ridge, up to BACKGROUND_SHADE', () => {
    expect(depthShade(0)).toBe(0);
    expect(depthShade(BACKGROUND_SHADE_DEPTH / 2)).toBeCloseTo(BACKGROUND_SHADE / 2);
    expect(depthShade(BACKGROUND_SHADE_DEPTH * 3)).toBe(BACKGROUND_SHADE);
  });

  it('reaches full shade inside the strip, so the plain fill below it shows no step', () => {
    expect(BACKGROUND_FILL_BELOW).toBeGreaterThanOrEqual(BACKGROUND_SHADE_DEPTH);
  });
});
