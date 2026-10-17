import { describe, expect, it } from 'vitest';
import { ACTIONS, HOTBAR_ACTIONS, isNamedKey, keyName, type Action, type ActionTable } from '../src/input';
import { controlsList, keyList, ladderGrabHint, mapHelpText, overlayHelpLines, respawnPrompt } from '../src/ui/controls';

const actions = Object.keys(ACTIONS) as Action[];
const gameplay = actions.filter((a) => !ACTIONS[a].debug);
const cheats = actions.filter((a) => ACTIONS[a].debug);

/** Every action bound to its own unusual key (F13, F14, ...), as a remapping screen might leave it. */
function rebound(): ActionTable {
  return Object.fromEntries(actions.map((a, i) => [a, { ...ACTIONS[a], keys: [`F${13 + i}`] }])) as unknown as ActionTable;
}

describe('action table', () => {
  it('binds every action to at least one key, each with a proper on-screen name', () => {
    for (const action of actions) {
      expect(ACTIONS[action].keys.length, action).toBeGreaterThan(0);
      for (const code of ACTIONS[action].keys) expect(isNamedKey(code), `${action}: ${code}`).toBe(true);
    }
  });

  it('names keys the way the screens show them', () => {
    expect(['KeyE', 'Digit0', 'ArrowUp', 'Space', 'Escape', 'ShiftRight', 'F3', 'MouseRight'].map(keyName)).toEqual([
      'E',
      '0',
      '↑',
      'Space',
      'Esc',
      'Shift',
      'F3',
      'Right mouse',
    ]);
    expect(keyList('jump')).toBe('Space, W or ↑');
    expect(keyList('modifier')).toBe('Shift'); // left and right Shift are one name
  });

  it('only shares a key between actions where that is intended', () => {
    const users = new Map<string, Action[]>();
    for (const action of gameplay) {
      for (const code of ACTIONS[action].keys) users.set(code, [...(users.get(code) ?? []), action]);
    }
    const shared = [...users].filter(([, list]) => list.length > 1).map(([code, list]) => [code, list.sort()]);
    // W/↑ jump and climb; Space also respawns (only on the death screen, where nothing else
    // moves); the left mouse button uses the held item in the world and clicks in menus.
    expect(shared).toEqual([
      ['Space', ['jump', 'respawn']],
      ['KeyW', ['climbUp', 'jump']],
      ['ArrowUp', ['climbUp', 'jump']],
      ['MouseLeft', ['click', 'use']],
    ]);
  });

  it('never puts a debug cheat on a key the game already uses', () => {
    const used = new Set(gameplay.flatMap((a) => ACTIONS[a].keys));
    for (const action of cheats) {
      for (const code of ACTIONS[action].keys) expect(used.has(code), `${action}: ${code}`).toBe(false);
    }
  });

  it('selects hotbar slots 1–9 with the digit keys and slot 10 with 0', () => {
    expect(HOTBAR_ACTIONS.map((a) => ACTIONS[a].keys)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => [`Digit${d}`]));
  });
});

describe('key hints', () => {
  it('read every key name from the action table', () => {
    // With every action moved to a new key, no default key name may be left in any hint.
    const table = rebound();
    const text = [
      ...controlsList(table).map(([action, input]) => `${action} | ${input}`),
      ...overlayHelpLines(table),
      mapHelpText(table),
      respawnPrompt(table),
      ladderGrabHint(table),
    ].join('\n');
    const defaults = new Set(actions.flatMap((a) => ACTIONS[a].keys.map(keyName)));
    for (const name of defaults) {
      const pattern = new RegExp(`(^|[^\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w])`, name.endsWith('mouse') ? 'i' : '');
      expect(pattern.test(text), `"${name}" is still shown`).toBe(false);
    }
    expect(text).not.toMatch(/Left-click|Right-click|Middle-click/);
  });

  it('follow a changed binding', () => {
    const table = { ...ACTIONS, inventory: { ...ACTIONS.inventory, keys: ['KeyB'] } };
    expect(controlsList(table)).toContainEqual(['Inventory, crafting, nearest chest', 'B']);
    expect(overlayHelpLines(table).some((line) => line.startsWith('B: inventory'))).toBe(true);
  });
});
