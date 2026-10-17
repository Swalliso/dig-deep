import { describe, expect, it } from 'vitest';
import { BEAM_MAX_HEIGHT, GRAVEL_WARN_TIME, HURT_PROTECTION, SPAN_MAX, TILE_SIZE, TILE_UPDATE_BUDGET } from '../src/config';
import { CaveIns, gravelDamage, type CaveInHooks, type SavedCaveIns } from '../src/systems/caveIns';
import { Health } from '../src/systems/health';
import { columnHeld, holdsLoose, postAnchored, spanAnchored, supportEffect, worldGetter } from '../src/world/supports';
import { SUPPORT_REACH } from '../src/config';
import { Tile, type TileId } from '../src/world/tiles';
import { TileUpdates } from '../src/world/tileUpdates';
import { World } from '../src/world/world';

const DT = 1 / 60;
const FLOOR = 30; // rows FLOOR.. are stone

/** A 40 x 40 world: air above row FLOOR, stone from it down. */
function makeWorld(): World {
  const world = new World(40, 40, 1);
  for (let ty = FLOOR; ty < 40; ty++) for (let tx = 0; tx < 40; tx++) world.setTile(tx, ty, Tile.Stone);
  return world;
}

function count(world: World, id: TileId): number {
  let n = 0;
  for (let ty = 0; ty < world.height; ty++) for (let tx = 0; tx < world.width; tx++) if (world.getTile(tx, ty) === id) n++;
  return n;
}

interface Log {
  warned: [number, number][];
  landed: [number, number][];
  bursts: { onPlayer: boolean; fell: number }[];
  broke: [number, number][];
}

/** A world with cave-ins, a fake player box and a step runner. */
function setup(options: { enabled?: boolean; world?: World; saved?: SavedCaveIns; player?: { x: number; y: number } } = {}) {
  const world = options.world ?? makeWorld();
  const updates = new TileUpdates(world);
  const caveIns = new CaveIns(world, updates, options.enabled ?? true, options.saved);
  const log: Log = { warned: [], landed: [], bursts: [], broke: [] };
  const player = options.player ?? null;
  let time = 0;
  const hooks: CaveInHooks = {
    touchesPlayer: (x, y) => !!player && x < player.x + 12 && x + TILE_SIZE > player.x && y < player.y + 28 && y + TILE_SIZE > player.y,
    burst: (_block, onPlayer, fell) => log.bursts.push({ onPlayer, fell }),
    landed: (tx, ty) => log.landed.push([tx, ty]),
    warned: (tx, ty) => log.warned.push([tx, ty]),
    beamBroke: (tx, ty) => log.broke.push([tx, ty]),
  };
  const run = (seconds: number, budget = TILE_UPDATE_BUDGET): void => {
    for (let t = 0; t < seconds; t += DT) {
      time += DT;
      caveIns.update(DT, time, budget, hooks);
    }
  };
  return { world, updates, caveIns, log, run, hooks, now: () => time };
}

describe('supports', () => {
  it('a beam standing on firm ground holds the tile above it', () => {
    const world = makeWorld();
    world.setTile(5, FLOOR - 1, Tile.Beam);
    expect(postAnchored(worldGetter(world), 5, FLOOR - 1)).toBe(true);
    expect(holdsLoose(worldGetter(world), 5, FLOOR - 1)).toBe(true);
  });

  it('a beam column up to BEAM_MAX_HEIGHT tall holds; one taller does not', () => {
    const world = makeWorld();
    for (let i = 1; i <= BEAM_MAX_HEIGHT; i++) world.setTile(5, FLOOR - i, Tile.Beam);
    expect(postAnchored(worldGetter(world), 5, FLOOR - BEAM_MAX_HEIGHT)).toBe(true);
    world.setTile(5, FLOOR - BEAM_MAX_HEIGHT - 1, Tile.Beam);
    expect(postAnchored(worldGetter(world), 5, FLOOR - BEAM_MAX_HEIGHT - 1)).toBe(false);
  });

  it('a floating beam holds nothing; one on gravel that rests on the ground does', () => {
    const world = makeWorld();
    world.setTile(5, 10, Tile.Beam);
    expect(postAnchored(worldGetter(world), 5, 10)).toBe(false);
    world.setTile(8, FLOOR - 1, Tile.Gravel);
    world.setTile(8, FLOOR - 2, Tile.Beam);
    expect(postAnchored(worldGetter(world), 8, FLOOR - 2)).toBe(true);
  });

  it(`a crossbeam holds up to ${SPAN_MAX} tiles from where its row rests`, () => {
    const world = makeWorld();
    const row = FLOOR - 4;
    // A beam post at x = 10 (3 tall) under a crossbeam row from x = 10 to 10 + SPAN_MAX + 1.
    for (let y = row + 1; y < FLOOR; y++) world.setTile(10, y, Tile.Beam);
    for (let x = 10; x <= 10 + SPAN_MAX + 1; x++) world.setTile(x, row, Tile.Crossbeam);
    const get = worldGetter(world);
    for (let d = 0; d <= SPAN_MAX; d++) expect(spanAnchored(get, 10 + d, row)).toBe(true);
    expect(spanAnchored(get, 10 + SPAN_MAX + 1, row)).toBe(false);
  });

  it('a crossbeam row between two walls holds all the way across, up to the span from each wall', () => {
    const world = makeWorld();
    const row = 20;
    const width = 2 * SPAN_MAX + 2; // the widest gap that's held all the way across
    world.setTile(0 + 1, row, Tile.Stone);
    world.setTile(2 + width, row, Tile.Stone);
    for (let x = 2; x < 2 + width; x++) world.setTile(x, row, Tile.Crossbeam);
    const get = worldGetter(world);
    for (let x = 2; x < 2 + width; x++) expect(spanAnchored(get, x, row)).toBe(true);
    // One wider and the middle tile is too far from both walls.
    const wide = makeWorld();
    wide.setTile(1, row, Tile.Stone);
    wide.setTile(3 + width, row, Tile.Stone);
    for (let x = 2; x < 3 + width; x++) wide.setTile(x, row, Tile.Crossbeam);
    const held = [];
    for (let x = 2; x < 3 + width; x++) held.push(spanAnchored(worldGetter(wide), x, row));
    expect(held.filter((h) => !h)).toHaveLength(1);
  });

  it(`the top of a beam holds gravel diagonally above it, ${SUPPORT_REACH} to each side; a block does not`, () => {
    const world = makeWorld();
    for (let y = FLOOR - 3; y < FLOOR; y++) world.setTile(10, y, Tile.Beam); // top at FLOOR - 3
    const row = FLOOR - 4;
    for (let x = 10 - SUPPORT_REACH - 1; x <= 10 + SUPPORT_REACH + 1; x++) world.setTile(x, row, Tile.Gravel);
    const get = worldGetter(world);
    for (let x = 10 - SUPPORT_REACH; x <= 10 + SUPPORT_REACH; x++) expect(columnHeld(get, x, row)).toBe(true);
    expect(columnHeld(get, 10 - SUPPORT_REACH - 1, row)).toBe(false);
    expect(columnHeld(get, 10 + SUPPORT_REACH + 1, row)).toBe(false);
    // Only from the top of the post: gravel beside it, diagonally above a beam lower down, isn't held.
    world.setTile(11, FLOOR - 3, Tile.Gravel);
    expect(columnHeld(worldGetter(world), 11, FLOOR - 3)).toBe(false);
    // A stone block in place of the beam holds only its own column.
    const blocks = makeWorld();
    blocks.setTile(10, FLOOR - 1, Tile.Stone);
    blocks.setTile(10, FLOOR - 2, Tile.Gravel);
    blocks.setTile(11, FLOOR - 2, Tile.Gravel);
    expect(columnHeld(worldGetter(blocks), 10, FLOOR - 2)).toBe(true);
    expect(columnHeld(worldGetter(blocks), 11, FLOOR - 2)).toBe(false);
  });

  it('a crossbeam row pinned under solid rock is anchored, and holds one past each end diagonally', () => {
    const world = makeWorld();
    const row = 15;
    // Stone above x = 8 only; a crossbeam row from 8 to 11 under it, gravel above 9..12.
    world.setTile(8, row - 1, Tile.Stone);
    for (let x = 8; x <= 11; x++) world.setTile(x, row, Tile.Crossbeam);
    for (let x = 9; x <= 13; x++) world.setTile(x, row - 1, Tile.Gravel);
    const get = worldGetter(world);
    expect(spanAnchored(get, 11, row)).toBe(true);
    for (let x = 9; x <= 11 + SUPPORT_REACH; x++) expect(columnHeld(get, x, row - 1)).toBe(true);
    expect(columnHeld(get, 11 + SUPPORT_REACH + 1, row - 1)).toBe(false);
    // Without the rock it's just a floating row.
    world.setTile(8, row - 1, Tile.Air);
    expect(spanAnchored(worldGetter(world), 11, row)).toBe(false);
  });

  it('a crossbeam row beside the top of a standing beam is anchored (a T)', () => {
    const world = makeWorld();
    for (let y = FLOOR - 3; y < FLOOR; y++) world.setTile(10, y, Tile.Beam);
    // Like a wall: the tile next to the beam rests there, and SPAN_MAX more tiles hang from it.
    for (let x = 11; x <= 12 + SPAN_MAX; x++) world.setTile(x, FLOOR - 3, Tile.Crossbeam);
    const get = worldGetter(world);
    for (let x = 11; x <= 11 + SPAN_MAX; x++) expect(spanAnchored(get, x, FLOOR - 3)).toBe(true);
    expect(spanAnchored(get, 12 + SPAN_MAX, FLOOR - 3)).toBe(false);
  });

  it('platforms count as spans; ladders, torches and air hold nothing', () => {
    const world = makeWorld();
    world.setTile(4, FLOOR - 1, Tile.Platform);
    world.setTile(5, FLOOR - 1, Tile.Ladder);
    world.setTile(6, FLOOR - 1, Tile.Torch);
    const get = worldGetter(world);
    expect(holdsLoose(get, 4, FLOOR - 1)).toBe(true);
    expect(holdsLoose(get, 5, FLOOR - 1)).toBe(false);
    expect(holdsLoose(get, 6, FLOOR - 1)).toBe(false);
    expect(holdsLoose(get, 7, FLOOR - 1)).toBe(false);
  });

  it('gravel resting on gravel is held through the bottom of its column', () => {
    const world = makeWorld();
    for (let y = FLOOR - 3; y < FLOOR; y++) world.setTile(5, y, Tile.Gravel);
    expect(columnHeld(worldGetter(world), 5, FLOOR - 3)).toBe(true);
    for (let y = 10; y < 13; y++) world.setTile(8, y, Tile.Gravel);
    expect(columnHeld(worldGetter(world), 8, 10)).toBe(false);
  });

  it('the preview shows what a support would hold, and the warning what removing one would drop', () => {
    const world = makeWorld();
    // Gravel hanging two tiles above the floor's... a 2-tall gravel column with air under it.
    world.setTile(5, FLOOR - 4, Tile.Gravel);
    world.setTile(5, FLOOR - 3, Tile.Gravel);
    // A beam at (5, FLOOR - 1) wouldn't reach it; at (5, FLOOR - 2) on top of another beam it would.
    world.setTile(5, FLOOR - 1, Tile.Beam);
    const effect = supportEffect(world, 5, FLOOR - 2, Tile.Beam);
    expect(effect.stabilized).toEqual([
      [5, FLOOR - 3],
      [5, FLOOR - 4],
    ]);
    world.setTile(5, FLOOR - 2, Tile.Beam);
    expect(supportEffect(world, 5, FLOOR - 1, Tile.Air).endangered).toHaveLength(2);
    expect(supportEffect(world, 5, FLOOR - 2, Tile.Air).endangered).toHaveLength(2);
    // A beam elsewhere isn't load-bearing.
    world.setTile(15, FLOOR - 1, Tile.Beam);
    expect(supportEffect(world, 15, FLOOR - 1, Tile.Air).endangered).toHaveLength(0);
  });
});

describe('falling gravel', () => {
  it('gravel nobody disturbs stays put, even hanging in the air', () => {
    const { world, run, caveIns } = setup();
    world.setTile(5, 10, Tile.Gravel); // placing it is a change, so this one does shake...
    run(0.1);
    expect(caveIns.warnings.size).toBe(1);
    // ...but gravel that was there before the cave-in system started (like generated ceilings) waits.
    const generated = makeWorld();
    generated.setTile(5, 10, Tile.Gravel);
    const g = setup({ world: generated });
    g.run(2);
    expect(generated.getTile(5, 10)).toBe(Tile.Gravel);
    expect(g.caveIns.warnings.size).toBe(0);
  });

  it('mining under gravel makes it shake for GRAVEL_WARN_TIME, then fall and land as gravel', () => {
    const world = makeWorld();
    world.setTile(5, FLOOR - 3, Tile.Stone);
    world.setTile(5, FLOOR - 4, Tile.Gravel);
    const { run, caveIns, log } = setup({ world });
    world.setTile(5, FLOOR - 3, Tile.Air); // mined out from under it
    run(GRAVEL_WARN_TIME - 0.05);
    expect(caveIns.isWarning(5, FLOOR - 4)).toBe(true);
    expect(world.getTile(5, FLOOR - 4)).toBe(Tile.Gravel);
    expect(log.warned).toEqual([[5, FLOOR - 4]]);
    run(0.1);
    expect(world.getTile(5, FLOOR - 4)).toBe(Tile.Air);
    expect(caveIns.falling).toHaveLength(1);
    run(2);
    expect(caveIns.falling).toHaveLength(0);
    expect(world.getTile(5, FLOOR - 1)).toBe(Tile.Gravel);
    expect(log.landed).toEqual([[5, FLOOR - 1]]);
    expect(count(world, Tile.Gravel)).toBe(1);
  });

  it('a whole column falls together and stacks up again', () => {
    const world = makeWorld();
    for (let y = 5; y < 10; y++) world.setTile(7, y, Tile.Gravel);
    world.setTile(7, 10, Tile.Stone);
    const { run, log } = setup({ world });
    world.setTile(7, 10, Tile.Air);
    run(4);
    for (let y = FLOOR - 5; y < FLOOR; y++) expect(world.getTile(7, y)).toBe(Tile.Gravel);
    expect(count(world, Tile.Gravel)).toBe(5);
    expect(log.warned).toHaveLength(1);
  });

  it('a beam placed under shaking gravel stops it falling', () => {
    const world = makeWorld();
    world.setTile(5, FLOOR - 2, Tile.Gravel);
    world.setTile(5, FLOOR - 1, Tile.Stone);
    const { run, caveIns } = setup({ world });
    world.setTile(5, FLOOR - 1, Tile.Air);
    run(GRAVEL_WARN_TIME / 2);
    expect(caveIns.isWarning(5, FLOOR - 2)).toBe(true);
    world.setTile(5, FLOOR - 1, Tile.Beam);
    run(1);
    expect(caveIns.warnings.size).toBe(0);
    expect(world.getTile(5, FLOOR - 2)).toBe(Tile.Gravel);
  });

  it('removing the bottom of a load-bearing beam breaks the beams above it and brings the gravel down', () => {
    const world = makeWorld();
    for (let y = FLOOR - 3; y < FLOOR; y++) world.setTile(5, y, Tile.Beam);
    world.setTile(5, FLOOR - 4, Tile.Gravel);
    const { run, log } = setup({ world });
    run(1);
    expect(world.getTile(5, FLOOR - 4)).toBe(Tile.Gravel);
    world.setTile(5, FLOOR - 1, Tile.Air); // the bottom of the post
    run(DT);
    // The two beams left lost their footing and broke at once, like a felled tree.
    expect(log.broke).toEqual([
      [5, FLOOR - 2],
      [5, FLOOR - 3],
    ]);
    run(3);
    expect(world.getTile(5, FLOOR - 4)).toBe(Tile.Air);
    expect(world.getTile(5, FLOOR - 1)).toBe(Tile.Gravel);
  });

  it('beams break without footing in Cozy worlds too, but a beam on the ground stays', () => {
    const world = makeWorld();
    for (let y = FLOOR - 3; y < FLOOR; y++) world.setTile(5, y, Tile.Beam);
    world.setTile(9, FLOOR - 1, Tile.Beam);
    const { run, log } = setup({ world, enabled: false });
    world.setTile(5, FLOOR - 1, Tile.Air);
    world.setTile(10, FLOOR - 1, Tile.Stone); // a change next to the other beam
    run(0.1);
    expect(log.broke).toHaveLength(2);
    expect(world.getTile(9, FLOOR - 1)).toBe(Tile.Beam);
  });

  it('removing a beam drops the gravel it held diagonally', () => {
    const world = makeWorld();
    world.setTile(10, FLOOR - 1, Tile.Beam);
    world.setTile(11, FLOOR - 2, Tile.Gravel); // diagonally above the beam's top, air under it
    const { run } = setup({ world });
    run(1);
    expect(world.getTile(11, FLOOR - 2)).toBe(Tile.Gravel);
    world.setTile(10, FLOOR - 1, Tile.Air);
    run(2);
    expect(world.getTile(11, FLOOR - 2)).toBe(Tile.Air);
    expect(world.getTile(11, FLOOR - 1)).toBe(Tile.Gravel);
  });

  it('removing a wall under a crossbeam row drops what the row held', () => {
    const world = makeWorld();
    const row = FLOOR - 3;
    world.setTile(3, row, Tile.Stone);
    for (let x = 4; x <= 6; x++) {
      world.setTile(x, row, Tile.Crossbeam);
      world.setTile(x, row - 1, Tile.Gravel);
    }
    const { run } = setup({ world });
    run(1);
    expect(count(world, Tile.Gravel)).toBe(3);
    world.setTile(3, row, Tile.Air);
    run(4);
    for (let x = 4; x <= 6; x++) expect(world.getTile(x, row - 1)).toBe(Tile.Air);
    for (let x = 4; x <= 6; x++) expect(world.getTile(x, FLOOR - 1)).toBe(Tile.Gravel);
  });

  it('collapses chain along a hanging gravel ceiling, each column warning first', () => {
    const world = makeWorld();
    // A gravel ceiling hanging over air from x = 10 to 17, with stone at x = 9 holding nothing.
    for (let x = 9; x <= 17; x++) world.setTile(x, 8, x === 9 ? Tile.Stone : Tile.Gravel);
    const { run, log, caveIns } = setup({ world });
    world.setTile(9, 8, Tile.Air); // disturb one end
    run(0.1);
    expect(log.warned).toEqual([[10, 8]]); // only the neighbour, at first
    run(10);
    expect(log.warned).toHaveLength(8); // every column warned in turn
    expect(caveIns.falling).toHaveLength(0);
    for (let x = 10; x <= 17; x++) {
      expect(world.getTile(x, 8)).toBe(Tile.Air);
      expect(world.getTile(x, FLOOR - 1)).toBe(Tile.Gravel);
    }
  });

  it('a big collapse spreads its rechecks over steps with the budget', () => {
    const world = makeWorld();
    const { updates, caveIns, hooks } = setup({ world });
    for (let x = 1; x < 39; x++) for (let y = 1; y < 20; y++) world.setTile(x, y, Tile.Gravel);
    const queued = updates.size;
    expect(queued).toBeGreaterThan(64);
    caveIns.update(DT, DT, 64, hooks);
    expect(updates.size).toBeGreaterThan(0);
    expect(updates.size).toBeLessThan(queued);
  });

  it('a block that hits the player bursts into an item and hurts by how far it fell', () => {
    const world = makeWorld();
    world.setTile(5, 10, Tile.Stone);
    world.setTile(5, 9, Tile.Gravel);
    // The player stands on the floor under it.
    const { run, log } = setup({ world, player: { x: 5 * TILE_SIZE + 2, y: FLOOR * TILE_SIZE - 28 } });
    world.setTile(5, 10, Tile.Air);
    run(4);
    expect(log.bursts).toHaveLength(1);
    expect(log.bursts[0].onPlayer).toBe(true);
    expect(log.bursts[0].fell).toBeGreaterThan(15);
    expect(count(world, Tile.Gravel)).toBe(0); // it's an item now (the game drops it)
    expect(gravelDamage(0.5)).toBe(1);
    expect(gravelDamage(log.bursts[0].fell)).toBeGreaterThan(1);
    expect(gravelDamage(1000)).toBeLessThanOrEqual(4);
  });

  it('a pileup on the player hurts once per hurt protection', () => {
    const world = makeWorld();
    for (let y = 10; y < 16; y++) world.setTile(5, y, Tile.Gravel);
    world.setTile(5, 16, Tile.Stone);
    const health = new Health(10);
    const player = { x: 5 * TILE_SIZE + 2, y: FLOOR * TILE_SIZE - 28 };
    const s = setup({ world, player });
    let hits = 0;
    s.hooks.burst = (_b, onPlayer, fell) => {
      if (onPlayer && health.hurt(gravelDamage(fell), s.now(), 'normal') !== 'ignored') hits++;
    };
    world.setTile(5, 16, Tile.Air);
    s.run(3);
    // Six blocks hit within a fraction of a second: only the first gets through.
    expect(hits).toBe(1);
    expect(HURT_PROTECTION).toBeGreaterThan(0.1);
    expect(health.hp).toBeGreaterThanOrEqual(10 - 4);
  });
});

describe('Cozy worlds', () => {
  it('gravel never shakes or falls', () => {
    const world = makeWorld();
    world.setTile(5, 10, Tile.Stone);
    world.setTile(5, 9, Tile.Gravel);
    const { run, caveIns } = setup({ world, enabled: false });
    world.setTile(5, 10, Tile.Air);
    world.setTile(20, 5, Tile.Gravel); // placed in mid-air
    run(3);
    expect(caveIns.warnings.size).toBe(0);
    expect(world.getTile(5, 9)).toBe(Tile.Gravel);
    expect(world.getTile(20, 5)).toBe(Tile.Gravel);
  });

  it('switching to Cozy stops shaking gravel, and blocks already falling land without hitting anyone', () => {
    const world = makeWorld();
    world.setTile(5, 9, Tile.Gravel);
    world.setTile(9, 3, Tile.Gravel);
    const s = setup({ world, player: { x: 5 * TILE_SIZE + 2, y: FLOOR * TILE_SIZE - 28 } });
    world.setTile(9, 4, Tile.Stone);
    world.setTile(9, 4, Tile.Air); // disturb (9, 3)
    world.setTile(5, 10, Tile.Stone);
    world.setTile(5, 10, Tile.Air); // disturb (5, 9)
    s.run(GRAVEL_WARN_TIME + 0.05);
    expect(s.caveIns.falling.length).toBe(2);
    s.caveIns.setEnabled(false);
    s.run(3);
    expect(s.log.bursts.filter((b) => b.onPlayer)).toHaveLength(0);
    // The one over the player can't land on them: it pops out as an item instead.
    expect(s.log.bursts).toHaveLength(1);
    expect(world.getTile(9, FLOOR - 1)).toBe(Tile.Gravel);

    const t = setup({ world: makeWorld() });
    t.world.setTile(3, 3, Tile.Gravel);
    t.run(0.1);
    expect(t.caveIns.warnings.size).toBe(1);
    t.caveIns.setEnabled(false);
    t.run(2);
    expect(t.caveIns.warnings.size).toBe(0);
    expect(t.world.getTile(3, 3)).toBe(Tile.Gravel);
  });
});

describe('saving cave-ins', () => {
  /** A copy of the world's tiles, as a save's chunks would bring them back. */
  function copyWorld(world: World): World {
    const copy = new World(world.width, world.height, world.seed);
    world.chunks.forEach((chunk, i) => copy.chunks[i].set(chunk));
    return copy;
  }

  it('a reload during the warning keeps the gravel and the danger', () => {
    const world = makeWorld();
    for (let y = 8; y < 11; y++) world.setTile(5, y, Tile.Gravel);
    const a = setup({ world });
    world.setTile(5, 11, Tile.Stone);
    world.setTile(5, 11, Tile.Air);
    a.run(GRAVEL_WARN_TIME / 2);
    expect(a.caveIns.warnings.size).toBe(3);
    const saved = JSON.parse(JSON.stringify(a.caveIns.saved())) as SavedCaveIns;
    const reloaded = copyWorld(world);
    const b = setup({ world: reloaded, saved });
    expect(b.caveIns.warnings.size).toBe(3);
    // The clock carries on from the save (the session clock is saved too).
    b.run(a.now() + 3);
    expect(count(reloaded, Tile.Gravel)).toBe(3);
    for (let y = FLOOR - 3; y < FLOOR; y++) expect(reloaded.getTile(5, y)).toBe(Tile.Gravel);
  });

  it('a reload mid-fall neither loses nor duplicates gravel', () => {
    const world = makeWorld();
    for (let x = 4; x <= 8; x++) world.setTile(x, 4, Tile.Gravel);
    const a = setup({ world });
    world.setTile(3, 4, Tile.Stone);
    world.setTile(3, 4, Tile.Air); // starts a chain along the row
    a.run(GRAVEL_WARN_TIME + 0.2);
    const falling = a.caveIns.falling.length;
    expect(falling).toBeGreaterThan(0);
    expect(count(world, Tile.Gravel) + falling).toBe(5);
    const saved = JSON.parse(JSON.stringify(a.caveIns.saved())) as SavedCaveIns;
    expect(saved.falling).toHaveLength(falling);
    const reloaded = copyWorld(world);
    const b = setup({ world: reloaded, saved });
    expect(count(reloaded, Tile.Gravel) + b.caveIns.falling.length).toBe(5);
    b.run(15);
    expect(b.caveIns.falling).toHaveLength(0);
    expect(count(reloaded, Tile.Gravel)).toBe(5);
    for (let x = 4; x <= 8; x++) expect(reloaded.getTile(x, FLOOR - 1)).toBe(Tile.Gravel);
  });

  it('skips saved state that no longer fits the world', () => {
    const world = makeWorld();
    const saved: SavedCaveIns = {
      warnings: [
        { tx: 5, ty: 5, at: 1 }, // no gravel there
        { tx: -1, ty: 5, at: 1 },
      ],
      falling: [{ tx: 500, y: 0, vy: 0, startY: 0, tile: Tile.Gravel }, { tx: 3, y: 10, vy: 0, startY: 0, tile: Tile.Stone }],
      pending: [{ tx: 1.5, ty: 2 }],
    };
    const { caveIns, updates } = setup({ world, saved });
    expect(caveIns.warnings.size).toBe(0);
    expect(caveIns.falling).toHaveLength(0);
    expect(updates.size).toBe(0);
  });
});
