import * as THREE from 'three';

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...opts });

// Builds a kart + driver out of primitives. The kart faces +z.
export function buildKartModel(color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = std(color, { roughness: 0.35, metalness: 0.2 });
  const shirt = std(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3));
  const dark = std(0x22252b);
  const metal = std(0xb8bcc4, { metalness: 0.8, roughness: 0.3 });
  const skin = std(0xffd2a6);

  const add = (geo, mat, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // chassis
  add(new THREE.BoxGeometry(1.7, 0.32, 2.7), paint, 0, 0.45, 0);
  add(new THREE.BoxGeometry(1.25, 0.3, 0.8), paint, 0, 0.5, 1.45).rotation.x = 0.15;
  add(new THREE.BoxGeometry(2.0, 0.18, 0.3), dark, 0, 0.3, 1.85);
  add(new THREE.BoxGeometry(1.9, 0.25, 0.3), dark, 0, 0.38, -1.45);
  add(new THREE.BoxGeometry(1.0, 0.75, 0.2), dark, 0, 0.95, -0.75).rotation.x = -0.2;
  add(new THREE.BoxGeometry(1.1, 0.45, 0.55), metal, 0, 0.8, -1.15);
  for (const sx of [-0.32, 0.32]) {
    add(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 10), metal, sx, 0.85, -1.5).rotation.x = Math.PI / 2;
  }

  // spoiler
  add(new THREE.BoxGeometry(1.9, 0.08, 0.45), paint, 0, 1.35, -1.35);
  for (const sx of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.08, 0.4, 0.2), dark, sx, 1.12, -1.35);

  // driver
  add(new THREE.CylinderGeometry(0.3, 0.38, 0.65, 12), shirt, 0, 1.05, -0.35);
  add(new THREE.SphereGeometry(0.33, 16, 12), skin, 0, 1.62, -0.3);
  add(new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, 1.7, -0.3);
  add(new THREE.BoxGeometry(0.5, 0.06, 0.3), paint, 0, 1.72, -0.02);
  for (const ex of [-0.11, 0.11]) add(new THREE.SphereGeometry(0.05, 8, 6), dark, ex, 1.66, 0.0);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), shirt, sx * 0.28, 1.12, 0.0).rotation.x = Math.PI / 2 - 0.5;
  }
  add(new THREE.TorusGeometry(0.2, 0.04, 8, 16), dark, 0, 1.1, 0.32).rotation.x = -0.6;

  // wheels: outer group steers (y), inner group rolls (x)
  const tire = std(0x1b1b1b, { roughness: 0.9 });
  const hub = std(0xdddddd, { metalness: 0.5 });
  const wheels = [];
  for (const [x, z, r, w, front] of [
    [-0.95, 1.0, 0.38, 0.35, true],
    [0.95, 1.0, 0.38, 0.35, true],
    [-0.98, -1.0, 0.46, 0.45, false],
    [0.98, -1.0, 0.46, 0.45, false],
  ]) {
    const steer = new THREE.Group();
    steer.position.set(x, r, z);
    body.add(steer);
    const spin = new THREE.Group();
    steer.add(spin);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16), tire);
    t.rotation.z = Math.PI / 2;
    t.castShadow = true;
    spin.add(t);
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, r * 1.3, 0.12), hub));
    wheels.push({ steer, spin, front, r });
  }

  // drift sparks + boost flames
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = [-0.98, 0.98].map((sx) => {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), sparkMat);
    s.position.set(sx, 0.2, -1.55);
    s.visible = false;
    body.add(s);
    return s;
  });

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffa020, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flames = [-0.32, 0.32].map((sx) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.9, 10), flameMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(sx, 0.85, -2.15);
    f.visible = false;
    body.add(f);
    return f;
  });

  return { root, body, wheels, sparks, sparkMat, flames };
}
