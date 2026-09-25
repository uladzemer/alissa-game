import Phaser from 'phaser';
import { TILE } from './constants';
import { REF_H } from './assets';
import { sfx } from './sfx';
import type { LevelScene } from '../scenes/Level';

type Body = Phaser.Physics.Arcade.Body;

export type EnemyKind = 'hedgehog' | 'mushroom' | 'owl' | 'bat' | 'frog' | 'fish' | 'dog';

interface KindSpec {
  w: number;
  h: number;
  viewH: number;
  gravity: boolean;
  stompable: boolean;
  hp: number;
  speed: number;
  frames: string[];
}

const KINDS: Record<EnemyKind, KindSpec> = {
  hedgehog: { w: 70, h: 46, viewH: 62, gravity: true, stompable: false, hp: 1, speed: 70, frames: ['hedgehog1', 'hedgehog2'] },
  mushroom: { w: 56, h: 58, viewH: 72, gravity: true, stompable: true, hp: 1, speed: 80, frames: ['mushroom1', 'mushroom2'] },
  owl: { w: 60, h: 56, viewH: 78, gravity: false, stompable: true, hp: 1, speed: 0, frames: ['owl1', 'owl2'] },
  bat: { w: 64, h: 40, viewH: 58, gravity: false, stompable: true, hp: 1, speed: 110, frames: ['bat1', 'bat2'] },
  frog: { w: 58, h: 46, viewH: 62, gravity: true, stompable: true, hp: 1, speed: 0, frames: ['frog1', 'frog2'] },
  fish: { w: 50, h: 42, viewH: 58, gravity: false, stompable: true, hp: 1, speed: 0, frames: ['fish1', 'fish2'] },
  dog: { w: 76, h: 56, viewH: 78, gravity: true, stompable: true, hp: 2, speed: 110, frames: ['dog1', 'dog2'] },
};

export const ENEMY_CHARS: Record<string, EnemyKind> = { h: 'hedgehog', m: 'mushroom', o: 'owl', b: 'bat', f: 'frog', x: 'fish', d: 'dog' };

export class Enemy {
  zone: Phaser.GameObjects.Zone;
  body: Body;
  view: Phaser.GameObjects.Image;
  spec: KindSpec;
  hp: number;
  friendly = false;
  dead = false;
  dir = -1;
  private home: Phaser.Math.Vector2;
  private clock = Math.random() * 10;
  private state: 'idle' | 'dive' | 'return' | 'hidden' | 'jump' = 'idle';
  private timer = 0;
  private target = new Phaser.Math.Vector2();
  private flashUntil = 0;

  constructor(private scene: LevelScene, public kind: EnemyKind, x: number, y: number) {
    this.spec = KINDS[kind];
    this.hp = this.spec.hp;
    this.home = new Phaser.Math.Vector2(x, y);
    this.zone = scene.add.zone(x, y, this.spec.w, this.spec.h);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Body;
    this.body.setAllowGravity(this.spec.gravity);
    this.view = scene.add.image(x, y, this.spec.frames[0]).setOrigin(0.5, 1).setDepth(10);
    this.view.setScale(this.spec.viewH / REF_H.character);
    if (this.spec.gravity) scene.physics.add.collider(this.zone, scene.solids);
    if (kind === 'fish') {
      this.state = 'hidden';
      this.timer = 1 + Math.random() * 1.5;
    }
    this.timer = kind === 'frog' ? 1 + Math.random() : this.timer;
  }

  get stompable() {
    return this.spec.stompable && this.state !== 'hidden';
  }

  get harmful() {
    return !this.friendly && !this.dead && this.state !== 'hidden';
  }

  update(dt: number) {
    if (this.dead) return;
    this.clock += dt;
    const b = this.body;
    const p = this.scene.player.body;
    const dx = p.center.x - b.center.x;
    const dy = p.center.y - b.center.y;

    if (this.friendly) return; // the float-away tween moves it now

    switch (this.kind) {
      case 'hedgehog':
      case 'mushroom':
        this.walk(this.spec.speed);
        break;
      case 'dog': {
        const chase = Math.abs(dx) < 380 && Math.abs(dy) < 90;
        if (chase) this.dir = Math.sign(dx) || this.dir;
        this.walk(chase ? 250 : this.spec.speed, !chase);
        break;
      }
      case 'frog':
        if (b.blocked.down) {
          b.setVelocityX(0);
          this.timer -= dt;
          if (this.timer <= 0) {
            this.dir = Math.abs(dx) < 500 ? Math.sign(dx) || -1 : -this.dir;
            b.setVelocity(this.dir * 190, -760);
            this.timer = 1.6 + Math.random() * 0.8;
          }
        }
        break;
      case 'bat':
        b.setVelocity(Math.cos(this.clock * 1.1) * this.spec.speed, Math.cos(this.clock * 2.6) * 70);
        this.dir = Math.sign(b.velocity.x) || this.dir;
        break;
      case 'owl':
        this.owl(dt, dx, dy);
        break;
      case 'fish':
        this.fish(dt);
        break;
    }
    this.render(dt);
  }

  private walk(speed: number, turnAtEdges = true) {
    const b = this.body;
    if (b.blocked.left) this.dir = 1;
    else if (b.blocked.right) this.dir = -1;
    if (b.blocked.down && turnAtEdges) {
      const aheadX = b.center.x + this.dir * (b.halfWidth + 6);
      if (!this.scene.floorAt(aheadX, b.bottom + 8) || this.scene.hazardAt(aheadX, b.bottom - 8)) this.dir *= -1;
    } else if (b.blocked.down && !this.scene.floorAt(b.center.x + this.dir * (b.halfWidth + 6), b.bottom + 8)) {
      this.dir *= -1; // even a chasing dog will not run off a cliff
    }
    b.setVelocityX(this.dir * speed);
  }

  private owl(dt: number, dx: number, dy: number) {
    const b = this.body;
    if (this.state === 'idle') {
      const hx = this.home.x + Math.sin(this.clock * 0.9) * 90;
      const hy = this.home.y + Math.sin(this.clock * 2.2) * 20;
      b.setVelocity((hx - b.center.x) * 3, (hy - b.center.y) * 3);
      this.dir = Math.cos(this.clock * 0.9) >= 0 ? 1 : -1;
      this.timer -= dt;
      if (this.timer <= 0 && Math.abs(dx) < 330 && dy > 60) {
        this.state = 'dive';
        this.target.set(this.scene.player.body.center.x, this.scene.player.body.center.y);
        this.dir = Math.sign(dx) || 1;
      }
    } else if (this.state === 'dive') {
      const v = new Phaser.Math.Vector2(this.target.x - b.center.x, this.target.y - b.center.y);
      if (v.length() < 20 || this.scene.solidAt(b.center.x, b.bottom + 4)) {
        this.state = 'return';
      } else b.setVelocity(v.normalize().x * 470, v.y * 470);
    } else {
      const v = new Phaser.Math.Vector2(this.home.x - b.center.x, this.home.y - b.center.y);
      if (v.length() < 16) {
        this.state = 'idle';
        this.timer = 2.2;
      } else b.setVelocity(v.normalize().x * 240, v.y * 240);
    }
  }

  private fish(dt: number) {
    const b = this.body;
    if (this.state === 'hidden') {
      b.setVelocity(0, 0);
      b.reset(this.home.x, this.home.y);
      this.view.setVisible(false);
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'jump';
        b.setVelocityY(-980);
        this.view.setVisible(true);
        this.scene.splash(this.home.x, this.home.y - TILE);
      }
    } else {
      b.setVelocityY(b.velocity.y + 1500 * dt);
      if (b.velocity.y > 0 && b.center.y >= this.home.y) {
        this.state = 'hidden';
        this.timer = 1.6 + Math.random() * 1.4;
      }
    }
  }

  private render(dt: number) {
    const b = this.body;
    const f = this.spec.frames;
    let key = f[Math.floor(this.clock * (this.kind === 'bat' || this.kind === 'owl' ? 8 : 6)) % f.length];
    if (this.kind === 'owl' && this.state === 'dive') key = 'owl-dive';
    if (this.kind === 'frog') key = b.blocked.down ? 'frog1' : 'frog2';
    if (this.kind === 'fish') key = b.velocity.y < 0 ? 'fish1' : 'fish2';
    if (this.kind === 'dog' && this.friendly) key = 'dog-sit';
    this.view.setTexture(key);
    const facingRight = this.kind === 'fish' ? true : this.dir > 0;
    this.view.setFlipX(!facingRight);
    if (this.kind === 'fish') this.view.setAngle(b.velocity.y < 0 ? -70 : 70);
    const bottom = this.spec.gravity ? b.bottom + 2 : b.bottom + (this.spec.viewH - this.spec.h) / 2;
    this.view.setPosition(b.center.x, bottom);
    const now = this.scene.time.now;
    if (now < this.flashUntil) this.view.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (!this.friendly) this.view.clearTint();
    void dt;
  }

  hit(dmg: number) {
    if (!this.harmful) return;
    this.hp -= dmg;
    this.flashUntil = this.scene.time.now + 120;
    if (this.hp <= 0) this.befriend();
    else sfx.stomp();
  }

  stomp() {
    if (this.kind === 'mushroom') {
      this.view.setTexture('mushroom-flat');
    }
    this.befriend();
  }

  /** Enemies are never killed: they turn kind, float away with hearts and leave a star. */
  befriend() {
    if (this.friendly || this.dead) return;
    this.friendly = true;
    this.body.enable = false;
    sfx.befriend();
    this.view.clearTint();
    this.view.setTint(0xffc4e1);
    this.scene.heartsBurst(this.body.center.x, this.body.center.y - 20);
    this.scene.dropStar(this.body.center.x, this.body.center.y - 30);
    this.scene.tweens.add({
      targets: this.view,
      y: this.view.y - 220,
      alpha: 0,
      angle: this.kind === 'fish' ? 0 : Phaser.Math.Between(-15, 15),
      duration: 1400,
      delay: this.kind === 'mushroom' ? 350 : 150,
      ease: 'Sine.easeIn',
      onComplete: () => this.destroy(),
    });
  }

  destroy() {
    this.dead = true;
    this.zone.destroy();
    this.view.destroy();
  }
}

/** The witch: flies over the arena, throws magic orbs, calls bats. Hearts make her kind again. */
export class Witch {
  view: Phaser.GameObjects.Image;
  hp = 10;
  maxHp = 10;
  state: 'waiting' | 'fight' | 'kind' = 'waiting';
  x: number;
  y: number;
  private clock = 0;
  private attackTimer = 2;
  private attacks = 0;
  private castUntil = 0;
  private flashUntil = 0;
  readonly arenaX0: number;
  readonly arenaX1: number;

  constructor(private scene: LevelScene, col: number, row: number) {
    this.x = (col + 0.5) * TILE;
    this.y = (row + 0.5) * TILE;
    this.arenaX0 = (col - 10) * TILE;
    this.arenaX1 = (col + 10) * TILE;
    this.view = scene.add.image(this.x, this.y, 'witch-fly').setDepth(15);
    this.view.setScale(150 / REF_H.character);
  }

  get bounds() {
    const w = this.view.displayWidth * 0.55;
    const h = this.view.displayHeight * 0.7;
    return new Phaser.Geom.Rectangle(this.x - w / 2, this.y - h / 2, w, h);
  }

  update(dt: number) {
    const now = this.scene.time.now;
    if (this.state === 'waiting') {
      this.clock += dt;
      this.y += Math.sin(this.clock * 2) * 0.3;
      this.view.setPosition(this.x, this.y);
      return;
    }
    if (this.state === 'fight') {
      this.clock += dt;
      const cx = (this.arenaX0 + this.arenaX1) / 2;
      const tx = cx + Math.sin(this.clock * 0.55) * 7 * TILE;
      const ty = 3.5 * TILE + Math.sin(this.clock * 1.4) * 45;
      const vx = tx - this.x;
      this.x = tx;
      this.y = ty;
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attacks++;
        this.castUntil = now + 450;
        this.attackTimer = this.hp > this.maxHp / 2 ? 1.9 : 1.4;
        sfx.magic();
        this.scene.witchOrb(this.x - 30, this.y - 10);
        if (this.attacks % 3 === 0) this.scene.summonBats(this.arenaX0 + TILE * 2, this.arenaX1 - TILE * 2);
      }
      this.view.setTexture(now < this.castUntil ? 'witch-cast' : 'witch-fly');
      // the art faces left; flip when flying right
      this.view.setFlipX(vx > 0.5);
    }
    this.view.setPosition(this.x, this.y);
    if (now < this.flashUntil) this.view.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.view.clearTint();
  }

  hit(dmg: number) {
    if (this.state !== 'fight') return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flashUntil = this.scene.time.now + 120;
    sfx.bossHit();
    if (this.hp === 0) {
      this.state = 'kind';
      this.view.setTexture('witch-kind').setFlipX(false).clearTint();
      this.scene.witchBefriended(this);
    }
  }
}
