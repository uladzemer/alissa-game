import Phaser from 'phaser';
import { GAME_W, GAME_H, PLAYER, titleStyle, viewW } from '../game/constants';
import { touch, isTouchDevice } from '../game/controls';
import { load } from '../game/save';
import { toggleMute, isMuted } from '../game/sfx';
import type { LevelScene } from './Level';
import { paintedButton, paintedPanel, roundPlate, PlateColor } from '../game/ui';

interface Btn { name: 'jump' | 'shoot' | 'shield' | 'kesha'; x: number; y: number; r: number; g: Phaser.GameObjects.Container }

const PAD = { x: 200, y: 560, r: 185 };

/** Hearts, stars, crystals, Kesha charge, boss bar, pause menu and the on-screen touch buttons. */
export class HudScene extends Phaser.Scene {
  private level!: LevelScene;
  private hearts: Phaser.GameObjects.Image[] = [];
  private starText!: Phaser.GameObjects.Text;
  private crystals: Phaser.GameObjects.Image[] = [];
  private keshaIcon!: Phaser.GameObjects.Image;
  private keshaRing!: Phaser.GameObjects.Graphics;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossLabel!: Phaser.GameObjects.Text;
  private buttons: Btn[] = [];
  private pad: Phaser.GameObjects.Graphics | null = null;
  private padKnob: Phaser.GameObjects.Arc | null = null;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private showTouch = false;

  constructor() {
    super('Hud');
  }

  init(data: { level: LevelScene }) {
    this.level = data.level;
    this.hearts = [];
    this.crystals = [];
    this.buttons = [];
    this.pad = null;
    this.padKnob = null;
    this.pauseLayer = null;
  }

  /** x measured from the right edge of a 1280-wide layout, kept at the right edge on wider screens. */
  private R(x: number) {
    return viewW(this) - (GAME_W - x);
  }

  create() {
    this.input.addPointer(4);
    const relayout = () => this.scene.restart({ level: this.level });
    this.scale.on('resize', relayout);
    this.events.once('shutdown', () => this.scale.off('resize', relayout));
    for (let i = 0; i < PLAYER.heartCap; i++) {
      this.hearts.push(this.add.image(46 + i * 58, 44, 'heart').setScale(46 / 144));
    }
    this.add.image(56, 104, 'star').setScale(40 / 132);
    this.starText = this.add.text(86, 104, '0', titleStyle(34, '#ffe36e', '#7a4a00')).setOrigin(0, 0.5);
    this.add.rectangle(viewW(this) / 2, 42, 270, 60, 0x2a1840, 0.35).setStrokeStyle(3, 0xffffff, 0.5);
    for (let i = 0; i < 5; i++) {
      this.crystals.push(this.add.image(viewW(this) / 2 - 100 + i * 50, 42, 'crystal').setScale(44 / 128));
    }
    this.bossBar = this.add.graphics();
    this.bossLabel = this.add.text(viewW(this) / 2, 92, 'Колдунья', titleStyle(24, '#e3b5ff')).setOrigin(0.5).setVisible(false);

    const pause = roundPlate(this, this.R(GAME_W - 52), 48, 36, 'pink').setInteractive({ useHandCursor: true });
    this.add.text(this.R(GAME_W - 52), 46, 'II', titleStyle(30, '#ffffff', '#b8326f')).setOrigin(0.5);
    pause.on('pointerdown', () => this.level.togglePause());

    this.showTouch = isTouchDevice();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch && !this.showTouch) {
        this.showTouch = true;
        this.buildTouch();
      }
    });

    // Kesha charge: shown near the Kesha button on touch, top-left on keyboard
    this.keshaRing = this.add.graphics();
    this.keshaIcon = this.add.image(0, 0, 'kesha-fly1').setScale(58 / 200);
    if (this.showTouch) this.buildTouch();
    this.placeKeshaIcon();

    this.events.on('pause', () => this.openPause());
    if (this.scene.isPaused('Level')) this.openPause();
    this.events.once('shutdown', () => this.clearTouch());
  }

  private placeKeshaIcon() {
    if (this.showTouch) this.keshaIcon.setPosition(this.R(1170), 390);
    else this.keshaIcon.setPosition(56, 170);
  }

  private buildTouch() {
    this.placeKeshaIcon();
    this.pad = this.add.graphics().setAlpha(0.55);
    this.pad.fillStyle(0xffffff, 0.25).fillCircle(PAD.x, PAD.y, PAD.r);
    this.pad.lineStyle(5, 0xffffff, 0.7).strokeCircle(PAD.x, PAD.y, PAD.r);
    const arrow = (dx: number, dy: number) => {
      const cx = PAD.x + dx * 118;
      const cy = PAD.y + dy * 118;
      const s = 34;
      this.pad!.fillStyle(0xffffff, 0.95);
      if (dx) this.pad!.fillTriangle(cx + dx * s, cy, cx - dx * s * 0.6, cy - s, cx - dx * s * 0.6, cy + s);
      else this.pad!.fillTriangle(cx, cy + dy * s, cx - s, cy - dy * s * 0.6, cx + s, cy - dy * s * 0.6);
    };
    arrow(-1, 0);
    arrow(1, 0);
    arrow(0, -1);
    arrow(0, 1);
    this.padKnob = this.add.circle(PAD.x, PAD.y, 46, 0xff7eb6, 0.6).setStrokeStyle(4, 0xffffff);

    const mk = (name: Btn['name'], x: number, y: number, r: number, color: PlateColor, icon: string, label: string) => {
      const g = this.add.container(x, y);
      g.add(roundPlate(this, 0, 0, r, color));
      if (icon) g.add(this.add.image(0, -8, icon).setScale((r * 0.9) / 200));
      g.add(this.add.text(0, r * 0.62, label, titleStyle(20)).setOrigin(0.5));
      g.setAlpha(0.9);
      this.buttons.push({ name, x, y, r, g });
    };
    mk('jump', this.R(1150), 600, 92, 'blue', 'alice-jump', 'Прыжок');
    mk('shoot', this.R(960), 640, 72, 'pink', '', 'Сердечко');
    this.buttons[1].g.add(this.add.image(0, -10, 'heart').setScale(60 / 144));
    mk('shield', this.R(985), 470, 60, 'lilac', 'alice-shield', 'Щит');
    mk('kesha', this.R(1170), 400, 62, 'green', '', 'Кеша');
    this.children.bringToTop(this.keshaRing);
    this.children.bringToTop(this.keshaIcon);
  }

  private clearTouch() {
    for (const k of Object.keys(touch) as (keyof typeof touch)[]) touch[k] = false;
  }

  private readTouch() {
    if (!this.pad) return;
    this.clearTouch();
    if (this.pauseLayer) return;
    let knob: { x: number; y: number } | null = null;
    for (const p of this.input.manager.pointers) {
      if (!p || !p.isDown) continue;
      const dx = p.x - PAD.x;
      const dy = p.y - PAD.y;
      if (dx * dx + dy * dy < (PAD.r + 60) ** 2 && p.x < viewW(this) / 2) {
        if (dx < -38) touch.left = true;
        if (dx > 38) touch.right = true;
        if (dy < -52) touch.up = true;
        if (dy > 52) touch.down = true;
        const len = Math.min(1, Math.hypot(dx, dy) / 120);
        const a = Math.atan2(dy, dx);
        knob = { x: PAD.x + Math.cos(a) * len * 120, y: PAD.y + Math.sin(a) * len * 120 };
        continue;
      }
      for (const b of this.buttons) {
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r + 18) ** 2) touch[b.name] = true;
      }
    }
    this.padKnob?.setPosition(knob?.x ?? PAD.x, knob?.y ?? PAD.y);
    for (const b of this.buttons) b.g.setScale(touch[b.name] ? 0.9 : 1);
  }

  update() {
    this.readTouch();
    const L = this.level;
    if (!L.player) return;
    this.hearts.forEach((h, i) => {
      h.setVisible(i < L.player.maxHearts);
      h.setTint(i < L.player.hearts ? 0xffffff : 0x555566);
      h.setAlpha(i < L.player.hearts ? 1 : 0.5);
    });
    this.starText.setText(String(L.starsHere));
    const got = load().crystals;
    this.crystals.forEach((c, i) => {
      c.setTint(got[i] ? 0xffffff : 0x9aa4c8);
      c.setAlpha(got[i] ? 1 : 0.4);
    });

    // Kesha charge ring
    const now = L.time.now;
    const left = Math.max(0, L.keshaReadyAt - now);
    const frac = 1 - left / PLAYER.keshaCdMs;
    this.keshaRing.clear();
    const { x, y } = this.keshaIcon;
    this.keshaRing.lineStyle(7, frac >= 1 ? 0x7dff7a : 0xffffff, frac >= 1 ? 1 : 0.6);
    this.keshaRing.beginPath();
    this.keshaRing.arc(x, y, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    this.keshaRing.strokePath();
    this.keshaIcon.setAlpha(frac >= 1 ? 1 : 0.55);
    if (frac >= 1) this.keshaIcon.setScale((58 / 200) * (1 + Math.sin(now / 150) * 0.06));

    // boss
    this.bossBar.clear();
    const w = L.witch;
    if (w && w.state === 'fight') {
      this.bossLabel.setVisible(true);
      this.bossBar.fillStyle(0x2a1840, 0.8).fillRoundedRect(viewW(this) / 2 - 200, 110, 400, 22, 10);
      this.bossBar.fillStyle(0xb46cff).fillRoundedRect(viewW(this) / 2 - 196, 114, 392 * (w.hp / w.maxHp), 14, 7);
    } else this.bossLabel.setVisible(false);
  }

  private openPause() {
    if (this.pauseLayer) return;
    this.clearTouch();
    const c = this.add.container(0, 0).setDepth(500);
    c.add(this.add.rectangle(viewW(this) / 2, GAME_H / 2, viewW(this), GAME_H, 0x2a1840, 0.6).setInteractive());
    c.add(paintedPanel(this, viewW(this) / 2, GAME_H / 2 + 10, 620, 560));
    c.add(this.add.text(viewW(this) / 2, 150, 'Пауза', titleStyle(60)).setOrigin(0.5));
    const button = (y: number, label: string, cb: () => void) => {
      const b = paintedButton(this, viewW(this) / 2, y, label, 36, cb, 440);
      c.add(b);
      return b.list[b.list.length - 1] as Phaser.GameObjects.Text;
    };
    button(275, 'Продолжить', () => this.closePause());
    button(390, 'Выбрать мир', () => {
      this.closePause();
      this.level.scene.start('Map');
    });
    const snd = button(505, isMuted() ? 'Звук: выкл' : 'Звук: вкл', () => snd.setText(toggleMute() ? 'Звук: выкл' : 'Звук: вкл'));
    this.pauseLayer = c;
    // listen for ESC from the next frame on: the press that opened the pause is still being dispatched
    this.time.delayedCall(60, () => this.input.keyboard?.once('keydown-ESC', this.escClose));
  }

  private escClose = () => this.closePause();

  private closePause() {
    this.input.keyboard?.off('keydown-ESC', this.escClose);
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    this.scene.resume('Level');
  }
}
