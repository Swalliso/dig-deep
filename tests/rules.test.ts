import { beforeAll, describe, expect, it } from 'vitest';
import {
  DAMP_TORCH_LIGHT,
  DEPTHS_GEN,
  FLOAT_RADIUS,
  HEAT_COOL_RATE,
  HEAT_GRACE,
  HEAT_HURT_INTERVAL,
  LAVA_HEAT,
  LIGHT_FALLOFF_AIR,
  PLAYER_HEIGHT,
  TILE_SIZE,
  TORCH_LIGHT,
} from '../src/config';
import { heartSpot, placeLavaPool, LAVA_POOL_WIDTH } from '../src/debug';
import { Player, type PlayerControls } from '../src/entities/player';
import { Heat, heatStatus } from '../src/systems/heat';
import { deathCauseText, Health } from '../src/systems/health';
import { itemDef, ITEMS } from '../src/systems/items';
import { checkMine } from '../src/systems/mining';
import { PICKAXES } from '../src/config';
import { checkSave, createSave, metaFromSave } from '../src/systems/save';
import { Inventory } from '../src/systems/inventory';
import { generateWorld, STRATA_V2_PROFILE } from '../src/world/generate';
import { heatField, heatIn, maxHeat, HEAT_REACH } from '../src/world/heat';
import { LightMap } from '../src/world/lighting';
import { GEODE, HOLLOWS, inFloatField, MAGMA, STRATA, stratumAt, torchLight } from '../src/world/strata';
import { isSolid, Tile, TILE_INSULATES, TILES, tileDef, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';
import { createRng, randInt } from '../src/util/rng';

const DT = 1 / 60;
const IDLE: PlayerControls = { move: 0, jumpPressed: false, jumpHeld: false };

function fill(world: World, x0: number, y0: number, x1: number, y1: number, id: TileId): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) world.setTile(x, y, id);
}

/**
 * A small strata world for the rules: 80 x 80, every column with the same boundaries (Stone
 * Caverns from row 5, the Fungal Hollows from 20, the Geode Depths from 50, the Magma Layer from
 * 65), open air down to row 10 and stone below.
 */
function strataWorld(): World {
  const world = new World(80, 80, 0);
  world.strataTops = [5, 20, 50, 65].map((row) => new Int16Array(80).fill(row));
  fill(world, 0, 10, 79, 79, Tile.Stone);
  return world;
}

function copyOf(world: World): World {
  const copy = new World(world.width, world.height, world.seed);
  copy.chunks.forEach((chunk, i) => chunk.set(world.chunks[i]));
  copy.strataTops = world.strataTops.map((tops) => tops.slice());
  return copy;
}

describe('damp (Fungal Hollows)', () => {
  it('dims torches in the Hollows only, fading in over its top rows', () => {
    const world = strataWorld();
    expect(stratumAt(world, 10, 30)).toBe(HOLLOWS);
    expect(torchLight(world, 10, 15)).toBe(TORCH_LIGHT); // Stone Caverns
    expect(torchLight(world, 10, 23)).toBeLessThan(TORCH_LIGHT);
    expect(torchLight(world, 10, 23)).toBeGreaterThan(DAMP_TORCH_LIGHT); // the top rows are only a little damp
    expect(torchLight(world, 10, 40)).toBe(DAMP_TORCH_LIGHT);
    expect(torchLight(world, 10, 55)).toBe(TORCH_LIGHT); // Geode Depths
    for (let ty = 20; ty < 49; ty++) expect(torchLight(world, 10, ty)).toBeGreaterThanOrEqual(torchLight(world, 10, ty + 1));
  });

  it('gives a damp torch a smaller radius, but leaves glowshrooms alone', () => {
    const world = strataWorld();
    fill(world, 2, 15, 77, 17, Tile.Air); // a tunnel in the Stone Caverns, out of the sky's reach
    fill(world, 2, 38, 77, 42, Tile.Air); // and one deep in the Hollows
    world.setTile(20, 16, Tile.Torch);
    world.setTile(20, 40, Tile.Torch);
    world.setTile(60, 16, Tile.Glowshroom);
    world.setTile(60, 40, Tile.Glowshroom);
    const light = new LightMap(world);
    const reach = (x: number, y: number): number => {
      let r = 0;
      while (light.level(x + r + 1, y) > 0) r++;
      return r;
    };
    expect(reach(20, 16)).toBe(TORCH_LIGHT / LIGHT_FALLOFF_AIR - 1);
    expect(reach(20, 40)).toBe(DAMP_TORCH_LIGHT / LIGHT_FALLOFF_AIR - 1);
    expect(reach(60, 40)).toBe(reach(60, 16));
  });

  it('keeps incremental relighting equal to a full recompute across the damp boundary', () => {
    const world = strataWorld();
    fill(world, 2, 12, 77, 60, Tile.Air);
    const light = new LightMap(world);
    const rng = createRng(14);
    const choices: TileId[] = [Tile.Air, Tile.Stone, Tile.Torch, Tile.Torch, Tile.Glowshroom, Tile.Mudstone];
    for (let step = 1; step <= 300; step++) {
      for (let k = randInt(rng, 0, 2); k > 0; k--) world.setTile(randInt(rng, 1, 78), randInt(rng, 12, 60), choices[randInt(rng, 0, choices.length - 1)]);
      light.update();
      if (step % 30 === 0) expect(Array.from(light.light)).toEqual(Array.from(new LightMap(copyOf(world)).light));
    }
  });
});

describe('floatstone (Geode Depths)', () => {
  /** 60 x 120: open air down to a stone floor at row 110. */
  function shaftWorld(): World {
    const world = new World(60, 120, 0);
    fill(world, 0, 110, 59, 119, Tile.Stone);
    return world;
  }

  it('pulls within FLOAT_RADIUS tiles of a floatstone', () => {
    const world = shaftWorld();
    world.setTile(30, 109, Tile.Floatstone);
    expect(inFloatField(world, 30, 109 - FLOAT_RADIUS)).toBe(true);
    expect(inFloatField(world, 30, 108 - FLOAT_RADIUS)).toBe(false);
    expect(inFloatField(world, 33, 105)).toBe(true);
    expect(inFloatField(world, 10, 105)).toBe(false);
  });

  it('makes jumps higher', () => {
    const rise = (floating: boolean): number => {
      const world = shaftWorld();
      const player = new Player(30, 109);
      for (let i = 0; i < 5; i++) player.update(DT, world, IDLE);
      player.floating = floating;
      const start = player.y;
      let top = player.y;
      for (let i = 0; i < 200; i++) {
        player.update(DT, world, { move: 0, jumpPressed: i === 0, jumpHeld: true });
        top = Math.min(top, player.y);
      }
      return (start - top) / TILE_SIZE;
    };
    expect(rise(true)).toBeGreaterThan(2 * rise(false));
  });

  it('cushions a long fall that ends in its pull', () => {
    const fall = (floatstone: boolean): number => {
      const world = shaftWorld();
      if (floatstone) world.setTile(31, 110, Tile.Floatstone);
      const player = new Player(30, 5);
      let landed = 0;
      for (let i = 0; i < 600 && landed === 0; i++) {
        player.floating = inFloatField(world, Math.floor(player.centerX / TILE_SIZE), Math.floor(player.centerY / TILE_SIZE));
        player.update(DT, world, IDLE);
        landed = player.fallLanded;
      }
      expect(player.y + PLAYER_HEIGHT).toBe(110 * TILE_SIZE);
      return landed;
    };
    expect(fall(false)).toBeGreaterThan(100);
    expect(fall(true)).toBeLessThan(1);
  });
});

describe('heat', () => {
  /** 40 x 30 of open air over a stone floor at row 20, with a lava pool in the floor at x 10..13. */
  function lavaWorld(): World {
    const world = new World(40, 30, 0);
    fill(world, 0, 20, 39, 29, Tile.Stone);
    placeLavaPool(world, 10, 20);
    return world;
  }

  it('spreads a level less per tile, through air and rock, as far as HEAT_REACH', () => {
    const world = lavaWorld();
    const field = heatField(world, 0, 0, 39, 29);
    expect(heatIn(field, 10, 20)).toBe(LAVA_HEAT);
    expect(heatIn(field, 10, 19)).toBe(LAVA_HEAT - 1);
    expect(heatIn(field, 10, 23)).toBe(LAVA_HEAT - 3); // three tiles down into the rock
    expect(heatIn(field, 10, 20 - HEAT_REACH)).toBe(1);
    expect(heatIn(field, 10, 19 - HEAT_REACH)).toBe(0);
    expect(heatIn(field, 14 + HEAT_REACH, 20)).toBe(0);
  });

  it('is kept out by bricks and closed doors, but not open ones', () => {
    // Lava lying on the floor (row 19) at x 10..13.
    const world = new World(40, 30, 0);
    fill(world, 0, 20, 39, 29, Tile.Stone);
    placeLavaPool(world, 10, 19);
    expect(maxHeat(world, 15, 19, 15, 19)).toBeGreaterThan(0);
    // A brick wall right beside it, four tiles tall: the far side is cool.
    fill(world, 14, 16, 14, 19, Tile.StoneBricks);
    expect(maxHeat(world, 15, 19, 15, 19)).toBe(0);
    expect(maxHeat(world, 14, 19, 14, 19)).toBe(0); // bricks aren't hot themselves
    // A door on the other side.
    world.setTile(9, 19, Tile.DoorClosedBottom);
    world.setTile(9, 18, Tile.DoorClosedTop);
    expect(maxHeat(world, 8, 19, 8, 19)).toBe(0);
    world.setTile(9, 19, Tile.DoorOpenBottom);
    world.setTile(9, 18, Tile.DoorOpenTop);
    expect(maxHeat(world, 8, 19, 8, 19)).toBeGreaterThan(0);
  });

  it('a sealed brick room right over the lava stays cool inside', () => {
    const world = lavaWorld();
    fill(world, 8, 14, 15, 19, Tile.MudstoneBricks);
    fill(world, 9, 15, 14, 18, Tile.Air);
    expect(maxHeat(world, 9, 15, 14, 18)).toBe(0);
    expect(maxHeat(world, 16, 20, 16, 20)).toBeGreaterThan(0); // outside it's still hot
  });

  it('gives every tile in a box the same level as a field over the whole world', () => {
    const world = generateWorld(42, STRATA_V2_PROFILE);
    const heart = world.heart!;
    const whole = heatField(world, heart.cavernX0 - 30, heart.cavernY0 - 30, heart.cavernX1 + 30, world.height - 1);
    const rng = createRng(3);
    for (let i = 0; i < 40; i++) {
      const x = randInt(rng, heart.cavernX0 - 20, heart.cavernX1 + 15);
      const y = randInt(rng, heart.cavernY0 - 20, world.height - 8);
      const box = heatField(world, x, y, x + 4, y + 4);
      for (let ty = y; ty <= y + 4; ty++) for (let tx = x; tx <= x + 4; tx++) expect(heatIn(box, tx, ty)).toBe(heatIn(whole, tx, ty));
    }
  });

  it('only every brick, heartstone and closed door insulates', () => {
    const insulating = TILES.filter((def) => TILE_INSULATES[def.id]).map((def) => def.id);
    expect(insulating.sort((a, b) => a - b)).toEqual(
      [Tile.DoorClosedTop, Tile.DoorClosedBottom, Tile.DoorRightClosedTop, Tile.DoorRightClosedBottom, Tile.StoneBricks, Tile.MudstoneBricks, Tile.DeepstoneBricks, Tile.BasaltBricks, Tile.Heartstone].sort((a, b) => a - b),
    );
  });
});

describe('heat exposure', () => {
  it('is safe for HEAT_GRACE, then burns every HEAT_HURT_INTERVAL', () => {
    const heat = new Heat();
    let now = 0;
    const burns: number[] = [];
    for (let i = 0; i < 60 * 10.5; i++) {
      now += DT;
      if (heat.update(DT, now, 'hot', true)) burns.push(now);
    }
    expect(burns[0]).toBeCloseTo(HEAT_GRACE, 1);
    expect(burns[1] - burns[0]).toBeCloseTo(HEAT_HURT_INTERVAL, 1);
    expect(burns.length).toBe(1 + Math.floor((10.5 - HEAT_GRACE) / HEAT_HURT_INTERVAL));
  });

  it('cools off faster than it heats up, and a short dash through costs nothing', () => {
    const heat = new Heat();
    for (let i = 0; i < 60 * 3; i++) expect(heat.update(DT, i * DT, 'hot', true)).toBe(false);
    for (let i = 0; i < 60 * (3 / HEAT_COOL_RATE) + 1; i++) heat.update(DT, 3 + i * DT, 'cool', true);
    expect(heat.exposure).toBe(0);
  });

  it('never burns in Cozy worlds', () => {
    const heat = new Heat();
    for (let i = 0; i < 60 * 20; i++) expect(heat.update(DT, i * DT, 'lava', false)).toBe(false);
    expect(heat.exposure).toBe(0);
  });

  it('says how long until it burns, then that it burns, on the safety line', () => {
    const heat = new Heat();
    expect(heatStatus('cool', heat)).toBeNull();
    heat.update(1, 1, 'hot', true);
    expect(heatStatus('hot', heat)).toEqual({ text: `Too hot here: burns in ${HEAT_GRACE - 1} s. Bricks keep heat out.`, tone: 'heat' });
    heat.update(HEAT_GRACE, 5, 'hot', true);
    expect(heatStatus('hot', heat)?.tone).toBe('danger');
    expect(heatStatus('lava', heat)?.text).toBe('In lava! Get out!');
    expect(heatStatus('cool', heat)?.tone).toBe('safe');
    expect(deathCauseText({ kind: 'heat' })).toBe('The heat got to you.');
    expect(deathCauseText({ kind: 'lava' })).toBe('You touched lava.');
  });
});

describe('lava', () => {
  it("can't be dug or built in, and you can walk into it", () => {
    const world = new World(20, 20, 0);
    world.setTile(5, 5, Tile.Lava);
    const player = new Player(5, 6);
    expect(checkMine(world, player, 5, 5, PICKAXES.length - 1)).toBe('empty');
    expect(isSolid(Tile.Lava)).toBe(false);
  });
});

describe('a strata v2 world', () => {
  let world: World;
  beforeAll(() => {
    world = generateWorld(42, STRATA_V2_PROFILE);
  });

  it('is deterministic, and keeps strata v1 under what it adds', () => {
    expect(world.profile).toEqual({ name: 'strata', version: 2 });
    expect(generateWorld(42, STRATA_V2_PROFILE).hash()).toBe(world.hash());
  });

  it('has floatstone only in the Geode Depths, lava and hot rock only in the Magma Layer below its gentle rows', () => {
    const problems: string[] = [];
    let floatstone = 0;
    let lava = 0;
    let hot = 0;
    const heart = world.heart!;
    for (let ty = 0; ty < world.height; ty++) {
      for (let tx = 0; tx < world.width; tx++) {
        const tile = world.getTile(tx, ty);
        const s = stratumAt(world, tx, ty);
        if (tile === Tile.Floatstone) {
          floatstone++;
          if (s !== GEODE) problems.push(`floatstone at (${tx}, ${ty}) in stratum ${s}`);
        }
        if (tile !== Tile.Lava && tile !== Tile.HotRock) continue;
        if (tile === Tile.Lava) lava++;
        else hot++;
        const gentle = ty < world.strataTops[MAGMA - 1][tx] + DEPTHS_GEN.gentleRows;
        const byHeart = tx >= heart.cavernX0 && tx <= heart.cavernX1 && ty >= heart.cavernY0;
        if (s !== MAGMA || (gentle && !byHeart)) problems.push(`${tileDef(tile).name} at (${tx}, ${ty})`);
        // Lava sits in a basin: rock or lava under it and on both sides.
        if (tile === Tile.Lava) {
          for (const [x, y] of [[tx - 1, ty], [tx + 1, ty], [tx, ty + 1]]) {
            const next = world.getTile(x, y);
            if (next !== Tile.Lava && !isSolid(next)) problems.push(`lava at (${tx}, ${ty}) can spill to (${x}, ${y})`);
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(floatstone).toBeGreaterThan(50);
    expect(lava).toBeGreaterThan(200);
    expect(hot).toBeGreaterThan(500);
  });

  it('has a cool, safe first meeting with the Magma Layer and plenty of cool space below it', () => {
    let gentleHot = 0;
    let open = 0;
    let hotOpen = 0;
    const field = heatField(world, 0, 0, world.width - 1, world.height - 1);
    for (let tx = 0; tx < world.width; tx++) {
      const top = world.strataTops[MAGMA - 1][tx];
      for (let ty = top; ty < world.height; ty++) {
        if (world.getTile(tx, ty) !== Tile.Air) continue;
        const heat = heatIn(field, tx, ty);
        if (ty < top + DEPTHS_GEN.gentleRows - HEAT_REACH && heat > 0) gentleHot++;
        open++;
        if (heat > 0) hotOpen++;
      }
    }
    expect(gentleHot).toBe(0);
    // Heat is a zone: some of the open space, never most of it.
    expect(hotOpen / open).toBeGreaterThan(0.04);
    expect(hotOpen / open).toBeLessThan(0.3);
  });

  it('seals the Heart of the Deep in heartstone above the bedrock, cool inside and on its roof', () => {
    const heart = world.heart!;
    expect(world.getTile(heart.tx, heart.ty)).toBe(Tile.HeartCore);
    expect(world.getTile(heart.tx, heart.y1 + 1)).toBe(Tile.Bedrock);
    const { heartWall: t } = DEPTHS_GEN;
    for (let ty = heart.y0; ty <= heart.y1; ty++) {
      for (let tx = heart.x0; tx <= heart.x1; tx++) {
        const wall = tx < heart.x0 + t || tx > heart.x1 - t || ty < heart.y0 + t || ty > heart.y1 - t;
        if (wall) expect(world.getTile(tx, ty)).toBe(Tile.Heartstone);
        else if (tx !== heart.tx || ty !== heart.ty) expect(world.getTile(tx, ty)).toBe(Tile.Air);
      }
    }
    expect(maxHeat(world, heart.x0 + t, heart.y0 + t, heart.x1 - t, heart.y1 - t)).toBe(0);
    expect(maxHeat(world, heart.x0, heart.y0 - 3, heart.x1, heart.y0 - 1)).toBe(0);
    // A glowing landmark: lava on both sides of it.
    expect(world.getTile(heart.x0 - 2, heart.y1)).toBe(Tile.Lava);
    expect(world.getTile(heart.x1 + 2, heart.y1)).toBe(Tile.Lava);
  });

  it('needs the emberite pickaxe (the best one) for heartstone, and nothing past it', () => {
    const best = PICKAXES.length - 1;
    expect(tileDef(Tile.Heartstone).minTier).toBe(best);
    expect(itemDef('emberite_pickaxe').pickaxeTier).toBe(best);
    expect(tileDef(Tile.HeartCore).drop).toBe('heart_of_the_deep');
    expect(ITEMS.heart_of_the_deep.placeTile).toBe(Tile.HeartCore);
  });

  it('debug X stands the player on the chamber roof', () => {
    const copy = generateWorld(42, STRATA_V2_PROFILE);
    const spot = heartSpot(copy)!;
    const heart = copy.heart!;
    expect(spot.ty).toBe(heart.y0 - 1);
    expect(copy.getTile(spot.tx, spot.ty)).toBe(Tile.Air);
    expect(copy.getTile(spot.tx, spot.ty - 1)).toBe(Tile.Air);
    expect(copy.getTile(spot.tx, spot.ty + 1)).toBe(Tile.Heartstone);
  });

  it("debug Z's lava pool is LAVA_POOL_WIDTH tiles", () => {
    const small = new World(20, 20, 0);
    placeLavaPool(small, 3, 3);
    let n = 0;
    for (let tx = 0; tx < 20; tx++) if (small.getTile(tx, 3) === Tile.Lava) n++;
    expect(n).toBe(LAVA_POOL_WIDTH);
  });

  it('names each rule on its stratum banner', () => {
    expect(STRATA[HOLLOWS].rule?.needsDepths).toBe(false);
    expect(STRATA[GEODE].rule?.needsDepths).toBe(true);
    expect(STRATA[MAGMA].rule?.text).toContain('Bricks');
  });
});

describe('the Heart of the Deep in saves', () => {
  it('saves when it was claimed, and the world list shows it', () => {
    const world = new World(64, 64, 1);
    const survival = { health: new Health(10), difficulty: 'normal' as const, bed: null, satchels: [], heartClaimedAt: 3600 };
    const save = createSave(world, new Player(0, 0), new Inventory(), [], undefined, { survival });
    expect(save.heartClaimedAt).toBe(3600);
    expect(metaFromSave('1', save).heartClaimed).toBe(true);
    expect(metaFromSave('1', { ...save, heartClaimedAt: null }).heartClaimed).toBeUndefined();
    expect(checkSave({ ...save, heartClaimedAt: 'yes' as never }).kind).toBe('broken');
  });
});
