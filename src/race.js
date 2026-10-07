import { CONFIG as C } from './config.js';

export class Race {
  constructor(karts, track, { attract = false } = {}) {
    this.karts = karts;
    this.track = track;
    this.laps = C.laps;
    this.attract = attract; // title-screen demo: no countdown, never ends
    this.state = attract ? 'racing' : 'countdown';
    this.countdown = 3;
    this.time = 0;
    this.endTimer = 0;
    this.finishCount = 0;
  }

  lapOf(k) {
    return Math.min(this.laps, Math.max(1, Math.floor(k.progress / this.track.N) + 1));
  }

  update(dt) {
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.state = 'racing';
    } else {
      this.time += dt;
    }

    if (!this.attract && this.state !== 'countdown') {
      const goal = this.laps * this.track.N;
      for (const k of this.karts) {
        if (!k.finished && k.progress >= goal) {
          k.finished = true;
          k.finishTime = this.time;
          k.finishPlace = ++this.finishCount;
          k.events.push('finish');
        }
      }
    }

    const order = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishPlace - b.finishPlace;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    order.forEach((k, i) => (k.rank = i + 1));
    this.order = order;

    if (!this.attract && this.state === 'racing' && this.karts.filter((k) => k.isHuman).every((k) => k.finished)) {
      this.endTimer += dt;
      if (this.endTimer > 3) this.state = 'results';
    }
  }
}
