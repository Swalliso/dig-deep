import {
  GIANT_MUSHROOM_STEM_MAX,
  GIANT_MUSHROOM_STEM_MIN,
  PLANT_GROW_MAX,
  PLANT_GROW_MIN,
  PLANT_SPACING,
  TREE_LEAF_RAGGEDNESS,
  TREE_TRUNK_MAX,
  TREE_TRUNK_MIN,
} from '../config';
import { createRng, randInt, type Rng } from '../util/rng';
import { blocksSky } from './lighting';
import type { PlantData, TileEntities } from './tileEntities';
import { Tile, tileDef, type TileId } from './tiles';
import { isTrunk } from './trees';
import type { World } from './world';

// Renewable wood (Phase 14a): a planted sapling grows into a tree and mushroom spores into a giant
// mushroom, some minutes of play later (on the session clock). Strata generation grows the Fungal
// Hollows' giant mushrooms with the same code. No farming system: plant it, wait, fell it.
//
// When its time comes a plant grows if it can (see plantStatus): a sapling needs open sky, room
// above it and no other trunk within PLANT_SPACING columns; spores only need room for the whole
// mushroom, dark or not. If it can't, its timer starts again from scratch, so a plant never banks
// its time to spring up the moment a neighbour is felled.

/**
 * How a planted sapling or sprout stands: it will grow when its time comes ('growing'), or it
 * can't yet, because its ground is gone, it has no open sky above it (saplings only), another
 * trunk is too close (saplings only) or there's no room for what it grows into.
 */
export type PlantStatus = 'growing' | 'noGround' | 'noSky' | 'crowded' | 'noRoom';

/** Can `tile` be planted on `ground`? (Only saplings and sprouts have a rule; anything else can.) */
export function canPlantOn(tile: TileId, ground: TileId): boolean {
  const plant = tileDef(tile).plant;
  return !plant || plant.on.includes(ground);
}

/** Seconds a fresh plant takes to grow, for `r` in 0..1. */
export function plantGrowTime(r: number): number {
  return PLANT_GROW_MIN + r * (PLANT_GROW_MAX - PLANT_GROW_MIN);
}

/** How the sapling or sprout at (tx, ty) stands (see PlantStatus), or null if there isn't one. */
export function plantStatus(world: World, tx: number, ty: number): PlantStatus | null {
  const plant = tileDef(world.getTile(tx, ty)).plant;
  if (!plant) return null;
  if (!plant.on.includes(world.getTile(tx, ty + 1))) return 'noGround';
  if (plant.grows === 'giantMushroom') return giantMushroomFit(world, tx, ty, plantRng(world, tx, ty)) ? 'growing' : 'noRoom';
  if (!openToSky(world, tx, ty)) return 'noSky';
  if (crowded(world, tx, ty)) return 'crowded';
  return treeFits(world, tx, ty) ? 'growing' : 'noRoom';
}

/** What the cursor says over a planted sapling or sprout (`tile`) that stands as `status`. */
export function plantStatusText(tile: TileId, status: PlantStatus): string {
  const def = tileDef(tile);
  const name = def.name;
  switch (status) {
    case 'growing':
      return `${name}: growing`;
    case 'noGround':
      return `${name}: needs ${(def.plant?.on ?? []).map((t) => tileDef(t).name.toLowerCase()).join(' or ')} under it to grow`;
    case 'noSky':
      return `${name}: needs open sky above it to grow`;
    case 'crowded':
      return `${name}: too close to another tree to grow (needs ${PLANT_SPACING} clear tiles each side)`;
    case 'noRoom':
      return def.plant?.grows === 'tree' ? `${name}: no room above it to grow (needs ${TREE_TRUNK_MIN + 1} clear tiles)` : `${name}: no room to grow (its cap needs open air)`;
  }
}

/** Is the column above (tx, ty) open to the sky (so the tile gets sky light)? */
export function openToSky(world: World, tx: number, ty: number): boolean {
  for (let y = ty - 1; y >= 0; y--) if (blocksSky(world.getTile(tx, y))) return false;
  return true;
}

/**
 * Is there a trunk (a tree's, a stump, a giant mushroom's stem) within PLANT_SPACING columns of a
 * sapling at (tx, ty), from PLANT_SPACING rows below it up to the top of the tallest trunk it
 * could grow?
 */
function crowded(world: World, tx: number, ty: number): boolean {
  for (let y = ty - TREE_TRUNK_MAX; y <= ty + PLANT_SPACING; y++) {
    for (let x = tx - PLANT_SPACING; x <= tx + PLANT_SPACING; x++) if (isTrunk(world.getTile(x, y))) return true;
  }
  return false;
}

/** The random numbers a plant at (tx, ty) grows with: from the world seed and its spot, so it's the same whenever it grows. */
function plantRng(world: World, tx: number, ty: number): Rng {
  return createRng((world.seed ^ Math.imul(ty * world.width + tx + 1, 0x9e3779b9)) >>> 0);
}

/** Air straight up from (tx, ty - 1): how many open tiles, counting at most `max`. */
function headroom(world: World, tx: number, ty: number, max: number): number {
  let room = 0;
  while (room < max && world.getTile(tx, ty - 1 - room) === Tile.Air) room++;
  return room;
}

/** Is there room for a tree from (tx, ty): its shortest trunk and the middle of its canopy (see growTree)? */
function treeFits(world: World, tx: number, ty: number): boolean {
  return headroom(world, tx, ty, TREE_TRUNK_MIN + 1) === TREE_TRUNK_MIN + 1;
}

/**
 * Grow a tree whose trunk starts at (tx, ty) (a sapling's tile), shaped like the generated ones:
 * a trunk of TREE_TRUNK_MIN..TREE_TRUNK_MAX tiles with a round, ragged blob of leaves on top.
 * The trunk needs open air up its column and two more rows for the middle of the canopy; with
 * less room than its random height it grows shorter, and with less than the shortest trunk it
 * doesn't grow. Leaves only fill open air. Returns whether it grew.
 */
export function growTree(world: World, tx: number, ty: number, rng: Rng): boolean {
  const want = randInt(rng, TREE_TRUNK_MIN, TREE_TRUNK_MAX);
  const trunk = Math.min(want, headroom(world, tx, ty, want + 1) - 1);
  if (trunk < TREE_TRUNK_MIN) return false;
  for (let i = 0; i < trunk; i++) world.setTile(tx, ty - i, Tile.Wood);
  const cy = ty - trunk;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > 5) continue;
      if (d2 >= 4 && rng() < TREE_LEAF_RAGGEDNESS) continue;
      if (world.getTile(tx + dx, cy + dy) === Tile.Air) world.setTile(tx + dx, cy + dy, Tile.Leaves);
    }
  }
  return true;
}

/** The cap tiles of a giant mushroom whose cap's wide bottom row is at `bottom`, `r` tiles to each side. */
function capTiles(tx: number, bottom: number, r: number): [number, number][] {
  const tiles: [number, number][] = [];
  for (let x = tx - r; x <= tx + r; x++) tiles.push([x, bottom]);
  for (let x = tx - r + 1; x <= tx + r - 1; x++) tiles.push([x, bottom - 1]);
  if (r >= 3) for (let x = tx - 1; x <= tx + 1; x++) tiles.push([x, bottom - 2]);
  return tiles;
}

/**
 * Where a giant mushroom from (tx, ty) fits, with the random numbers `rng` gives it: a stem of
 * GIANT_MUSHROOM_STEM_MIN..MAX tiles (shorter to fit) under a cap 2 or 3 tiles to each side, all
 * of it in open air. Null if even the shortest stem doesn't fit.
 */
function giantMushroomFit(world: World, tx: number, ty: number, rng: Rng): { stem: number; cap: [number, number][] } | null {
  const want = randInt(rng, GIANT_MUSHROOM_STEM_MIN, GIANT_MUSHROOM_STEM_MAX);
  const r = randInt(rng, 2, 3);
  const open = (x: number, y: number): boolean => world.getTile(x, y) === Tile.Air;
  for (let stem = want; stem >= GIANT_MUSHROOM_STEM_MIN; stem--) {
    if (headroom(world, tx, ty, stem - 1) < stem - 1) continue;
    const cap = capTiles(tx, ty - stem, r);
    if (cap.every(([x, y]) => open(x, y))) return { stem, cap };
  }
  return null;
}

/**
 * Grow a giant mushroom whose stem starts at (tx, ty) (a sprout's tile, or an open floor spot in
 * generation): a stem of GIANT_MUSHROOM_STEM_MIN..MAX tiles under a domed cap 5 or 7 tiles wide.
 * Everything it covers must be open air (it grows a shorter stem to fit); if even the shortest
 * doesn't fit, it doesn't grow. Returns whether it grew.
 */
export function growGiantMushroom(world: World, tx: number, ty: number, rng: Rng): boolean {
  const fit = giantMushroomFit(world, tx, ty, rng);
  if (!fit) return false;
  for (let i = 0; i < fit.stem; i++) world.setTile(tx, ty - i, Tile.MushroomStem);
  for (const [x, y] of fit.cap) world.setTile(x, y, Tile.MushroomCap);
  return true;
}

/** Grow the sapling or sprout at (tx, ty) if it can now (see plantStatus). Returns whether it grew. */
export function growPlant(world: World, tx: number, ty: number): boolean {
  if (plantStatus(world, tx, ty) !== 'growing') return false;
  const rng = plantRng(world, tx, ty);
  return tileDef(world.getTile(tx, ty)).plant!.grows === 'tree' ? growTree(world, tx, ty, rng) : growGiantMushroom(world, tx, ty, rng);
}

/**
 * Every plant whose time has come (session clock `now`) grows if it can, one at a time, longest
 * due first, so each one sees the trees grown before it in the same pass. One that can't starts
 * its timer again with a fresh grow time (from `random`). A grown plant's tile changes, which
 * removes its entity. Each plant's shape comes from the world seed and its position, so it's the
 * same whenever it grows. Returns the plants that grew.
 */
export function growDuePlants(world: World, entities: TileEntities, now: number, random: () => number = Math.random): [number, number][] {
  const due: { tx: number; ty: number; plant: PlantData }[] = [];
  entities.forEach((tx, ty, entity) => {
    if (entity.kind === 'plant' && entity.growAt <= now) due.push({ tx, ty, plant: entity });
  });
  due.sort((a, b) => a.plant.growAt - b.plant.growAt || a.ty - b.ty || a.tx - b.tx);
  const grown: [number, number][] = [];
  for (const { tx, ty, plant } of due) {
    if (growPlant(world, tx, ty)) grown.push([tx, ty]);
    else plant.growAt = now + plantGrowTime(random());
  }
  return grown;
}

/** The entity for a freshly planted sapling or sprout: it grows `growTime` seconds after `now`. */
export function newPlant(now: number, growTime: number): PlantData {
  return { kind: 'plant', growAt: now + growTime };
}
