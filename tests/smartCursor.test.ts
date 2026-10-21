import { describe, expect, it } from 'vitest';
import { REACH, TILE_SIZE } from '../src/config';
import { Player } from '../src/entities/player';
import { checkMine } from '../src/systems/mining';
import { smartDigTarget, smartPlaceTarget, tilesAlongLine } from '../src/systems/smartCursor';
import { Tile, type TileId } from '../src/world/tiles';
import { World } from '../src/world/world';

const FLOOR = 20;

function fill(world: World, tx0: number, ty0: number, tx1: number, ty1: number, id: TileId): void {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) world.setTile(tx, ty, id);
}

/** Open air over a stone floor at row FLOOR, and a player standing on it in column 10 (body in rows 18 and 19). */
function setup(): { world: World; player: Player } {
  const world = new World(40, 40, 0);
  fill(world, 0, FLOOR, 39, 39, Tile.Stone);
  return { world, player: new Player(10, FLOOR - 1) };
}

/** The centre of tile (tx, ty) in world px, for pointing at it. */
const at = (tx: number, ty: number): [number, number] => [(tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE];
/** A point far to the player's right, level with their centre. */
const farRight = (player: Player): [number, number] => [player.centerX + 30 * TILE_SIZE, player.centerY];

describe('tilesAlongLine', () => {
  it('walks the tiles the line crosses, in order, on past the target to the length', () => {
    expect(tilesAlongLine(8, 8, 100, 8, 48)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(tilesAlongLine(8, 8, 20, 8, 48)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(tilesAlongLine(8, 8, -100, 8, 32)).toEqual([[0, 0], [-1, 0], [-2, 0]]);
    expect(tilesAlongLine(8, 8, 8, -100, 32)).toEqual([[0, 0], [0, -1], [0, -2]]);
    expect(tilesAlongLine(8, 8, 8, 8, 100)).toEqual([[0, 0]]);
  });

  it('never slips diagonally between two tiles, even through a corner', () => {
    // Exactly through tile corners: the tile below each corner comes first.
    expect(tilesAlongLine(8, 8, 40, 40, 40)).toEqual([[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]]);
    for (const [x1, y1] of [[90, 37], [-61, 140], [13, -200], [-77, -76]]) {
      const tiles = tilesAlongLine(21, 33, x1, y1, 200);
      for (let i = 1; i < tiles.length; i++) {
        expect(Math.abs(tiles[i][0] - tiles[i - 1][0]) + Math.abs(tiles[i][1] - tiles[i - 1][1])).toBe(1);
      }
      // ...and the line's own points are in the tiles walked.
      const keys = new Set(tiles.map(([tx, ty]) => `${tx},${ty}`));
      const length = Math.hypot(x1 - 21, y1 - 33);
      for (let d = 0; d <= 190; d += 5) {
        const x = 21 + ((x1 - 21) * d) / length;
        const y = 33 + ((y1 - 33) * d) / length;
        expect(keys.has(`${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`)).toBe(true);
      }
    }
  });
});

describe('smart cursor digging', () => {
  it('digs the nearest solid tile toward the pointer, skipping the air before it', () => {
    const { world, player } = setup();
    fill(world, 13, 0, 39, FLOOR - 1, Tile.Dirt); // a wall 2 tiles of air to the right
    expect(smartDigTarget(world, player, ...farRight(player))).toEqual([13, 19]);
    // Pointing at a tile deeper in the wall still digs the nearest one first.
    expect(smartDigTarget(world, player, ...at(15, 19))).toEqual([13, 19]);
    // Pointing a little down to the right digs the floor next to the player; steeply down, the
    // floor they stand on.
    expect(smartDigTarget(world, player, ...at(14, 21))).toEqual([11, FLOOR]);
    expect(smartDigTarget(world, player, ...at(12, 23))).toEqual([10, FLOOR]);
  });

  it('only digs within reach, and nothing toward open sky', () => {
    const { world, player } = setup();
    fill(world, 10 + REACH + 2, 0, 39, FLOOR - 1, Tile.Dirt); // a wall just out of reach
    expect(smartDigTarget(world, player, ...farRight(player))).toBeNull();
    expect(smartDigTarget(world, player, player.centerX + 40, player.centerY - 200)).toBeNull();
    // Off the edge of the world (out-of-bounds tiles read as bedrock): nothing.
    const edge = new World(12, 40, 0);
    fill(edge, 0, FLOOR, 11, 39, Tile.Stone);
    expect(smartDigTarget(edge, new Player(10, FLOOR - 1), ...farRight(player))).toBeNull();
  });

  it('stops at a tile that needs a better pickaxe, so the dig can say so', () => {
    const { world, player } = setup();
    fill(world, 12, 0, 39, FLOOR - 1, Tile.IronOre);
    expect(smartDigTarget(world, player, ...farRight(player))).toEqual([12, 19]);
    expect(checkMine(world, player, 12, 19, 0)).toBe('tier');
    fill(world, 12, 0, 39, FLOOR - 1, Tile.Bedrock);
    expect(smartDigTarget(world, player, ...farRight(player))).toEqual([12, 19]);
  });

  it('passes over ladders, torches and lava unless the pointer is on them', () => {
    const { world, player } = setup();
    fill(world, 13, 0, 39, FLOOR - 1, Tile.Dirt);
    world.setTile(11, 19, Tile.Torch);
    world.setTile(12, 19, Tile.Lava);
    expect(smartDigTarget(world, player, ...farRight(player))).toEqual([13, 19]);
    expect(smartDigTarget(world, player, ...at(11, 19))).toEqual([11, 19]);
    expect(smartDigTarget(world, player, ...at(12, 19))).toEqual([13, 19]); // lava can't be dug
    // Standing on a ladder and pointing down digs the floor, not the ladder.
    fill(world, 10, 15, 10, FLOOR - 1, Tile.Ladder);
    expect(smartDigTarget(world, player, ...at(10, 30))).toEqual([10, FLOOR]);
    expect(smartDigTarget(world, player, ...at(10, 19))).toEqual([10, 19]);
  });

  it('passes over a rope beside the player unless the pointer is on it', () => {
    const { world, player } = setup();
    // A rope hanging right beside the player, in front of a dirt wall.
    fill(world, 11, 10, 11, FLOOR - 1, Tile.Rope);
    fill(world, 12, 0, 39, FLOOR - 1, Tile.Dirt);
    expect(smartDigTarget(world, player, ...farRight(player))).toEqual([12, 19]);
    expect(smartDigTarget(world, player, ...at(13, 18))).toEqual([12, 18]);
    expect(smartDigTarget(world, player, ...at(11, 19))).toEqual([11, 19]);
  });
});

describe('smart cursor placing', () => {
  it('places in the nearest spot toward the pointer where the block can go', () => {
    const { world, player } = setup();
    // Pointing up into open air: nothing holds a block up that way.
    expect(smartPlaceTarget(world, player, ...at(14, 10), Tile.Dirt)).toBeNull();
    expect(smartPlaceTarget(world, player, ...farRight(player), Tile.Dirt)).toEqual([11, 19]);
    world.setTile(11, 19, Tile.Dirt);
    // The next one extends the row (the block just placed doesn't block the line).
    expect(smartPlaceTarget(world, player, ...farRight(player), Tile.Dirt)).toEqual([12, 19]);
    // Pointing at a spot further along places next to the row, not out at the pointer.
    expect(smartPlaceTarget(world, player, ...at(15, 19), Tile.Dirt)).toEqual([12, 19]);
    // Now a block up that way rests on the one placed.
    expect(smartPlaceTarget(world, player, ...at(14, 10), Tile.Dirt)).toEqual([11, 18]);
  });

  it('only places within reach', () => {
    // A pit beside the player with a pillar across it just out of reach: the only spot that
    // holds a block is beside the pillar, too far away.
    const pit = setup();
    fill(pit.world, 11, FLOOR, 10 + REACH + 1, 39, Tile.Air);
    fill(pit.world, 10 + REACH + 2, 0, 10 + REACH + 2, 39, Tile.Stone);
    expect(smartPlaceTarget(pit.world, pit.player, ...farRight(pit.player), Tile.Dirt)).toBeNull();
  });

  it("passes over the spots the player stands in, unless pointed at", () => {
    const { world, player } = setup();
    expect(smartPlaceTarget(world, player, ...farRight(player), Tile.Torch)).toEqual([11, 19]);
    // Straight down: the player's own spot, then the floor blocks the line.
    expect(smartPlaceTarget(world, player, ...at(10, 25), Tile.Torch)).toBeNull();
    expect(smartPlaceTarget(world, player, ...at(10, 19), Tile.Torch)).toEqual([10, 19]);
  });
});
