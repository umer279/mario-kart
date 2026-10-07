const keys = new Set();
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftRight', 'Enter', 'Slash', 'Period',
]);

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (GAME_KEYS.has(e.code) && e.target === document.body) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export const BINDINGS = {
  solo: {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    drift: ['Space', 'ShiftLeft', 'ShiftRight'],
    item: ['KeyE', 'KeyX', 'Enter'],
  },
  p1: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    drift: ['Space', 'ShiftLeft'],
    item: ['KeyE', 'KeyQ'],
  },
  p2: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    drift: ['ShiftRight', 'Slash'],
    item: ['Enter', 'Period'],
  },
};

const anyDown = (codes) => codes.some((c) => keys.has(c));

export class HumanController {
  constructor(binding) {
    this.b = binding;
    this.prevItem = false;
    this.out = { throttle: 0, steer: 0, drift: false, useItem: false, back: false };
  }

  update() {
    const b = this.b;
    const o = this.out;
    const down = anyDown(b.down);
    o.throttle = (anyDown(b.up) ? 1 : 0) - (down ? 1 : 0);
    o.steer = (anyDown(b.left) ? 1 : 0) - (anyDown(b.right) ? 1 : 0);
    o.drift = anyDown(b.drift);
    const item = anyDown(b.item);
    o.useItem = item && !this.prevItem;
    this.prevItem = item;
    o.back = down;
    return o;
  }
}
