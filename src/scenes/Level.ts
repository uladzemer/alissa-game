import Phaser from 'phaser';
import { GAME_H, TILE, PLAYER, titleStyle, viewW } from '../game/constants';
import { LEVELS, LevelDef } from '../game/levels';
import { Player } from '../game/player';
import { Enemy, ENEMY_CHARS, Witch } from '../game/enemies';
import { Keyboard, InputState, blank } from '../game/controls';
import { sfx, playMusic, stopMusic } from '../game/sfx';
import { load, save } from '../game/save';

type StaticBody = Phaser.Physics.Arcade.StaticBody;
type Body = Phaser.Physics.Arcade.Body;

interface Pickup { img: Phaser.GameObjects.Image; kind: 'star' | 'strawberry' | 'crystal'; taken: boolean; baseY: number }
interface Mover { zone: Phaser.GameObjects.Zone; view: Phaser.GameObjects.Image; x0: number; y0: number; axis: 'x' | 'y'; range: number; period: number; phase: number }
interface Faller { zone: Phaser.GameObjects.Zone; view: Phaser.GameObjects.Image; x0: number; y0: number; state: 'still' | 'shake' | 'fall'; timer: number }
interface Shot { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; kind: 'heart' | 'orb' }
interface Seed { img: Phaser.GameObjects.Image; target: Enemy | Witch }

const SOLID = new Set(['#']);
const ONE_WAY = new Set(['=', 'O', 'L']);
const CLIMB = new Set(['T', '|']);

export class LevelScene extends Phaser.Scene {
  def!: LevelDef;
  grid: string[][] = [];
  cols = 0;
  rows = 0;
  solids!: Phaser.Physics.Arcade.StaticGroup;
  player!: Player;
  enemies: Enemy[] = [];
  witch: Witch | null = null;
  pickups: Pickup[] = [];
  movers: Mover[] = [];
  fallers: Faller[] = [];
  shots: Shot[] = [];
  seeds: Seed[] = [];
  flags: { img: Phaser.GameObjects.Image; x: number; y: number; on: boolean }[] = [];
  door: { img: Phaser.GameObjects.Image; x: number; y: number; open: boolean } | null = null;
  starsHere = 0;
  crystalTaken = false;
  keshaReadyAt = 0;
  finished = false;

  private kb!: Keyboard;
  private bg!: Phaser.GameObjects.TileSprite;
  private kesha!: Phaser.GameObjects.Image;
  private keshaBlowUntil = 0;
  private checkpoint = new Phaser.Math.Vector2();
  private prevInput: InputState = blank();
  private arenaWall: Phaser.GameObjects.Zone | null = null;
  private waterTop: number[] = [];

  constructor() {
    super('Level');
  }

  init(data: { index: number }) {
    this.def = LEVELS[data.index ?? 0];
    this.enemies = [];
    this.pickups = [];
    this.movers = [];
    this.fallers = [];
    this.shots = [];
    this.seeds = [];
    this.flags = [];
    this.door = null;
    this.witch = null;
    this.arenaWall = null;
    this.starsHere = 0;
    this.crystalTaken = false;
    this.finished = false;
    this.keshaReadyAt = 0;
    this.prevInput = blank();
    this.respawning = false;
  }

  create() {
    const map = this.def.map;
    this.rows = map.length;
    this.cols = Math.max(...map.map((r) => r.length));
    this.grid = map.map((r) => r.padEnd(this.cols, ' ').split(''));
    const W = this.cols * TILE;
    const H = this.rows * TILE;

    this.physics.world.setBounds(0, 0, W, H + 400);
    this.physics.world.setBoundsCollision(true, true, false, false);

    const bgKey = `bg-${this.def.world}`;
    const bgSrc = this.textures.get(bgKey).getSourceImage() as { height: number };
    this.bg = this.add.tileSprite(0, 0, viewW(this) + 4, GAME_H, bgKey).setOrigin(0).setScrollFactor(0).setDepth(-20);
    this.bg.setTileScale(GAME_H / bgSrc.height);

    this.solids = this.physics.add.staticGroup();
    this.buildTerrain();
    this.spawnThings();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player.zone, true, 0.12, 0.12, 0, 40);
    cam.setDeadzone(80, 120);
    cam.fadeIn(400);
    const onResize = () => {
      this.bg.setSize(viewW(this) + 4, GAME_H);
      // phone turned upright: the "turn your phone" screen covers the game, so stop the action
      if (this.scale.height > this.scale.width && this.scene.isActive()) this.togglePause();
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.kb = new Keyboard(this);
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard!.on('keydown-P', () => this.togglePause());

    this.scene.launch('Hud', { level: this });
    this.events.once('shutdown', () => {
      this.scene.stop('Hud');
      stopMusic();
    });
    playMusic(this.def.world);

    const banner = this.add
      .text(viewW(this) / 2, GAME_H * 0.3, `${this.def.name}\n${this.def.goal}`, titleStyle(46))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);
    this.tweens.add({ targets: banner, alpha: 0, delay: 2200, duration: 600, onComplete: () => banner.destroy() });
  }

  // ---------- map helpers ----------
  cell(x: number, y: number) {
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    if (cy < 0 || cx < 0 || cx >= this.cols) return cy < 0 ? ' ' : '#';
    if (cy >= this.rows) return ' ';
    return this.grid[cy][cx];
  }

  solidAt(x: number, y: number) {
    return SOLID.has(this.cell(x, y));
  }

  floorAt(x: number, y: number) {
    const c = this.cell(x, y);
    return SOLID.has(c) || ONE_WAY.has(c) || this.movers.some((m) => m.zone.getBounds().contains(x, y));
  }

  hazardAt(x: number, y: number) {
    const c = this.cell(x, y);
    return c === '^' || c === '~';
  }

  climbableAt(x: number, y: number) {
    return CLIMB.has(this.cell(x, y));
  }

  climbCenterX(x: number) {
    return (Math.floor(x / TILE) + 0.5) * TILE;
  }

  // ---------- building ----------
  private buildTerrain() {
    const g = this.grid;
    const tex = this.def.ground;
    // visuals
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = g[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (c === '#') {
          const top = y === 0 || g[y - 1][x] !== '#';
          const key = tex === 'grass' ? (top ? 'tile-grass' : 'tile-dirt') : `tile-${tex}`;
          const img = this.add.image(px, py, key).setOrigin(0).setDisplaySize(TILE + 1, TILE + 1);
          if (tex !== 'grass' && !top) img.setTint(0xcfc8dc);
        } else if (c === '=') {
          this.add.image(px, py, 'tile-wood').setOrigin(0).setDisplaySize(TILE + 1, 26).setDepth(1);
        } else if (c === 'T') {
          this.add.image(px + TILE / 2, py, 'tile-trunk').setOrigin(0.5, 0).setDisplaySize(40, TILE + 1).setDepth(-5);
        } else if (c === '^') {
          this.add.image(px, py + TILE, 'spikes').setOrigin(0, 1).setDisplaySize(TILE, 40).setDepth(2);
        }
      }
    }
    // crowns (runs of O) and vines (runs of |)
    this.runs('O', (x1, x2, y) => {
      const w = (x2 - x1 + 1) * TILE;
      this.add.image(x1 * TILE + w / 2, y * TILE - 26, 'crown').setOrigin(0.5, 0).setDisplaySize(w + 70, 150).setDepth(-4);
    });
    for (let x = 0; x < this.cols; x++) {
      let y = 0;
      while (y < this.rows) {
        if (g[y][x] === '|') {
          const y1 = y;
          while (y < this.rows && g[y][x] === '|') y++;
          this.add.image((x + 0.5) * TILE, y1 * TILE - 10, 'vine').setOrigin(0.5, 0).setDisplaySize(44, (y - y1) * TILE + 10).setDepth(-5);
        } else y++;
      }
    }
    // water
    const waterCols = new Map<number, number>();
    for (let x = 0; x < this.cols; x++) {
      this.waterTop[x] = -1;
      for (let y = 0; y < this.rows; y++) {
        if (g[y][x] === '~' || g[y][x] === 'x') {
          this.waterTop[x] = y;
          waterCols.set(x, y);
          break;
        }
      }
    }
    if (waterCols.size) {
      const water = this.add.graphics().setDepth(25);
      water.fillStyle(0x3fa9f5, 0.72);
      for (const [x, y] of waterCols) water.fillRect(x * TILE, y * TILE + 14, TILE + 1, (this.rows - y) * TILE);
      water.fillStyle(0xbfe9ff, 0.9);
      for (const [x, y] of waterCols) for (let i = 0; i < 2; i++) water.fillEllipse(x * TILE + 16 + i * 32, y * TILE + 16, 30, 10);
      this.tweens.add({ targets: water, y: 5, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut' });
    }

    // colliders: merge solid cells into rectangles (rows, then stack equal rows)
    const rects: { x1: number; x2: number; y1: number; y2: number; oneWay: boolean }[] = [];
    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        const c = g[y][x];
        const solid = SOLID.has(c);
        const oneWay = ONE_WAY.has(c);
        if (!solid && !oneWay) {
          x++;
          continue;
        }
        const x1 = x;
        while (x < this.cols && (solid ? SOLID.has(g[y][x]) : ONE_WAY.has(g[y][x]))) x++;
        const x2 = x - 1;
        const above = rects.find((r) => !r.oneWay && solid && r.x1 === x1 && r.x2 === x2 && r.y2 === y - 1);
        if (above) above.y2 = y;
        else rects.push({ x1, x2, y1: y, y2: y, oneWay });
      }
    }
    for (const r of rects) {
      const w = (r.x2 - r.x1 + 1) * TILE;
      const h = r.oneWay ? 22 : (r.y2 - r.y1 + 1) * TILE;
      const z = this.add.zone(r.x1 * TILE + w / 2, r.y1 * TILE + h / 2, w, h);
      this.physics.add.existing(z, true);
      if (r.oneWay) this.makeOneWay(z.body as StaticBody);
      this.solids.add(z);
    }
  }

  private makeOneWay(b: StaticBody | Body) {
    b.checkCollision.down = false;
    b.checkCollision.left = false;
    b.checkCollision.right = false;
  }

  private runs(ch: string, fn: (x1: number, x2: number, y: number) => void) {
    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        if (this.grid[y][x] !== ch) {
          x++;
          continue;
        }
        const x1 = x;
        while (x < this.cols && this.grid[y][x] === ch) x++;
        fn(x1, x - 1, y);
      }
    }
  }

  private spawnThings() {
    const data = load();
    let start = new Phaser.Math.Vector2(2 * TILE, 5 * TILE);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.grid[y][x];
        const cx = (x + 0.5) * TILE;
        const cy = (y + 0.5) * TILE;
        const bottom = (y + 1) * TILE;
        if (c === '@') start = new Phaser.Math.Vector2(cx, bottom - PLAYER.bodyH / 2);
        else if (c === '*') this.addPickup('star', cx, cy, 44);
        else if (c === 's') this.addPickup('strawberry', cx, cy, 52);
        else if (c === 'K') this.addPickup('crystal', cx, cy - 10, 84);
        else if (c === 'P') {
          const img = this.add.image(cx, bottom + 2, 'flag-down').setOrigin(0.5, 1).setDepth(3);
          img.setScale(110 / (img.height || 1));
          this.flags.push({ img, x: cx, y: bottom - PLAYER.bodyH / 2, on: false });
        } else if (c === 'D') {
          const img = this.add.image(cx, bottom + 2, 'door').setOrigin(0.5, 1).setDepth(3);
          img.setScale(150 / (img.height || 1)).setTint(0x9a8fb0);
          this.door = { img, x: cx, y: bottom - 75, open: false };
          const tower = this.add.image(cx + 20, bottom - 150, 'prince').setOrigin(0.5, 1).setDepth(2).setScale(0.001);
          tower.setData('prince', true);
        } else if (c === 'M' || c === 'R') {
          const axis = c === 'M' ? 'y' : 'x';
          const key = this.def.world === 'river' ? 'raft' : this.def.world === 'cave' ? 'cloud' : 'tile-wood';
          this.addMover(x * TILE + TILE, y * TILE + 11, axis, axis === 'y' ? 2 * TILE : 5 * TILE, key);
        } else if (c === 'F') this.addFaller(cx, y * TILE + 11);
        else if (c === 'L') {
          const img = this.add.image(cx, y * TILE + 22, 'lily').setDepth(26).setDisplaySize(TILE + 24, 28);
          this.tweens.add({ targets: img, y: img.y + 4, yoyo: true, repeat: -1, duration: 900 + Math.random() * 400 });
        } else if (c === 'W') this.witch = new Witch(this, x, y);
        else if (ENEMY_CHARS[c]) {
          const kind = ENEMY_CHARS[c];
          const e = new Enemy(this, kind, cx, kind === 'fish' ? bottom + TILE * 0.2 : bottom - 30);
          this.enemies.push(e);
        }
      }
    }
    this.checkpoint.copy(start);
    this.player = new Player(this, start.x, start.y, PLAYER.maxHearts + data.bonusHearts);
    this.physics.add.collider(this.player.zone, this.solids);
    for (const m of this.movers) this.physics.add.collider(this.player.zone, m.zone);
    for (const f of this.fallers) this.physics.add.collider(this.player.zone, f.zone, () => this.touchFaller(f));
    this.kesha = this.add.image(start.x - 60, start.y - 80, 'kesha-fly1').setDepth(21);
    this.kesha.setScale(46 / 200);
  }

  private addPickup(kind: Pickup['kind'], x: number, y: number, size: number) {
    const img = this.add.image(x, y, kind).setDepth(5);
    img.setScale(size / Math.max(img.width, img.height));
    if (kind === 'crystal') {
      this.tweens.add({ targets: img, angle: { from: -8, to: 8 }, yoyo: true, repeat: -1, duration: 900 });
      const glow = this.add.circle(x, y, 60, 0x9ff3ff, 0.25).setDepth(4);
      this.tweens.add({ targets: glow, scale: 1.3, alpha: 0.1, yoyo: true, repeat: -1, duration: 800 });
      img.setData('glow', glow);
    }
    this.pickups.push({ img, kind, taken: false, baseY: y });
  }

  private addMover(x: number, y: number, axis: 'x' | 'y', range: number, key: string) {
    const w = TILE * 2;
    const zone = this.add.zone(x, y, w, 22);
    this.physics.add.existing(zone);
    const b = zone.body as Body;
    b.setAllowGravity(false).setImmovable(true);
    b.moves = false;
    this.makeOneWay(b);
    const view = this.add.image(x, y - 11, key).setOrigin(0.5, 0).setDisplaySize(w + 10, key === 'tile-wood' ? 26 : 40).setDepth(6);
    this.movers.push({ zone, view, x0: x, y0: y, axis, range, period: axis === 'x' ? 4.2 : 3, phase: Math.random() * 6 });
  }

  private addFaller(x: number, y: number) {
    const zone = this.add.zone(x, y, TILE, 22);
    this.physics.add.existing(zone);
    const b = zone.body as Body;
    b.setAllowGravity(false).setImmovable(true);
    this.makeOneWay(b);
    const view = this.add.image(x, y - 11, 'log').setOrigin(0.5, 0).setDisplaySize(TILE + 4, 30).setDepth(6);
    this.fallers.push({ zone, view, x0: x, y0: y, state: 'still', timer: 0 });
  }

  private touchFaller(f: Faller) {
    if (f.state === 'still' && this.player.body.bottom <= f.zone.y) {
      f.state = 'shake';
      f.timer = 0.45;
    }
  }

  // ---------- effects ----------
  puff(x: number, y: number, color: number) {
    for (let i = 0; i < 6; i++) {
      const d = this.add.circle(x, y, Phaser.Math.Between(5, 10), color, 0.9).setDepth(30);
      this.tweens.add({ targets: d, x: x + Phaser.Math.Between(-40, 40), y: y + Phaser.Math.Between(-20, 10), alpha: 0, scale: 0.3, duration: 400, onComplete: () => d.destroy() });
    }
  }

  heartsBurst(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const h = this.add.image(x, y, 'heart').setDepth(30).setScale(0.15 + Math.random() * 0.1);
      this.tweens.add({
        targets: h,
        x: x + Phaser.Math.Between(-70, 70),
        y: y - Phaser.Math.Between(40, 140),
        alpha: 0,
        duration: 900 + Math.random() * 400,
        ease: 'Sine.easeOut',
        onComplete: () => h.destroy(),
      });
    }
  }

  splash(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const d = this.add.circle(x, y, Phaser.Math.Between(4, 8), 0xbfe9ff, 1).setDepth(30);
      this.tweens.add({ targets: d, x: x + Phaser.Math.Between(-50, 50), y: y - Phaser.Math.Between(20, 90), alpha: 0, duration: 500, ease: 'Quad.easeOut', onComplete: () => d.destroy() });
    }
  }

  dropStar(x: number, y: number) {
    const s = this.add.image(x, y, 'star').setDepth(30).setScale(0.3);
    this.tweens.add({ targets: s, y: y - 60, duration: 300, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: s, alpha: 0, delay: 350, duration: 250, onComplete: () => s.destroy() });
    this.addStars(1);
  }

  private floatText(x: number, y: number, text: string, color = '#ffffff') {
    const t = this.add.text(x, y, text, titleStyle(34, color)).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  private addStars(n: number) {
    this.starsHere += n;
    const d = load();
    const before = Math.floor(d.stars / 100);
    d.stars += n;
    const after = Math.floor(d.stars / 100);
    if (after > before && d.bonusHearts < PLAYER.heartCap - PLAYER.maxHearts) {
      d.bonusHearts++;
      this.player.maxHearts++;
      this.player.heal(this.player.maxHearts);
      this.floatText(this.player.body.center.x, this.player.body.top - 30, '+1 сердечко!', '#ff8fc8');
      sfx.strawberry();
    }
    save({ stars: d.stars, bonusHearts: d.bonusHearts });
  }

  // ---------- weapons ----------
  shootHeart(x: number, y: number, dir: number) {
    const img = this.add.image(x, y, 'heart').setDepth(22).setScale(34 / 128);
    this.shots.push({ img, vx: dir * 820, vy: 0, life: 0.9, kind: 'heart' });
    sfx.shoot();
  }

  witchOrb(x: number, y: number) {
    const p = this.player.body.center;
    const v = new Phaser.Math.Vector2(p.x - x, p.y - y).normalize().scale(300);
    const img = this.add.image(x, y, 'orb').setDepth(22).setScale(48 / 128);
    this.shots.push({ img, vx: v.x, vy: v.y, life: 5, kind: 'orb' });
  }

  summonBats(x1: number, x2: number) {
    const alive = this.enemies.filter((e) => e.kind === 'bat' && !e.dead && !e.friendly).length;
    if (alive >= 3) return;
    for (const x of [x1, x2]) {
      const e = new Enemy(this, 'bat', x, 3 * TILE);
      this.enemies.push(e);
      this.puff(x, 3 * TILE, 0xb88cff);
    }
  }

  private useKesha() {
    const now = this.time.now;
    if (now < this.keshaReadyAt || this.finished) return;
    const view = this.cameras.main.worldView;
    const targets: (Enemy | Witch)[] = this.enemies.filter((e) => e.harmful && view.contains(e.body.center.x, e.body.center.y));
    if (this.witch && this.witch.state === 'fight') targets.push(this.witch);
    this.keshaReadyAt = now + PLAYER.keshaCdMs;
    this.keshaBlowUntil = now + 700;
    sfx.kesha();
    if (!targets.length) {
      this.floatText(this.kesha.x, this.kesha.y - 30, 'Чик-чирик!', '#b6ff8a');
      return;
    }
    for (const t of targets) {
      const img = this.add.image(this.kesha.x, this.kesha.y, 'seed').setDepth(31).setScale(24 / 128);
      this.seeds.push({ img, target: t });
    }
  }

  // ---------- boss ----------
  private startBoss(w: Witch) {
    w.state = 'fight';
    const cam = this.cameras.main;
    cam.stopFollow();
    // the arena ends at the map's right edge; on wide screens it simply shows a bit more castle
    const x0 = Math.max(0, Math.min(w.arenaX0, this.cols * TILE - viewW(this)));
    this.tweens.add({ targets: cam, scrollX: x0, duration: 700, ease: 'Sine.easeInOut' });
    cam.setBounds(x0, 0, Math.max(viewW(this), this.cols * TILE - x0), this.rows * TILE);
    this.time.delayedCall(720, () => cam.startFollow(this.player.zone, true, 0.12, 0.12, 0, 40));
    this.arenaWall = this.add.zone(x0 - 16, (this.rows * TILE) / 2, 32, this.rows * TILE * 2);
    this.physics.add.existing(this.arenaWall, true);
    this.physics.add.collider(this.player.zone, this.arenaWall);
    this.checkpoint.set(x0 + 3 * TILE, (this.rows - 2) * TILE - PLAYER.bodyH / 2);
    this.floatText(w.x, w.y + 90, 'Ха-ха! Принца не отдам!', '#e3b5ff');
    playMusic('castle');
  }

  witchBefriended(w: Witch) {
    sfx.befriend();
    this.heartsBurst(w.x, w.y);
    this.time.delayedCall(300, () => this.heartsBurst(w.x, w.y));
    for (const e of this.enemies) if (e.harmful) e.befriend();
    for (const s of this.shots) s.life = 0;
    const groundY = (this.rows - 2) * TILE;
    this.tweens.add({ targets: w, y: groundY - 110, duration: 1500, ease: 'Sine.easeOut' });
    const msg = this.add
      .text(viewW(this) / 2, 150, 'Спасибо, Алиса! Твои сердечки\nрасколдовали меня. Я больше не злая!', titleStyle(34, '#ffe0f4'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);
    this.tweens.add({ targets: msg, alpha: 0, delay: 4200, duration: 600, onComplete: () => msg.destroy() });
    this.time.delayedCall(1600, () => this.addPickup('crystal', (w.arenaX0 + w.arenaX1) / 2, groundY - 40, 84));
  }

  // ---------- main loop ----------
  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    const now = this.time.now;
    const inp = this.kb.read();
    const keshaPressed = inp.kesha && !this.prevInput.kesha;
    this.prevInput = inp;

    this.player.update(inp, dt);
    if (keshaPressed) this.useKesha();

    const p = this.player.body;
    this.bg.tilePositionX = this.cameras.main.scrollX * 0.3 / this.bg.tileScaleX;

    // movers
    const t = now / 1000;
    // moving platforms are driven by position (the body copies the zone each step) and carry their rider
    for (const m of this.movers) {
      const w = (Math.PI * 2) / m.period;
      const b = m.zone.body as Body;
      const nx = m.axis === 'x' ? m.x0 + (m.range * (1 - Math.cos(t * w + m.phase))) / 2 : m.x0;
      const ny = m.axis === 'y' ? m.y0 + Math.sin(t * w + m.phase) * m.range : m.y0;
      const riding = Math.abs(p.bottom - b.top) < 4 && p.right > b.x && p.x < b.right && p.velocity.y >= 0;
      const dx = nx - m.zone.x;
      const dy = ny - m.zone.y;
      m.zone.setPosition(nx, ny);
      if (riding && !this.player.climbing) {
        this.player.zone.x += dx;
        this.player.zone.y += dy;
      }
      m.view.setPosition(nx, ny - 11);
    }
    // falling logs
    for (const f of this.fallers) {
      const b = f.zone.body as Body;
      if (f.state === 'shake') {
        f.timer -= dt;
        f.view.x = f.x0 + Math.sin(now / 25) * 3;
        if (f.timer <= 0) {
          f.state = 'fall';
          f.timer = 3;
          b.setAllowGravity(true);
          b.checkCollision.up = false;
        }
      } else if (f.state === 'fall') {
        f.timer -= dt;
        f.view.setPosition(f.zone.x, f.zone.y - 11);
        if (f.timer <= 0) {
          f.state = 'still';
          b.setAllowGravity(false);
          b.checkCollision.up = true;
          b.reset(f.x0, f.y0);
          f.view.setPosition(f.x0, f.y0 - 11).setAlpha(0);
          this.tweens.add({ targets: f.view, alpha: 1, duration: 300 });
        }
      }
    }

    // Kesha follows Alice
    const kx = p.center.x - this.player.facing * 58;
    const ky = p.top - 34 + Math.sin(now / 220) * 8;
    this.kesha.x += (kx - this.kesha.x) * Math.min(1, dt * 6);
    this.kesha.y += (ky - this.kesha.y) * Math.min(1, dt * 6);
    this.kesha.setTexture(now < this.keshaBlowUntil ? 'kesha-blow' : Math.floor(now / 110) % 2 ? 'kesha-fly1' : 'kesha-fly2');
    this.kesha.setFlipX(this.player.facing < 0);

    const pr = new Phaser.Geom.Rectangle(p.x, p.y, p.width, p.height);

    // enemies
    for (const e of this.enemies) {
      e.update(dt);
      if (!e.harmful || this.finished) continue;
      const eb = e.body;
      const er = new Phaser.Geom.Rectangle(eb.x + 6, eb.y + 6, eb.width - 12, eb.height - 10);
      if (!Phaser.Geom.Intersects.RectangleToRectangle(pr, er)) continue;
      const stomping = p.velocity.y > 60 && p.bottom - eb.top < 26;
      if (stomping && e.stompable) {
        e.stomp();
        sfx.stomp();
        this.player.bounce();
      } else if (stomping && !e.stompable) {
        this.player.bounce();
        this.player.hurt(eb.center.x);
        this.floatText(eb.center.x, eb.top - 20, 'Колючий!', '#ffd08a');
      } else if (this.player.shieldOn) {
        this.player.blocked(eb.center.x);
        e.dir = eb.center.x < p.center.x ? -1 : 1;
      } else this.player.hurt(eb.center.x);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    // witch
    if (this.witch) {
      const w = this.witch;
      if (w.state === 'waiting' && p.center.x > w.arenaX0 + TILE * 2) this.startBoss(w);
      w.update(dt);
      if (w.state === 'fight' && Phaser.Geom.Intersects.RectangleToRectangle(pr, w.bounds)) {
        if (this.player.shieldOn) this.player.blocked(w.x);
        else this.player.hurt(w.x);
      }
    }

    // projectiles
    for (const s of this.shots) {
      s.life -= dt;
      s.img.x += s.vx * dt;
      s.img.y += s.vy * dt;
      if (s.kind === 'heart') {
        s.img.setScale((34 / 128) * (1 + Math.sin(now / 60) * 0.08));
        if (this.solidAt(s.img.x, s.img.y)) s.life = 0;
        for (const e of this.enemies) {
          if (s.life <= 0) break;
          if (e.harmful && e.body.hitTest(s.img.x, s.img.y)) {
            e.hit(1);
            s.life = 0;
          }
        }
        if (s.life > 0 && this.witch && this.witch.state === 'fight' && this.witch.bounds.contains(s.img.x, s.img.y)) {
          this.witch.hit(1);
          s.life = 0;
        }
        for (const o of this.shots) {
          if (o.kind === 'orb' && o.life > 0 && s.life > 0 && Phaser.Math.Distance.Between(o.img.x, o.img.y, s.img.x, s.img.y) < 34) {
            o.life = 0;
            s.life = 0;
            this.heartsBurst(o.img.x, o.img.y);
          }
        }
      } else {
        s.img.angle += 360 * dt;
        if (pr.contains(s.img.x, s.img.y) || Phaser.Geom.Intersects.CircleToRectangle(new Phaser.Geom.Circle(s.img.x, s.img.y, 18), pr)) {
          if (this.player.shieldOn) this.player.blocked(s.img.x);
          else this.player.hurt(s.img.x);
          s.life = 0;
        }
        if (this.solidAt(s.img.x, s.img.y)) s.life = 0;
      }
    }
    for (const s of this.shots) if (s.life <= 0) s.img.destroy();
    this.shots = this.shots.filter((s) => s.life > 0);

    // Kesha seeds fly to their targets
    for (const sd of this.seeds) {
      const tgt = sd.target;
      const tx = tgt instanceof Witch ? tgt.x : tgt.body.center.x;
      const ty = tgt instanceof Witch ? tgt.y : tgt.body.center.y;
      const v = new Phaser.Math.Vector2(tx - sd.img.x, ty - sd.img.y);
      sd.img.rotation = v.angle();
      if (v.length() < 22 || (tgt instanceof Enemy && !tgt.harmful)) {
        if (tgt instanceof Witch) tgt.hit(3);
        else tgt.hit(99);
        sd.img.destroy();
        continue;
      }
      v.normalize().scale(900 * dt);
      sd.img.x += v.x;
      sd.img.y += v.y;
    }
    this.seeds = this.seeds.filter((s) => s.img.active);

    // pickups
    for (const k of this.pickups) {
      if (k.taken) continue;
      if (k.kind === 'star') k.img.setScale((44 / 132) * (0.9 + Math.abs(Math.sin(now / 400 + k.baseY)) * 0.15));
      else k.img.y = k.baseY + Math.sin(now / 300 + k.img.x) * 5;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(pr, k.img.getBounds())) continue;
      k.taken = true;
      if (k.kind === 'star') {
        sfx.star();
        this.addStars(1);
        this.tweens.add({ targets: k.img, y: k.img.y - 50, alpha: 0, duration: 250, onComplete: () => k.img.destroy() });
      } else if (k.kind === 'strawberry') {
        sfx.strawberry();
        this.player.heal(1);
        this.floatText(k.img.x, k.img.y - 20, '+♥', '#ff6fa8');
        k.img.destroy();
      } else this.takeCrystal(k);
    }

    // checkpoints
    for (const f of this.flags) {
      if (!f.on && Math.abs(p.center.x - f.x) < 50 && p.center.y > f.y - 420 && p.center.y < f.y + 60) {
        f.on = true;
        f.img.setTexture('flag-up');
        this.checkpoint.set(f.x, f.y);
        this.player.heal(this.player.maxHearts);
        sfx.checkpoint();
        this.floatText(f.x, f.y - 90, 'Флажок!', '#ffe36e');
      }
    }

    // door (castle finale)
    if (this.door?.open && Math.abs(p.center.x - this.door.x) < 60 && Math.abs(p.center.y - this.door.y) < 120 && !this.finished) {
      this.finished = true;
      this.player.frozen = true;
      sfx.win();
      this.cameras.main.fadeOut(900, 255, 220, 240);
      this.time.delayedCall(950, () => this.scene.start('Ending'));
    }

    // hazards
    if (!this.finished) {
      const feet = this.cell(p.center.x, p.bottom - 6);
      const body = this.cell(p.center.x, p.center.y);
      if (feet === '^' || body === '^') {
        if (this.player.hurt(p.center.x + this.player.facing * 10)) p.setVelocityY(-700);
      }
      const col = Math.floor(p.center.x / TILE);
      const wTop = this.waterTop[col] ?? -1;
      if (wTop >= 0 && p.center.y > wTop * TILE + 20) this.fellOut(true);
      else if (p.top > this.rows * TILE + 40) this.fellOut(false);
      if (this.player.hearts <= 0) this.fellOut(false, true);
    }
  }

  private respawning = false;

  private fellOut(water: boolean, noHearts = false) {
    if (this.respawning) return;
    this.respawning = true;
    const p = this.player.body;
    if (water) {
      sfx.splash();
      this.splash(p.center.x, p.center.y);
    } else if (!noHearts) sfx.hurt();
    this.player.frozen = true;
    this.cameras.main.fadeOut(260, 255, 255, 255);
    this.time.delayedCall(300, () => {
      this.player.teleport(this.checkpoint.x, this.checkpoint.y);
      if (noHearts || this.player.hearts <= 0) this.player.hearts = this.player.maxHearts;
      this.player.frozen = false;
      this.respawning = false;
      this.kesha.setPosition(this.checkpoint.x - 60, this.checkpoint.y - 80);
      this.cameras.main.fadeIn(260, 255, 255, 255);
      this.floatText(this.checkpoint.x, this.checkpoint.y - 90, 'Ой! Ещё разок!', '#ffffff');
    });
  }

  private takeCrystal(k: Pickup) {
    k.taken = true;
    sfx.crystal();
    const glow = k.img.getData('glow') as Phaser.GameObjects.Arc | undefined;
    glow?.destroy();
    this.tweens.killTweensOf(k.img);
    this.heartsBurst(k.img.x, k.img.y);
    const data = load();
    data.crystals[this.def.index] = true;
    const unlocked = Math.max(data.unlocked, Math.min(LEVELS.length, this.def.index + 2));
    save({ crystals: data.crystals, unlocked });

    if (this.def.world === 'castle' && this.door) {
      // last crystal: all locks on the tower door open
      this.tweens.add({ targets: k.img, x: this.door.x, y: this.door.y - 40, scale: 0.1, duration: 900, ease: 'Sine.easeIn', onComplete: () => k.img.destroy() });
      this.time.delayedCall(900, () => {
        if (!this.door) return;
        this.door.open = true;
        this.door.img.clearTint();
        sfx.checkpoint();
        this.heartsBurst(this.door.x, this.door.y - 40);
        this.floatText(this.door.x, this.door.y - 150, 'Башня открыта! Заходи!', '#ffe36e');
      });
      return;
    }
    this.finished = true;
    this.player.frozen = true;
    sfx.win();
    stopMusic();
    this.tweens.add({ targets: k.img, y: k.img.y - 120, scale: k.img.scale * 1.8, duration: 900, ease: 'Back.easeOut' });
    const cam = this.cameras.main;
    const panel = this.add.container(viewW(this) / 2, GAME_H / 2).setScrollFactor(0).setDepth(200);
    panel.add(this.add.rectangle(0, 0, 620, 340, 0xffffff, 0.94).setStrokeStyle(8, 0xff7eb6));
    panel.add(this.add.text(0, -110, 'Кристалл найден!', titleStyle(52, '#ff5fa8', '#ffffff')).setOrigin(0.5));
    panel.add(this.add.text(0, -30, `★ ${this.starsHere} звёздочек`, titleStyle(36, '#ffc93a', '#8a5a00')).setOrigin(0.5));
    const crystals = load().crystals.filter(Boolean).length;
    panel.add(this.add.text(0, 25, `Кристаллов: ${crystals} из 5`, titleStyle(30, '#49c9e8', '#1d4e6b')).setOrigin(0.5));
    const btn = this.add.text(0, 105, '  Дальше ▶  ', titleStyle(42, '#ffffff')).setOrigin(0.5).setBackgroundColor('#ff7eb6').setPadding(10, 6, 10, 6);
    btn.setInteractive({ useHandCursor: true });
    panel.add(btn);
    panel.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 450, delay: 900, ease: 'Back.easeOut' });
    const go = () => {
      sfx.click();
      cam.fadeOut(300);
      this.time.delayedCall(320, () => this.scene.start('Map'));
    };
    btn.on('pointerup', go);
    this.time.delayedCall(1000, () => this.input.keyboard!.once('keydown', go));
  }

  togglePause() {
    if (this.finished) return;
    this.scene.pause();
    this.scene.get('Hud').events.emit('pause');
  }
}
