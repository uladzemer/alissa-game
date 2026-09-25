import Phaser from 'phaser';
import { titleStyle } from './constants';
import { hasArt } from './assets';
import { sfx } from './sfx';

/**
 * Painted interface pieces (Codex art in public/assets/ui-*.png).
 * Everything is stretched only along its plain middle part (3/9-slice), never distorted;
 * if a picture is missing, a simple drawn version is used.
 */

export function paintedButton(scene: Phaser.Scene, x: number, y: number, label: string, size: number, cb: () => void, minWidth = 0) {
  const c = scene.add.container(x, y);
  const text = scene.add.text(0, -size * 0.06, label, titleStyle(size, '#ffffff', '#b8326f')).setOrigin(0.5);
  const h = size * 2.1;
  const w = Math.max(h * 2.2, text.width + size * 3.2, minWidth);
  if (hasArt(scene, 'ui-button')) {
    const src = scene.textures.get('ui-button').getSourceImage() as { width: number; height: number };
    const k = h / src.height;
    const end = src.height * 0.62;
    const plate = scene.add.nineslice(0, 0, 'ui-button', undefined, w / k, src.height, end, end, 0, 0);
    plate.setScale(k);
    c.add(plate);
  } else {
    c.add(scene.add.rectangle(0, 0, w, h * 0.8, 0xff7eb6).setStrokeStyle(5, 0xffe08a));
  }
  c.add(text);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerover', () => c.setScale(1.05));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerdown', () => c.setScale(0.95));
  c.on('pointerup', () => {
    c.setScale(1);
    sfx.click();
    cb();
  });
  return c;
}

export function paintedPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  if (hasArt(scene, 'ui-panel')) {
    const src = scene.textures.get('ui-panel').getSourceImage() as { width: number; height: number };
    const corner = src.height * 0.3;
    // scale the corners with the panel height so the ornaments keep their shape
    const k = Math.min(1, h / src.height);
    const panel = scene.add.nineslice(x, y, 'ui-panel', undefined, w / k, h / k, corner, corner, corner, corner);
    return panel.setScale(k);
  }
  const g = scene.add.graphics({ x, y });
  g.fillStyle(0x2a1840, 0.35).fillRoundedRect(-w / 2 + 10, -h / 2 + 12, w, h, 28);
  g.fillStyle(0xfffaf4, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 28);
  g.lineStyle(6, 0xff7eb6, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 28);
  return g;
}

export function ribbon(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  if (hasArt(scene, 'ui-ribbon')) {
    // the ribbon is curved all along, so it is only ever scaled as a whole (width decides, height follows)
    const img = scene.add.image(x, y, 'ui-ribbon');
    return img.setScale(w / img.width);
  }
  return scene.add.rectangle(x, y, w, h || w / 5.5, 0x6b2a5c, 0.6).setStrokeStyle(4, 0xffffff, 0.6);
}

/**
 * A title on a ribbon: the ribbon plus letters laid along its curve (each letter follows the sag and tilts with it).
 * The curve is measured from ui-ribbon.png: the band's centre sags 23.5px (of 776) from the quarter points to the middle.
 */
export function ribbonTitle(scene: Phaser.Scene, x: number, y: number, label: string, size: number, minWidth = 0) {
  const c = scene.add.container(x, y);
  const style = titleStyle(size, '#ffffff', '#b8326f');
  const letters = [...label].map((ch) => scene.add.text(0, 0, ch, style).setOrigin(0.5, 0.5));
  const advance = letters.map((t) => t.width - style.strokeThickness);
  const textW = advance.reduce((a, b) => a + b, 0);
  const w = Math.max(minWidth, textW / 0.56);
  c.add(ribbon(scene, 0, 0, w, 0));
  const k = w / 776;
  const curved = hasArt(scene, 'ui-ribbon');
  let u = -textW / 2;
  letters.forEach((t, i) => {
    const cx = u + advance[i] / 2;
    u += advance[i];
    const d = cx / (w * 0.25);
    const dy = curved ? (-1.5 - 23.5 * d * d) * k : 0;
    const slope = curved ? (-47 * d) / (0.25 * 776) : 0;
    t.setPosition(cx, dy - size * 0.12).setRotation(Math.atan(slope));
    c.add(t);
  });
  return c;
}

export type PlateColor = 'pink' | 'blue' | 'green' | 'lilac';
const PLATE_FALLBACK: Record<PlateColor, number> = { pink: 0xff5fa8, blue: 0x5fb8ff, green: 0x6fd36f, lilac: 0xb99cff };

export function roundPlate(scene: Phaser.Scene, x: number, y: number, r: number, color: PlateColor) {
  const key = `ui-round-${color}`;
  if (hasArt(scene, key)) {
    const img = scene.add.image(x, y, key);
    return img.setScale((r * 2) / Math.max(img.width, img.height));
  }
  return scene.add.circle(x, y, r, PLATE_FALLBACK[color], 0.6).setStrokeStyle(5, 0xffffff, 0.9);
}
