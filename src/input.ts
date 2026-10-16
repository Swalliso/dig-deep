// Keyboard and mouse state, read by the fixed-step update through logical actions. Keys are
// KeyboardEvent.code values; mouse buttons use the codes 'MouseLeft', 'MouseMiddle' and
// 'MouseRight' so they bind like keys.

/** A logical action and the keys bound to it. */
export interface ActionDef {
  /** What it does, for a remapping screen later. */
  label: string;
  /** Key codes; the first one is the main key shown in short hints. */
  keys: readonly string[];
  /** A `?debug` cheat: never listed on the Controls screen. */
  debug?: boolean;
}

/**
 * Every action and its keys: the one place key bindings live. The Controls screen, the F3 help,
 * tooltips and hints all read key names from here (see ui/controls.ts), so a remapping screen
 * only has to edit this table. Some actions share a key on purpose: W/↑ both jumps and climbs,
 * and the left mouse button uses the held item in the world and clicks in menus.
 */
const ACTION_DEFS = {
  moveLeft: { label: 'Move left', keys: ['KeyA', 'ArrowLeft'] },
  moveRight: { label: 'Move right', keys: ['KeyD', 'ArrowRight'] },
  jump: { label: 'Jump', keys: ['Space', 'KeyW', 'ArrowUp'] },
  climbUp: { label: 'Climb up (pan the map up)', keys: ['KeyW', 'ArrowUp'] },
  climbDown: { label: 'Climb down, or drop through a platform with jump', keys: ['KeyS', 'ArrowDown'] },
  use: { label: 'Dig, or place the held block', keys: ['MouseLeft'] },
  interact: { label: 'Open a chest or door', keys: ['MouseRight'] },
  pickBlock: { label: 'Pick block onto the hotbar', keys: ['MouseMiddle'] },
  click: { label: 'Click in the inventory and drag the map', keys: ['MouseLeft'] },
  modifier: { label: 'Shift-click: move a stack or craft 10', keys: ['ShiftLeft', 'ShiftRight'] },
  hotbar1: { label: 'Hotbar slot 1', keys: ['Digit1'] },
  hotbar2: { label: 'Hotbar slot 2', keys: ['Digit2'] },
  hotbar3: { label: 'Hotbar slot 3', keys: ['Digit3'] },
  hotbar4: { label: 'Hotbar slot 4', keys: ['Digit4'] },
  hotbar5: { label: 'Hotbar slot 5', keys: ['Digit5'] },
  hotbar6: { label: 'Hotbar slot 6', keys: ['Digit6'] },
  hotbar7: { label: 'Hotbar slot 7', keys: ['Digit7'] },
  hotbar8: { label: 'Hotbar slot 8', keys: ['Digit8'] },
  hotbar9: { label: 'Hotbar slot 9', keys: ['Digit9'] },
  hotbar10: { label: 'Hotbar slot 10', keys: ['Digit0'] },
  dropStack: { label: 'Drop the selected stack', keys: ['KeyQ'] },
  quickStack: { label: 'Quick stack to nearby chests', keys: ['KeyC'] },
  inventory: { label: 'Inventory and crafting', keys: ['KeyE', 'Tab'] },
  map: { label: 'Map', keys: ['KeyM'] },
  minimap: { label: 'Minimap', keys: ['KeyN'] },
  pause: { label: 'Pause, or close the inventory, map or a menu screen', keys: ['Escape'] },
  overlay: { label: 'Debug overlay (FPS)', keys: ['F3'] },
  debugGive: { label: 'Debug: materials kit', keys: ['KeyG'], debug: true },
  debugFly: { label: 'Debug: fly mode', keys: ['KeyF'], debug: true },
  debugInstantMine: { label: 'Debug: instant mining', keys: ['KeyI'], debug: true },
  debugLighting: { label: 'Debug: lighting on/off', keys: ['KeyL'], debug: true },
  debugOres: { label: 'Debug: ore patch at the cursor', keys: ['KeyO'], debug: true },
  debugLadderShaft: { label: 'Debug: ladder shaft down from the cursor', keys: ['KeyK'], debug: true },
  debugRevealMap: { label: 'Debug: reveal the map', keys: ['KeyV'], debug: true },
} satisfies Record<string, ActionDef>;

export type Action = keyof typeof ACTION_DEFS;
/** The action table's shape, so hint builders can be given another one (tests, remapping). */
export type ActionTable = Readonly<Record<Action, ActionDef>>;
export const ACTIONS: ActionTable = ACTION_DEFS;

/** The hotbar keys, slot 1 first. */
export const HOTBAR_ACTIONS: readonly Action[] = [
  'hotbar1',
  'hotbar2',
  'hotbar3',
  'hotbar4',
  'hotbar5',
  'hotbar6',
  'hotbar7',
  'hotbar8',
  'hotbar9',
  'hotbar10',
];

const SPECIAL_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Esc',
  Enter: 'Enter',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MouseLeft: 'Left mouse',
  MouseRight: 'Right mouse',
  MouseMiddle: 'Middle mouse',
};

/** What a key is called on screen: 'KeyE' → 'E', 'Digit1' → '1', 'ArrowUp' → '↑', 'F3' → 'F3'. */
export function keyName(code: string): string {
  if (code in SPECIAL_NAMES) return SPECIAL_NAMES[code];
  const match = /^(?:Key|Digit|Numpad)(\w+)$/.exec(code);
  return match ? match[1] : code;
}

/** Has keyName got a proper name for this code (rather than showing the raw code)? */
export function isNamedKey(code: string): boolean {
  return code in SPECIAL_NAMES || /^(Key[A-Z]|Digit\d|F\d{1,2})$/.test(code);
}

// --- Live input state ---

const down = new Set<string>();
/** Keys pressed since the end of the last update step. */
const pressed = new Set<string>();
let wheelSteps = 0;

/** Pointer position in canvas pixels (device pixels). */
export const mouse = { x: 0, y: 0 };

// Keys whose browser default (scrolling, clicking a focused button) must not fire while playing.
const NO_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'F3']);
const BUTTONS: Record<number, string> = { 0: 'MouseLeft', 1: 'MouseMiddle', 2: 'MouseRight' };

export function initInput(canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (e) => {
    // Typing in a menu field (the seed, a volume slider) isn't game input, except Esc, which
    // backs out of menus.
    if (e.target instanceof HTMLInputElement && e.code !== 'Escape') return;
    if (!e.repeat) pressed.add(e.code);
    down.add(e.code);
    // Leave keys alone on menu buttons so Space/Enter still press them.
    if (NO_DEFAULT.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  // Releasing a key while the tab is unfocused never fires keyup, so forget everything.
  window.addEventListener('blur', () => down.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    mouse.y = ((e.clientY - rect.top) * canvas.height) / rect.height;
  });
  canvas.addEventListener('mousedown', (e) => {
    const code = BUTTONS[e.button];
    if (!code) return;
    if (e.button === 1) e.preventDefault(); // no autoscroll on middle click
    pressed.add(code);
    down.add(code);
  });
  window.addEventListener('mouseup', (e) => {
    const code = BUTTONS[e.button];
    if (code) down.delete(code);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      wheelSteps += Math.sign(e.deltaY);
    },
    { passive: false },
  );
}

/** Is any key bound to `action` held down? */
export function actionDown(action: Action): boolean {
  return ACTIONS[action].keys.some((code) => down.has(code));
}

/** Did a key bound to `action` go down since the last update step (even if already released)? */
export function actionPressed(action: Action): boolean {
  return ACTIONS[action].keys.some((code) => pressed.has(code));
}

/** Mouse wheel notches since the last call (positive = scrolled down). */
export function consumeWheel(): number {
  const steps = wheelSteps;
  wheelSteps = 0;
  return steps;
}

/** Call after every fixed update step. */
export function endInputStep(): void {
  pressed.clear();
}
