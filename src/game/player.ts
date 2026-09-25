import Phaser from 'phaser';
import { PHYS, PLAYER } from './constants';
import { REF_H as REF, hasArt } from './assets';
import { InputState } from './controls';
import { sfx } from './sfx';
import type { LevelScene } from '../scenes/Level';

type Body = Phaser.Physics.Arcade.Body;

export class Player {
  zone: Phaser.GameObjects.Zone;
  body: Body;
  view: Phaser.GameObjects.Image;
  facing = 1;
  hearts: number;
  maxHearts: number;
  climbing = false;
  shieldOn = false;
  crouching = false;
  frozen = false;

  private lastGround = -9999;
  private jumpBufferUntil = -9999;
  private airJumps = 0;
  private climbLockUntil = 0;
  private invulnUntil = 0;
  private hurtUntil = 0;
  private shootAnimUntil = 0;
  private shootReadyAt = 0;
  private prev: InputState | null = null;
  private runClock = 0;
  private climbClock = 0;

  constructor(private scene: LevelScene, x: number, y: number, maxHearts: number) {
    this.zone = scene.add.zone(x, y, PLAYER.bodyW, PLAYER.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Body;
    this.body.setMaxVelocityY(1150);
    this.view = scene.add.image(x, y, 'alice-idle').setOrigin(0.5, 1).setDepth(20);
    this.view.setScale(PLAYER.viewH / REF.character);
    this.maxHearts = maxHearts;
    this.hearts = maxHearts;
  }

  get invulnerable() {
    return this.scene.time.now < this.invulnUntil;
  }

  get onGround() {
    return this.body.blocked.down || this.body.touching.down;
  }

  update(inp: InputState, dt: number) {
    const now = this.scene.time.now;
    const b = this.body;
    const prev = this.prev ?? inp;
    const jumpPressed = inp.jump && !prev.jump;
    const jumpReleased = !inp.jump && prev.jump;
    this.prev = { ...inp };

    if (this.frozen) {
      b.setVelocityX(0);
      this.render(now, dt);
      return;
    }

    if (this.onGround) {
      this.lastGround = now;
      this.airJumps = 0;
    }
    if (jumpPressed) this.jumpBufferUntil = now + PHYS.jumpBufferMs;

    const hurt = now < this.hurtUntil;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0 && !hurt) this.facing = dir;

    // --- climbing trees and vines ---
    const climbHere = this.scene.climbableAt(b.center.x, b.center.y);
    if (!this.climbing && climbHere && (inp.up || (inp.down && !this.onGround)) && now > this.climbLockUntil && !hurt) {
      if (this.crouching) this.setCrouch(false);
      this.climbing = true;
      this.airJumps = 0;
    }
    if (this.climbing) {
      if (!climbHere || (inp.down && this.onGround)) {
        this.stopClimb();
      } else {
        b.setAllowGravity(false);
        const cx = this.scene.climbCenterX(b.center.x);
        const topBlocked = inp.up && !this.scene.climbableAt(b.center.x, b.top + 6);
        if (topBlocked && this.scene.floorAt(b.center.x, b.top - 10)) {
          // top of a tree or vine with a crown/platform above: pull Alice up onto it
          this.stopClimb();
          this.climbLockUntil = now + 400;
          b.setVelocity(0, -720);
          this.render(now, dt);
          return;
        }
        const vy = topBlocked ? 0 : inp.up ? -PHYS.climbSpeed : inp.down ? PHYS.climbSpeed : 0;
        b.setVelocity((cx - b.center.x) * 10 + dir * 60, vy);
        if (vy !== 0) this.climbClock += dt;
        if (this.jumpBufferUntil > now) {
          this.jumpBufferUntil = 0;
          this.stopClimb();
          this.climbLockUntil = now + 280;
          b.setVelocity(dir * PHYS.runSpeed, -PHYS.jumpVel * 0.95);
          this.airJumps = 0;
          sfx.jump();
        }
        this.render(now, dt);
        return;
      }
    }

    // --- crouch (hold down on the ground): smaller body, low shots; stands up only where there is room ---
    const wantCrouch = inp.down && this.onGround && !hurt;
    if (wantCrouch && !this.crouching) this.setCrouch(true);
    else if (!wantCrouch && this.crouching && this.canStand()) this.setCrouch(false);

    // --- running, shield ---
    this.shieldOn = inp.shield && !hurt && !this.crouching;
    if (!hurt) {
      const speed = this.crouching ? 0 : this.shieldOn ? PHYS.shieldSpeed : PHYS.runSpeed;
      const target = dir * speed;
      const accel = this.onGround ? 0.35 : 0.2;
      b.setVelocityX(Phaser.Math.Linear(b.velocity.x, target, accel));
      if (Math.abs(b.velocity.x) < 4 && dir === 0) b.setVelocityX(0);
    }

    // --- jumping: coyote time, buffer, double jump, variable height ---
    if (this.jumpBufferUntil > now && !hurt && this.crouching && this.canStand()) this.setCrouch(false);
    if (this.jumpBufferUntil > now && !hurt && !this.crouching) {
      if (now - this.lastGround < PHYS.coyoteMs) {
        b.setVelocityY(-PHYS.jumpVel);
        this.lastGround = -9999;
        this.jumpBufferUntil = 0;
        sfx.jump();
      } else if (this.airJumps < 1) {
        b.setVelocityY(-PHYS.doubleJumpVel);
        this.airJumps++;
        this.jumpBufferUntil = 0;
        sfx.doubleJump();
        this.scene.puff(b.center.x, b.bottom, 0xffffff);
      }
    }
    if (jumpReleased && b.velocity.y < -380) b.setVelocityY(b.velocity.y * 0.5);

    // --- shooting hearts ---
    if (inp.shoot && now >= this.shootReadyAt && !this.shieldOn && !hurt) {
      this.shootReadyAt = now + PLAYER.shootCdMs;
      this.shootAnimUntil = now + 220;
      // from a crouch the heart flies low, at hedgehog height
      const y = this.crouching ? b.bottom - 40 : b.center.y - 6;
      this.scene.shootHeart(b.center.x + this.facing * 40, y, this.facing);
    }

    this.render(now, dt);
  }

  private setCrouch(on: boolean) {
    this.crouching = on;
    const h = on ? PLAYER.crouchH : PLAYER.bodyH;
    // the zone is bodyH tall; keep the feet where they are by offsetting the smaller body down
    this.body.setSize(PLAYER.bodyW, h, false);
    this.body.setOffset(0, PLAYER.bodyH - h);
    // same frame: platforms, shots and the sprite see the new size. prev/prevFrame must follow too, otherwise
    // the physics post-update reads the offset change as movement and shoves the zone 32px (through platforms)
    this.body.updateFromGameObject();
    this.body.prev.copy(this.body.position);
    this.body.prevFrame.copy(this.body.position);
  }

  private canStand() {
    const b = this.body;
    const top = b.bottom - PLAYER.bodyH + 4;
    return !this.scene.solidAt(b.left + 4, top) && !this.scene.solidAt(b.right - 4, top);
  }

  private stopClimb() {
    this.climbing = false;
    this.body.setAllowGravity(true);
  }

  private render(now: number, dt: number) {
    const b = this.body;
    let key = 'alice-idle';
    if (now < this.hurtUntil) key = 'alice-hurt';
    else if (this.climbing) key = Math.floor(this.climbClock * 6) % 2 ? 'alice-climb2' : 'alice-climb1';
    else if (this.crouching && hasArt(this.scene, 'alice-crouch')) key = now < this.shootAnimUntil ? 'alice-crouch-shoot' : 'alice-crouch';
    else if (this.crouching) key = 'alice-shield'; // fallback pose if the crouch art is missing
    else if (this.shieldOn) key = 'alice-shield';
    else if (now < this.shootAnimUntil) key = 'alice-shoot';
    else if (!this.onGround) key = b.velocity.y < 0 ? 'alice-jump' : 'alice-fall';
    else if (Math.abs(b.velocity.x) > 20) {
      // 6-frame cycle (contact, down, passing for each leg); the old 4-frame art is a fallback
      const frames = hasArt(this.scene, 'alice-run6') ? 6 : 4;
      const fps = frames === 6 ? 14 : 12;
      const before = Math.floor(this.runClock * fps);
      this.runClock += dt * (Math.abs(b.velocity.x) / PHYS.runSpeed);
      const frame = Math.floor(this.runClock * fps);
      key = `alice-run${(frame % frames) + 1}`;
      // a footstep whenever a foot lands (the contact frames)
      if (frame !== before && frame % (frames / 2) === 0) sfx.step(this.scene.def.ground === 'grass' ? 'grass' : 'stone');
    }
    this.view.setTexture(key);
    this.view.setFlipX(this.facing < 0);
    this.view.setPosition(b.center.x, b.bottom + 3);
    const breathe = key === 'alice-idle' ? 1 + Math.sin(now / 300) * 0.01 : 1;
    this.view.setScale((PLAYER.viewH / REF.character) * breathe);
    this.view.setAlpha(this.invulnerable && Math.floor(now / 60) % 2 ? 0.55 : 1);
  }

  /** Returns true if the hit landed. */
  hurt(fromX: number) {
    const now = this.scene.time.now;
    if (this.invulnerable || this.frozen) return false;
    if (this.climbing) this.stopClimb();
    this.hearts -= 1;
    this.invulnUntil = now + PLAYER.invulnMs;
    this.hurtUntil = now + 380;
    const away = this.body.center.x < fromX ? -1 : 1;
    this.body.setVelocity(away * 320, -520);
    sfx.hurt();
    this.scene.cameras.main.shake(160, 0.006);
    return true;
  }

  /** Blocked by the shield: small push back, no damage. */
  blocked(fromX: number) {
    const away = this.body.center.x < fromX ? -1 : 1;
    this.body.setVelocityX(away * 200);
    this.invulnUntil = this.scene.time.now + 250;
    sfx.shield();
  }

  bounce() {
    this.body.setVelocityY(-PHYS.jumpVel * 0.75);
    this.airJumps = 0;
  }

  teleport(x: number, y: number) {
    if (this.climbing) this.stopClimb();
    if (this.crouching) this.setCrouch(false);
    this.body.reset(x, y);
    this.body.setVelocity(0, 0);
    this.invulnUntil = this.scene.time.now + PLAYER.invulnMs;
  }

  heal(n = 1) {
    this.hearts = Math.min(this.maxHearts, this.hearts + n);
  }
}
