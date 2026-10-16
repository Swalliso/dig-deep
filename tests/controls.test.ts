import { describe, expect, it } from 'vitest';
import readme from '../README.md?raw';
import { primaryAction } from '../src/systems/building';
import { CONTROLS, CONTROLS_ROW_MAX_CHARS } from '../src/ui/controls';
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

describe('controls list', () => {
  it('keeps every row short enough for one line of the Controls screen', () => {
    // The screen wraps long rows rather than overflow, but a row past this budget means
    // shortening the wording (or widening the menu in index.html), not a two-line row.
    const tooLong = CONTROLS.filter(([action, input]) => action.length + input.length > CONTROLS_ROW_MAX_CHARS);
    expect(tooLong).toEqual([]);
  });

  it("matches README.md's controls table, row for row", () => {
    const start = readme.indexOf('| Action ');
    expect(start).toBeGreaterThan(-1);
    const table = readme.slice(start, readme.indexOf('\n\n', start)).split('\n');
    const rows = table
      .slice(2) // header and separator
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
    expect(rows).toEqual(CONTROLS.map(([action, input]) => [action, input]));
  });
});
