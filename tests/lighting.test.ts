import { describe, expect, it } from 'vitest';
import { FLARE_LIGHT, GLOW_CRYSTAL_LIGHT, GLOWSHROOM_LIGHT, LANTERN_LIGHT, LIGHT_FALLOFF_AIR, LIGHT_FALLOFF_SOLID, LIGHT_MAX, PLAYER_GLOW, TOAST_DURATION, TORCH_LIGHT } from '../src/config';
import { Toasts } from '../src/ui/hud';
import { createRng, randInt } from '../src/util/rng';
import { generateWorld } from '../src/world/generate';
import { LightMap, playerGlow } from '../src/world/lighting';
import { Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const GROUND = 20;

/** 60 x 50 world: open sky down to row GROUND, solid stone below. */
function stoneWorld(): World {
  const world = new World(60, 50, 0);
  fill(world, 0, GROUND, 59, 49, Tile.Stone);
  return world;
}

function fill(world: World, x0: number, y0: number, x1: number, y1: number, id: TileId): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) world.setTile(x, y, id);
}

function copyOf(world: World): World {
  const copy = new World(world.width, world.height, world.seed);
  copy.chunks.forEach((chunk, i) => chunk.set(world.chunks[i]));
  return copy;
}

/** A fresh LightMap computed from scratch on a copy of the world. */
function fullRecompute(world: World): LightMap {
  return new LightMap(copyOf(world));
}

/** Every tile's level, moving lights included. */
function levels(light: LightMap): number[] {
  const out: number[] = [];
  for (let y = 0; y < light.height; y++) for (let x = 0; x < light.width; x++) out.push(light.level(x, y));
  return out;
}

describe('lighting', () => {
  it('lights open sky and the first solid tile fully, fading into the rock below', () => {
    const world = stoneWorld();
    const light = new LightMap(world);
    expect(light.level(10, 5)).toBe(LIGHT_MAX);
    expect(light.level(10, GROUND)).toBe(LIGHT_MAX);
    expect(light.level(10, GROUND + 1)).toBe(LIGHT_MAX - LIGHT_FALLOFF_SOLID);
    expect(light.level(10, GROUND + 10)).toBe(0);
  });

  it('keeps a sealed cave completely dark', () => {
    const world = stoneWorld();
    fill(world, 10, 35, 40, 38, Tile.Air);
    const light = new LightMap(world);
    for (let x = 10; x <= 40; x++) for (let y = 35; y <= 38; y++) expect(light.level(x, y)).toBe(0);
  });

  it('a torch lights about 8 tiles around it', () => {
    const world = stoneWorld();
    fill(world, 5, 37, 55, 37, Tile.Air); // long 1-tile-high tunnel
    const light = new LightMap(world);
    world.setTile(25, 37, Tile.Torch);
    light.update();
    const radius = TORCH_LIGHT / LIGHT_FALLOFF_AIR;
    expect(radius).toBe(8);
    for (let d = 0; d <= radius; d++) {
      expect(light.level(25 + d, 37)).toBe(TORCH_LIGHT - LIGHT_FALLOFF_AIR * d);
      expect(light.level(25 - d, 37)).toBe(TORCH_LIGHT - LIGHT_FALLOFF_AIR * d);
    }
    expect(light.level(25 + radius + 1, 37)).toBe(0);

    world.setTile(25, 37, Tile.Air); // take the torch away again
    light.update();
    expect(light.level(25, 37)).toBe(0);
  });

  it('sky light falls straight down a shaft, then spreads into the cave at its foot', () => {
    const world = stoneWorld();
    fill(world, 5, 37, 55, 37, Tile.Air);
    const light = new LightMap(world);
    fill(world, 40, GROUND, 40, 36, Tile.Air); // dig a shaft from the surface into the tunnel
    light.update();
    expect(light.level(40, 30)).toBe(LIGHT_MAX);
    expect(light.level(40, 37)).toBe(LIGHT_MAX);
    expect(light.level(43, 37)).toBe(LIGHT_MAX - 3 * LIGHT_FALLOFF_AIR);

    world.setTile(40, GROUND, Tile.Dirt); // cap it: dark again
    light.update();
    expect(light.level(40, 37)).toBe(0);
  });

  it('incremental relighting always matches a full recompute', () => {
    const world = stoneWorld();
    fill(world, 8, 30, 50, 34, Tile.Air);
    fill(world, 20, 38, 45, 44, Tile.Air);
    const light = new LightMap(world);
    const rng = createRng(5);
    const choices: TileId[] = [Tile.Air, Tile.Air, Tile.Stone, Tile.Torch, Tile.Dirt, Tile.Glowshroom, Tile.GlowCrystal];
    for (let edit = 1; edit <= 300; edit++) {
      // A few changes per step, like breaking a tree or using the 3x3 brush.
      for (let k = randInt(rng, 1, 3); k > 0; k--) {
        world.setTile(randInt(rng, 1, 58), randInt(rng, 5, 48), choices[randInt(rng, 0, choices.length - 1)]);
      }
      light.update();
      if (edit % 25 === 0) expect(Array.from(light.light)).toEqual(Array.from(fullRecompute(world).light));
    }
  });

  it('a moving light lights its radius but stays out of the established light', () => {
    const world = stoneWorld();
    fill(world, 5, 37, 55, 37, Tile.Air);
    const light = new LightMap(world);
    light.setMovingLight('lantern', 25, 37, LANTERN_LIGHT);
    light.update();
    const radius = LANTERN_LIGHT / LIGHT_FALLOFF_AIR;
    expect(radius).toBe(6);
    for (let d = 0; d <= radius; d++) expect(light.level(25 + d, 37)).toBe(LANTERN_LIGHT - LIGHT_FALLOFF_AIR * d);
    expect(light.level(25 + radius + 1, 37)).toBe(0);
    expect(light.established(25, 37)).toBe(0);

    light.setMovingLight('lantern', 30, 37, LANTERN_LIGHT); // walk 5 tiles right
    light.update();
    expect(light.level(30, 37)).toBe(LANTERN_LIGHT);
    expect(light.level(20, 37)).toBe(0);
    light.removeMovingLight('lantern');
    expect(light.level(30, 37)).toBe(0);
  });

  it('glowing tiles light the dark as established light', () => {
    const world = stoneWorld();
    fill(world, 5, 37, 55, 37, Tile.Air);
    world.setTile(15, 37, Tile.Glowshroom);
    world.setTile(40, 38, Tile.GlowCrystal); // set in the floor of the tunnel
    const light = new LightMap(world);
    expect(light.established(15, 37)).toBe(GLOWSHROOM_LIGHT);
    expect(light.level(15 + GLOWSHROOM_LIGHT / LIGHT_FALLOFF_AIR, 37)).toBe(0);
    expect(light.established(40, 37)).toBe(GLOW_CRYSTAL_LIGHT - LIGHT_FALLOFF_AIR);
    expect(light.established(28, 37)).toBe(0);
  });

  it('a moving light gives exactly what a torch in its place would', () => {
    const world = stoneWorld();
    fill(world, 8, 30, 50, 34, Tile.Air);
    fill(world, 20, 35, 22, 44, Tile.Air);
    world.setTile(15, 32, Tile.Torch);
    const moving = new LightMap(world);
    moving.setMovingLight('test', 21, 33, TORCH_LIGHT);
    moving.update();
    const torch = copyOf(world);
    torch.setTile(21, 33, Tile.Torch);
    expect(levels(moving)).toEqual(levels(new LightMap(torch)));
  });

  it('incremental relighting matches a full recompute with moving lights too', () => {
    const world = stoneWorld();
    fill(world, 8, 30, 50, 34, Tile.Air);
    fill(world, 20, 38, 45, 44, Tile.Air);
    const light = new LightMap(world);
    const rng = createRng(9);
    const choices: TileId[] = [Tile.Air, Tile.Air, Tile.Stone, Tile.Torch, Tile.Dirt, Tile.Glowshroom];
    let x = 20;
    let y = 32;
    for (let step = 1; step <= 400; step++) {
      // The lantern wanders around (sometimes into rock it has just dug), now and then switched off.
      x = Math.max(1, Math.min(58, x + randInt(rng, -1, 1)));
      y = Math.max(21, Math.min(48, y + randInt(rng, -1, 1)));
      if (step % 50 < 45) light.setMovingLight('lantern', x, y, LANTERN_LIGHT);
      else light.removeMovingLight('lantern');
      light.setMovingLight('flare', 40, 41, FLARE_LIGHT);
      for (let k = randInt(rng, 0, 2); k > 0; k--) {
        world.setTile(randInt(rng, 1, 58), randInt(rng, 5, 48), choices[randInt(rng, 0, choices.length - 1)]);
      }
      light.update();
      if (step % 20 === 0) {
        const fresh = fullRecompute(world);
        if (step % 50 < 45) fresh.setMovingLight('lantern', x, y, LANTERN_LIGHT);
        fresh.setMovingLight('flare', 40, 41, FLARE_LIGHT);
        fresh.update();
        expect(Array.from(light.light)).toEqual(Array.from(fresh.light));
        expect(levels(light)).toEqual(levels(fresh));
      }
    }
  });

  it('stays correct while digging around in a generated world', () => {
    const world = generateWorld(42);
    const light = new LightMap(world);
    // Dig a staircase down from spawn into the caves, dropping torches as we go.
    let x = world.spawnTx;
    for (let y = world.spawnTy; y < world.spawnTy + 120; y++) {
      world.setTile(x, y, Tile.Air);
      world.setTile(x + 1, y, Tile.Air);
      if (y % 10 === 0) world.setTile(x - 1, y, Tile.Torch);
      light.update();
      if (y % 3 === 0) x++;
    }
    expect(Array.from(light.light)).toEqual(Array.from(fullRecompute(world).light));
  });
});

describe('toasts', () => {
  it('adds up pickups of the same item while its toast is showing', () => {
    const toasts = new Toasts();
    toasts.gained('coal', 1);
    toasts.gained('stone', 2);
    toasts.gained('coal', 2);
    expect(toasts.list.map((t) => t.text)).toEqual(['+3 Coal', '+2 Stone']);
  });

  it(`fades out after ${TOAST_DURATION} s`, () => {
    const toasts = new Toasts();
    toasts.show('Need better pickaxe');
    toasts.update(TOAST_DURATION - 0.01);
    expect(toasts.list).toHaveLength(1);
    toasts.update(0.02);
    expect(toasts.list).toHaveLength(0);
  });
});

describe('player glow', () => {
  it('faintly lights only the few tiles around the player', () => {
    expect(playerGlow(0)).toBe(PLAYER_GLOW);
    expect(playerGlow(0)).toBeLessThan(LIGHT_MAX / 2);
    expect(playerGlow(1)).toBeGreaterThan(0);
    expect(playerGlow(3.5)).toBe(0);
  });
});
