import { describe, expect, it } from 'vitest';
import { nextPickupStep, pickupSemitones } from '../src/audio/sfx';
import {
  BREAK_FLASH_ALPHA_MAX,
  PICKUP_RUN_STEPS,
  PICKUP_RUN_WINDOW,
  SHAKE_MAX,
  SPARKLE_DURATION,
  SPARKLE_PERIOD,
  TILE_SIZE,
} from '../src/config';
import { breakFlashAlpha, oreSparkle, ScreenShake } from '../src/render/juice';
import { TILES } from '../src/world/tiles';

describe('screen shake', () => {
  it('stays within SHAKE_MAX and dies down', () => {
    const shake = new ScreenShake();
    shake.hit(100);
    for (let i = 0; i < 30; i++) {
      shake.update(1 / 60);
      expect(Math.abs(shake.x)).toBeLessThanOrEqual(SHAKE_MAX);
      expect(Math.abs(shake.y)).toBeLessThanOrEqual(SHAKE_MAX);
    }
    shake.update(1); // long after
    expect([shake.x, shake.y]).toEqual([0, 0]);
  });
});

describe('break flash', () => {
  it('is stronger for harder tiles, up to a cap', () => {
    const dirt = breakFlashAlpha(0.3);
    const stone = breakFlashAlpha(0.8);
    expect(stone).toBeGreaterThan(dirt);
    expect(breakFlashAlpha(100)).toBe(BREAK_FLASH_ALPHA_MAX);
    expect(dirt).toBeGreaterThan(0);
  });
});

describe('ore sparkle', () => {
  it('is deterministic and stays inside the tile', () => {
    for (let t = 0; t < 30; t += 0.07) {
      const a = oreSparkle(12, 340, t);
      expect(oreSparkle(12, 340, t)).toEqual(a);
      if (a) {
        expect(a.x).toBeGreaterThanOrEqual(1);
        expect(a.x).toBeLessThanOrEqual(TILE_SIZE - 2);
        expect(a.y).toBeGreaterThanOrEqual(1);
        expect(a.y).toBeLessThanOrEqual(TILE_SIZE - 2);
        expect(a.strength).toBeGreaterThanOrEqual(0);
        expect(a.strength).toBeLessThanOrEqual(1);
      }
    }
  });

  it('glints about SPARKLE_DURATION out of every SPARKLE_PERIOD, at different moments per tile', () => {
    let lit = 0;
    let samples = 0;
    const glinted = new Set<number>();
    for (let tx = 0; tx < 40; tx++) {
      for (let i = 0; i < 300; i++) {
        const t = (i / 300) * SPARKLE_PERIOD;
        samples++;
        if (oreSparkle(tx, 200, t)) {
          lit++;
          glinted.add(tx);
        }
      }
    }
    expect(lit / samples).toBeCloseTo(SPARKLE_DURATION / SPARKLE_PERIOD, 2);
    expect(glinted.size).toBe(40); // every tile glints once per period
    const starts = new Set(Array.from({ length: 40 }, (_, tx) => {
      let t = 0;
      while (!oreSparkle(tx, 200, t) && t < SPARKLE_PERIOD) t += 0.01;
      return Math.round(t * 10);
    }));
    expect(starts.size).toBeGreaterThan(10); // not all at once
  });
});

describe('pickup run', () => {
  it('climbs while pickups come quickly, caps, and restarts after a pause', () => {
    let step = 0;
    const steps = [step];
    for (let i = 0; i < 15; i++) {
      step = nextPickupStep(step, PICKUP_RUN_WINDOW / 2);
      steps.push(step);
    }
    expect(steps.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(step).toBe(PICKUP_RUN_STEPS);
    expect(nextPickupStep(step, PICKUP_RUN_WINDOW + 0.01)).toBe(0);
  });

  it('follows a pentatonic scale, an octave every 5 steps', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(pickupSemitones)).toEqual([0, 2, 4, 7, 9, 12, 14]);
    expect(pickupSemitones(10)).toBe(24);
  });
});

describe('tile materials', () => {
  it('give every breakable tile a sound', () => {
    for (const def of TILES) {
      if (def.name === 'Air') expect(def.material).toBe('none');
      else expect(def.material).not.toBe('none');
    }
  });
});
