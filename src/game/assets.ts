import Phaser from 'phaser';

/**
 * Every picture the game uses. Real art lives in public/assets/<key>.png (made by art/build_assets.py);
 * if a file is missing, Boot draws a simple placeholder of the same size so the game still runs.
 * `h` is the pixel height of the file: all frames of one character share one scale (see art/build_assets.py).
 */
type Shape = 'body' | 'round' | 'star' | 'heart' | 'tile' | 'tex' | 'bg' | 'flag' | 'spikes' | 'plank' | 'none';
export interface AssetSpec { w: number; h: number; color: number; shape: Shape }

const A = (w: number, h: number, color: number, shape: Shape): AssetSpec => ({ w, h, color, shape });

/** Reference heights produced by the build script (first frame of each sheet). */
export const REF_H = { character: 200, item: 128, tile: 128 };

export const ASSETS: Record<string, AssetSpec> = {
  'alice-idle': A(110, 200, 0xff7eb6, 'body'),
  'alice-run1': A(130, 200, 0xff7eb6, 'body'),
  'alice-run2': A(120, 200, 0xff7eb6, 'body'),
  'alice-run3': A(130, 200, 0xff7eb6, 'body'),
  'alice-run4': A(120, 200, 0xff7eb6, 'body'),
  'alice-jump': A(130, 190, 0xff7eb6, 'body'),
  'alice-fall': A(140, 200, 0xff7eb6, 'body'),
  'alice-climb1': A(110, 210, 0xff7eb6, 'body'),
  'alice-climb2': A(110, 210, 0xff7eb6, 'body'),
  'alice-shoot': A(150, 200, 0xff7eb6, 'body'),
  'alice-shield': A(140, 190, 0xff7eb6, 'body'),
  'alice-hurt': A(130, 200, 0xff7eb6, 'body'),
  'kesha-fly1': A(120, 110, 0x5fd35f, 'round'),
  'kesha-fly2': A(120, 110, 0x5fd35f, 'round'),
  'kesha-blow': A(150, 110, 0x5fd35f, 'round'),
  'witch-fly': A(260, 200, 0x9b59d0, 'body'),
  'witch-cast': A(240, 220, 0x9b59d0, 'body'),
  'witch-kind': A(240, 220, 0xd59bf0, 'body'),
  prince: A(120, 200, 0x4f8ee8, 'body'),
  king: A(140, 200, 0xd9443a, 'body'),
  hedgehog1: A(200, 130, 0x8a5a33, 'round'),
  hedgehog2: A(200, 130, 0x8a5a33, 'round'),
  mushroom1: A(140, 150, 0xe8413c, 'round'),
  mushroom2: A(140, 150, 0xe8413c, 'round'),
  'mushroom-flat': A(160, 60, 0xe8413c, 'round'),
  owl1: A(180, 150, 0x9a8570, 'round'),
  owl2: A(180, 150, 0x9a8570, 'round'),
  'owl-dive': A(120, 170, 0x9a8570, 'round'),
  bat1: A(180, 110, 0x8e5bc2, 'round'),
  bat2: A(180, 110, 0x8e5bc2, 'round'),
  frog1: A(150, 120, 0x4cbf4c, 'round'),
  frog2: A(190, 120, 0x4cbf4c, 'round'),
  fish1: A(140, 120, 0xff9b33, 'round'),
  fish2: A(150, 90, 0xff9b33, 'round'),
  dog1: A(200, 150, 0xa8703f, 'round'),
  dog2: A(200, 150, 0xa8703f, 'round'),
  'dog-sit': A(150, 160, 0xa8703f, 'round'),
  star: A(128, 128, 0xffd23a, 'star'),
  strawberry: A(110, 128, 0xff3b4d, 'round'),
  crystal: A(80, 128, 0x49e5ff, 'round'),
  heart: A(128, 112, 0xff5fa8, 'heart'),
  seed: A(70, 128, 0x3a3a3a, 'round'),
  orb: A(128, 128, 0xa64dff, 'round'),
  'flag-down': A(90, 200, 0x9a9a9a, 'flag'),
  'flag-up': A(110, 200, 0xff6fb0, 'flag'),
  lily: A(200, 60, 0x4fbf4f, 'plank'),
  raft: A(256, 80, 0xa8703f, 'plank'),
  log: A(256, 70, 0x8a5a33, 'plank'),
  cloud: A(256, 110, 0xffffff, 'plank'),
  crown: A(260, 200, 0x3fae4a, 'round'),
  vine: A(50, 400, 0x3f9e3a, 'plank'),
  spikes: A(192, 64, 0xc9d3dc, 'spikes'),
  door: A(150, 220, 0x7a4a26, 'plank'),
  'tile-grass': A(128, 128, 0x5cc84a, 'tile'),
  'tile-dirt': A(128, 128, 0x9a6233, 'tile'),
  'tile-stone': A(128, 128, 0x8a7fa0, 'tile'),
  'tile-wood': A(128, 128, 0xb77b43, 'tile'),
  'tile-rock': A(128, 128, 0x4e6477, 'tile'),
  'tile-trunk': A(128, 128, 0x7b4a2a, 'tile'),
  'ground-dirt': A(128, 128, 0x9a6233, 'tex'),
  'ground-stone': A(128, 128, 0x8a7fa0, 'tex'),
  'ground-rock': A(128, 128, 0x4e6477, 'tex'),
  'ground-wood': A(128, 128, 0xb77b43, 'tex'),
  'ground-grass': A(128, 72, 0x5cc84a, 'tex'),
  bark: A(80, 200, 0x7b4a2a, 'tex'),
  'mid-meadow': A(4, 4, 0, 'none'),
  'mid-forest': A(4, 4, 0, 'none'),
  'mid-river': A(4, 4, 0, 'none'),
  'mid-cave': A(4, 4, 0, 'none'),
  'mid-castle': A(4, 4, 0, 'none'),
  grass1: A(4, 4, 0, 'none'),
  grass2: A(4, 4, 0, 'none'),
  daisies: A(4, 4, 0, 'none'),
  flowers: A(4, 4, 0, 'none'),
  fern: A(4, 4, 0, 'none'),
  rock: A(4, 4, 0, 'none'),
  shrooms: A(4, 4, 0, 'none'),
  reeds: A(4, 4, 0, 'none'),
  crystals1: A(4, 4, 0, 'none'),
  crystals2: A(4, 4, 0, 'none'),
  glowshrooms: A(4, 4, 0, 'none'),
  stalagmite: A(4, 4, 0, 'none'),
  torch: A(4, 4, 0, 'none'),
  banner: A(4, 4, 0, 'none'),
  butterfly1: A(4, 4, 0, 'none'),
  'near-meadow': A(4, 4, 0, 'none'),
  'near-forest': A(4, 4, 0, 'none'),
  'near-river': A(4, 4, 0, 'none'),
  'near-cave': A(4, 4, 0, 'none'),
  'near-castle': A(4, 4, 0, 'none'),
  'fg-grass': A(4, 4, 0, 'none'),
  'fg-leaves': A(4, 4, 0, 'none'),
  'fg-fern': A(4, 4, 0, 'none'),
  'fg-bush': A(4, 4, 0, 'none'),
  'fg-rock': A(4, 4, 0, 'none'),
  'fg-stalagmite': A(4, 4, 0, 'none'),
  'fg-pillar': A(4, 4, 0, 'none'),
  'fg-thorns': A(4, 4, 0, 'none'),
  'ui-button': A(4, 4, 0, 'none'),
  'ui-panel': A(4, 4, 0, 'none'),
  'ui-ribbon': A(4, 4, 0, 'none'),
  'ui-round-pink': A(4, 4, 0, 'none'),
  'ui-round-blue': A(4, 4, 0, 'none'),
  'ui-round-green': A(4, 4, 0, 'none'),
  'ui-round-lilac': A(4, 4, 0, 'none'),
  butterfly2: A(4, 4, 0, 'none'),
  'bg-meadow': A(1280, 720, 0x8fd8ff, 'bg'),
  'bg-forest': A(1280, 720, 0xf2a37a, 'bg'),
  'bg-river': A(1280, 720, 0x9fe3ff, 'bg'),
  'bg-cave': A(1280, 720, 0x1d3b4f, 'bg'),
  'bg-castle': A(1280, 720, 0x6b4a9e, 'bg'),
  title: A(1280, 800, 0xffc6e0, 'bg'),
  ending: A(1280, 800, 0xffe29a, 'bg'),
};

export function preloadAssets(scene: Phaser.Scene) {
  for (const [key, s] of Object.entries(ASSETS)) scene.load.image(key, `assets/${key}.${s.shape === 'bg' || s.shape === 'tex' ? 'jpg' : 'png'}`);
}

/** Draw a placeholder for every asset that failed to load. */
export function makePlaceholders(scene: Phaser.Scene) {
  for (const [key, s] of Object.entries(ASSETS)) {
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const { w, h, color } = s;
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(35).color;
    switch (s.shape) {
      case 'bg': {
        const top = Phaser.Display.Color.IntegerToColor(color).lighten(25).color;
        g.fillGradientStyle(top, top, color, color, 1);
        g.fillRect(0, 0, w, h);
        g.fillStyle(0xffffff, 0.35);
        for (let i = 0; i < 6; i++) g.fillCircle(120 + i * 210, 140 + (i % 2) * 60, 50);
        g.fillStyle(dark, 0.5);
        for (let i = 0; i < 8; i++) g.fillCircle(i * 180, h, 170);
        break;
      }
      case 'none':
        break;
      case 'tile':
      case 'tex':
        g.fillStyle(color);
        g.fillRect(0, 0, w, h);
        g.fillStyle(dark, 0.6);
        for (let i = 0; i < 6; i++) g.fillCircle(((i * 47) % w) + 10, ((i * 71) % h) + 10, 7);
        if (key === 'tile-grass') {
          g.fillStyle(0x9a6233);
          g.fillRect(0, h * 0.3, w, h * 0.7);
        }
        g.lineStyle(4, dark, 0.8);
        g.strokeRect(2, 2, w - 4, h - 4);
        break;
      case 'star': {
        g.fillStyle(color);
        g.lineStyle(8, dark);
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? w * 0.22 : w * 0.46;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          pts.push(new Phaser.Math.Vector2(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r));
        }
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
        break;
      }
      case 'heart':
        g.fillStyle(color);
        g.fillCircle(w * 0.3, h * 0.35, w * 0.25);
        g.fillCircle(w * 0.7, h * 0.35, w * 0.25);
        g.fillTriangle(w * 0.07, h * 0.45, w * 0.93, h * 0.45, w / 2, h * 0.95);
        break;
      case 'flag':
        g.fillStyle(0x7a4a26);
        g.fillRect(w * 0.1, 0, 12, h);
        g.fillStyle(color);
        g.fillTriangle(w * 0.1 + 12, key === 'flag-up' ? 10 : h * 0.55, w, key === 'flag-up' ? 45 : h * 0.7, w * 0.1 + 12, key === 'flag-up' ? 80 : h * 0.85);
        break;
      case 'spikes':
        g.fillStyle(color);
        g.lineStyle(4, dark);
        for (let i = 0; i < 3; i++) {
          g.fillTriangle(i * 64 + 4, h, i * 64 + 32, 4, i * 64 + 60, h);
          g.strokeTriangle(i * 64 + 4, h, i * 64 + 32, 4, i * 64 + 60, h);
        }
        break;
      case 'plank':
        g.fillStyle(color);
        g.fillRoundedRect(0, 0, w, h, Math.min(20, h / 2));
        g.lineStyle(5, dark);
        g.strokeRoundedRect(3, 3, w - 6, h - 6, Math.min(18, h / 2 - 3));
        break;
      case 'round':
        g.fillStyle(color);
        g.fillEllipse(w / 2, h / 2, w * 0.95, h * 0.95);
        g.lineStyle(6, dark);
        g.strokeEllipse(w / 2, h / 2, w * 0.95 - 6, h * 0.95 - 6);
        g.fillStyle(0xffffff);
        g.fillCircle(w * 0.68, h * 0.38, Math.min(w, h) * 0.12);
        g.fillStyle(0x222222);
        g.fillCircle(w * 0.71, h * 0.38, Math.min(w, h) * 0.06);
        break;
      case 'body':
        g.fillStyle(color);
        g.fillRoundedRect(w * 0.15, h * 0.35, w * 0.7, h * 0.6, 20);
        g.fillStyle(0xffe0c7);
        g.fillCircle(w / 2, h * 0.22, Math.min(w * 0.4, h * 0.2));
        g.fillStyle(key.startsWith('alice') ? 0xffe27a : dark);
        g.fillEllipse(w / 2, h * 0.12, w * 0.8, h * 0.16);
        g.fillStyle(0x222222);
        g.fillCircle(w * 0.62, h * 0.22, 6);
        break;
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }
  makeFxTextures(scene);
  // 1x1 white pixel for effects
  if (!scene.textures.exists('px')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('px', 4, 4);
    g.destroy();
  }
}

/** Scale an image so its source reference height maps to `displayH` pixels on screen. */
export function scaleFor(scene: Phaser.Scene, key: string, displayH: number, refH?: number) {
  const src = scene.textures.get(key).getSourceImage() as { height: number };
  return displayH / (refH ?? src.height);
}

/** True when a real picture was loaded (decor is skipped when only a placeholder exists). */
export function hasArt(scene: Phaser.Scene, key: string) {
  const src = scene.textures.get(key).getSourceImage() as { width: number };
  return scene.textures.exists(key) && src.width > 8;
}

/** Soft effect textures drawn once on a canvas: cheap to render, no extra downloads. */
function makeFxTextures(scene: Phaser.Scene) {
  const canvas = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h);
    if (!t) return;
    draw(t.getContext());
    t.refresh();
  };
  canvas('glow', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  canvas('shadow', 128, 32, (c) => {
    const g = c.createRadialGradient(64, 16, 0, 64, 16, 64);
    g.addColorStop(0, 'rgba(20,10,30,0.55)');
    g.addColorStop(1, 'rgba(20,10,30,0)');
    c.setTransform(1, 0, 0, 0.25, 0, 12);
    c.fillStyle = g;
    c.fillRect(0, -48, 128, 128);
  });
  canvas('vignette', 256, 144, (c) => {
    const g = c.createRadialGradient(128, 72, 40, 128, 72, 150);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,0,25,0.85)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 144);
  });
  canvas('ray', 64, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,250,220,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 256);
    const fade = c.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = fade;
    c.fillRect(0, 0, 64, 256);
  });
  canvas('wave', 64, 16, (c) => {
    c.fillStyle = 'rgba(230,248,255,0.95)';
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.ellipse(16 + i * 32, 10, 15, 6, 0, Math.PI, 0);
      c.fill();
    }
    c.fillRect(0, 9, 64, 3);
  });
  canvas('shade', 8, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(40,20,10,0.55)');
    g.addColorStop(1, 'rgba(40,20,10,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 8, 64);
  });
  canvas('side', 32, 8, (c) => {
    const g = c.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, 'rgba(30,15,10,0.5)');
    g.addColorStop(1, 'rgba(30,15,10,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 8);
  });
}
