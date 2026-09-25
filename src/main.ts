import Phaser from 'phaser';
import { GAME_W, GAME_H, PHYS } from './game/constants';
import { BootScene, TitleScene, StoryScene, MapScene, EndingScene } from './scenes/Menus';
import { LevelScene } from './scenes/Level';
import { HudScene } from './scenes/Hud';
import { touch } from './game/controls';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#2a1840',
  // EXPAND: height is always 720, width grows with wide phone screens (no black bars)
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: PHYS.gravity }, debug: false } },
  input: { activePointers: 5 },
  render: { antialias: true },
  scene: [BootScene, TitleScene, StoryScene, MapScene, LevelScene, HudScene, EndingScene],
});

// handy for automated checks in the browser console
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __touch: typeof touch }).__touch = touch;
