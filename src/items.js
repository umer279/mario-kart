import * as THREE from 'three';
import { CONFIG as C } from './config.js';

export const ITEM_TYPES = ['banana', 'shell', 'mushroom'];

function questionTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#fff';
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ItemSystem {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.time = 0;
    this.boxes = [];
    this.bananas = [];
    this.shells = [];

    this.boxGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    this.boxMat = new THREE.MeshStandardMaterial({
      map: questionTexture(), transparent: true, opacity: 0.85, roughness: 0.2, emissive: 0x333333,
    });
    for (const idx of track.itemRows) {
      const s = track.sample(idx);
      for (const lat of [-6, -2, 2, 6]) {
        const base = s.pos.clone().addScaledVector(s.right, lat);
        base.y += 1.6;
        const mesh = new THREE.Mesh(this.boxGeo, this.boxMat);
        mesh.position.copy(base);
        mesh.castShadow = true;
        scene.add(mesh);
        this.boxes.push({ mesh, base, active: true, timer: 0, phase: Math.random() * 6 });
      }
    }

    // banana: a curved yellow torus with a stalk
    this.bananaGeo = new THREE.TorusGeometry(0.5, 0.17, 8, 16, Math.PI * 1.1);
    this.bananaMat = new THREE.MeshStandardMaterial({ color: 0xffd93b, roughness: 0.5 });
    this.stalkGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6);
    this.stalkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d10 });

    // shell: green dome with a white rim
    this.domeGeo = new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.domeMat = new THREE.MeshStandardMaterial({ color: 0x2ecc40, roughness: 0.35 });
    this.rimGeo = new THREE.TorusGeometry(0.62, 0.13, 8, 20);
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  }

  makeBanana() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(this.bananaGeo, this.bananaMat);
    b.rotation.z = Math.PI * 0.95;
    b.position.y = 0.55;
    b.castShadow = true;
    const st = new THREE.Mesh(this.stalkGeo, this.stalkMat);
    st.position.set(-0.45, 0.45, 0);
    g.add(b, st);
    this.scene.add(g);
    return g;
  }

  makeShell() {
    const g = new THREE.Group();
    const d = new THREE.Mesh(this.domeGeo, this.domeMat);
    d.castShadow = true;
    const r = new THREE.Mesh(this.rimGeo, this.rimMat);
    r.rotation.x = Math.PI / 2;
    g.add(d, r);
    this.scene.add(g);
    return g;
  }

  // Racers further back are more likely to get a mushroom.
  roll(rank, total) {
    const r = total > 1 ? (rank - 1) / (total - 1) : 0;
    const w = [0.55 * (1 - r) + 0.15 * r, 0.38 * (1 - r) + 0.35 * r, 0.07 * (1 - r) + 0.5 * r];
    let x = Math.random() * (w[0] + w[1] + w[2]);
    for (let i = 0; i < 3; i++) {
      if ((x -= w[i]) <= 0) return ITEM_TYPES[i];
    }
    return 'mushroom';
  }

  use(kart, back) {
    const item = kart.item;
    if (!item) return;
    kart.item = null;
    kart.events.push('throw');
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);

    if (item === 'mushroom') {
      kart.boost(C.mushroomBoost);
    } else if (item === 'banana') {
      const pos = new THREE.Vector3(kart.pos.x - fx * 2.8, 0, kart.pos.z - fz * 2.8);
      pos.y = this.track.locate(pos, kart.trackIndex).y;
      const mesh = this.makeBanana();
      mesh.position.copy(pos);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.bananas.push({ mesh, pos, owner: kart, immune: 0.6 });
    } else if (item === 'shell') {
      const dir = back ? -1 : 1;
      const pos = new THREE.Vector3(kart.pos.x + fx * 2.8 * dir, kart.pos.y, kart.pos.z + fz * 2.8 * dir);
      const vel = new THREE.Vector3(fx * C.shellSpeed * dir, 0, fz * C.shellSpeed * dir);
      this.shells.push({
        mesh: this.makeShell(), pos, vel, owner: kart, immune: 0.3, life: C.shellLife, bounces: 0, index: kart.trackIndex,
      });
    }
  }

  remove(list, i) {
    this.scene.remove(list[i].mesh);
    list.splice(i, 1);
  }

  update(dt, karts) {
    this.time += dt;
    this.boxMat.color.setHSL((this.time * 0.12) % 1, 0.85, 0.65);

    for (const b of this.boxes) {
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.active = true;
          b.mesh.visible = true;
          b.mesh.scale.setScalar(0.01);
        }
        continue;
      }
      b.mesh.scale.setScalar(Math.min(1, b.mesh.scale.x + dt * 3));
      b.mesh.rotation.set(this.time * 0.9 + b.phase, this.time * 1.3 + b.phase, 0);
      b.mesh.position.y = b.base.y + Math.sin(this.time * 2.5 + b.phase) * 0.25;
      for (const k of karts) {
        if (k.pos.distanceToSquared(b.mesh.position) < 2.6 * 2.6) {
          b.active = false;
          b.mesh.visible = false;
          b.timer = C.itemRespawn;
          if (!k.item && k.roulette <= 0) {
            k.roulette = C.rouletteTime;
            k.pendingItem = this.roll(k.rank, karts.length);
            k.events.push('pickup');
          }
          break;
        }
      }
    }

    for (const k of karts) {
      if (k.roulette > 0) {
        k.roulette -= dt;
        if (k.roulette <= 0) k.item = k.pendingItem;
      }
    }

    // bananas
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const b = this.bananas[i];
      b.immune -= dt;
      for (const k of karts) {
        if (k === b.owner && b.immune > 0) continue;
        if (k.spinTime > 0) continue;
        const dx = k.pos.x - b.pos.x;
        const dz = k.pos.z - b.pos.z;
        if (dx * dx + dz * dz < 1.8 * 1.8) {
          k.spinOut();
          this.remove(this.bananas, i);
          break;
        }
      }
    }

    // shells
    const lim = this.track.wallOffset - 0.7;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.immune -= dt;
      s.pos.addScaledVector(s.vel, dt);
      const loc = this.track.locate(s.pos, s.index);
      s.index = loc.index;
      if (Math.abs(loc.lateral) > lim) {
        const side = Math.sign(loc.lateral);
        const r = loc.sample.right;
        s.pos.addScaledVector(r, -(loc.lateral - side * lim));
        s.vel.addScaledVector(r, -2 * s.vel.dot(r));
        s.bounces++;
      }
      s.pos.y = loc.y + 0.15;
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.y += dt * 12;

      let dead = s.life <= 0 || s.bounces > C.shellBounces;
      if (!dead) {
        for (const k of karts) {
          if (k === s.owner && s.immune > 0) continue;
          const dx = k.pos.x - s.pos.x;
          const dz = k.pos.z - s.pos.z;
          if (dx * dx + dz * dz < 2.0 * 2.0) {
            k.spinOut();
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = this.bananas.length - 1; j >= 0; j--) {
          if (this.bananas[j].pos.distanceToSquared(s.pos) < 1.6 * 1.6) {
            this.remove(this.bananas, j);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = 0; j < this.shells.length; j++) {
          if (j !== i && this.shells[j].pos.distanceToSquared(s.pos) < 1.4 * 1.4) {
            this.shells[j].life = 0; // the other one dies on its own turn
            dead = true;
            break;
          }
        }
      }
      if (dead) this.remove(this.shells, i);
    }
  }

  dispose() {
    for (const o of [this.boxGeo, this.boxMat, this.boxMat.map, this.bananaGeo, this.bananaMat, this.stalkGeo,
      this.stalkMat, this.domeGeo, this.domeMat, this.rimGeo, this.rimMat]) o.dispose();
  }
}
