import { CONFIG as C } from './config.js';
import { ITEM_TYPES } from './items.js';
import { clamp, fmtTime, ordinal } from './utils.js';

export const ITEM_ICONS = {
  banana: `<svg viewBox="0 0 64 64"><path d="M16 10c-3 20 6 36 30 42 4 1 8 0 10-2-20-5-30-19-31-38z" fill="#ffd93b" stroke="#8a6d00" stroke-width="3" stroke-linejoin="round"/><path d="M14 6l4 6" stroke="#5a3d10" stroke-width="5" stroke-linecap="round"/></svg>`,
  shell: `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="40" rx="25" ry="9" fill="#fff" stroke="#333" stroke-width="3"/><path d="M9 38a23 23 0 0 1 46 0z" fill="#2ecc40" stroke="#135c1c" stroke-width="3"/><path d="M24 22l8-5 8 5v9l-8 5-8-5z" fill="#c8f7c5" stroke="#135c1c" stroke-width="2"/></svg>`,
  mushroom: `<svg viewBox="0 0 64 64"><path d="M22 36h20v14a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" fill="#fde7c8" stroke="#6b4a2b" stroke-width="3"/><path d="M6 37a26 25 0 0 1 52 0z" fill="#e53935" stroke="#7a1010" stroke-width="3"/><circle cx="32" cy="20" r="6" fill="#fff"/><circle cx="17" cy="30" r="4.5" fill="#fff"/><circle cx="47" cy="30" r="4.5" fill="#fff"/></svg>`,
};

const TIER_COLORS = ['#ffffff', '#3fb4ff', '#ff8a00'];

export class PlayerHUD {
  constructor(root, kart, index, total) {
    this.kart = kart;
    this.el = document.createElement('div');
    this.el.className = `phud${total === 2 ? ' split' : ''}`;
    this.el.style.top = total === 2 ? `${index * 50}%` : '0';
    this.el.style.height = total === 2 ? '50%' : '100%';
    this.el.innerHTML = `
      <div class="h-lap"><span>LAP</span> <b class="lapn">1</b><i>/${C.laps}</i></div>
      <div class="h-time">0:00.00</div>
      <div class="h-item"><div class="slot"></div></div>
      <div class="h-pos"></div>
      <div class="h-speed"><div class="drift"></div><div class="track"><div class="bar"></div></div></div>
      <div class="h-msg"></div>
      ${total === 2 ? `<div class="h-tag" style="background:#${kart.color.toString(16).padStart(6, '0')}">${kart.name}</div>` : ''}`;
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.lapEl = q('.lapn');
    this.timeEl = q('.h-time');
    this.slotEl = q('.slot');
    this.posEl = q('.h-pos');
    this.barEl = q('.bar');
    this.driftEl = q('.drift');
    this.msgEl = q('.h-msg');

    this.lastLap = 1;
    this.flashText = '';
    this.flashT = 0;
    this.cache = {};
  }

  set(key, el, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  flash(text, t) {
    this.flashText = text;
    this.flashT = t;
  }

  update(dt, race) {
    const k = this.kart;
    const lap = race.lapOf(k);
    if (lap > this.lastLap) {
      this.lastLap = lap;
      this.flash(lap === race.laps ? 'FINAL LAP!' : `LAP ${lap}`, 1.8);
      k.events.push('lap');
    }
    this.flashT -= dt;

    this.set('lap', this.lapEl, 'textContent', String(lap));
    this.set('time', this.timeEl, 'textContent', fmtTime(k.finished ? k.finishTime : race.time));
    this.set('pos', this.posEl, 'innerHTML', `${k.rank}<sup>${ordinal(k.rank)}</sup>`);

    let icon = '';
    if (k.roulette > 0) icon = ITEM_TYPES[Math.floor(performance.now() / 70) % ITEM_TYPES.length];
    else if (k.item) icon = k.item;
    this.set('item', this.slotEl, 'innerHTML', icon ? ITEM_ICONS[icon] : '');
    this.slotEl.parentElement.classList.toggle('rolling', k.roulette > 0);

    this.barEl.style.width = `${clamp(k.speed / C.boostSpeed, 0, 1) * 100}%`;
    this.barEl.classList.toggle('boost', k.boostTime > 0);
    const tier = k.driftTier;
    this.driftEl.style.opacity = tier >= 0 ? '1' : '0';
    if (tier >= 0) {
      this.driftEl.style.width = `${clamp(k.driftCharge / C.driftTier2, 0, 1) * 100}%`;
      this.driftEl.style.background = TIER_COLORS[tier];
    }

    let msg = '';
    let cls = 'h-msg';
    if (race.state === 'countdown') {
      msg = String(Math.ceil(race.countdown));
      cls += ' count';
    } else if (race.time < 1) {
      msg = 'GO!';
      cls += ' go';
    } else if (k.finished) {
      msg = `FINISH! ${k.finishPlace}${ordinal(k.finishPlace)}`;
      cls += ' go';
    } else if (this.flashT > 0) {
      msg = this.flashText;
    } else if (k.wrongWayTime > 1) {
      msg = 'WRONG WAY';
      cls += ' warn';
    }
    this.set('msg', this.msgEl, 'textContent', msg);
    if (this.msgEl.className !== cls) this.msgEl.className = cls;
  }

  destroy() {
    this.el.remove();
  }
}

export class Minimap {
  constructor(canvas, track, numPlayers) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    canvas.classList.toggle('hidden', numPlayers === 0);
    canvas.classList.toggle('split', numPlayers === 2);

    const size = canvas.width;
    const pad = 14;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.pos.x);
      maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z);
      maxZ = Math.max(maxZ, s.pos.z);
    }
    const sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (size - (maxX - minX) * sc) / 2;
    const oy = (size - (maxZ - minZ) * sc) / 2;
    // Mirror x so the map matches the driver's view (+z up, left turns go left).
    this.map = (p) => [ox + (maxX - p.x) * sc, oy + (maxZ - p.z) * sc];

    this.bg = document.createElement('canvas');
    this.bg.width = this.bg.height = size;
    const b = this.bg.getContext('2d');
    b.lineJoin = 'round';
    const path = () => {
      b.beginPath();
      track.samples.forEach((s, i) => {
        const [x, y] = this.map(s.pos);
        if (i) b.lineTo(x, y);
        else b.moveTo(x, y);
      });
      b.closePath();
    };
    path();
    b.strokeStyle = 'rgba(255,255,255,0.95)';
    b.lineWidth = 11;
    b.stroke();
    path();
    b.strokeStyle = '#4a4d55';
    b.lineWidth = 7;
    b.stroke();
    const [sx, sy] = this.map(track.samples[0].pos);
    b.fillStyle = '#fff';
    b.fillRect(sx - 2, sy - 7, 4, 14);
  }

  draw(karts) {
    const g = this.g;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.bg, 0, 0);
    const list = [...karts].sort((a, b) => a.isHuman - b.isHuman);
    for (const k of list) {
      const [x, y] = this.map(k.pos);
      g.beginPath();
      g.arc(x, y, k.isHuman ? 6.5 : 4.5, 0, Math.PI * 2);
      g.fillStyle = `#${k.color.toString(16).padStart(6, '0')}`;
      g.fill();
      g.lineWidth = k.isHuman ? 2.5 : 1.5;
      g.strokeStyle = k.isHuman ? '#fff' : 'rgba(0,0,0,0.6)';
      g.stroke();
    }
  }

  hide() {
    this.canvas.classList.add('hidden');
  }
}
