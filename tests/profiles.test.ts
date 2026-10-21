import { beforeAll, describe, expect, it } from 'vitest';
import { GRAVEL_POCKETS, SURFACE_LEVEL } from '../src/config';
import { Player } from '../src/entities/player';
import { readBackup, backupText } from '../src/systems/backup';
import { Inventory } from '../src/systems/inventory';
import { checkSave, createSave, restoreProfile, SAVE_VERSION } from '../src/systems/save';
import { CLASSIC_PROFILE, findProfile, generateWorld, GRAVEL_PROFILE, STRATA_PROFILE, STRATA_V2_PROFILE } from '../src/world/generate';
import { columnHeld, isLoose, worldGetter } from '../src/world/supports';
import { ORE_TILES, Tile } from '../src/world/tiles';
import type { World } from '../src/world/world';

// World hashes of classic generation, recorded before Phase 12 added generation profiles. Classic
// is frozen: existing worlds regenerate their unchanged chunks from it, so these must never change.
const CLASSIC_HASHES: [number, string][] = [
  [1, 'b7a6a303'],
  [42, '5be2c012'],
  [987654321, '53dd316e'],
];

describe('the classic profile', () => {
  it.each(CLASSIC_HASHES)('still generates seed %i exactly as before Phase 12', (seed, hash) => {
    const world = generateWorld(seed, CLASSIC_PROFILE);
    expect(world.hash().toString(16).padStart(8, '0')).toBe(hash);
    expect(world.profile).toEqual({ name: 'classic', version: 1 });
  });

  it('has no gravel', () => {
    const world = generateWorld(42, CLASSIC_PROFILE);
    for (const chunk of world.chunks) expect(chunk.includes(Tile.Gravel)).toBe(false);
  });
});

// World hashes of the gravel profile, recorded before Phase 14a added strata. It's frozen too.
const GRAVEL_HASHES: [number, string][] = [
  [1, '0524fabb'],
  [42, '8109e4f0'],
  [987654321, 'd87f091e'],
];

describe('the gravel profile', () => {
  let classic: World;
  let world: World;
  beforeAll(() => {
    classic = generateWorld(42, CLASSIC_PROFILE);
    world = generateWorld(42, GRAVEL_PROFILE);
  });

  it.each(GRAVEL_HASHES)('still generates seed %i exactly as before Phase 14a', (seed, hash) => {
    const gravel = generateWorld(seed, GRAVEL_PROFILE);
    expect(gravel.hash().toString(16).padStart(8, '0')).toBe(hash);
    expect(gravel.profile).toEqual({ name: 'gravel', version: 1 });
    expect(gravel.strataTops).toEqual([]);
  });

  it('is deterministic', () => {
    expect(generateWorld(42, GRAVEL_PROFILE).hash()).toBe(world.hash());
  });

  it('is classic with gravel pockets (and ore in some) in place of stone, below the minimum depth', () => {
    let gravel = 0;
    let richOre = 0;
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) {
        const was = classic.getTile(tx, ty);
        const now = world.getTile(tx, ty);
        if (was === now) continue;
        expect(was).toBe(Tile.Stone);
        expect(ty - SURFACE_LEVEL).toBeGreaterThanOrEqual(GRAVEL_POCKETS.minDepth);
        if (now === Tile.Gravel) gravel++;
        else if ((ORE_TILES as readonly number[]).includes(now)) richOre++;
        else throw new Error(`unexpected tile ${now} at (${tx}, ${ty})`);
      }
    }
    expect(gravel).toBeGreaterThan(2000);
    expect(richOre).toBeGreaterThan(30);
    expect(world.spawnTy).toBe(classic.spawnTy);
  });

  it('hangs some pockets from cave ceilings, small ones near the surface', () => {
    const get = worldGetter(world);
    let hanging = 0;
    let shallowTallest = 0;
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) {
        if (!isLoose(get(tx, ty)) || isLoose(get(tx, ty + 1))) continue;
        if (!columnHeld(get, tx, ty)) hanging++;
        if (ty - SURFACE_LEVEL < GRAVEL_POCKETS.gentleDepth - 4) {
          let height = 0;
          while (isLoose(get(tx, ty - height))) height++;
          shallowTallest = Math.max(shallowTallest, height);
        }
      }
    }
    expect(hanging).toBeGreaterThan(100);
    // Gentle pockets are 2 * (radius - 1) + 1 rows tall, plus up to 2 reaching down to a ceiling
    // (two overlapping pockets can stack a little higher, rarely).
    expect(shallowTallest).toBeLessThanOrEqual(2 * (GRAVEL_POCKETS.gentleRadiusMax - 1) + 1 + 2 + 1);
  });

  it('generates in under 2 seconds', () => {
    const start = performance.now();
    generateWorld(7, GRAVEL_PROFILE);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

// World hashes of strata v1, recorded before Phase 14b added strata v2. It's frozen too: worlds
// made with it keep generating the same, without lava, floatstone or the Heart of the Deep.
const STRATA_V1_HASHES: [number, string][] = [
  [1, '7cd16165'],
  [42, '06b4015c'],
  [987654321, '47a02b98'],
];

describe('strata v1', () => {
  it.each(STRATA_V1_HASHES)('still generates seed %i exactly as before Phase 14b', (seed, hash) => {
    const world = generateWorld(seed, STRATA_PROFILE);
    expect(world.hash().toString(16).padStart(8, '0')).toBe(hash);
    expect(world.profile).toEqual({ name: 'strata', version: 1 });
    expect(world.heart).toBeNull();
  });
});

// World hashes of strata v2, recorded before package B1 added strata v3. It's frozen too: worlds
// made with it keep generating the same, without B1's caverns, cave networks, cave mouths or
// ore on cave walls.
const STRATA_V2_HASHES: [number, string][] = [
  [1, '80ed5913'],
  [42, 'bfb1baa2'],
  [987654321, '6f867977'],
];

describe('strata v2', () => {
  it.each(STRATA_V2_HASHES)('still generates seed %i exactly as before package B1', (seed, hash) => {
    const world = generateWorld(seed, STRATA_V2_PROFILE);
    expect(world.hash().toString(16).padStart(8, '0')).toBe(hash);
    expect(world.profile).toEqual({ name: 'strata', version: 2 });
    expect(world.firstCavern).toBeNull();
  });
});

describe('saved worlds keep their profile', () => {
  it('saves the profile, and a save without one (from before Phase 12) is classic', () => {
    const world = generateWorld(3, GRAVEL_PROFILE);
    const save = createSave(world, new Player(0, 0), new Inventory(), []);
    expect(save.profile).toEqual({ name: 'gravel', version: 1 });
    expect(restoreProfile(save)).toBe(GRAVEL_PROFILE);
    const { profile: _gone, ...old } = save;
    expect(restoreProfile(old)).toBe(CLASSIC_PROFILE);
    expect(checkSave(old).kind).toBe('ok');
  });

  it('a profile this version does not know reads as a save from a newer version', () => {
    const save = createSave(generateWorld(3), new Player(0, 0), new Inventory(), []);
    const status = checkSave({ ...save, profile: { name: 'strata', version: 4 } });
    expect(status).toEqual({ kind: 'outdated', version: SAVE_VERSION + 1 });
    expect(findProfile({ name: 'gravel', version: 2 })).toBeNull();
    expect(checkSave({ ...save, profile: { name: 'strata', version: 1 } }).kind).toBe('ok');
    expect(checkSave({ ...save, profile: { name: 'strata', version: 2 } }).kind).toBe('ok');
    expect(checkSave({ ...save, profile: { name: 'strata', version: 3 } }).kind).toBe('ok');
  });

  it('a backup keeps the profile', () => {
    const save = createSave(generateWorld(3, GRAVEL_PROFILE), new Player(0, 0), new Inventory(), []);
    const read = readBackup(backupText(save));
    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') expect(restoreProfile(read.save)).toBe(GRAVEL_PROFILE);
  });
});
