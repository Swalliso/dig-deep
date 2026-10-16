import { describe, expect, it } from 'vitest';
import { primaryAction } from '../src/systems/building';
import { Tile } from '../src/world/tiles';

describe('left-click', () => {
  it('places a held block on an empty spot', () => {
    expect(primaryAction('dirt', Tile.Air)).toBe('build');
    expect(primaryAction('torch', Tile.Air)).toBe('build');
    expect(primaryAction('door', Tile.Air)).toBe('build');
  });

  it('digs a tile even while holding a block, so digging never needs a hotbar switch', () => {
    expect(primaryAction('dirt', Tile.Stone)).toBe('dig');
    expect(primaryAction('ladder', Tile.Torch)).toBe('dig');
  });

  it('digs with a pickaxe, an empty hand or an item that places nothing', () => {
    expect(primaryAction('wooden_pickaxe', Tile.Air)).toBe('dig');
    expect(primaryAction('wooden_pickaxe', Tile.Dirt)).toBe('dig');
    expect(primaryAction(null, Tile.Dirt)).toBe('dig');
    expect(primaryAction('coal', Tile.Air)).toBe('dig');
  });
});
