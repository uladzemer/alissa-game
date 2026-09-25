import Phaser from 'phaser';
import { GAME_W, GAME_H, titleStyle, viewW } from '../game/constants';
import { preloadAssets, makePlaceholders } from '../game/assets';
import { LEVELS } from '../game/levels';
import { load, save } from '../game/save';
import { sfx, unlockAudio, playMusic, stopMusic } from '../game/sfx';
import { isTouchDevice } from '../game/controls';

/** Menus are laid out for 1280x720; on wider screens the camera keeps that layout centred. */
const leaving = new WeakSet<Phaser.Scene>();

/** Mark a menu as switching to another scene: resizes (fullscreen, rotation) no longer restart it. */
function leave(scene: Phaser.Scene) {
  leaving.add(scene);
  scene.events.once('shutdown', () => leaving.delete(scene));
}

function centre(scene: Phaser.Scene) {
  const fit = () => scene.cameras.main.setScroll(-(viewW(scene) - GAME_W) / 2, 0);
  fit();
  let lastW = viewW(scene);
  const restart = () => {
    if (Math.abs(viewW(scene) - lastW) < 1) return;
    lastW = viewW(scene);
    if (leaving.has(scene)) fit();
    else scene.scene.restart();
  };
  scene.scale.on('resize', restart);
  scene.events.once('shutdown', () => scene.scale.off('resize', restart));
}

function cover(scene: Phaser.Scene, key: string) {
  centre(scene);
  const img = scene.add.image(GAME_W / 2, GAME_H / 2, key);
  img.setScale(Math.max(viewW(scene) / img.width, GAME_H / img.height));
  return img;
}

function button(scene: Phaser.Scene, x: number, y: number, label: string, size: number, cb: () => void) {
  const t = scene.add.text(x, y, label, titleStyle(size)).setOrigin(0.5).setPadding(28, 12, 28, 12).setBackgroundColor('#ff7eb6');
  t.setInteractive({ useHandCursor: true });
  t.on('pointerup', () => {
    sfx.click();
    cb();
  });
  return t;
}

function goFullscreen(scene: Phaser.Scene) {
  if (!isTouchDevice() || scene.scale.isFullscreen) return;
  try {
    scene.scale.startFullscreen();
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => undefined);
  } catch {
    /* not allowed here: play in the browser window */
  }
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const bar = this.add.rectangle(GAME_W / 2 - 300, GAME_H / 2, 4, 24, 0xff7eb6).setOrigin(0, 0.5);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, 608, 32).setStrokeStyle(4, 0xffffff);
    this.add.text(GAME_W / 2, GAME_H / 2 - 60, 'Загрузка...', titleStyle(36)).setOrigin(0.5);
    this.load.on('progress', (v: number) => (bar.width = 600 * v));
    this.load.on('loaderror', () => undefined);
    preloadAssets(this);
  }

  async create() {
    makePlaceholders(this);
    try {
      await Promise.race([document.fonts.load('900 40px Nunito'), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* font is optional */
    }
    this.scene.start('Title');
  }
}

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    cover(this, 'title');
    const logo = this.add.text(GAME_W / 2, 130, 'Приключения\nАлисы', titleStyle(92, '#ffffff', '#d6337f')).setOrigin(0.5);
    logo.setShadow(0, 6, '#6b2a5c', 8, true, true);
    this.tweens.add({ targets: logo, scale: 1.04, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
    const play = button(this, GAME_W / 2, GAME_H - 130, '▶  Играть', 56, () => this.start());
    this.tweens.add({ targets: play, scale: 1.08, yoyo: true, repeat: -1, duration: 700 });
    this.add
      .text(GAME_W / 2, GAME_H - 40, isTouchDevice() ? 'Кнопки на экране: слева — ходить, справа — прыгать и стрелять' : 'Стрелки — бег  •  Пробел — прыжок  •  X — сердечки  •  Z — щит  •  C — Кеша', titleStyle(22))
      .setOrigin(0.5);
    this.input.keyboard?.once('keydown-ENTER', () => this.start());
    this.input.keyboard?.once('keydown-SPACE', () => this.start());
  }

  private start() {
    if (leaving.has(this)) return;
    leave(this);
    unlockAudio();
    goFullscreen(this);
    playMusic('title');
    this.cameras.main.fadeOut(300);
    this.time.delayedCall(320, () => this.scene.start(load().seenStory ? 'Map' : 'Story'));
  }
}

const STORY = [
  { who: 'king', text: 'Беда, Алиса! Злая колдунья заколдовала\nпринца и заперла его в высокой башне!' },
  { who: 'witch-fly', text: 'Башню закрывают пять волшебных замков.\nОткрыть их могут только кристаллы-ключи.' },
  { who: 'kesha-blow', text: 'Попугай Кеша полетит с тобой!\nОн дует кормом через трубочку во всех врагов.' },
  { who: 'alice-jump', text: 'Твои сердечки делают злых добрыми.\nВперёд, Алиса, спаси принца!' },
];

export class StoryScene extends Phaser.Scene {
  private page = 0;

  constructor() {
    super('Story');
  }

  create() {
    this.page = 0;
    cover(this, 'bg-castle').setTint(0xd8c8ff);
    this.cameras.main.fadeIn(300);
    this.show();
    this.input.on('pointerup', () => this.next());
    this.input.keyboard?.on('keydown', () => this.next());
    button(this, GAME_W - 120, 50, 'Пропустить', 24, () => this.finish());
  }

  private layer: Phaser.GameObjects.Container | null = null;

  private show() {
    this.layer?.destroy();
    const s = STORY[this.page];
    const c = this.add.container(0, 0);
    const img = this.add.image(290, GAME_H / 2 + 40, s.who);
    img.setScale(360 / img.height);
    if (s.who === 'witch-fly') img.setScale(300 / img.height);
    c.add(img);
    c.add(this.add.rectangle(810, GAME_H / 2, 820, 260, 0xffffff, 0.92).setStrokeStyle(6, 0xff7eb6));
    c.add(this.add.text(810, GAME_H / 2, s.text, { ...titleStyle(34, '#6b2a5c', '#ffffff'), strokeThickness: 0 }).setOrigin(0.5));
    c.add(this.add.text(810, GAME_H / 2 + 170, 'нажми, чтобы продолжить ▶', titleStyle(24)).setOrigin(0.5));
    this.tweens.add({ targets: img, y: img.y - 12, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    this.layer = c;
  }

  private next() {
    sfx.click();
    this.page++;
    if (this.page >= STORY.length) this.finish();
    else this.show();
  }

  private finish() {
    this.input.removeAllListeners();
    save({ seenStory: true });
    this.scene.start('Map');
  }
}

const NODE_POS = [
  { x: 170, y: 520 },
  { x: 410, y: 380 },
  { x: 650, y: 530 },
  { x: 890, y: 370 },
  { x: 1120, y: 250 },
];
const NODE_ICON = ['hedgehog1', 'owl1', 'frog1', 'bat1', 'witch-fly'];

export class MapScene extends Phaser.Scene {
  private sel = 0;
  private marker!: Phaser.GameObjects.Image;

  constructor() {
    super('Map');
  }

  create() {
    const data = load();
    cover(this, 'bg-meadow');
    this.cameras.main.fadeIn(300);
    playMusic('title');
    this.add.text(GAME_W / 2, 60, 'Куда пойдёт Алиса?', titleStyle(52)).setOrigin(0.5);
    const path = this.add.graphics();
    path.lineStyle(14, 0xfff3c4, 0.9);
    path.beginPath();
    path.moveTo(NODE_POS[0].x, NODE_POS[0].y);
    for (const p of NODE_POS.slice(1)) path.lineTo(p.x, p.y);
    path.strokePath();

    LEVELS.forEach((lv, i) => {
      const { x, y } = NODE_POS[i];
      const open = i < data.unlocked;
      const circle = this.add.circle(x, y, 70, open ? 0xffffff : 0x8a8a9a, 0.95).setStrokeStyle(8, open ? 0xff7eb6 : 0x55556a);
      const icon = this.add.image(x, y - 4, NODE_ICON[i]);
      icon.setScale(96 / Math.max(icon.width, icon.height));
      if (!open) icon.setTint(0x333344);
      this.add.text(x, y + 96, `${i + 1}. ${lv.name}`, titleStyle(24)).setOrigin(0.5);
      if (data.crystals[i]) this.add.image(x + 56, y - 52, 'crystal').setScale(56 / 128);
      if (!open) this.add.text(x, y, '🔒', { fontSize: '44px' }).setOrigin(0.5);
      if (open) {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerup', () => this.go(i));
      }
    });
    this.sel = Math.min(data.unlocked, LEVELS.length) - 1;
    if (data.crystals.every(Boolean)) this.sel = LEVELS.length - 1;
    this.marker = this.add.image(0, 0, 'alice-idle').setOrigin(0.5, 1).setScale(110 / 200);
    this.placeMarker();
    this.tweens.add({ targets: this.marker, scaleY: this.marker.scaleY * 1.04, yoyo: true, repeat: -1, duration: 500 });
    this.add.text(GAME_W / 2, GAME_H - 30, `★ ${data.stars}   •   Кристаллов: ${data.crystals.filter(Boolean).length} из 5`, titleStyle(28, '#ffe36e', '#7a4a00')).setOrigin(0.5);
    button(this, 90, 50, '◀', 32, () => this.scene.start('Title'));

    const kb = this.input.keyboard!;
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-ENTER', () => this.go(this.sel));
    kb.on('keydown-SPACE', () => this.go(this.sel));
  }

  private placeMarker() {
    const p = NODE_POS[this.sel];
    this.marker.setPosition(p.x - 70, p.y - 20);
  }

  private move(d: number) {
    const max = load().unlocked - 1;
    this.sel = Phaser.Math.Clamp(this.sel + d, 0, max);
    sfx.click();
    this.placeMarker();
  }

  private go(i: number) {
    if (i >= load().unlocked || leaving.has(this)) return;
    leave(this);
    unlockAudio();
    stopMusic();
    this.cameras.main.fadeOut(300);
    this.time.delayedCall(320, () => this.scene.start('Level', { index: i }));
  }
}

export class EndingScene extends Phaser.Scene {
  constructor() {
    super('Ending');
  }

  create() {
    save({ finished: true });
    cover(this, 'ending');
    this.cameras.main.fadeIn(800, 255, 220, 240);
    sfx.win();
    playMusic('title');
    const t = this.add.text(GAME_W / 2, 90, 'Ура! Алиса спасла принца!', titleStyle(64, '#ffffff', '#d6337f')).setOrigin(0.5);
    this.tweens.add({ targets: t, scale: 1.05, yoyo: true, repeat: -1, duration: 800 });
    this.add.rectangle(GAME_W / 2, 172, 900, 84, 0x6b2a5c, 0.55);
    this.add
      .text(GAME_W / 2, 170, `Король устроил праздник, а колдунья теперь печёт пироги.\nСобрано звёздочек: ${load().stars}`, titleStyle(28))
      .setOrigin(0.5);
    for (let i = 0; i < 24; i++) {
      const h = this.add.image(Phaser.Math.Between(0, GAME_W), GAME_H + 40, i % 3 ? 'heart' : 'star').setScale(0.2 + Math.random() * 0.15);
      this.tweens.add({ targets: h, y: -60, x: h.x + Phaser.Math.Between(-80, 80), duration: 4000 + Math.random() * 3000, delay: Math.random() * 3000, repeat: -1 });
    }
    button(this, GAME_W / 2, GAME_H - 70, 'Играть ещё', 44, () => this.scene.start('Map'));
  }
}
