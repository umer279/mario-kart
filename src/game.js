import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { Track, buildScenery } from './track.js';
import { Kart } from './kart.js';
import { AIController } from './ai.js';
import { HumanController, BINDINGS } from './input.js';
import { ItemSystem } from './items.js';
import { Race } from './race.js';
import { ChaseCam } from './camera.js';
import { PlayerHUD, Minimap } from './hud.js';
import { sfx, EngineSound } from './audio.js';
import { clamp, fmtTime } from './utils.js';

const CPU_ROSTER = [
  { name: 'Bolt', color: 0xf2c200 },
  { name: 'Pepper', color: 0xff6f91 },
  { name: 'Turbo', color: 0x8e44ad },
  { name: 'Nova', color: 0x00bcd4 },
  { name: 'Mochi', color: 0xf5f5f5 },
  { name: 'Rex', color: 0x2e7d32 },
  { name: 'Ziggy', color: 0xff9800 },
  { name: 'Dash', color: 0x795548 },
];
const PLAYER_ROSTER = [
  { name: 'P1', color: 0xe53935 },
  { name: 'P2', color: 0x1e63e9 },
];
const IDLE = { throttle: 0, steer: 0, drift: false, useItem: false, back: false };

export class Game {
  constructor(renderer, numPlayers, { onResults } = {}) {
    this.renderer = renderer;
    this.numPlayers = numPlayers;
    this.onResults = onResults;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0x8fd3ff, 220, 950);
    scene.add(new THREE.HemisphereLight(0xdff3ff, 0x4a7a3a, 1.2));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const ext = numPlayers === 2 ? 110 : 70;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 400 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    this.track = new Track();
    scene.add(this.track.group, buildScenery(this.track));
    this.items = new ItemSystem(scene, this.track);

    // CPUs fill the front of the grid, humans start at the back.
    this.karts = [];
    this.humans = [];
    const cpuCount = C.numRacers - numPlayers;
    for (let i = 0; i < cpuCount; i++) {
      const k = new Kart(this.track, CPU_ROSTER[i]);
      k.controller = new AIController(0.93 + Math.random() * 0.07);
      this.karts.push(k);
    }
    for (let p = 0; p < numPlayers; p++) {
      const k = new Kart(this.track, { ...PLAYER_ROSTER[p], isHuman: true, playerIndex: p });
      k.controller = new HumanController(numPlayers === 1 ? BINDINGS.solo : p === 0 ? BINDINGS.p1 : BINDINGS.p2);
      k.autopilot = new AIController(0.97); // drives after the finish line
      this.karts.push(k);
      this.humans.push(k);
    }
    this.karts.forEach((k, slot) => {
      const row = Math.floor(slot / 2);
      k.place(this.track.N - 6 - row * 5, (slot % 2 ? 1 : -1) * 4.5);
      scene.add(k.object);
    });

    this.race = new Race(this.karts, this.track, { attract: numPlayers === 0 });
    this.world = { track: this.track, karts: this.karts, race: this.race };

    const hudRoot = document.getElementById('hud');
    const followed = numPlayers ? this.humans : [this.karts[0]];
    this.views = followed.map((kart, i) => {
      const cam = new THREE.PerspectiveCamera(numPlayers === 2 ? 56 : 68, 1, 0.1, 2500);
      return {
        kart,
        cam,
        chase: new ChaseCam(cam, kart),
        hud: numPlayers ? new PlayerHUD(hudRoot, kart, i, numPlayers) : null,
        engine: numPlayers ? new EngineSound(numPlayers === 2 ? (i === 0 ? -0.4 : 0.4) : 0) : null,
      };
    });
    this.minimap = new Minimap(document.getElementById('minimap'), this.track, numPlayers);
    this.lastCount = 4;
    this.resultsSent = false;
    this.focus = new THREE.Vector3();
  }

  step(dt) {
    const race = this.race;
    race.update(dt);

    if (this.numPlayers) {
      if (race.state === 'countdown') {
        const c = Math.ceil(race.countdown);
        if (c !== this.lastCount) {
          sfx.beep();
          this.lastCount = c;
        }
      } else if (this.lastCount > 0) {
        sfx.go();
        this.lastCount = 0;
      }
    }

    this.rubberBand();
    const frozen = race.state === 'countdown';
    for (const k of this.karts) {
      const c = k.isHuman && k.finished ? k.autopilot : k.controller;
      const ctl = frozen ? IDLE : c.update(k, dt, this.world);
      if (ctl.useItem && k.item) this.items.use(k, ctl.back);
      k.update(dt, ctl);
    }
    this.collideKarts();
    this.items.update(dt, this.karts);

    this.focus.set(0, 0, 0);
    for (const v of this.views) {
      v.chase.update(dt);
      v.hud?.update(dt, race);
      v.engine?.set(v.kart.speed, v.kart.boostTime > 0);
      this.focus.add(v.kart.pos);
    }
    this.focus.multiplyScalar(1 / this.views.length);
    this.sun.position.set(this.focus.x + 60, this.focus.y + 120, this.focus.z + 40);
    this.sun.target.position.copy(this.focus);

    for (const k of this.karts) {
      if (k.isHuman) for (const e of k.events) sfx[e]?.();
      k.events.length = 0;
    }

    if (race.state === 'results' && !this.resultsSent) {
      this.resultsSent = true;
      this.views.forEach((v) => v.engine?.silence());
      this.onResults?.(this.resultRows());
    }
  }

  // CPUs ease off when well ahead of the leading human and push when behind.
  rubberBand() {
    if (!this.humans.length) {
      for (const k of this.karts) k.speedMul = k.controller.skill;
      return;
    }
    const lead = Math.max(...this.humans.map((h) => h.progress));
    for (const k of this.karts) {
      if (k.isHuman) continue;
      const laps = (k.progress - lead) / this.track.N;
      k.speedMul = k.controller.skill * clamp(1 - laps * 0.25, 0.9, 1.08);
    }
  }

  collideKarts() {
    const min = C.kartRadius * 2;
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i];
        const b = ks[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6 || Math.abs(a.pos.y - b.pos.y) > 2) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) / 2;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          const j2 = rv * 0.75;
          a.vel.x += nx * j2;
          a.vel.z += nz * j2;
          b.vel.x -= nx * j2;
          b.vel.z -= nz * j2;
          if (rv < -6) {
            a.events.push('bump');
            b.events.push('bump');
          }
        }
      }
    }
  }

  resultRows() {
    return this.race.order.map((k) => ({
      rank: k.rank,
      name: k.name,
      color: k.color,
      human: k.isHuman,
      time: k.finished ? fmtTime(k.finishTime) : '--:--.--',
    }));
  }

  setPaused(p) {
    for (const v of this.views) if (p) v.engine?.silence();
  }

  render() {
    const r = this.renderer;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (this.views.length === 1) {
      const v = this.views[0];
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      v.cam.aspect = W / H;
      v.cam.updateProjectionMatrix();
      r.render(this.scene, v.cam);
    } else {
      const h = Math.floor(H / 2);
      r.setScissorTest(true);
      this.views.forEach((v, i) => {
        const y = i === 0 ? H - h : 0; // viewport y is measured from the bottom
        r.setViewport(0, y, W, h);
        r.setScissor(0, y, W, h);
        v.cam.aspect = W / h;
        v.cam.updateProjectionMatrix();
        r.render(this.scene, v.cam);
      });
      r.setScissorTest(false);
    }
    if (this.numPlayers) this.minimap.draw(this.karts);
  }

  dispose() {
    for (const v of this.views) {
      v.hud?.destroy();
      v.engine?.stop();
    }
    this.minimap.hide();
    this.items.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
