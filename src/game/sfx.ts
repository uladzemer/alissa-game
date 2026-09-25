import { load, save } from './save';

/** Tiny WebAudio synth: all game sounds and a cheerful chiptune loop, no audio files needed. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = load().muted ? 0 : 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from any user gesture so mobile browsers allow sound. */
export function unlockAudio() {
  if (ac()) loadSamples();
}

// --- Recorded sounds: Kenney CC0 packs (public/sfx, see LICENSE-kenney-CC0.txt), ~140 KB in total.
// Loaded after the first tap (not during boot), each one falls back to the synth until it has arrived.
const SAMPLE_NAMES = [
  'jump', 'doublejump', 'star', 'strawberry', 'shoot', 'befriend', 'stomp', 'hurt', 'shield', 'checkpoint',
  'kesha', 'crystal', 'win', 'click', 'magic', 'bosshit',
  ...[0, 1, 2, 3, 4].flatMap((i) => [`step-grass${i}`, `step-stone${i}`]),
];
const buffers = new Map<string, AudioBuffer>();
let loading = false;

function loadSamples() {
  const a = ctx;
  if (loading || !a) return;
  loading = true;
  // one sfx.json with every MP3 in base64 (built by art/build_assets.py): download-manager extensions
  // grab *.mp3 requests and save them as files, a json request they leave alone
  fetch('sfx.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((pack: Record<string, string>) => {
      for (const name of SAMPLE_NAMES) {
        const b64 = pack[name];
        if (!b64) continue;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        a.decodeAudioData(bytes.buffer)
          .then((buf) => buffers.set(name, buf))
          .catch(() => undefined); // keep the synth version
      }
    })
    .catch(() => undefined);
}

let lastStep = 0;

/** Recorded sound at a set pitch (footsteps: a steady left-right rhythm reads as running). */
function playAt(name: string, vol: number, rate: number) {
  const buf = buffers.get(name);
  const a = ctx;
  if (!buf || !a || !master) return;
  const src = a.createBufferSource();
  const g = a.createGain();
  src.buffer = buf;
  src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.03);
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
}

/** Play a recorded sound; false if it is not loaded (then the caller uses the synth). Slight pitch variety. */
function play(name: string, vol = 1, vary = 0.06) {
  const buf = buffers.get(name);
  const a = ctx;
  if (!buf || !a || !master) return false;
  const src = a.createBufferSource();
  const g = a.createGain();
  src.buffer = buf;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
  return true;
}

export function isMuted() {
  return load().muted;
}

export function toggleMute() {
  const muted = !load().muted;
  save({ muted });
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function tone(f0: number, f1: number, dur: number, type: OscillatorType = 'square', vol = 0.25, delay = 0, out?: AudioNode) {
  const a = ac();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out ?? master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, delay = 0) {
  const a = ac();
  if (!a || !master) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = vol;
  s.buffer = buf;
  s.connect(g).connect(master);
  s.start(a.currentTime + delay);
}

export const sfx = {
  jump: () => play('jump', 0.55) || tone(300, 620, 0.15, 'square', 0.12),
  doubleJump: () => play('doublejump', 0.55) || tone(500, 1000, 0.14, 'square', 0.12),
  star: () => play('star', 0.7, 0.1) || (tone(988, 988, 0.06, 'square', 0.1), tone(1319, 1319, 0.14, 'square', 0.1, 0.06)),
  strawberry: () => play('strawberry', 0.8, 0) || [660, 880, 1100].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.25, i * 0.08)),
  shoot: () => play('shoot', 0.8, 0.1) || tone(900, 1400, 0.1, 'sine', 0.18),
  befriend: () => play('befriend', 0.8) || [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.25, i * 0.08)),
  stomp: () => play('stomp', 0.9) || tone(400, 150, 0.12, 'square', 0.18),
  hurt: () => play('hurt', 0.8, 0) || tone(400, 120, 0.3, 'sawtooth', 0.18),
  shield: () => play('shield', 0.6) || tone(200, 200, 0.08, 'triangle', 0.2),
  checkpoint: () => play('checkpoint', 0.7, 0) || [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, 'square', 0.1, i * 0.08)),
  splash: () => noise(0.4, 0.25),
  kesha: () => (play('kesha', 0.6), tone(1500, 2400, 0.08, 'sine', 0.15), tone(1800, 2600, 0.08, 'sine', 0.15, 0.1)),
  crystal: () => play('crystal', 0.8, 0) || [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, f, 0.25, 'triangle', 0.2, i * 0.09)),
  win: () => play('win', 0.8, 0) || [523, 523, 523, 698, 880, 784, 880, 1047].forEach((f, i) => tone(f, f, 0.2, 'square', 0.1, i * 0.14)),
  click: () => play('click', 0.8, 0.04) || tone(700, 900, 0.05, 'triangle', 0.2),
  magic: () => play('magic', 0.6) || tone(300, 900, 0.35, 'sine', 0.15),
  bossHit: () => play('bosshit', 0.7) || tone(250, 180, 0.12, 'square', 0.2),
  /** Footstep on grass or stone: 5 variants, never the same one twice, left/right foot a little different. */
  step: (ground: 'grass' | 'stone', foot: 0 | 1) => {
    let i = Math.floor(Math.random() * 4);
    if (i >= lastStep) i++;
    lastStep = i;
    playAt(`step-${ground}${i}`, ground === 'grass' ? 0.75 : 0.6, foot ? 1.06 : 0.95);
  },
};

// --- Music: a small chiptune per world (placeholder until the real soundtrack arrives). ---
const N: Record<string, number> = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, _: 0 };
const TUNES: Record<string, { bpm: number; melody: string; bass: string }> = {
  title: { bpm: 110, melody: 'E5 G5 A5 G5 E5 C5 D5 E5 C5 _ E5 G5 A5 C5 G5 _', bass: 'C4 _ G4 _ A4 _ F4 _' },
  meadow: { bpm: 132, melody: 'C5 E5 G5 E5 F5 A5 G5 _ E5 G5 C5 G5 D5 F5 E5 _', bass: 'C4 _ F4 _ G4 _ C4 _' },
  forest: { bpm: 112, melody: 'A4 C5 E5 C5 D5 F5 E5 _ C5 E5 A5 G5 F5 D5 E5 _', bass: 'A4 _ D4 _ E4 _ A4 _' },
  river: { bpm: 124, melody: 'G4 B4 D5 B4 C5 E5 D5 _ B4 D5 G5 D5 C5 A4 B4 _', bass: 'G4 _ C4 _ D4 _ G4 _' },
  cave: { bpm: 100, melody: 'E4 G4 B4 G4 A4 C5 B4 _ G4 B4 E5 B4 A4 F4 G4 _', bass: 'E4 _ A4 _ B4 _ E4 _' },
  castle: { bpm: 140, melody: 'D5 F5 A5 F5 G5 E5 F5 _ D5 A4 D5 F5 E5 C5 D5 _', bass: 'D4 _ G4 _ A4 _ D4 _' },
};

export function playMusic(name: string) {
  stopMusic();
  const tune = TUNES[name];
  const a = ac();
  if (!tune || !a || !musicGain) return;
  const step = 60 / tune.bpm / 2;
  const mel = tune.melody.split(' ');
  const bass = tune.bass.split(' ');
  let i = 0;
  const tick = () => {
    const m = N[mel[i % mel.length]];
    if (m) tone(m, m, step * 0.9, 'square', 0.07, 0, musicGain!);
    if (i % 2 === 0) {
      const b = N[bass[(i / 2) % bass.length]];
      if (b) tone(b / 2, b / 2, step * 1.8, 'triangle', 0.18, 0, musicGain!);
    }
    i++;
  };
  tick();
  musicTimer = window.setInterval(tick, step * 1000);
}

export function stopMusic() {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
}
