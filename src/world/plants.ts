import {
  GIANT_MUSHROOM_STEM_MAX,
  GIANT_MUSHROOM_STEM_MIN,
  PLANT_GROW_MAX,
  PLANT_GROW_MIN,
  TREE_LEAF_RAGGEDNESS,
  TREE_TRUNK_MAX,
  TREE_TRUNK_MIN,
} from '../config';
import { createRng, randInt, type Rng } from '../util/rng';
import type { PlantData, TileEntities } from './tileEntities';
import { Tile, tileDef, type TileId } from './tiles';
import type { World } from './world';

// Renewable wood (Phase 14a): a planted sapling grows into a tree and mushroom spores into a giant
// mushroom, some minutes of play later (on the session clock), once there's room. Strata
// generation grows the Fungal Hollows' giant mushrooms with the same code. No farming system:
// plant it, wait, fell it.

/** Can `tile` be planted on `ground`? (Only saplings and sprouts have a rule; anything else can.) */
export function canPlantOn(tile: TileId, ground: TileId): boolean {
  const plant = tileDef(tile).plant;
  return !plant || plant.on.includes(ground);
}

/** Seconds a fresh plant takes to grow, for `r` in 0..1. */
export function plantGrowTime(r: number): number {
  return PLANT_GROW_MIN + r * (PLANT_GROW_MAX - PLANT_GROW_MIN);
}

/** Air straight up from (tx, ty - 1): how many open tiles, counting at most `max`. */
function headroom(world: World, tx: number, ty: number, max: number): number {
  let room = 0;
  while (room < max && world.getTile(tx, ty - 1 - room) === Tile.Air) room++;
  return room;
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
 * Grow a giant mushroom whose stem starts at (tx, ty) (a sprout's tile, or an open floor spot in
 * generation): a stem of GIANT_MUSHROOM_STEM_MIN..MAX tiles under a domed cap 5 or 7 tiles wide.
 * Everything it covers must be open air (it grows a shorter stem to fit); if even the shortest
 * doesn't fit, it doesn't grow. Returns whether it grew.
 */
export function growGiantMushroom(world: World, tx: number, ty: number, rng: Rng): boolean {
  const want = randInt(rng, GIANT_MUSHROOM_STEM_MIN, GIANT_MUSHROOM_STEM_MAX);
  const r = randInt(rng, 2, 3);
  const open = (x: number, y: number): boolean => world.getTile(x, y) === Tile.Air;
  for (let stem = want; stem >= GIANT_MUSHROOM_STEM_MIN; stem--) {
    if (headroom(world, tx, ty, stem - 1) < stem - 1) continue;
    const cap = capTiles(tx, ty - stem, r);
    if (!cap.every(([x, y]) => open(x, y))) continue;
    for (let i = 0; i < stem; i++) world.setTile(tx, ty - i, Tile.MushroomStem);
    for (const [x, y] of cap) world.setTile(x, y, Tile.MushroomCap);
    return true;
  }
  return false;
}

/** Grow the sapling or sprout at (tx, ty), if there's room. Returns whether it grew. */
export function growPlant(world: World, tx: number, ty: number, rng: Rng): boolean {
  const plant = tileDef(world.getTile(tx, ty)).plant;
  if (!plant || !plant.on.includes(world.getTile(tx, ty + 1))) return false;
  return plant.grows === 'tree' ? growTree(world, tx, ty, rng) : growGiantMushroom(world, tx, ty, rng);
}

/**
 * Grow every plant whose time has come (session clock `now`) and that has room; the rest wait for
 * the next check. A grown plant's tile changes, which removes its entity. Each plant's shape
 * comes from the world seed and its position, so it's the same whenever it grows. Returns the
 * plants that grew.
 */
export function growDuePlants(world: World, entities: TileEntities, now: number): [number, number][] {
  const due: [number, number][] = [];
  entities.forEach((tx, ty, entity) => {
    if (entity.kind === 'plant' && entity.growAt <= now) due.push([tx, ty]);
  });
  return due.filter(([tx, ty]) => growPlant(world, tx, ty, createRng((world.seed ^ Math.imul(ty * world.width + tx + 1, 0x9e3779b9)) >>> 0)));
}

/** The entity for a freshly planted sapling or sprout: it grows `growTime` seconds after `now`. */
export function newPlant(now: number, growTime: number): PlantData {
  return { kind: 'plant', growAt: now + growTime };
}
