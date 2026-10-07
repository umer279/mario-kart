let ctx = null;
let master = null;
let muted = false;
const VOLUME = 0.5;

export function initAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : VOLUME;
  return muted;
}

function tone(freq, dur = 0.12, { type = 'square', vol = 0.15, to = null, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const notes = (freqs, step, opts) => freqs.forEach((f, i) => tone(f, step * 1.6, { ...opts, delay: i * step }));

export const sfx = {
  beep: () => tone(440, 0.3, { vol: 0.18 }),
  go: () => tone(880, 0.6, { vol: 0.18 }),
  boost: () => tone(180, 0.45, { type: 'sawtooth', to: 900, vol: 0.1 }),
  hit: () => tone(700, 0.6, { type: 'triangle', to: 70, vol: 0.25 }),
  pickup: () => notes([523, 659, 784], 0.06, { vol: 0.1 }),
  throw: () => tone(320, 0.15, { to: 140, vol: 0.12 }),
  bump: () => tone(90, 0.12, { type: 'triangle', vol: 0.3 }),
  lap: () => notes([660, 880], 0.1, { vol: 0.12 }),
  finish: () => notes([523, 659, 784, 1047], 0.12, { vol: 0.14, type: 'triangle' }),
};

export class EngineSound {
  constructor(pan = 0) {
    if (!ctx) return;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 650;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    let node = this.osc.connect(this.filter).connect(this.gain);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(master);
    this.osc.start();
  }

  set(speed, boosting) {
    if (!this.osc) return;
    const t = ctx.currentTime;
    const s = Math.abs(speed);
    this.osc.frequency.setTargetAtTime(50 + s * 3.2 + (boosting ? 40 : 0), t, 0.05);
    this.gain.gain.setTargetAtTime(0.03 + Math.min(s, 40) * 0.0012, t, 0.1);
  }

  silence() {
    if (this.osc) this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  stop() {
    if (!this.osc) return;
    this.silence();
    this.osc.stop(ctx.currentTime + 0.3);
    this.osc = null;
  }
}
