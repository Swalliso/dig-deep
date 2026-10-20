import { describe, expect, it } from 'vitest';
import { GIANT_MUSHROOM_STEM_MIN, PLANT_GROW_MAX, PLANT_GROW_MIN, PLANT_SPACING, SAPLING_CHANCE, SPORE_CHANCE, TREE_TRUNK_MIN } from '../src/config';
import { Player } from '../src/entities/player';
import { canPlace } from '../src/systems/building';
import { Inventory } from '../src/systems/inventory';
import { createSave, restoreTileEntities } from '../src/systems/save';
import { createRng } from '../src/util/rng';
import { canPlantOn, growDuePlants, growGiantMushroom, newPlant, openToSky, plantGrowTime, plantStatus, plantStatusText } from '../src/world/plants';
import { TileEntities } from '../src/world/tileEntities';
import { chanceDropFor, Tile, tileDef, type TileId } from '../src/world/tiles';
import { fellTreeAbove, isTrunk } from '../src/world/trees';
import { World } from '../src/world/world';

const DT = 1 / 60;
const GROUND = 30;
const PX = 20;

/** 60 x 40 world with `ground` from row GROUND down and a player standing on it at column PX. */
function setup(ground: TileId = Tile.Grass): { world: World; player: Player; entities: TileEntities } {
  const world = new World(60, 40, 7);
  for (let ty = GROUND; ty < 40; ty++) for (let tx = 0; tx < 60; tx++) world.setTile(tx, ty, ty === GROUND ? ground : Tile.Stone);
  const player = new Player(PX, GROUND - 1);
  for (let i = 0; i < 2; i++) player.update(DT, world, { move: 0, jumpPressed: false, jumpHeld: false });
  return { world, player, entities: new TileEntities(world) };
}

function count(world: World, id: TileId): number {
  let n = 0;
  for (const chunk of world.chunks) for (const t of chunk) if (t === id) n++;
  return n;
}

/** Plant `tile` at (tx, GROUND - 1), due to grow at `growAt`. */
function plant(world: World, entities: TileEntities, tile: TileId, tx: number, growAt: number): void {
  world.setTile(tx, GROUND - 1, tile);
  entities.set(tx, GROUND - 1, { kind: 'plant', growAt });
}

describe('planting', () => {
  it('puts saplings on grass or dirt, and mushroom spores on mudstone', () => {
    expect(canPlantOn(Tile.Sapling, Tile.Grass)).toBe(true);
    expect(canPlantOn(Tile.Sapling, Tile.Dirt)).toBe(true);
    expect(canPlantOn(Tile.Sapling, Tile.Stone)).toBe(false);
    expect(canPlantOn(Tile.MushroomSprout, Tile.Mudstone)).toBe(true);
    expect(canPlantOn(Tile.MushroomSprout, Tile.Grass)).toBe(false);
    expect(canPlantOn(Tile.Torch, Tile.Stone)).toBe(true); // only plants have a rule

    const grass = setup(Tile.Grass);
    expect(canPlace(grass.world, grass.player, PX + 2, GROUND - 1, Tile.Sapling)).toBe(true);
    expect(canPlace(grass.world, grass.player, PX + 2, GROUND - 1, Tile.MushroomSprout)).toBe(false);
    const mud = setup(Tile.Mudstone);
    expect(canPlace(mud.world, mud.player, PX + 2, GROUND - 1, Tile.MushroomSprout)).toBe(true);
    expect(canPlace(mud.world, mud.player, PX + 2, GROUND - 1, Tile.Sapling)).toBe(false);
  });

  it(`takes ${PLANT_GROW_MIN}–${PLANT_GROW_MAX} s of play to grow`, () => {
    expect(plantGrowTime(0)).toBe(PLANT_GROW_MIN);
    expect(plantGrowTime(1)).toBe(PLANT_GROW_MAX);
    expect(newPlant(100, plantGrowTime(0.5))).toEqual({ kind: 'plant', growAt: 100 + (PLANT_GROW_MIN + PLANT_GROW_MAX) / 2 });
  });
});

describe('growing', () => {
  it('grows a sapling into a tree once its time has come, and not before', () => {
    const { world, entities } = setup();
    plant(world, entities, Tile.Sapling, 30, 300);
    expect(growDuePlants(world, entities, 299)).toEqual([]);
    expect(world.getTile(30, GROUND - 1)).toBe(Tile.Sapling);
    expect(growDuePlants(world, entities, 300)).toEqual([[30, GROUND - 1]]);
    // A trunk from the sapling's tile up, with leaves on top.
    let trunk = 0;
    while (world.getTile(30, GROUND - 1 - trunk) === Tile.Wood) trunk++;
    expect(trunk).toBeGreaterThanOrEqual(TREE_TRUNK_MIN);
    expect(world.getTile(30, GROUND - 1 - trunk)).toBe(Tile.Leaves);
    expect(count(world, Tile.Leaves)).toBeGreaterThan(8);
    expect(entities.size).toBe(0); // the tile changed, so its entity went
  });

  it('grows only as tall as the room allows', () => {
    const { world, entities } = setup();
    plant(world, entities, Tile.Sapling, 30, 10);
    // Room for the shortest trunk and its canopy's middle, under a beam (it doesn't block the sky).
    world.setTile(30, GROUND - 7, Tile.Beam);
    expect(plantStatus(world, 30, GROUND - 1)).toBe('growing');
    expect(growDuePlants(world, entities, 50)).toHaveLength(1);
    expect(count(world, Tile.Wood)).toBe(TREE_TRUNK_MIN);
  });

  it("starts a plant's time again if it can't grow when it's due, instead of banking it", () => {
    const { world, entities } = setup();
    plant(world, entities, Tile.Sapling, 30, 10);
    world.setTile(30, GROUND - 5, Tile.Beam); // 3 tiles above the sapling: too low
    expect(plantStatus(world, 30, GROUND - 1)).toBe('noRoom');
    expect(growDuePlants(world, entities, 50, () => 0.5)).toEqual([]);
    expect(world.getTile(30, GROUND - 1)).toBe(Tile.Sapling);
    expect(entities.get(30, GROUND - 1)).toEqual({ kind: 'plant', growAt: 50 + plantGrowTime(0.5) });
    // Clearing the way doesn't make it spring up: it waits out its fresh time.
    world.setTile(30, GROUND - 5, Tile.Air);
    expect(plantStatus(world, 30, GROUND - 1)).toBe('growing');
    expect(growDuePlants(world, entities, 51)).toEqual([]);
    expect(growDuePlants(world, entities, 50 + plantGrowTime(0.5))).toHaveLength(1);
  });

  it('needs open sky above a sapling: a cave roof or a torch-lit room keeps it from growing', () => {
    const { world, entities } = setup();
    plant(world, entities, Tile.Sapling, 30, 10);
    // A roof high above, with plenty of room under it, and torches beside the sapling.
    for (let x = 0; x < 60; x++) world.setTile(x, 5, Tile.Stone);
    world.setTile(29, GROUND - 1, Tile.Torch);
    world.setTile(31, GROUND - 1, Tile.Torch);
    expect(openToSky(world, 30, GROUND - 1)).toBe(false);
    expect(plantStatus(world, 30, GROUND - 1)).toBe('noSky');
    expect(growDuePlants(world, entities, 10, () => 0)).toEqual([]);
    expect(entities.get(30, GROUND - 1)).toEqual({ kind: 'plant', growAt: 10 + PLANT_GROW_MIN });
    // A hole in the roof right over it lets the sky in.
    world.setTile(30, 5, Tile.Air);
    expect(openToSky(world, 30, GROUND - 1)).toBe(true);
    expect(growDuePlants(world, entities, 10 + PLANT_GROW_MIN)).toHaveLength(1);
  });

  it('grows mushroom spores in the dark', () => {
    const { world, entities } = setup(Tile.Mudstone);
    for (let x = 0; x < 60; x++) world.setTile(x, 5, Tile.Stone);
    plant(world, entities, Tile.MushroomSprout, 30, 5);
    expect(plantStatus(world, 30, GROUND - 1)).toBe('growing');
    expect(growDuePlants(world, entities, 5)).toHaveLength(1);
    expect(world.getTile(30, GROUND - 1)).toBe(Tile.MushroomStem);
  });

  it("starts a mushroom sprout's time again if its cap has no room", () => {
    const { world, entities } = setup(Tile.Mudstone);
    plant(world, entities, Tile.MushroomSprout, 30, 5);
    world.setTile(30, GROUND - 3, Tile.Stone); // a low ceiling
    expect(plantStatus(world, 30, GROUND - 1)).toBe('noRoom');
    expect(growDuePlants(world, entities, 5, () => 1)).toEqual([]);
    expect(entities.get(30, GROUND - 1)).toEqual({ kind: 'plant', growAt: 5 + PLANT_GROW_MAX });
  });

  it(`keeps ${PLANT_SPACING} clear tiles between trees, checking each sapling in turn`, () => {
    const { world, entities } = setup();
    // Two saplings due in the same check, two tiles apart: only the one due first grows.
    plant(world, entities, Tile.Sapling, 20, 6);
    plant(world, entities, Tile.Sapling, 22, 5);
    expect(growDuePlants(world, entities, 10, () => 0)).toEqual([[22, GROUND - 1]]);
    expect(world.getTile(20, GROUND - 1)).toBe(Tile.Sapling);
    expect(plantStatus(world, 20, GROUND - 1)).toBe('crowded');
    expect(entities.get(20, GROUND - 1)).toEqual({ kind: 'plant', growAt: 10 + PLANT_GROW_MIN });
    // Far enough apart, both grow.
    plant(world, entities, Tile.Sapling, 22 + PLANT_SPACING + 1, 10);
    plant(world, entities, Tile.Sapling, 22 + 2 * (PLANT_SPACING + 1), 10);
    expect(growDuePlants(world, entities, 10)).toHaveLength(2);
    // A stump counts as a trunk too, and so does one on a step down the hill.
    const hill = setup();
    hill.world.setTile(40, GROUND - 1, Tile.Wood);
    plant(hill.world, hill.entities, Tile.Sapling, 40 - PLANT_SPACING, 0);
    expect(plantStatus(hill.world, 40 - PLANT_SPACING, GROUND - 1)).toBe('crowded');
    hill.world.setTile(40, GROUND - 1, Tile.Air);
    hill.world.setTile(40, GROUND, Tile.Air);
    hill.world.setTile(40, GROUND + 1, Tile.Wood);
    expect(plantStatus(hill.world, 40 - PLANT_SPACING, GROUND - 1)).toBe('crowded');
    hill.world.setTile(40, GROUND + 1, Tile.Air);
    expect(plantStatus(hill.world, 40 - PLANT_SPACING, GROUND - 1)).toBe('growing');
  });

  it('says how a planted sapling or sprout is doing', () => {
    expect(plantStatusText(Tile.Sapling, 'growing')).toBe('Sapling: growing');
    expect(plantStatusText(Tile.Sapling, 'noSky')).toBe('Sapling: needs open sky above it to grow');
    expect(plantStatusText(Tile.Sapling, 'crowded')).toContain(`${PLANT_SPACING} clear tiles`);
    expect(plantStatusText(Tile.Sapling, 'noRoom')).toContain(`${TREE_TRUNK_MIN + 1} clear tiles`);
    expect(plantStatusText(Tile.Sapling, 'noGround')).toBe('Sapling: needs grass or dirt under it to grow');
    expect(plantStatusText(Tile.MushroomSprout, 'noRoom')).toContain('cap');
    const { world } = setup();
    expect(plantStatus(world, 30, GROUND - 1)).toBeNull(); // nothing planted
  });

  it('grows the same tree whenever it grows (from the world seed and its spot)', () => {
    const shape = (): number[] => {
      const { world, entities } = setup();
      plant(world, entities, Tile.Sapling, 30, 0);
      growDuePlants(world, entities, 1);
      return Array.from(world.chunks[0]).concat(Array.from(world.chunks[1]));
    };
    expect(shape()).toEqual(shape());
  });

  it('grows mushroom spores into a giant mushroom: a stem that gives wood under a cap', () => {
    const { world, entities } = setup(Tile.Mudstone);
    plant(world, entities, Tile.MushroomSprout, 30, 5);
    expect(growDuePlants(world, entities, 5)).toHaveLength(1);
    let stem = 0;
    while (world.getTile(30, GROUND - 1 - stem) === Tile.MushroomStem) stem++;
    expect(stem).toBeGreaterThanOrEqual(GIANT_MUSHROOM_STEM_MIN);
    expect(world.getTile(30, GROUND - 1 - stem)).toBe(Tile.MushroomCap);
    expect(count(world, Tile.MushroomCap)).toBeGreaterThanOrEqual(8);
    expect(tileDef(Tile.MushroomStem).drop).toBe('wood');
  });

  it("doesn't grow a giant mushroom without room for all of it", () => {
    const { world } = setup(Tile.Mudstone);
    world.setTile(30, GROUND - 3, Tile.Stone); // a low ceiling
    expect(growGiantMushroom(world, 30, GROUND - 1, createRng(1))).toBe(false);
    expect(count(world, Tile.MushroomStem)).toBe(0);
  });

  it('leaves a sapling whose ground was dug out alone', () => {
    const { world, entities } = setup();
    plant(world, entities, Tile.Sapling, 30, 0);
    world.setTile(30, GROUND, Tile.Stone);
    expect(plantStatus(world, 30, GROUND - 1)).toBe('noGround');
    expect(growDuePlants(world, entities, 1)).toEqual([]);
  });
});

describe('felling a giant mushroom', () => {
  it('brings down the stem above the cut and the whole cap, leaving the stump', () => {
    const { world, entities } = setup(Tile.Mudstone);
    plant(world, entities, Tile.MushroomSprout, 30, 0);
    growDuePlants(world, entities, 1);
    const caps = count(world, Tile.MushroomCap);
    const stems = count(world, Tile.MushroomStem);
    expect(isTrunk(Tile.MushroomStem)).toBe(true);
    world.setTile(30, GROUND - 2, Tile.Air); // the player cuts the second stem tile
    const felled = fellTreeAbove(world, 30, GROUND - 2, Tile.MushroomStem);
    expect(felled.filter((t) => t.tile === Tile.MushroomCap)).toHaveLength(caps);
    expect(felled.filter((t) => t.tile === Tile.MushroomStem)).toHaveLength(stems - 2);
    expect(world.getTile(30, GROUND - 1)).toBe(Tile.MushroomStem); // the stump
    expect(count(world, Tile.MushroomCap)).toBe(0);
  });
});

describe('seeds from felled plants', () => {
  it('leaves drop a sapling now and then, and mushroom caps spores', () => {
    expect(chanceDropFor(Tile.Leaves, 0)).toBe('sapling');
    expect(chanceDropFor(Tile.Leaves, SAPLING_CHANCE - 0.001)).toBe('sapling');
    expect(chanceDropFor(Tile.Leaves, SAPLING_CHANCE)).toBeNull();
    expect(chanceDropFor(Tile.MushroomCap, SPORE_CHANCE - 0.001)).toBe('mushroom_spores');
    expect(chanceDropFor(Tile.MushroomCap, 0.99)).toBeNull();
    expect(chanceDropFor(Tile.Stone, 0)).toBeNull();
  });
});

describe('saving plants', () => {
  it('saves when each plant grows, and loads only those still on a sapling or sprout', () => {
    const { world, entities } = setup();
    plant(world, entities, Tile.Sapling, 30, 412.5);
    const save = structuredClone(createSave(world, new Player(0, 0), new Inventory(), [], entities));
    expect(save.tileEntities).toEqual([{ tx: 30, ty: GROUND - 1, kind: 'plant', growAt: 412.5 }]);
    save.tileEntities!.push(
      { tx: 40, ty: GROUND - 1, kind: 'plant', growAt: 5 }, // nothing planted there
      { tx: 30, ty: GROUND - 1, kind: 'plant', growAt: Number.NaN },
    );
    const restored = restoreTileEntities(save, world);
    expect(restored.size).toBe(1);
    expect(restored.get(30, GROUND - 1)).toEqual({ kind: 'plant', growAt: 412.5 });
  });
});
