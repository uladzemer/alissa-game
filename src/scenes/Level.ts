import Phaser from 'phaser';
import { GAME_H, TILE, PLAYER, titleStyle, viewW, LOW_POWER } from '../game/constants';
import { LEVELS, LevelDef } from '../game/levels';
import { Player } from '../game/player';
import { Enemy, ENEMY_CHARS, Witch } from '../game/enemies';
import { Keyboard, InputState, blank } from '../game/controls';
import { hasArt } from '../game/assets';
import { paintedButton, paintedPanel, ribbon } from '../game/ui';
import { sfx, playMusic, stopMusic } from '../game/sfx';
import { load, save } from '../game/save';

type StaticBody = Phaser.Physics.Arcade.StaticBody;
type Body = Phaser.Physics.Arcade.Body;

interface Pickup { img: Phaser.GameObjects.Image; kind: 'star' | 'strawberry' | 'crystal'; taken: boolean; baseY: number }
interface Mover { zone: Phaser.GameObjects.Zone; view: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite; x0: number; y0: number; axis: 'x' | 'y'; range: number; period: number; phase: number; lift: number }
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
  private bg!: Phaser.GameObjects.Image;
  private kesha!: Phaser.GameObjects.Image;
  private keshaBlowUntil = 0;
  private checkpoint = new Phaser.Math.Vector2();
  private prevInput: InputState = blank();
  private arenaWall: Phaser.GameObjects.Zone | null = null;
  private waterTop: number[] = [];
  private waves: Phaser.GameObjects.TileSprite[] = [];
  private mid: Phaser.GameObjects.TileSprite | null = null;
  private near: Phaser.GameObjects.TileSprite | null = null;
  /** Static scenery (ground, decor, water): hidden while off-screen so the GPU only draws what is visible. */
  private statics: { obj: Phaser.GameObjects.Components.Visible; rect: Phaser.Geom.Rectangle }[] = [];
  private cullTick = 0;
  private fg: Phaser.GameObjects.Image[] = [];
  private rays: Phaser.GameObjects.Image[] = [];
  private vignette!: Phaser.GameObjects.Image;
  private motes: { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; par: number; phase: number; flutter?: boolean }[] = [];
  private lastCam = new Phaser.Math.Vector2();
  private shadow!: Phaser.GameObjects.Image;

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
    this.waves = [];
    this.mid = null;
    this.near = null;
    this.statics = [];
    this.fg = [];
    this.rays = [];
    this.motes = [];
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
    const bgSrc = this.textures.get(bgKey).getSourceImage() as { width: number; height: number };
    // far background: one picture, a bit wider than the screen, panned once across the level (never repeated)
    this.bg = this.add.image(0, 0, bgKey).setOrigin(0).setScrollFactor(0).setDepth(-20);
    this.fitFarBackground(bgSrc);
    const midKey = `mid-${this.def.world}`;
    if (hasArt(this, midKey)) {
      const midSrc = this.textures.get(midKey).getSourceImage() as { height: number };
      this.mid = this.add.tileSprite(0, 0, viewW(this) + 4, GAME_H, midKey).setOrigin(0).setScrollFactor(0).setDepth(-15);
      this.mid.setTileScale(GAME_H / midSrc.height);
    }
    const nearKey = `near-${this.def.world}`;
    if (hasArt(this, nearKey)) {
      const nearSrc = this.textures.get(nearKey).getSourceImage() as { height: number };
      this.near = this.add.tileSprite(0, 0, viewW(this) + 4, GAME_H, nearKey).setOrigin(0).setScrollFactor(0).setDepth(-8);
      this.near.setTileScale(GAME_H / nearSrc.height);
    }

    this.solids = this.physics.add.staticGroup();
    const firstStatic = this.children.list.length;
    this.buildTerrain();
    for (const obj of this.children.list.slice(firstStatic)) {
      const o = obj as Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.GetBounds> & Phaser.GameObjects.Components.Visible;
      if (typeof o.getBounds === 'function' && typeof o.setVisible === 'function') this.statics.push({ obj: o, rect: o.getBounds() });
    }
    this.addForeground();
    this.spawnThings();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player.zone, true, 0.12, 0.12, 0, 40);
    cam.setDeadzone(80, 120);
    cam.fadeIn(400);
    const onResize = () => {
      this.fitFarBackground(this.textures.get(this.bg.texture.key).getSourceImage() as { width: number; height: number });
      this.mid?.setSize(viewW(this) + 4, GAME_H);
      this.near?.setSize(viewW(this) + 4, GAME_H);
      this.vignette.setDisplaySize(viewW(this), GAME_H);
      this.rays.forEach((r, i) => (r.x = viewW(this) * (0.15 + i * 0.25)));
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
    this.setupAtmosphere();

    // level title on a ribbon, so it never blends into the picture behind it
    const banner = this.add.container(viewW(this) / 2, GAME_H * 0.3).setScrollFactor(0).setDepth(100);
    const bannerText = this.add.text(0, -8, this.def.name, titleStyle(44, '#ffffff', '#b8326f')).setOrigin(0.5);
    banner.add(ribbon(this, 0, 0, Math.max(640, bannerText.width + 300), 0));
    banner.add(bannerText);
    banner.add(this.add.text(0, 92, this.def.goal, titleStyle(32)).setOrigin(0.5));
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
    return SOLID.has(c) || ONE_WAY.has(c) || this.movers.some((m) => m.zone.getBounds().contains(x, y)) || this.fallers.some((f) => f.state !== 'fall' && f.zone.getBounds().contains(x, y));
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
    // ground: one big continuous texture over every run of '#', aligned to the world so neighbouring runs join
    const groundKey = tex === 'grass' ? 'ground-dirt' : `ground-${tex}`;
    this.runs('#', (x1, x2, y) => {
      const ts = this.add.tileSprite(x1 * TILE, y * TILE, (x2 - x1 + 1) * TILE, TILE, groundKey).setOrigin(0);
      ts.setTilePosition(x1 * TILE, y * TILE);
    });
    const isSolid = (x: number, y: number) => y >= 0 && y < this.rows && x >= 0 && x < this.cols && g[y][x] === '#';
    // top edges: a grass strip (or a light stone ledge) and a soft shadow under it
    this.runsWhere((x, y) => y > 0 && isSolid(x, y) && !isSolid(x, y - 1), (x1, x2, y) => {
      const w = (x2 - x1 + 1) * TILE;
      const top = y * TILE;
      this.add.image(x1 * TILE, top + (tex === 'grass' ? 34 : 10), 'shade').setOrigin(0).setDisplaySize(w, 46).setDepth(0.5);
      if (tex === 'grass') {
        const edge = this.add.tileSprite(x1 * TILE - 6, top - 12, w + 12, 58, 'ground-grass').setOrigin(0).setDepth(0.6);
        edge.setTileScale(58 / 72);
        edge.setTilePosition((x1 * TILE - 6) / (58 / 72), 0);
      } else {
        this.add.rectangle(x1 * TILE, top, w, 5, 0xffffff, 0.28).setOrigin(0).setDepth(0.6);
        this.add.rectangle(x1 * TILE, top + 5, w, 3, 0x1a1030, 0.25).setOrigin(0).setDepth(0.6);
      }
    });
    // exposed sides and undersides get a soft dark edge so blocks read as solid shapes
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!isSolid(x, y)) continue;
        if (x > 0 && !isSolid(x - 1, y)) this.add.image(x * TILE, y * TILE, 'side').setOrigin(0).setDisplaySize(26, TILE).setDepth(0.5);
        if (x < this.cols - 1 && !isSolid(x + 1, y)) this.add.image((x + 1) * TILE, y * TILE, 'side').setOrigin(1, 0).setFlipX(true).setDisplaySize(26, TILE).setDepth(0.5);
        if (y < this.rows - 1 && !isSolid(x, y + 1) && g[y + 1][x] !== '~') this.add.image(x * TILE, (y + 1) * TILE, 'shade').setOrigin(0, 1).setFlipY(true).setDisplaySize(TILE, 30).setDepth(0.5);
      }
    }
    // wooden platforms: real planks at a readable size, with an outline
    this.runs('=', (x1, x2, y) => {
      const w = (x2 - x1 + 1) * TILE;
      const plank = this.add.tileSprite(x1 * TILE, y * TILE, w, 28, 'ground-wood').setOrigin(0).setDepth(1);
      plank.setTilePosition(x1 * TILE, 40);
      const o = this.add.graphics().setDepth(1.1);
      o.lineStyle(3, 0x4a2a14, 0.9).strokeRoundedRect(x1 * TILE + 1, y * TILE + 1, w - 2, 26, 6);
      o.fillStyle(0xffffff, 0.18).fillRect(x1 * TILE + 4, y * TILE + 3, w - 8, 3);
      this.add.image(x1 * TILE, y * TILE + 28, 'shade').setOrigin(0).setDisplaySize(w, 18).setDepth(0.9).setAlpha(0.6);
    });
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = g[y][x];
        if (c === 'T' && (y === 0 || g[y - 1][x] !== 'T')) {
          let y2 = y;
          while (y2 + 1 < this.rows && g[y2 + 1][x] === 'T') y2++;
          const bark = this.add.tileSprite(x * TILE + TILE / 2, y * TILE, 46, (y2 - y + 1) * TILE + 1, 'bark').setOrigin(0.5, 0).setDepth(-5);
          bark.setTileScale(46 / 80);
        }
      }
    }
    this.runs('^', (x1, x2, y) => {
      const src = this.textures.get('spikes').getSourceImage() as { height: number };
      const sp = this.add.tileSprite(x1 * TILE, (y + 1) * TILE + 2, (x2 - x1 + 1) * TILE, 42, 'spikes').setOrigin(0, 1).setDepth(2);
      sp.setTileScale(42 / src.height);
    });
    this.placeDecor(isSolid);
    // crowns (runs of O) and vines (runs of |)
    this.runs('O', (x1, x2, y) => {
      const w = (x2 - x1 + 1) * TILE;
      const crown = this.add.image(x1 * TILE + w / 2, y * TILE - 30, 'crown').setOrigin(0.5, 0).setDepth(-4);
      crown.setScale((w + 70) / crown.width);
    });
    for (let x = 0; x < this.cols; x++) {
      let y = 0;
      while (y < this.rows) {
        if (g[y][x] === '|') {
          const y1 = y;
          while (y < this.rows && g[y][x] === '|') y++;
          const vsrc = this.textures.get('vine').getSourceImage() as { width: number };
          const vine = this.add.tileSprite((x + 0.5) * TILE, y1 * TILE - 10, 44, (y - y1) * TILE + 10, 'vine').setOrigin(0.5, 0).setDepth(-5);
          vine.setTileScale(44 / vsrc.width);
        } else y++;
      }
    }
    // water: the surface sits just under the islands' grass, so lily pads, rafts and logs float on it
    for (let x = 0; x < this.cols; x++) {
      this.waterTop[x] = -1;
      for (let y = 0; y < this.rows; y++) {
        if (g[y][x] === '~' || g[y][x] === 'x') {
          this.waterTop[x] = y;
          break;
        }
      }
    }
    this.runsWhere((x, y) => this.waterTop[x] === y, (x1, x2, y) => {
      const w = (x2 - x1 + 1) * TILE;
      const surface = this.waterSurface(y);
      const depth = (this.rows - y + 1) * TILE;
      this.add.rectangle(x1 * TILE, surface, w, depth, 0x2f86d6, 0.78).setOrigin(0).setDepth(25);
      this.add.rectangle(x1 * TILE, surface, w, 30, 0x6cc6ff, 0.55).setOrigin(0).setDepth(25);
      const foam = this.add.tileSprite(x1 * TILE, surface - 6, w, 16, 'wave').setOrigin(0).setDepth(25.5).setAlpha(0.85);
      this.waves.push(foam);
      for (let i = 0; i < Math.ceil(w / 90); i++) {
        const sp = this.add.image(x1 * TILE + Math.random() * w, surface + 10 + Math.random() * 60, 'glow').setDepth(25.6).setScale(0.18).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: sp, alpha: { from: 0, to: 0.9 }, yoyo: true, repeat: -1, duration: 700 + Math.random() * 900, delay: Math.random() * 1500 });
      }
    });

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

  private runsWhere(test: (x: number, y: number) => boolean, fn: (x1: number, x2: number, y: number) => void) {
    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        if (!test(x, y)) {
          x++;
          continue;
        }
        const x1 = x;
        while (x < this.cols && test(x, y)) x++;
        fn(x1, x - 1, y);
      }
    }
  }

  /** Water surface y for a column whose first water row is `row`. */
  waterSurface(row: number) {
    return (row - 1) * TILE + 22;
  }

  /** Grass, flowers, ferns or crystals on the ground tops: picked by a fixed hash, so a level always looks the same. */
  private placeDecor(isSolid: (x: number, y: number) => boolean) {
    const sets: Record<string, string[]> = {
      meadow: ['grass1', 'grass2', 'daisies', 'flowers', 'grass1', 'rock', 'shrooms', 'flowers'],
      forest: ['fern', 'grass2', 'shrooms', 'fern', 'rock', 'grass1', 'glowshrooms'],
      river: ['reeds', 'grass1', 'grass2', 'flowers', 'reeds', 'rock', 'daisies'],
      cave: ['crystals1', 'crystals2', 'glowshrooms', 'stalagmite', 'crystals1'],
      castle: ['torch', 'banner', 'rock', 'torch'],
    };
    const keys = (sets[this.def.world] ?? []).filter((k) => hasArt(this, k));
    if (!keys.length) return;
    const busy = new Set(['@', 'P', 'K', 'D', 'T', '|', '^', 'W']);
    const chance = this.def.world === 'castle' ? 0.12 : 0.5;
    for (let y = 1; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!isSolid(x, y) || isSolid(x, y - 1) || busy.has(this.grid[y - 1][x])) continue;
        const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        if (h > chance) continue;
        const key = keys[Math.floor(h * 997) % keys.length];
        const tall = key === 'reeds' || key === 'torch' || key === 'banner' ? 86 : key.startsWith('crystals') || key === 'fern' ? 58 : 44;
        const img = this.add.image((x + 0.2 + ((h * 7) % 0.6)) * TILE, y * TILE + 8, key).setOrigin(0.5, 1).setDepth(2);
        img.setScale((tall * (0.8 + ((h * 13) % 0.4))) / img.height).setFlipX(h * 100 > 50);
        if (key === 'torch') {
          const flame = this.add.image(img.x, img.y - img.displayHeight * 0.85, 'glow').setDepth(2.1).setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6);
          this.tweens.add({ targets: flame, alpha: { from: 0.55, to: 0.9 }, scale: 1.8, yoyo: true, repeat: -1, duration: 260 + h * 200 });
        }
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
          // under Alice (20) and under the water (25): she stands ON the pad, the water laps its lower edge;
          // no bobbing, the pad must not move away from her feet
          const img = this.add.image(cx, y * TILE - 10, 'lily').setOrigin(0.5, 0).setDepth(19);
          img.setScale((TILE + 24) / img.width);
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
    let view: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
    if (key === 'tile-wood') {
      view = this.add.tileSprite(x, y - 11, w, 28, 'ground-wood').setOrigin(0.5, 0).setDepth(6);
    } else {
      view = this.add.image(x, y - 11 - (key === 'cloud' ? 6 : 4), key).setOrigin(0.5, 0).setDepth(6);
      view.setScale((w + 16) / view.width);
    }
    this.movers.push({ zone, view, lift: key === 'cloud' ? 6 : key === 'tile-wood' ? 0 : 4, x0: x, y0: y, axis, range, period: axis === 'x' ? 4.2 : 3, phase: Math.random() * 6 });
  }

  private addFaller(x: number, y: number) {
    const zone = this.add.zone(x, y, TILE, 22);
    this.physics.add.existing(zone);
    const b = zone.body as Body;
    b.setAllowGravity(false).setImmovable(true);
    this.makeOneWay(b);
    const view = this.add.image(x, y - 13, 'log').setOrigin(0.5, 0).setDepth(6);
    view.setScale((TILE + 8) / view.width);
    this.fallers.push({ zone, view, x0: x, y0: y, state: 'still', timer: 0 });
  }

  private touchFaller(f: Faller) {
    if (f.state === 'still' && this.player.body.bottom <= f.zone.y) {
      f.state = 'shake';
      f.timer = 0.45;
    }
  }

  // ---------- atmosphere: parallax, light, particles (all cheap: a few dozen sprites, no shaders) ----------
  private setupAtmosphere() {
    const W = viewW(this);
    const look: Record<string, { color: number; add: boolean; count: number; rays: number; rayTint: number; vignette: number; butterflies: number }> = {
      meadow: { color: 0xfff6c8, add: false, count: 18, rays: 3, rayTint: 0xfff2b0, vignette: 0.22, butterflies: 3 },
      forest: { color: 0xd8ff7a, add: true, count: 28, rays: 4, rayTint: 0xffc080, vignette: 0.42, butterflies: 0 },
      river: { color: 0xffffff, add: true, count: 16, rays: 3, rayTint: 0xfff6d0, vignette: 0.22, butterflies: 2 },
      cave: { color: 0x7ff6ff, add: true, count: 26, rays: 0, rayTint: 0, vignette: 0.6, butterflies: 0 },
      castle: { color: 0xd59bff, add: true, count: 24, rays: 0, rayTint: 0, vignette: 0.5, butterflies: 0 },
    };
    const L = look[this.def.world];
    if (LOW_POWER) {
      L.count = Math.round(L.count * 0.5);
      L.rays = Math.min(L.rays, 2);
    }
    for (let i = 0; i < L.rays; i++) {
      const ray = this.add.image(W * (0.15 + i * 0.25), -40, 'ray').setOrigin(0.5, 0).setScrollFactor(0).setDepth(-12);
      ray.setDisplaySize(140 + i * 30, GAME_H * 1.3).setAngle(22).setTint(L.rayTint).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.1);
      this.tweens.add({ targets: ray, alpha: 0.2, duration: 2600 + i * 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.rays.push(ray);
    }
    for (let i = 0; i < L.count; i++) {
      const par = 0.3 + Math.random() * 0.9;
      const img = this.add.image(0, 0, 'glow').setScrollFactor(0).setTint(L.color).setDepth(par > 0.8 ? 30 : -11);
      img.setScale((L.add ? 0.22 : 0.12) * par);
      if (L.add) img.setBlendMode(Phaser.BlendModes.ADD);
      this.motes.push({ img, x: Math.random() * W, y: Math.random() * GAME_H, vx: (Math.random() - 0.5) * 20, vy: -6 - Math.random() * 14, par, phase: Math.random() * 6 });
    }
    if (hasArt(this, 'butterfly1')) {
      for (let i = 0; i < L.butterflies; i++) {
        const img = this.add.image(0, 0, 'butterfly1').setScrollFactor(0).setDepth(-11).setScale(0.45);
        this.motes.push({ img, x: Math.random() * W, y: 120 + Math.random() * 300, vx: 30 + Math.random() * 20, vy: 0, par: 0.6, phase: Math.random() * 6, flutter: true });
      }
    }
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(90).setAlpha(L.vignette);
    this.vignette.setDisplaySize(W, GAME_H);
    this.shadow = this.add.image(0, 0, 'shadow').setDepth(19).setAlpha(0);
    this.lastCam.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
  }

  /** Blurred plants/rocks that pass in front of the camera faster than the level: the strongest depth cue. */
  private addForeground() {
    const dark = this.def.world === 'cave' || this.def.world === 'castle';
    const keys = (dark ? ['fg-rock', 'fg-stalagmite', 'fg-pillar', 'fg-thorns'] : ['fg-grass', 'fg-leaves', 'fg-fern', 'fg-bush']).filter((k) => hasArt(this, k));
    if (!keys.length) return;
    const f = 1.35;
    const span = this.cols * TILE * f + Math.max(viewW(this), 1920);
    const count = Math.floor(span / (LOW_POWER ? 1300 : 900));
    for (let i = 0; i < count; i++) {
      const h = Math.abs(Math.sin(i * 91.7 + this.def.index * 13.1) * 43758.5453) % 1;
      const key = keys[Math.floor(h * 97) % keys.length];
      // low enough to peek out only below the ground line; fades out near Alice (see updateLayers)
      const img = this.add.image(i * (span / count) + h * 300, this.rows * TILE + 40, key).setOrigin(0.5, 1).setDepth(60);
      img.setScrollFactor(f, 1).setScale((130 + h * 50) / img.height).setFlipX(h > 0.5).setTint(dark ? 0x6a5a8a : 0x6f8f5a);
      this.fg.push(img);
    }
  }

  private fitFarBackground(src: { width: number; height: number }) {
    // 25% wider than the screen gives a slow pan (~0.05 of the level speed) without ever showing an edge
    const k = Math.max(GAME_H / src.height, (viewW(this) * 1.25) / src.width);
    this.bg.setScale(k);
    this.bg.y = -(this.bg.displayHeight - GAME_H) * 0.4;
  }

  private updateLayers(now: number, dt: number) {
    const cam = this.cameras.main;
    const maxY = Math.max(0, this.rows * TILE - GAME_H);
    const maxX = Math.max(1, this.cols * TILE - viewW(this));
    this.bg.x = -(cam.scrollX / maxX) * (this.bg.displayWidth - viewW(this));
    if (this.mid) {
      this.mid.tilePositionX = (cam.scrollX * 0.4) / this.mid.tileScaleX;
      this.mid.y = (maxY - cam.scrollY) * 0.4 + 30;
    }
    if (this.near) {
      this.near.tilePositionX = (cam.scrollX * 0.7) / this.near.tileScaleX;
      this.near.y = (maxY - cam.scrollY) * 0.7 + 40;
    }
    const px = this.player.body.center.x - cam.scrollX;
    for (const img of this.fg) {
      const sx = img.x - cam.scrollX * img.scrollFactorX;
      img.setAlpha(Math.abs(sx - px) < img.displayWidth / 2 + 90 ? 0.3 : 0.95);
    }
    if (++this.cullTick % 4 === 0) {
      const view = new Phaser.Geom.Rectangle(cam.worldView.x - 480, cam.worldView.y - 320, cam.worldView.width + 960, cam.worldView.height + 640);
      for (const st of this.statics) st.obj.setVisible(Phaser.Geom.Intersects.RectangleToRectangle(view, st.rect));
    }
    for (const w of this.waves) w.tilePositionX = now / 40;
    const dx = cam.scrollX - this.lastCam.x;
    const dy = cam.scrollY - this.lastCam.y;
    this.lastCam.set(cam.scrollX, cam.scrollY);
    const W = viewW(this);
    for (const m of this.motes) {
      m.x += m.vx * dt - dx * m.par;
      m.y += m.vy * dt - dy * m.par * 0.5;
      if (m.x < -40) m.x += W + 80;
      if (m.x > W + 40) m.x -= W + 80;
      if (m.y < -40) m.y += GAME_H + 80;
      if (m.y > GAME_H + 40) m.y -= GAME_H + 80;
      const t = now / 1000 + m.phase;
      if (m.flutter) {
        m.img.setTexture(Math.floor(now / 90 + m.phase * 10) % 2 ? 'butterfly1' : 'butterfly2');
        m.img.setPosition(m.x, m.y + Math.sin(t * 2.2) * 30).setAngle(Math.sin(t * 3) * 15 + 90);
      } else {
        m.img.setPosition(m.x + Math.sin(t * 1.3) * 12, m.y);
        m.img.setAlpha(0.35 + Math.abs(Math.sin(t * 1.7)) * 0.65);
      }
    }
    // soft shadow under Alice on the ground below her, fading with height
    const p = this.player.body;
    let gy = -1;
    for (let y = p.bottom; y < p.bottom + 260; y += 12) {
      if (this.floorAt(p.center.x, y)) {
        gy = Math.floor(y / TILE) * TILE;
        const m = this.movers.find((mv) => mv.zone.getBounds().contains(p.center.x, y));
        if (m) gy = (m.zone.body as Body).top;
        break;
      }
    }
    if (gy < 0 || this.player.climbing) this.shadow.setAlpha(0);
    else {
      const k = 1 - Math.min(1, (gy - p.bottom) / 260);
      this.shadow.setPosition(p.center.x, gy + 2).setAlpha(0.8 * k).setDisplaySize(80 * (0.6 + 0.4 * k), 18);
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
    this.updateLayers(now, dt);

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
      m.view.setPosition(nx, ny - 11 - m.lift);
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
        f.view.setPosition(f.zone.x, f.zone.y - 13);
        if (f.timer <= 0) {
          f.state = 'still';
          b.setAllowGravity(false);
          b.checkCollision.up = true;
          b.reset(f.x0, f.y0);
          f.view.setPosition(f.x0, f.y0 - 13).setAlpha(0);
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
      if (wTop >= 0 && p.center.y > this.waterSurface(wTop) + 24) this.fellOut(true);
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
    panel.add(paintedPanel(this, 0, 0, 660, 400));
    panel.add(this.add.text(0, -110, 'Кристалл найден!', titleStyle(52, '#ff5fa8', '#ffffff')).setOrigin(0.5));
    panel.add(this.add.text(0, -30, `★ ${this.starsHere} звёздочек`, titleStyle(36, '#ffc93a', '#8a5a00')).setOrigin(0.5));
    const crystals = load().crystals.filter(Boolean).length;
    panel.add(this.add.text(0, 25, `Кристаллов: ${crystals} из 5`, titleStyle(30, '#49c9e8', '#1d4e6b')).setOrigin(0.5));
    const go = () => {
      cam.fadeOut(300);
      this.time.delayedCall(320, () => this.scene.start('Map'));
    };
    panel.add(paintedButton(this, 0, 115, 'Дальше ▶', 38, go));
    panel.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 450, delay: 900, ease: 'Back.easeOut' });

    this.time.delayedCall(1000, () => this.input.keyboard!.once('keydown', go));
  }

  togglePause() {
    if (this.finished) return;
    this.scene.pause();
    this.scene.get('Hud').events.emit('pause');
  }
}
