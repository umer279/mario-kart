import { damp, wrapAngle } from './utils.js';

export class ChaseCam {
  constructor(camera, kart, { distance = 8.5, height = 3.8 } = {}) {
    this.camera = camera;
    this.kart = kart;
    this.distance = distance;
    this.height = height;
    this.yaw = kart.heading;
    this.fov = camera.fov;
    this.baseFov = camera.fov;
    this.ready = false;
  }

  update(dt) {
    const k = this.kart;
    const cam = this.camera;
    this.yaw += wrapAngle(k.heading - this.yaw) * (1 - Math.exp(-5 * dt));
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);

    const tx = k.pos.x - fx * this.distance;
    const ty = k.pos.y + this.height;
    const tz = k.pos.z - fz * this.distance;
    if (!this.ready) {
      cam.position.set(tx, ty, tz);
      this.ready = true;
    } else {
      cam.position.set(damp(cam.position.x, tx, 10, dt), damp(cam.position.y, ty, 6, dt), damp(cam.position.z, tz, 10, dt));
    }
    cam.lookAt(k.pos.x + fx * 5, k.pos.y + 1.4, k.pos.z + fz * 5);

    this.fov = damp(this.fov, this.baseFov + (k.boostTime > 0 ? 12 : 0), 6, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }
}
