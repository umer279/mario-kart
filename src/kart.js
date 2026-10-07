import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { buildKartModel } from './kartModel.js';
import { clamp, damp, wrapAngle } from './utils.js';

const SPARK_COLORS = [0xffffff, 0x3fb4ff, 0xff8a00];

export class Kart {
  constructor(track, { name, color, isHuman = false, playerIndex = -1 }) {
    this.track = track;
    this.name = name;
    this.color = color;
    this.isHuman = isHuman;
    this.playerIndex = playerIndex;

    this.model = buildKartModel(color);
    this.object = this.model.root;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.speedMul = 1;

    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftArmed = false;
    this.prevDrift = false;
    this.boostTime = 0;
    this.spinTime = 0;
    this.hopY = 0;
    this.hopV = 0;
    this.yawOffset = 0;
    this.steerVis = 0;

    this.item = null;
    this.pendingItem = null;
    this.roulette = 0;

    this.trackIndex = 0;
    this.progress = 0; // samples travelled since the start line (negative on the grid)
    this.lateral = 0;
    this.offroad = false;
    this.rank = 1;
    this.finished = false;
    this.finishTime = 0;
    this.wrongWayTime = 0;

    this.events = []; // sound cues, drained by the game each step
  }

  place(index, lateral) {
    const s = this.track.sample(index);
    this.pos.copy(s.pos).addScaledVector(s.right, lateral);
    this.heading = s.heading;
    this.trackIndex = s.i;
    this.progress = index - this.track.N;
    this.syncMesh(0, s);
  }

  get driftTier() {
    if (!this.drifting) return -1;
    return this.driftCharge >= C.driftTier2 ? 2 : this.driftCharge >= C.driftTier1 ? 1 : 0;
  }

  boost(t) {
    this.boostTime = Math.max(this.boostTime, t);
    this.events.push('boost');
  }

  spinOut() {
    if (this.spinTime > 0) return;
    this.spinTime = C.spinTime;
    this.drifting = false;
    this.driftCharge = 0;
    this.boostTime = 0;
    this.speed *= 0.35;
    this.events.push('hit');
  }

  endDrift(reward) {
    const tier = this.driftTier;
    this.drifting = false;
    this.driftCharge = 0;
    if (reward && tier >= 1) this.boost(tier === 2 ? C.miniTurbo2 : C.miniTurbo1);
  }

  update(dt, ctl) {
    const spinning = this.spinTime > 0;
    let throttle = ctl.throttle;
    let steer = ctl.steer;
    if (spinning) {
      this.spinTime -= dt;
      throttle = 0;
      steer = 0;
    }

    // Hop on drift press; a drift starts once the kart is steering hard enough.
    const pressed = ctl.drift && !this.prevDrift;
    this.prevDrift = ctl.drift;
    if (!ctl.drift) this.driftArmed = false;
    if (pressed && !spinning && this.hopY === 0) {
      this.hopV = 4.2;
      this.driftArmed = true;
    }
    if (this.driftArmed && !this.drifting && Math.abs(steer) > 0.3 && this.speed > C.driftMinSpeed) {
      this.drifting = true;
      this.driftDir = Math.sign(steer);
      this.driftCharge = 0;
      this.driftArmed = false;
    }

    // Longitudinal speed
    const boosting = this.boostTime > 0;
    if (boosting) this.boostTime -= dt;
    const top = (this.offroad ? C.offroadMax : C.maxSpeed) * this.speedMul;
    if (boosting) {
      this.speed = Math.min(C.boostSpeed, this.speed + C.boostAccel * dt);
    } else if (throttle > 0) {
      if (this.speed < top) this.speed = Math.min(top, this.speed + C.accel * throttle * dt);
    } else if (throttle < 0) {
      this.speed = this.speed > 0 ? this.speed - C.brake * dt : Math.max(-C.reverseMax, this.speed - C.accel * 0.6 * dt);
    } else {
      const f = C.friction * dt;
      this.speed = Math.abs(this.speed) <= f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    if (!boosting && this.speed > top) this.speed = Math.max(top, this.speed - C.overspeedDecay * dt);
    if (spinning) this.speed *= Math.exp(-2.5 * dt);

    // Steering
    let turn = C.turnRate * steer;
    if (this.drifting) {
      if (!ctl.drift || this.speed < C.driftMinSpeed * 0.6 || spinning) {
        this.endDrift(!spinning);
      } else {
        turn = C.turnRate * (this.driftDir * 0.75 + steer * 0.5);
        this.driftCharge += dt * (0.7 + 0.6 * Math.max(0, steer * this.driftDir));
      }
    }
    this.heading = wrapAngle(this.heading + turn * clamp(this.speed / 8, -1, 1) * dt);

    // Velocity chases the facing direction; lower grip while drifting makes the kart slide.
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const grip = spinning ? 1.5 : this.drifting ? C.driftGrip : C.grip;
    const k = 1 - Math.exp(-grip * dt);
    this.vel.x += (fx * this.speed - this.vel.x) * k;
    this.vel.z += (fz * this.speed - this.vel.z) * k;
    this.vel.y = 0;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // Track constraints
    const loc = this.track.locate(this.pos, this.trackIndex);
    const N = this.track.N;
    let d = loc.index - this.trackIndex;
    if (d > N / 2) d -= N;
    if (d < -N / 2) d += N;
    this.progress += d;
    this.trackIndex = loc.index;
    this.lateral = loc.lateral;

    const s = loc.sample;
    const lim = this.track.wallOffset - C.kartRadius;
    if (Math.abs(loc.lateral) > lim) {
      const side = Math.sign(loc.lateral);
      this.pos.addScaledVector(s.right, -(loc.lateral - side * lim));
      const vn = this.vel.x * s.right.x + this.vel.z * s.right.z;
      if (vn * side > 0) {
        this.vel.addScaledVector(s.right, -vn * 1.4);
        this.speed *= 1 - Math.min(0.5, Math.abs(vn) / 40);
        if (Math.abs(vn) > 8) this.events.push('bump');
      }
    }
    this.offroad = Math.abs(this.lateral) > this.track.halfWidth + this.track.curb;
    this.pos.y = loc.y;

    this.hopV -= 25 * dt;
    this.hopY = Math.max(0, this.hopY + this.hopV * dt);
    if (this.hopY === 0) this.hopV = 0;

    const along = this.vel.x * s.t.x + this.vel.z * s.t.z;
    this.wrongWayTime = along < -3 ? this.wrongWayTime + dt : 0;

    this.steerVis = damp(this.steerVis, steer, 12, dt);
    this.syncMesh(dt, s);
  }

  syncMesh(dt, s) {
    const m = this.model;
    const pitch = -Math.asin(clamp(s.t.y, -1, 1)) * Math.cos(this.heading - s.heading);
    this.yawOffset = damp(this.yawOffset, this.drifting ? this.driftDir * 0.18 : 0, 10, dt);
    const spin = this.spinTime > 0 ? (1 - this.spinTime / C.spinTime) * Math.PI * 4 : 0;

    m.root.position.set(this.pos.x, this.pos.y + this.hopY, this.pos.z);
    m.root.rotation.set(pitch, this.heading + this.yawOffset + spin, 0, 'YXZ');
    m.body.rotation.z =
      this.steerVis * 0.06 * clamp(this.speed / C.maxSpeed, 0, 1) + (this.drifting ? this.driftDir * 0.05 : 0);

    for (const w of m.wheels) {
      w.spin.rotation.x += (this.speed * dt) / w.r;
      if (w.front) w.steer.rotation.y = this.steerVis * 0.45;
    }

    const tier = this.spinTime > 0 ? -1 : this.driftTier;
    for (const sp of m.sparks) {
      sp.visible = tier >= 0 && this.hopY === 0;
      if (sp.visible) {
        sp.scale.setScalar((tier === 0 ? 0.4 : 0.8) + Math.random() * 0.7);
        sp.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      }
    }
    if (tier >= 0) m.sparkMat.color.setHex(SPARK_COLORS[tier]);

    const boosting = this.boostTime > 0;
    for (const f of m.flames) {
      f.visible = boosting;
      if (boosting) f.scale.set(1, 0.8 + Math.random() * 0.8, 1);
    }
  }
}
