// Keyboard state, read by the fixed-step update. Keys are KeyboardEvent.code values.
// Mouse state is added when mining/building arrive (Phase 3).

const down = new Set<string>();

// Keys whose browser default (scrolling) must not fire while playing.
const NO_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    down.add(e.code);
    if (NO_DEFAULT.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  // Releasing a key while the tab is unfocused never fires keyup, so forget everything.
  window.addEventListener('blur', () => down.clear());
}

export function isDown(code: string): boolean {
  return down.has(code);
}
