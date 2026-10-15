// Keyboard and mouse state, read by the fixed-step update. Keys are KeyboardEvent.code values;
// mouse buttons use the codes 'MouseLeft' and 'MouseRight' so they share isDown/wasPressed.

const down = new Set<string>();
/** Keys pressed since the end of the last update step. */
const pressed = new Set<string>();
let wheelSteps = 0;

/** Pointer position in canvas pixels (device pixels). */
export const mouse = { x: 0, y: 0 };

// Keys whose browser default (scrolling, clicking a focused button) must not fire while playing.
const NO_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
const BUTTONS: Record<number, string> = { 0: 'MouseLeft', 2: 'MouseRight' };

export function initInput(canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (e) => {
    if (!e.repeat) pressed.add(e.code);
    down.add(e.code);
    if (NO_DEFAULT.has(e.code)) e.preventDefault();
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

export function isDown(code: string): boolean {
  return down.has(code);
}

/** True if the key went down since the last update step, even if it's already been released. */
export function wasPressed(code: string): boolean {
  return pressed.has(code);
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
