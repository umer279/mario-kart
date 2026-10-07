import { CONFIG as C } from './config.js';
import { clamp, rand, wrapAngle } from './utils.js';

export class AIController {
  constructor(skill = 0.96) {
    this.skill = skill;
    this.canDrift = skill > 0.94 || Math.random() < 0.6;
    this.lane = rand(-4, 4);
    this.laneTarget = this.lane;
    this.laneTimer = 0;
    this.drift = false;
    this.driftTime = 0;
    this.itemTimer = 0;
    this.itemPatience = rand(1, 4);
    this.out = { throttle: 1, steer: 0, drift: false, useItem: false, back: false };
  }

  update(kart, dt, world) {
    const tr = world.track;
    const o = this.out;

    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTarget = rand(-5, 5);
      this.laneTimer = rand(2, 5);
    }
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 0.8);

    // Steer at a point further ahead the faster we go.
    const look = 8 + Math.floor(Math.max(0, kart.speed) * 0.35);
    const s = tr.sample(kart.trackIndex + look);
    const tx = s.pos.x + s.right.x * this.lane;
    const tz = s.pos.z + s.right.z * this.lane;
    const diff = wrapAngle(Math.atan2(tx - kart.pos.x, tz - kart.pos.z) - kart.heading);
    o.steer = clamp(diff * 2.2, -1, 1);

    // How much the road bends over the next stretch.
    const bend = wrapAngle(tr.sample(kart.trackIndex + 30).heading - tr.sample(kart.trackIndex).heading);

    o.throttle = 1;
    if (Math.abs(bend) > 0.9 && kart.speed > C.maxSpeed * 0.85 && !kart.drifting) o.throttle = 0;
    if (Math.abs(diff) > 1.4) o.throttle = 0.5; // badly misaligned (after a spin), ease off

    // Drifting: press when a real corner is coming, release when it straightens out.
    if (!this.drift) {
      if (
        this.canDrift &&
        Math.abs(bend) > 0.7 &&
        kart.speed > C.driftMinSpeed + 4 &&
        Math.sign(o.steer) === Math.sign(bend) &&
        Math.abs(o.steer) > 0.35
      ) {
        this.drift = true;
        this.driftTime = 0;
      }
    } else {
      this.driftTime += dt;
      const counter = kart.drifting && o.steer * kart.driftDir < -0.6;
      if (Math.abs(bend) < 0.25 || counter || this.driftTime > 3.5 || kart.spinTime > 0) this.drift = false;
    }
    o.drift = this.drift;

    o.useItem = false;
    o.back = false;
    if (kart.item) {
      this.itemTimer += dt;
      if (this.itemTimer > this.itemPatience) this.decideItem(kart, world, bend);
    } else {
      this.itemTimer = 0;
      this.itemPatience = rand(1, 4);
    }
    return o;
  }

  decideItem(kart, world, bend) {
    const o = this.out;
    if (kart.item === 'mushroom') {
      o.useItem = Math.abs(bend) < 0.4;
      return;
    }
    if (kart.item === 'banana') {
      const chaser = world.karts.some((k) => k !== kart && kart.progress - k.progress > 0 && kart.progress - k.progress < 12);
      o.useItem = chaser || this.itemTimer > 10;
      return;
    }
    // shell: fire at someone roughly straight ahead, or back at a close chaser
    for (const k of world.karts) {
      if (k === kart) continue;
      const gap = k.progress - kart.progress;
      if (gap > 3 && gap < 40) {
        const a = wrapAngle(Math.atan2(k.pos.x - kart.pos.x, k.pos.z - kart.pos.z) - kart.heading);
        if (Math.abs(a) < 0.15) {
          o.useItem = true;
          return;
        }
      }
      if (gap < -2 && gap > -10 && Math.random() < 0.02) {
        o.useItem = true;
        o.back = true;
        return;
      }
    }
    if (this.itemTimer > 12) o.useItem = true;
  }
}
