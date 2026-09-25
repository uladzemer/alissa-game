export const GAME_W = 1280;
export const GAME_H = 720;
export const TILE = 64;

/** Current visible width: 720 tall, so wider than 1280 on long phones and narrower on 4:3 screens. */
export function viewW(scene: { scale: { width: number } }) {
  return scene.scale.width;
}

/** Phones and small tablets get fewer particles; everything else looks the same. */
export const LOW_POWER =
  typeof navigator !== 'undefined' &&
  (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent)) &&
  ((navigator.hardwareConcurrency ?? 4) <= 6 || ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4) <= 4);

export const FONT = '"Nunito", "Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif';

export const PHYS = {
  gravity: 2200,
  runSpeed: 330,
  shieldSpeed: 150,
  jumpVel: 900,
  doubleJumpVel: 780,
  climbSpeed: 230,
  coyoteMs: 110,
  jumpBufferMs: 130,
};

export const PLAYER = {
  bodyW: 40,
  bodyH: 88,
  viewH: 104,
  maxHearts: 3,
  heartCap: 5,
  invulnMs: 1500,
  shootCdMs: 280,
  keshaCdMs: 6000,
};

/** Text style shared by all big labels. */
export function titleStyle(size: number, color = '#ffffff', stroke = '#6b2a5c') {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: '900',
    color,
    stroke,
    strokeThickness: Math.max(4, Math.round(size / 7)),
    align: 'center',
  } as const;
}
