// Autoplay bot for smoke tests: run right, jump over gaps/walls/hazards, double-jump when falling into a pit.
// Usage in Playwright: page.evaluate(botSource) then window.__bot.start(levelIndex)
window.__bot = (() => {
  const T = 64;
  let timer = null;
  const log = [];
  function L() { return window.__game.scene.getScene('Level'); }
  function tick() {
    const lv = L();
    const t = window.__touch;
    if (!lv || !lv.player || !lv.sys.isActive()) return;
    const p = lv.player;
    p.invulnUntil = lv.time.now + 5000;
    const b = p.body;
    for (const k of Object.keys(t)) t[k] = false;
    t.right = true;
    t.shoot = true;
    const ahead = b.center.x + 70;
    const onGround = p.onGround;
    const floorAhead = lv.floorAt(ahead, b.bottom + 10) || lv.floorAt(ahead, b.bottom + 70) || lv.floorAt(ahead, b.bottom + 140);
    const wallAhead = lv.solidAt(b.right + 20, b.center.y) || lv.solidAt(b.right + 20, b.top + 4);
    const hazardAhead = lv.hazardAt(ahead, b.bottom - 4) || lv.hazardAt(ahead + 40, b.bottom - 4) || lv.hazardAt(ahead, b.bottom + 20);
    // a moving platform ahead: wait until it comes close, then jump on it
    const mover = lv.movers.find((m) => { const mb = m.zone.body; return mb.x > b.x - 40 && mb.x < b.right + 6 * T && Math.abs(mb.top - b.bottom) < 3 * T; });
    if (onGround && !floorAhead && mover) {
      const mb = mover.zone.body;
      const gap = mb.x - b.right;
      if (gap > 110 || mb.top < b.bottom - 150 || mb.top > b.bottom + 90) { t.right = false; t.shoot = true; }
      else t.jump = true;
    } else if (onGround && (!floorAhead || wallAhead || hazardAhead)) t.jump = true;
    // standing on a mover: wait until the next floor is in reach
    const riding = lv.movers.find((m) => Math.abs(m.zone.body.top - b.bottom) < 6 && b.center.x > m.zone.body.x - 10 && b.center.x < m.zone.body.right + 10);
    if (riding && !lv.floorAt(riding.zone.body.right + 90, b.bottom + 10) && !lv.floorAt(riding.zone.body.right + 150, b.bottom + 60)) {
      const next = lv.movers.find((m) => m !== riding && m.zone.body.x > riding.zone.body.x && m.zone.body.x - riding.zone.body.right < 140);
      if (!next) { t.right = b.center.x < riding.zone.body.right - 30; t.jump = false; }
    }
    const crystal = lv.pickups.find((k) => k.kind === 'crystal' && !k.taken && Math.abs(k.img.x - b.center.x) < 40 && k.img.y < b.top);
    if (crystal && lv.climbableAt(b.center.x, b.center.y)) { t.up = true; t.right = false; }
    if (!onGround && b.velocity.y < -150) t.jump = true;
    if (!onGround && b.velocity.y > 60 && !lv.floorAt(b.center.x, b.bottom + 90) && !p.__dj) { t.jump = true; p.__dj = lv.time.now; }
    if (onGround) p.__dj = 0;
    if (p.__dj && lv.time.now - p.__dj < 300) t.jump = true;
    if (lv.climbableAt(b.center.x, b.center.y) && (wallAhead || !floorAhead)) t.up = true;
  }
  return {
    log,
    start() { this.stop(); timer = setInterval(tick, 16); },
    stop() { if (timer) clearInterval(timer); timer = null; for (const k of Object.keys(window.__touch || {})) window.__touch[k] = false; },
    state() { const lv = L(); const b = lv.player.body; return { x: Math.round(b.center.x / T), y: Math.round(b.center.y / T), finished: lv.finished, stars: lv.starsHere, hearts: lv.player.hearts }; },
  };
})();
