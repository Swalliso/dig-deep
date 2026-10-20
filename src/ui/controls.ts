import { ACTIONS, HOTBAR_ACTIONS, keyName, type Action, type ActionTable } from '../input';

// Every on-screen key hint, built from the action table in input.ts: the Controls screen
// (mirrored in README.md's controls table; a test keeps the two in step and checks every row
// fits the screen), the F3 help, the map's help line, tooltips and toasts. Each builder takes
// the table to read, so a test (or a remapping screen later) can hand it different keys.

/** Longest row (action + input, in characters) that fits one line of the Controls screen. */
export const CONTROLS_ROW_MAX_CHARS = 52;

const CLICKS: Record<string, string> = { MouseLeft: 'Left-click', MouseRight: 'Right-click', MouseMiddle: 'Middle-click' };

/** Names of an action's keys, without repeats: ['A', '←']. */
export function keyNames(action: Action, table: ActionTable = ACTIONS): string[] {
  return [...new Set(table[action].keys.map(keyName))];
}

/** The action's main key: 'E'. */
export function mainKey(action: Action, table: ActionTable = ACTIONS): string {
  return keyNames(action, table)[0] ?? '?';
}

/** Every key for an action: 'Space, W or ↑'. */
export function keyList(action: Action, table: ActionTable = ACTIONS): string {
  const names = keyNames(action, table);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? '?');
}

/** Two opposite actions key by key: 'A / D or ← / →' (or 'A/D or ←/→' with sep '/'). */
export function keyPairs(a: Action, b: Action, table: ActionTable = ACTIONS, sep = ' / '): string {
  const first = keyNames(a, table);
  const second = keyNames(b, table);
  const pairs = first.slice(0, second.length).map((name, i) => `${name}${sep}${second[i]}`);
  return pairs.join(' or ');
}

/** A key name inside a sentence: mouse buttons are lower case ('hold left mouse'). */
function inSentence(name: string): string {
  return name.endsWith(' mouse') ? name.toLowerCase() : name;
}

/** 'Right-click' for a mouse button, or the key's name. */
function clickName(action: Action, table: ActionTable): string {
  return CLICKS[table[action].keys[0]] ?? mainKey(action, table);
}

/** '1–0': the first and last hotbar keys. */
function hotbarRange(table: ActionTable): string {
  return `${mainKey(HOTBAR_ACTIONS[0], table)}–${mainKey(HOTBAR_ACTIONS[HOTBAR_ACTIONS.length - 1], table)}`;
}

/** The controls list, as [action, input] pairs in the order they're listed. */
export function controlsList(table: ActionTable = ACTIONS): [string, string][] {
  const key = (action: Action): string => mainKey(action, table);
  const list = (action: Action): string => keyList(action, table);
  const use = inSentence(key('use'));
  return [
    ['Move', keyPairs('moveLeft', 'moveRight', table)],
    ['Jump', list('jump')],
    ['Careful walk (no auto step-up)', `Hold ${key('careful')} and move`],
    ['Dig', `Hold ${use} on a tile`],
    ['Place the held block', `${key('use')} on empty space`],
    ['Build a row', `Hold ${use} and sweep`],
    ['Throw a held flare or bomb', `${key('use')} at a spot`],
    ['Hang a held rope coil', `${key('use')} on an edge`],
    ['Pick block onto hotbar', key('pickBlock')],
    ['Quick torch (keeps what you hold)', list('quickTorch')],
    ['Use chest, door, bed, camp, lift', `${clickName('interact', table)} it`],
    ['Climb a ladder', `${keyPairs('climbUp', 'climbDown', table)} on it`],
    ['Drop through a platform', `${key('climbDown')} (hold to keep dropping)`],
    ['Map / minimap', `${key('map')} / ${key('minimap')}`],
    ['Add or edit a map pin', `${clickName('pin', table)} the map`],
    ['Select hotbar slot', `${hotbarRange(table)} or mouse wheel`],
    ['Drop selected stack', list('dropStack')],
    ['Quick stack to nearby chests', list('quickStack')],
    ['Inventory, crafting, nearest chest', list('inventory')],
    ['Move stack (hotbar ↔ bag ↔ chest)', `${key('modifier')}-click`],
    ['Wear or take off an accessory', `${key('modifier')}-click it`],
    ['Craft 10', `${key('modifier')}-click a recipe`],
    ['Pin a recipe as your goal', `${clickName('pin', table)} the recipe`],
    ['Pause', list('pause')],
    ['Debug overlay (FPS)', list('overlay')],
  ];
}

/** The Controls screen's rows (and README.md's controls table). */
export const CONTROLS: ReadonlyArray<readonly [string, string]> = controlsList();

/** The controls part of the F3 overlay. */
export function overlayHelpLines(table: ActionTable = ACTIONS): string[] {
  const key = (action: Action): string => mainKey(action, table);
  const list = (action: Action): string => keyList(action, table);
  return [
    `${keyPairs('moveLeft', 'moveRight', table, '/')}: move   ${list('jump')}: jump   hold ${key('careful')}: careful walk (no auto step-up onto ledges)`,
    `${keyPairs('climbUp', 'climbDown', table, '/')} on a ladder: climb   ${key('climbDown')} on a platform: drop through`,
    `${key('use')}: dig, or place the held block on an empty spot (hold to sweep), or use the held tool (flare, bomb, rope coil, drill)`,
    `${key('interact')}: open chest or door, sleep in bed or camp (respawn there), ride a lift from a stop   ${key('pickBlock')}: pick block   ${list('quickTorch')}: quick torch`,
    `${hotbarRange(table)} or wheel: select   ${list('dropStack')}: drop stack   ${list('quickStack')}: quick stack to nearby chests`,
    `${list('inventory')}: inventory + crafting, with the nearest chest (${key('modifier').toLowerCase()}-click: move stack, craft 10; ${key('pin').toLowerCase()}: pin a recipe)`,
    `${list('map')}: map   ${list('minimap')}: minimap   ${list('pause')}: pause   ${list('overlay')}: hide this overlay`,
  ];
}

/** The death screen's prompt: 'Press Space or Enter (or left mouse) to respawn'. */
export function respawnPrompt(table: ActionTable = ACTIONS): string {
  return `Press ${keyList('respawn', table)} (or ${inSentence(mainKey('click', table))}) to respawn`;
}

/** The hint the first time the player falls past a ladder: 'Hold W or S to grab the ladder'. */
export function ladderGrabHint(table: ActionTable = ACTIONS): string {
  return `Hold ${mainKey('climbUp', table)} or ${mainKey('climbDown', table)} to grab the ladder`;
}

/** The help line along the top of the full map. */
export function mapHelpText(table: ActionTable = ACTIONS): string {
  const pan = (['climbUp', 'moveLeft', 'climbDown', 'moveRight'] as const).map((action) => mainKey(action, table));
  const panKeys = pan.every((name) => name.length === 1) ? pan.join('') : pan.join('/');
  return `Drag or ${panKeys} to pan · Wheel to zoom · ${clickName('pin', table)}: pin · ${mainKey('map', table)} or ${mainKey('pause', table)} to close`;
}

/** The pin editor's help line: 'Type a name · Enter: done · Esc: cancel'. */
export function pinEditorHelp(table: ActionTable = ACTIONS): string {
  return `Type a name · ${mainKey('confirm', table)}: done · ${mainKey('pause', table)}: cancel`;
}

/** The recipe search box's tooltip line: 'Enter keeps the search, Esc clears it.' */
export function searchHelp(table: ActionTable = ACTIONS): string {
  return `${mainKey('confirm', table)} keeps the search, ${mainKey('pause', table)} clears it.`;
}

/** How to wear an accessory, for its tooltip: 'Shift-click: wear it'. */
export function wearHint(table: ActionTable = ACTIONS): string {
  return `${mainKey('modifier', table)}-click: wear it (or take it off)`;
}

/** The lift panel's help line: 'Left-click a stop to ride there · Esc: close'. */
export function liftPanelHelp(table: ActionTable = ACTIONS): string {
  return `${clickName('click', table)} a stop to ride there · ${mainKey('pause', table)}: close`;
}

/** The goal box with nothing pinned: 'Right-click a recipe to pin it as your goal.' */
export function pinRecipeHint(table: ActionTable = ACTIONS): string {
  return `${clickName('pin', table)} a recipe to pin it as your goal.`;
}

/** A recipe tooltip's pin line: 'Right-click: pin as your goal' (or 'unpin'). */
export function pinRecipeTip(pinned: boolean, table: ActionTable = ACTIONS): string {
  return `${clickName('pin', table)}: ${pinned ? 'unpin' : 'pin as your goal'}`;
}
