import './style.css';
import { createRenderer } from './renderer.js';
import { Game } from './game.js';
import { initAudio, toggleMute } from './audio.js';
import { ui } from './menu.js';

const STEP = 1 / 60;
const renderer = createRenderer(document.getElementById('app'));

let game = null;
let paused = false;
let players = 1;

function load(n) {
  game?.dispose();
  game = new Game(renderer, n, { onResults: (rows) => ui.showResults(rows) });
  paused = false;
}

function start(n) {
  players = n;
  initAudio();
  load(n);
  ui.hideAll();
  document.activeElement?.blur();
}

function toMenu() {
  load(0); // attract mode behind the title screen
  ui.show('title');
}

function setPaused(p) {
  paused = p;
  game.setPaused(p);
  ui.show(p ? 'pause' : null);
}

ui.bind({
  start,
  resume: () => setPaused(false),
  quit: toMenu,
  retry: () => start(players),
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Escape' && game && game.numPlayers > 0 && game.race.state !== 'results') setPaused(!paused);
});

toMenu();

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game || paused) return;
  acc += dt;
  while (acc >= STEP) {
    game.step(STEP);
    acc -= STEP;
  }
  game.render();
}
requestAnimationFrame(frame);

// handy for debugging from the console
window.__kart = { get game() { return game; } };
