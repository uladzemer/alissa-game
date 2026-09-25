import Phaser from 'phaser';

/** One shared input state, filled by the keyboard (Level scene) and the on-screen buttons (Hud scene). */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  shoot: boolean;
  shield: boolean;
  kesha: boolean;
}

export const blank = (): InputState => ({ left: false, right: false, up: false, down: false, jump: false, shoot: false, shield: false, kesha: false });

/** Touch buttons write here every frame. */
export const touch: InputState = blank();

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches;
}

export class Keyboard {
  private keys: Record<string, Phaser.Input.Keyboard.Key[]>;
  /** Presses seen since the last read: a tap shorter than one frame still counts. */
  private latched = new Set<string>();

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const add = (...codes: number[]) => codes.map((c) => kb.addKey(c, true, false));
    this.keys = {
      left: add(K.LEFT, K.A),
      right: add(K.RIGHT, K.D),
      up: add(K.UP, K.W),
      down: add(K.DOWN, K.S),
      jump: add(K.SPACE),
      shoot: add(K.X, K.J),
      shield: add(K.Z, K.K),
      kesha: add(K.C, K.L),
    };
    for (const [name, keys] of Object.entries(this.keys)) for (const k of keys) k.on('down', () => this.latched.add(name));
  }

  read(): InputState {
    const s = blank();
    for (const name of Object.keys(this.keys) as (keyof InputState)[]) {
      s[name] = this.keys[name].some((k) => k.isDown) || this.latched.has(name) || touch[name];
    }
    this.latched.clear();
    return s;
  }
}
