import { describe, expect, it } from 'vitest';
import { DREAD_DRAIN_TIME, DREAD_HURT_INTERVAL, DREAD_RISE_TIME, DREAD_SAFE_LIGHT, LANTERN_LIGHT, REGEN_DELAY, REGEN_INTERVAL } from '../src/config';
import { Dread, dreadStatus, lightSafety, type LightSafety } from '../src/systems/dread';
import { Health } from '../src/systems/health';

const DT = 1 / 60;

/** Run `dread` for `seconds` from clock time `start`; returns the times it hurt. */
function run(dread: Dread, start: number, seconds: number, safety: LightSafety, enabled = true): number[] {
  const hits: number[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 1; i <= steps; i++) {
    const now = start + i * DT;
    if (dread.update(DT, now, safety, enabled)) hits.push(now);
  }
  return hits;
}

describe('light safety', () => {
  it('counts the lantern as light, but only the world’s own light as established', () => {
    expect(lightSafety(0, 0)).toBe('dark');
    expect(lightSafety(DREAD_SAFE_LIGHT - 1, DREAD_SAFE_LIGHT - 1)).toBe('dark');
    expect(lightSafety(LANTERN_LIGHT, 0)).toBe('carried');
    expect(lightSafety(LANTERN_LIGHT, DREAD_SAFE_LIGHT - 1)).toBe('carried');
    expect(lightSafety(DREAD_SAFE_LIGHT, DREAD_SAFE_LIGHT)).toBe('established');
    expect(lightSafety(LANTERN_LIGHT, DREAD_SAFE_LIGHT)).toBe('established');
  });
});

describe('dread', () => {
  it(`fills in ${DREAD_RISE_TIME} s of darkness, then hurts every ${DREAD_HURT_INTERVAL} s`, () => {
    const dread = new Dread();
    expect(run(dread, 0, DREAD_RISE_TIME - 0.5, 'dark')).toEqual([]);
    expect(dread.full).toBe(false);
    expect(run(dread, DREAD_RISE_TIME - 0.5, 0.5 + DREAD_HURT_INTERVAL - 0.1, 'dark')).toEqual([]);
    expect(dread.full).toBe(true);
    const hits = run(dread, DREAD_RISE_TIME + DREAD_HURT_INTERVAL - 0.1, 3 * DREAD_HURT_INTERVAL, 'dark');
    expect(hits).toHaveLength(3);
    expect(hits[1] - hits[0]).toBeCloseTo(DREAD_HURT_INTERVAL, 1);
  });

  it(`drains in ${DREAD_DRAIN_TIME} s of any light, lantern included, and stops hurting at once`, () => {
    for (const safety of ['carried', 'established'] as const) {
      const dread = new Dread();
      dread.level = 1;
      expect(run(dread, 0, DREAD_DRAIN_TIME / 2, safety)).toEqual([]);
      expect(dread.level).toBeCloseTo(0.5, 2);
      run(dread, DREAD_DRAIN_TIME / 2, DREAD_DRAIN_TIME / 2 + 0.1, safety);
      expect(dread.level).toBe(0);
    }
  });

  it('never builds up in a Cozy world', () => {
    const dread = new Dread();
    expect(run(dread, 0, DREAD_RISE_TIME * 3, 'dark', false)).toEqual([]);
    expect(dread.level).toBe(0);
  });

  it('says how things stand and why', () => {
    expect(dreadStatus('dark', 0.3, false)?.tone).toBe('warning');
    expect(dreadStatus('dark', 1, false)?.tone).toBe('danger');
    expect(dreadStatus('carried', 0, true)?.text).toContain('only torchlight heals');
    expect(dreadStatus('carried', 0, false, 'Flare')?.text).toBe('Flare light keeps dread away');
    expect(dreadStatus('established', 0.5, false)?.text).toContain('fading');
    expect(dreadStatus('established', 0, false)).toBeNull();
  });
});

describe('healing needs established light', () => {
  it('holds regeneration back out of established light and resumes it in light', () => {
    const health = new Health(10);
    health.hurt(4, 0, 'normal');
    // Long past the regen delay, but in the dark (or only lantern light): nothing comes back.
    for (let t = 0; t <= REGEN_DELAY + 20; t += DT) health.update(t, 10, false);
    expect(health.hp).toBe(6);
    // Back in the light, no burst of saved-up HP: the first one comes REGEN_INTERVAL later.
    const back = REGEN_DELAY + 20;
    health.update(back + 0.1, 10, true);
    expect(health.hp).toBe(6);
    health.update(back + REGEN_INTERVAL, 10, true);
    expect(health.hp).toBe(7);
  });
});

describe('saved dread', () => {
  it('comes back as it was, and as none when missing or unreadable', () => {
    const dread = new Dread();
    dread.level = 0.42;
    dread.hurtAt = 123;
    const loaded = Dread.fromSave(structuredClone(dread.saved()));
    expect(loaded.level).toBeCloseTo(0.42, 10);
    expect(loaded.hurtAt).toBe(123);
    expect(Dread.fromSave(undefined).level).toBe(0);
    expect(Dread.fromSave({ percent: 'x' }).level).toBe(0);
    expect(Dread.fromSave({ percent: 250 }).level).toBe(1);
  });
});
