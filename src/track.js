import * as THREE from 'three';
import { CONFIG as C } from './config.js';

// Closed loop of [x, y, z] control points. y gives the hill on the back section.
const CONTROL = [
  [0, 0, 0],
  [90, 0, 0],
  [160, 1, 20],
  [195, 4, 80],
  [175, 9, 150],
  [115, 11, 175],
  [65, 6, 140],
  [15, 2, 160],
  [-55, 0, 195],
  [-130, 0, 165],
  [-165, 0, 95],
  [-125, 0, 25],
  [-60, 0, -5],
];

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, count, light = 0.07, dark = 0.1) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${light})` : `rgba(0,0,0,${dark})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

const roadTexture = () =>
  canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#585b62';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1600);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(4, 0, 3, h); // edge lines
    g.fillRect(w - 7, 0, 3, h);
    g.fillRect(w / 2 - 2, 0, 4, h / 2); // centre dash
  });

const curbTexture = () =>
  canvasTexture(8, 32, (g, w, h) => {
    g.fillStyle = '#e53935';
    g.fillRect(0, 0, w, h / 2);
    g.fillStyle = '#f5f5f5';
    g.fillRect(0, h / 2, w, h / 2);
  });

const wallTexture = () =>
  canvasTexture(64, 16, (g, w, h) => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1e63e9';
    g.fillRect(0, 0, w / 2, h);
  });

export const grassTexture = () =>
  canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#5fb84a';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, 0.08, 0.08);
  });

const checkerTexture = (cols, rows) =>
  canvasTexture(cols * 32, rows * 32, (g) => {
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        g.fillRect(x * 32, y * 32, 32, 32);
      }
  });

const bannerTexture = () =>
  canvasTexture(512, 64, (g, w, h) => {
    for (let x = 0; x < w / 16; x++)
      for (let y = 0; y < 4; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    g.fillStyle = '#e53935';
    g.fillRect(150, 6, 212, 52);
    g.fillStyle = '#fff';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('KART RUSH', w / 2, h / 2 + 2);
  });

export class Track {
  constructor() {
    this.halfWidth = C.trackWidth / 2;
    this.curb = 1.6;
    this.wallOffset = this.halfWidth + this.curb + 5;

    const pts = CONTROL.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    this.N = C.samples;
    this.segLen = this.length / this.N;

    this.samples = [];
    for (let i = 0; i < this.N; i++) {
      const u = i / this.N;
      const pos = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u).normalize();
      const h = Math.hypot(t.x, t.z) || 1;
      this.samples.push({
        i,
        pos,
        t,
        right: new THREE.Vector3(-t.z / h, 0, t.x / h),
        heading: Math.atan2(t.x, t.z),
        slope: t.y / h,
        dist: u * this.length,
      });
    }

    this.itemRows = [0.2, 0.48, 0.79].map((f) => Math.round(f * this.N));

    this.group = new THREE.Group();
    this.buildMeshes();
  }

  sample(i) {
    const N = this.N;
    return this.samples[((i % N) + N) % N];
  }

  // Nearest centre-line sample to p (XZ only). With a hint, only searches nearby samples.
  locate(p, hint = -1) {
    const N = this.N;
    let best = 0;
    let bd = Infinity;
    const test = (i) => {
      const s = this.samples[i].pos;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    };
    if (hint < 0) for (let i = 0; i < N; i++) test(i);
    else for (let k = -24; k <= 24; k++) test((((hint + k) % N) + N) % N);

    const s = this.samples[best];
    const dx = p.x - s.pos.x;
    const dz = p.z - s.pos.z;
    const h = Math.hypot(s.t.x, s.t.z) || 1;
    const along = (dx * s.t.x + dz * s.t.z) / h;
    return {
      index: best,
      lateral: dx * s.right.x + dz * s.right.z,
      along,
      y: s.pos.y + s.slope * along,
      sample: s,
    };
  }

  // Flat strip between lateral offsets a < b, following the centre line.
  ribbon(a, b, dy, material, vScale) {
    const N = this.N;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % N];
      const d = i === N ? this.length : s.dist;
      pos.push(
        s.pos.x + s.right.x * a, s.pos.y + dy, s.pos.z + s.right.z * a,
        s.pos.x + s.right.x * b, s.pos.y + dy, s.pos.z + s.right.z * b,
      );
      uv.push(0, d / vScale, 1, d / vScale);
      if (i < N) {
        const q = i * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  // Vertical barrier at a lateral offset, running from below ground to `height` above the road.
  wall(offset, height, material, uScale) {
    const N = this.N;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % N];
      const d = i === N ? this.length : s.dist;
      const x = s.pos.x + s.right.x * offset;
      const z = s.pos.z + s.right.z * offset;
      pos.push(x, -0.5, z, x, s.pos.y + height, z);
      uv.push(d / uScale, 0, d / uScale, 1);
      if (i < N) {
        const q = i * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildMeshes() {
    const hw = this.halfWidth;
    const cw = this.curb;
    const wo = this.wallOffset;

    const road = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.9 });
    this.ribbon(-hw, hw, 0.06, road, 14);

    const curb = new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.7 });
    this.ribbon(-hw - cw, -hw, 0.07, curb, 4);
    this.ribbon(hw, hw + cw, 0.07, curb, 4);

    const shoulder = new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0xc8e6b0, roughness: 1 });
    shoulder.map.repeat.set(1, 1);
    this.ribbon(-wo, -hw - cw, 0.03, shoulder, 8);
    this.ribbon(hw + cw, wo, 0.03, shoulder, 8);

    const wall = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.6, side: THREE.DoubleSide });
    this.wall(-wo, 1.3, wall, 6);
    this.wall(wo, 1.3, wall, 6);

    // Start line and gantry
    const s0 = this.samples[0];
    const start = new THREE.Group();
    start.position.copy(s0.pos);
    start.rotation.y = s0.heading;
    this.group.add(start);

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(C.trackWidth, 2.4),
      new THREE.MeshStandardMaterial({ map: checkerTexture(10, 2), roughness: 0.8 }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.09;
    line.receiveShadow = true;
    start.add(line);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 12), poleMat);
      pole.position.set(side * (hw + 3), 4.5, 0);
      pole.castShadow = true;
      start.add(pole);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(C.trackWidth + 6.7, 2.4, 0.4),
      new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.6 }),
    );
    banner.position.y = 8.4;
    banner.castShadow = true;
    start.add(banner);
  }
}

export function buildScenery(track) {
  const group = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }),
  );
  ground.material.map.repeat.set(250, 250);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  group.add(ground);

  // Trees, kept clear of the walls.
  const spots = [];
  for (let tries = 0; spots.length < 220 && tries < 3000; tries++) {
    const p = new THREE.Vector3(-360 + Math.random() * 720, 0, -200 + Math.random() * 600);
    if (Math.abs(track.locate(p).lateral) > track.wallOffset + 5) spots.push(p);
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.5, 0.7, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 1 }),
    spots.length,
  );
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(3, 7, 7),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  spots.forEach((p, i) => {
    const s = 0.7 + Math.random() * 0.8;
    sc.set(s, s, s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    m.compose(new THREE.Vector3(p.x, 1.2 * s, p.z), q, sc);
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(p.x, 5.8 * s, p.z), q, sc);
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, col.setHSL(0.27 + Math.random() * 0.08, 0.55, 0.28 + Math.random() * 0.12));
  });
  for (const t of [trunks, leaves]) {
    t.castShadow = true;
    t.receiveShadow = true;
    group.add(t);
  }

  // Distant mountains
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x6f8f7a, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
    const r = 620 + Math.random() * 120;
    const h = 90 + Math.random() * 110;
    const rad = 70 + Math.random() * 60;
    const mount = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), mountainMat);
    mount.position.set(15 + Math.cos(a) * r, h / 2 - 1, 95 + Math.sin(a) * r);
    group.add(mount);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.3, h * 0.3, 7), snowMat);
    cap.position.set(mount.position.x, h - (h * 0.3) / 2 - 0.5, mount.position.z);
    group.add(cap);
  }

  // Clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x666666 });
  const puff = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 22; i++) {
    const cloud = new THREE.Group();
    cloud.position.set(-450 + Math.random() * 900, 110 + Math.random() * 70, -300 + Math.random() * 800);
    for (let j = 0; j < 4; j++) {
      const p = new THREE.Mesh(puff, cloudMat);
      const s = 10 + Math.random() * 10;
      p.scale.set(s * 1.4, s * 0.8, s);
      p.position.set(j * 14 - 20 + Math.random() * 6, Math.random() * 5, Math.random() * 8);
      cloud.add(p);
    }
    group.add(cloud);
  }

  return group;
}
