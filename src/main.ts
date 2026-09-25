import Phaser from 'phaser';
import { GAME_W, GAME_H, PHYS } from './game/constants';
import { BootScene, TitleScene, StoryScene, MapScene, EndingScene } from './scenes/Menus';
import { LevelScene } from './scenes/Level';
import { HudScene } from './scenes/Hud';
import { touch } from './game/controls';

/**
 * The game is always 720 tall. On screens wider than 16:9 (phones) the width grows so there are no side bars;
 * on taller screens (tablets, narrow windows) it stays 1280 and FIT adds thin bars top and bottom,
 * so nothing below the level floor is ever shown.
 */
function gameWidth() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return Math.max(GAME_W, Math.round(GAME_H * aspect));
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: gameWidth(),
  height: GAME_H,
  backgroundColor: '#2a1840',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: PHYS.gravity }, debug: false } },
  input: { activePointers: 5 },
  render: { antialias: true },
  scene: [BootScene, TitleScene, StoryScene, MapScene, LevelScene, HudScene, EndingScene],
});

window.addEventListener('resize', () => {
  const w = gameWidth();
  if (w !== game.scale.width) game.scale.setGameSize(w, GAME_H);
});

// handy for automated checks in the browser console
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __touch: typeof touch }).__touch = touch;
