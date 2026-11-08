'use strict';
/* Clawd 的"大脑":物理、行为状态机、鼠标互动、彩蛋。 */
(() => {
  const api = window.clawd || null;
  const qs = new URLSearchParams(location.search);
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const bub = document.getElementById('bubble');
  const hitboxEl = document.getElementById('hitbox');

  // ---------------------------------------------------------------- utils
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = v => (v < 0 ? -1 : 1);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const chance = p => Math.random() < p;
  const TAU = Math.PI * 2;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const pulse = t => Math.sin(clamp(t, 0, 1) * Math.PI);

  // ---------------------------------------------------------------- layout
  let W = innerWidth, H = innerHeight, dpr = window.devicePixelRatio || 1;
  let S = Number(qs.get('scale')) || 4, u = 4, k = 1, petW = 56, petH = 44, groundY = H - 40;
  let quiet = false;
  const G0 = 2300;

  function layout(info) {
    if (info) {
      W = info.width; H = info.height; groundY = Math.min(info.groundY, H - 2);
      S = info.scale || S; quiet = !!info.quiet;
    } else {
      W = innerWidth; H = innerHeight; groundY = H - 40;
    }
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    u = Math.max(2, Math.round(S * dpr));
    k = S / 4; petW = 14 * S; petH = 11 * S;
    fullClear = true;
    rebuild();
  }

  // ---------------------------------------------------------------- platforms
  let plats = [], winList = [], domList = [], domStamp = 0;
  let surfAcc = 0, lastSurfSay = 0, seenIds = null, lastWinReact = 0;
  let anchors = new Map();

  function subtract(segs, cut) {
    const out = [];
    for (const [a, b] of segs) {
      if (cut[1] <= a || cut[0] >= b) { out.push([a, b]); continue; }
      if (cut[0] > a) out.push([a, cut[0]]);
      if (cut[1] < b) out.push([cut[1], b]);
    }
    return out;
  }

  function rebuild() {
    const L = [{ key: 'g', kind: 'g', x1: 0, x2: W, y: groundY, ax: 0, ay: groundY }];
    for (let i = 0; i < winList.length; i++) {
      const w = winList[i], y = w.t;
      if (y < petH + 12 || y > groundY - 24) continue;
      let segs = [[Math.max(0, w.l), Math.min(W, w.r)]];
      for (let j = 0; j < i && segs.length; j++) {
        const o = winList[j];
        if (o.t <= y + 0.5 && o.b > y + 0.5) segs = subtract(segs, [o.l, o.r]);
      }
      for (const s of segs) if (s[1] - s[0] >= petW * 0.9) L.push({ key: 'w' + w.id, kind: 'w', x1: s[0] + 2, x2: s[1] - 2, y, ax: w.l, ay: w.t });
    }
    if (performance.now() - domStamp < 1600) {
      for (const d of domList) {
        if (d.y < petH + 4 || d.y > groundY - 8) continue;
        L.push({ key: 'd' + d.id, kind: 'd', x1: Math.max(0, d.x1), x2: Math.min(W, d.x2), y: d.y, ax: d.x1, ay: d.y });
      }
    }
    const newA = new Map();
    for (const p of L) if (!newA.has(p.key)) newA.set(p.key, { ax: p.ax, ay: p.ay });

    // 脚下的平台移动了 -> 桌宠跟着走
    if (P.platKey && P.platKey !== 'g' && !AIR.has(P.mode)) {
      const o = anchors.get(P.platKey), n = newA.get(P.platKey);
      if (o && n) { const dx = n.ax - o.ax, dy = n.ay - o.ay; P.pendX += dx; P.pendY += dy; if (P.platKey[0] === 'w') surfAcc += Math.abs(dx) + Math.abs(dy); }
    }
    plats = L; anchors = newA;
    if (P.platKey && !AIR.has(P.mode)) {
      if (P.platKey === 'g') { P.y = groundY; P.plat = plats[0]; }
      else {
        const px = P.x + P.pendX;
        const p = plats.find(q => q.key === P.platKey && px >= q.x1 - 4 && px <= q.x2 + 4);
        if (p) { P.plat = p; } else startFall(P.face * 30 * k, 0);
      }
    }
  }

  function findLanding(px, y0, y1) {
    let best = null;
    for (const p of plats) {
      if (px < p.x1 || px > p.x2) continue;
      if (y0 <= p.y + 0.5 && y1 >= p.y && (!best || p.y < best.y)) best = p;
    }
    return best;
  }

  // ---------------------------------------------------------------- cursor
  const cur = { x: W / 2, y: H / 2, vx: 0, vy: 0, sp: 0, t: performance.now(), lastMove: performance.now(), known: false, still: 0 };
  function setCursor(x, y) {
    const now = performance.now();
    const dt = Math.max(0.008, (now - cur.t) / 1000);
    const d = Math.hypot(x - cur.x, y - cur.y);
    const a = Math.min(1, dt * 14);
    cur.vx = lerp(cur.vx, (x - cur.x) / dt, a); cur.vy = lerp(cur.vy, (y - cur.y) / dt, a);
    cur.sp = Math.hypot(cur.vx, cur.vy);
    if (d > 2) cur.lastMove = now;
    if (overPet(x, y) && d > 0) { petAcc += d; lastOverMove = now; }
    cur.x = x; cur.y = y; cur.t = now; cur.known = true;
    hoverCheck();
  }

  let sysIdle = null, sysIdleAt = 0, idleLong = 0, sense = true;
  const userIdle = () => (sysIdle == null ? cur.still : sysIdle + (performance.now() - sysIdleAt) / 1000);
  const isTyping = () => sysIdle != null && userIdle() < 2.5 && cur.still > 4;

  let interactive = false;
  function setInteractive(v) {
    if (v === interactive) return;
    interactive = v;
    if (api) api.setIgnore(!v);
    const curStyle = (P.mode === 'grab' || down) ? 'grabbing' : 'grab';
    if (hitboxEl) hitboxEl.style.cursor = curStyle;
    document.body.style.cursor = v ? curStyle : 'default';
  }
  function updateHitbox() {
    if (!hitboxEl) return;
    const hbW = Math.round(20 * S);
    const hbH = Math.round(16 * S);
    const hbX = Math.round(P.x - hbW / 2);
    const hbY = Math.round(P.y - 13.5 * S);
    hitboxEl.style.width = hbW + 'px';
    hitboxEl.style.height = hbH + 'px';
    hitboxEl.style.transform = `translate3d(${hbX}px, ${hbY}px, 0)`;
  }
  function overPet(x, y) {
    return x >= P.x - 10 * S && x <= P.x + 10 * S && y >= P.y - 13.5 * S && y <= P.y + (P.mode === 'edge' ? 3.5 : 2) * S;
  }
  function overChips(x, y) { const r = window.Director && Director.chipsRect(); return !!r && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6; }
  function hoverCheck() { setInteractive(!!down || P.mode === 'grab' || overPet(cur.x, cur.y) || overChips(cur.x, cur.y)); }

  // ---------------------------------------------------------------- particles / bubble
  const fx = [];
  function spawn(k_, x, y, o = {}) {
    fx.push(Object.assign({ k: k_, x, y, vx: 0, vy: 0, g: 0, life: 1, max: 1, size: 1 }, o, { max: o.life || 1 }));
  }
  function hearts(n, spread = 8) { for (let i = 0; i < n; i++) spawn('heart', P.x + rnd(-spread, spread) * S, P.y - rnd(8, 13) * S, { vx: rnd(-12, 12), vy: rnd(-48, -30), life: rnd(0.9, 1.4), size: rnd(0.9, 1.4) }); }
  function stars(n) { for (let i = 0; i < n; i++) spawn('star', P.x + rnd(-6, 6) * S, P.y - rnd(4, 11) * S, { vx: rnd(-70, 70), vy: rnd(-110, -30), g: 200, life: rnd(0.5, 0.9), size: rnd(1, 1.6) }); }
  function dust(n, dirv) { for (let i = 0; i < n; i++) spawn('dust', P.x + rnd(-5, 5) * S, P.y - 1, { vx: (dirv || sign(rnd(-1, 1))) * rnd(10, 60), vy: rnd(-30, -6), life: rnd(0.3, 0.5), size: rnd(0.8, 1.4) }); }
  function note(c) { spawn('text', P.x + rnd(-6, 8) * S, P.y - 12 * S, { text: pick(['♪', '♫', '♬']), color: c || pick(['#ffd23f', '#ff7ab6', '#7ad0ff']), vx: rnd(-14, 18), vy: rnd(-34, -22), life: 1.5, size: 1.2, bold: true }); }
  function ztext(t) { spawn('text', P.x + 6 * S, P.y - 11 * S, { text: t, color: '#b9c7ff', vx: 14, vy: -22, life: 1.8, size: 1.1 + Math.random() * 0.4, bold: true }); }
  function confetti(n, fromTop) {
    const cols = ['#ff6b6b', '#ffd23f', '#4ecdc4', '#7a8cff', '#ff9ff3', '#D97757'];
    for (let i = 0; i < n; i++) {
      if (fromTop) spawn('confetti', rnd(0, W), rnd(-40, 0), { vx: rnd(-30, 30), vy: rnd(120, 260), life: rnd(2.2, 3.4), size: rnd(1.2, 2), color: pick(cols), rot: rnd(0, TAU), vr: rnd(-8, 8) });
      else spawn('confetti', P.x, P.y - 10 * S, { vx: rnd(-220, 220), vy: rnd(-420, -150), g: 520, life: rnd(1.2, 2), size: rnd(1, 1.8), color: pick(cols), rot: rnd(0, TAU), vr: rnd(-12, 12) });
    }
  }

  let bubT = 0, bubDur = 0, storySay = false, bubPos = { x: 0, y: 0, w: 0, h: 0, below: false };
  function say(text, ms = 2400, cls = '', html = false) {
    if (!storySay && window.Director && Director.active()) return;      // 演剧情时,其它气泡先闭嘴
    if (quiet && !cls.includes('force')) return;
    if (html) bub.innerHTML = text; else bub.textContent = text;
    bub.className = 'show ' + cls.replace('force', '');
    bubT = ms / 1000; bubDur = bubT;
  }
  function sayStory(text, ms, cls, html) { storySay = true; try { say(text, ms, (cls || '') + ' force', html); } finally { storySay = false; } }
  function hideBubble() { bubT = 0; bub.className = ''; }
  function updateChips() {
    if (!window.Director || !Director.chipsVisible()) return;
    const el = document.getElementById('choices'), w = el.offsetWidth, h = el.offsetHeight;
    const headY = P.y - 15.5 * S - (P.hat ? 3 * S : 0);
    let y;
    if (bubT > 0) y = bubPos.below ? bubPos.y + bubPos.h + 8 : bubPos.y - h - 8;
    else y = headY - h - 10;
    if (y < 4) y = bubT > 0 ? bubPos.y + bubPos.h + 8 : P.y + 6 * S;
    el.style.transform = `translate(${Math.round(clamp(P.x - w / 2, 6, W - w - 6))}px,${Math.round(y)}px)`;
  }
  function updateBubble(dt) {
    updateChips();
    if (bubT <= 0) return;
    bubT -= dt;
    if (bubT <= 0) { bub.className = ''; return; }
    const w = bub.offsetWidth, h = bub.offsetHeight;
    const headY = P.y - (P.mode === 'sleep' || P.mode === 'sit' ? 14 : 15.5) * S - (P.hat || P.mode === 'party' ? 4 * S : 0);
    let bx = clamp(P.x - w / 2, 6, W - w - 6), by = headY - h - 12;
    let below = false;
    if (by < 4) { by = P.y + 6 * S; below = true; }
    bub.classList.toggle('below', below); bubPos = { x: bx, y: by, w, h, below };
    bub.style.setProperty('--tx', clamp(P.x - bx, 14, w - 14) + 'px');
    bub.style.transform = `translate(${Math.round(bx)}px,${Math.round(by)}px)`;
  }

  // ---------------------------------------------------------------- pet state
  const AIR = new Set(['air', 'grab']);
  const P = {
    x: W / 2, y: -80, vx: 0, vy: 0, face: 1, plat: null, platKey: null, mode: 'air', mt: 0, d: {},
    thrown: false, hat: null, legT: 0, blink: 0, love: 0, rot: 0, shiny: false, lastAct: '', afterLand: null, bounces: 0,
    look: { x: 0, y: 0, t: 0 }, pendX: 0, pendY: 0, surfT: 0, glasses: null, greetText: '', nextBlink: 2, blinkT: -1, greet: true, dizzyCount: 0
  };
  const crit = { on: false, kind: 'bug', x: 0, y: 0, vx: 0, vy: 0, dir: 1, fast: false, fastT: 0, t: 0, color: '#7ad0ff', color2: '#fff' };
  const ball = { on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, bounces: 0 };
  let now = performance.now() / 1000;
  const hour = () => new Date().getHours();
  const isNight = () => hour() >= 23 || hour() < 5;

  function setMode(m, d) {
    if (!B[m]) m = 'idle';
    if (P.mode === 'ball' && m !== 'ball') ball.on = false;
    if (P.mode === 'critter' && m !== 'critter') crit.on = false;
    if ((m === 'air' || m === 'grab') && (P.pendX || P.pendY)) { P.x += P.pendX; P.y += P.pendY; P.pendX = P.pendY = 0; }
    P.mode = m; P.mt = 0; P.d = d || {};
    if (B[m].enter) B[m].enter(P.d);
    hoverCheck();
  }
  function startFall(vx, vy, thrown) {
    P.plat = null; P.platKey = null; P.thrown = !!thrown; P.bounces = 0;
    setMode('air', { vx, vy });
    P.vx = vx || 0; P.vy = vy || 0;
  }
  function startJump(vx, vy, tag) {
    P.plat = null; P.platKey = null; P.thrown = false; P.bounces = 0;
    setMode('air', { tag, vx, vy });
    P.vx = vx; P.vy = vy;
  }
  function attach(pl) {
    P.plat = pl; P.platKey = pl.key; P.y = pl.y; P.vy = 0; P.vx = 0; P.pendX = P.pendY = 0;
  }

  // ---------------------------------------------------------------- pose helpers
  function base(p) {
    p.t = now; p.mt = P.mt; p.hat = P.hat; p.legs = 'stand'; p.legT = P.legT;
    p.dy = Math.sin(now * 2.3) > 0.25 ? -0.5 : 0;
    p.blink = P.blink; p.glasses = P.glasses;
    gaze(p);
    if (MOODY.has(P.mode)) { const m = Life.mood; if (m.lonely > 0.65) p.eye = 'sad'; if (m.energy < 0.28) p.blink = Math.max(p.blink, 0.5); }
    return p;
  }
  const MOODY = new Set(['idle', 'sit', 'walk', 'edge', 'read', 'coffee']);
  function gaze(p, far = 560) {
    const dx = cur.x - P.x, dy = cur.y - (P.y - 5 * S);
    if (cur.known && Math.hypot(dx, dy) < far) {
      p.ex = (Math.abs(dx) > 32 * k ? sign(dx) : 0) * P.face;
      p.ey = Math.abs(dy) > 40 * k ? sign(dy) : 0;
    } else { p.ex = P.look.x * P.face; p.ey = P.look.y; }
  }
  function faceCursor(minDx = 50) {
    const dx = cur.x - P.x;
    if (cur.known && Math.abs(dx) > minDx * k) P.face = sign(dx);
  }
  const armsUp = (p, amt = 1) => { p.armL = [1, -6 * amt, 3]; p.armR = [1, -6 * amt, 3]; };
  const wander = () => (P.plat ? P.plat : { x1: 0, x2: W });

  // ---------------------------------------------------------------- behaviors
  const B = {};

  B.idle = {
    enter(d) { d.dur = d.dur || rnd(2, 5); d.turned = false; },
    update() { if (P.mt > P.d.dur) decide(); else if (!P.d.turned && P.mt > 0.8) { P.d.turned = true; if (chance(0.5)) faceCursor(); } },
    pose(p) { base(p); if (P.mt > 1 && chance(0.0)) p.mouth = 'smile'; }
  };

  B.walk = {
    enter(d) {
      const pl = P.plat, pad = petW * 0.55;
      if (d.tx == null) {
        const dir = chance(0.5) ? 1 : -1;
        d.tx = clamp(P.x + dir * rnd(120, 420) * k, pl.x1 + pad, pl.x2 - pad);
        if (Math.abs(d.tx - P.x) < 50 * k) d.tx = clamp(P.x - dir * rnd(120, 360) * k, pl.x1 + pad, pl.x2 - pad);
      }
      d.sp = d.sp || 70 * k * rnd(0.85, 1.3);
      d.run = d.sp > 130 * k;
      if (!d.noDrop && P.platKey !== 'g' && chance(0.3)) {
        d.tx = (P.x - pl.x1 < pl.x2 - P.x) ? pl.x1 - 30 * k : pl.x2 + 30 * k; d.drop = true;
      }
      d.limit = 14;
      if (d.carry === 'balloon' || d.carry === 'flower') d.sp *= 0.8;
    },
    update(dt) {
      const d = P.d, dx = d.tx - P.x, step = d.sp * dt;
      if (Math.abs(dx) > 1) P.face = sign(dx);
      if (Math.abs(dx) <= step) {
        P.x = d.tx;
        if (d.drop) { startFall(P.face * d.sp * 0.5, -40 * k); return; }
        if (d.done) d.done(); else decide();
        return;
      }
      P.x += sign(dx) * step; P.legT += dt * d.sp / (6 * S) * Math.PI;
      const pl = P.plat;
      if (pl && (P.x < pl.x1 - 2 || P.x > pl.x2 + 2)) { startFall(sign(dx) * d.sp * 0.6, -50 * k); return; }
      if (P.mt > d.limit) decide();
      if (d.run && chance(0.12)) dust(1, -P.face);
    },
    pose(p) {
      const d = P.d; base(p);
      p.legs = d.run ? 'run' : 'walk'; p.legT = P.legT;
      p.dy = -Math.abs(Math.sin(P.legT)) * (d.run ? 1.3 : 0.7);
      p.rot = P.face * (d.run ? 0.1 : 0.02);
      const s = Math.round(Math.sin(P.legT)) ;
      p.armL = [0, s, 3]; p.armR = [0, -s, 3];
      if (d.carry) { p.prop = d.carry; p.mouth = 'smile'; p.blush = 0.5; if (d.carry === 'flower') p.armR = [0, -2, 3]; if (d.carry === 'balloon') p.armR = [0, -2, 3]; }
      if (d.run) p.mouth = 'big';
    }
  };

  B.sit = {
    enter(d) { d.dur = d.dur || rnd(3, 8); },
    update() { if (P.mt > P.d.dur) { (isNight() && chance(0.4)) ? setMode('sleep', { auto: true }) : decide(); } },
    pose(p) { base(p); p.legs = 'tuck'; if (Math.sin(now * 0.7) > 0.6) p.mouth = 'smile'; }
  };

  B.sleep = {
    enter(d) {
      d.dur = d.auto ? 1e9 : rnd(15, 40); d.z = 0; d.cx = cur.x; d.cy = cur.y; d.armed = false;
      P.hat = (hour() >= 21 || hour() < 6) ? 'nightcap' : P.baseHat;
      say(pick(['困了…', '眯一会儿…', '呼……']), 1600); Life.bump('nap');
    },
    update(dt) {
      const d = P.d; d.z -= dt;
      if (d.z <= 0) { d.z = 1.4; ztext(pick(['z', 'Z', 'z'])); }
      if (d.auto && P.mt > 3 && userIdle() < 1.5) wake(true);          // 你回来了(键盘/鼠标都算)
      else if (!d.auto && P.mt > 2 && Math.hypot(cur.x - d.cx, cur.y - d.cy) > 300) wake();
      else if (P.mt > d.dur) wake();
    },
    pose(p) {
      base(p); p.legs = 'tuck'; p.eye = 'closed'; p.hat = P.hat; p.blush = 0.35; p.glasses = null;
      p.dy = Math.sin(now * 1.4) > 0.3 ? -0.5 : 0; p.rot = Math.sin(now * 0.7) * 0.015;
      if (Math.sin(now * 1.4) > 0.3) p.mouth = 'o';
    }
  };
  function wake(back) {
    P.hat = P.baseHat;
    if (back) { say(Life.line('back'), 2400); Life.bump('return'); }
    setMode('stretch', { yawn: true, quietSay: !!back });
  }

  B.stretch = {
    enter(d) { d.dur = 2.4; if (!d.quietSay) say(d.yawn ? '啊~~~ 哈…' : '伸个懒腰~', 1800); },
    update() { if (P.mt > P.d.dur) decide(); },
    pose(p) {
      base(p); const s = P.mt / P.d.dur;
      armsUp(p, ease(Math.min(1, s * 2.5)) * (s > 0.75 ? 1 - (s - 0.75) * 4 : 1));
      p.sy = 1 + 0.1 * pulse(s); p.sx = 1 - 0.04 * pulse(s);
      p.eye = s > 0.1 && s < 0.85 ? 'closed' : 'open'; p.mouth = s > 0.2 && s < 0.75 ? 'yawn' : null;
    }
  };

  B.wave = {
    enter(d) { d.dur = d.dur || rnd(2.2, 3.4); faceCursor(); if (d.greet) say(P.greetText || '你好呀~ 我是 Clawd!', 3800); else if (d.chime != null) say(`${d.chime} 点啦~`, 2400); else if (chance(0.5)) say(pick(['嗨~', 'Hi!', '你好呀', '在忙吗?']), 1800); },
    update() { if (P.mt > P.d.dur) decide(); },
    pose(p) {
      base(p); const w = Math.sin(P.mt * 12);
      p.armR = [1 + (w > 0 ? 1 : 0), -6 + (w > 0 ? 1 : 0), 3]; p.mouth = 'smile'; p.eye = P.mt % 1.4 < 0.15 ? 'closed' : 'happy'; p.blush = 0.5;
      p.rot = P.face * 0.04;
    }
  };

  B.dance = {
    enter(d) { d.dur = rnd(4.5, 7); d.v = Math.floor(rnd(0, 3)); d.nt = 0; say(pick(['♪ ~', '啦啦啦~', '摇起来!', '扭一扭~']), 1600); },
    update(dt) {
      const d = P.d; d.nt -= dt; if (d.nt <= 0) { d.nt = 0.55; note(); }
      P.legT += dt * 9;
      if (d.v === 1) { const pl = wander(); P.x = clamp(P.x + Math.sin(P.mt * 3.5) * 40 * k * dt, pl.x1 + petW * 0.5, pl.x2 - petW * 0.5); }
      if (P.mt > d.dur) decide();
    },
    pose(p) {
      const d = P.d; base(p); const s = Math.sin(P.mt * 9);
      p.dy = -Math.abs(s) * 1.6; p.sx = d.v === 2 ? Math.cos(P.mt * 6) : 1 + 0.06 * s; p.sy = 1 - 0.05 * s;
      p.rot = Math.sin(P.mt * 4.5) * 0.12; p.eye = 'happy'; p.mouth = 'big'; p.blush = 0.7;
      p.armL = [1, s > 0 ? -6 : -1, 3]; p.armR = [1, s > 0 ? -1 : -6, 3];
      if (d.v === 1) { p.legs = 'walk'; p.legT = P.legT; }
    }
  };

  B.cheer = {
    enter(d) { d.dur = 2.2; if (!d.quiet) say(pick(['耶!', '太棒啦!', '好耶~']), 1500); confetti(24); },
    update() { if (P.mt > P.d.dur) decide(); },
    pose(p) {
      base(p); const h = Math.abs(Math.sin(P.mt * 7)); armsUp(p);
      p.lift = h * 3.2; p.eye = 'happy'; p.mouth = 'big'; p.blush = 0.8; p.shadow = 1 - h * 0.4;
    }
  };

  B.spin = {
    enter(d) { d.dur = rnd(0.9, 1.6); d.n = Math.max(1, Math.round(d.dur / 0.55)); },
    update() { if (P.mt > P.d.dur) { setMode('idle', { dur: 1 }); } },
    pose(p) {
      base(p); const s = P.mt / P.d.dur;
      p.sx = Math.cos(s * TAU * P.d.n); p.lift = pulse(s) * 2; p.eye = 'happy'; p.mouth = 'smile'; armsUp(p, 0.5);
    }
  };

  B.flip = {
    enter(d) { d.dur = 0.85; say(pick(['看我的!', '嘿!']), 900); },
    update() { if (P.mt > P.d.dur) { dust(6); setMode('land', { impact: 400 * k, soft: true }); } },
    pose(p) {
      base(p); const s = clamp(P.mt / P.d.dur, 0, 1);
      p.lift = 4 * 9 * s * (1 - s) ; p.rot = -TAU * ease(s) * P.face; p.eye = 'wide'; p.mouth = 'o'; armsUp(p, 0.7);
      p.pivot = [0, -5]; p.shadow = 1 - pulse(s) * 0.5;
    }
  };

  B.read = {
    enter(d) { d.dur = rnd(7, 11); d.pg = 2.5; },
    update(dt) {
      const d = P.d; d.pg -= dt;
      if (d.pg <= 0) { d.pg = rnd(2.5, 4); spawn('spark', P.x + 3 * S, P.y - 5 * S, { vx: 20, vy: -30, life: 0.5, size: 1 }); }
      if (P.mt > d.dur) { say(pick(['好看!', '读完啦~', '嗯嗯 原来如此']), 1800); setMode('sit', { dur: 1.6 }); }
    },
    pose(p) {
      base(p); p.legs = 'tuck'; p.prop = 'book'; p.ey = 0; p.ex = (Math.floor(P.mt / 0.55) % 2 ? 1 : -1) * P.face * (P.mt % 3 > 2.6 ? 0 : 1);
      p.armL = [-1, -1, 3]; p.armR = [-1, -1, 3]; if (P.mt % 4 > 3.5) p.mouth = 'smile';
    }
  };

  B.coffee = {
    enter(d) { d.dur = rnd(6.5, 9); d.st = 0; },
    update(dt) {
      const d = P.d; d.st -= dt; if (d.st <= 0) { d.st = 0.6; spawn('steam', P.x + 10.5 * S, P.y - 11 * S, { vx: rnd(-4, 4), vy: -22, life: 0.9, size: 1 }); }
      if (P.mt > d.dur) { say(pick(['舒服~', '续命成功', '好喝!']), 1800); setMode('idle', { dur: 1.5 }); }
    },
    pose(p) {
      base(p); p.prop = 'mug'; const s = (P.mt % 3.2) / 3.2; const sip = s > 0.6 && s < 0.9;
      p.armR = [-1, sip ? -4 : -2, 3]; p.eye = sip ? 'closed' : 'open'; p.mouth = sip ? 'smile' : null; p.blush = sip ? 0.6 : 0;
    }
  };

  B.cookie = {
    enter(d) { d.n = 1; d.nt = 0.9; Life.bump('cookie'); if (d.meal) say('吃饭时间到!🍪', 2400); else say(pick(['有饼干!', '偷吃一口~']), 1600); },
    update(dt) {
      const d = P.d; d.nt -= dt;
      if (d.nt <= 0 && d.n > 0) {
        d.n = Math.max(0, d.n - 0.25); d.nt = 1;
        for (let i = 0; i < 4; i++) spawn('crumb', P.x + rnd(0, 6) * S, P.y - 5 * S, { vx: rnd(-20, 20), vy: rnd(-30, 0), g: 260, life: 0.6, size: 1.2 });
      }
      if (d.n <= 0 && P.mt > 4.6) { say('好吃!', 1500); setMode('cheer'); }
    },
    pose(p) {
      const d = P.d; base(p); p.prop = 'cookie'; p.propT = d.n; p.eye = d.n > 0 ? 'happy' : 'happy'; p.mouth = d.n > 0 ? 'munch' : 'smile';
      p.blush = 0.7; p.armR = [-2, -1, 3]; p.legs = 'stand';
    }
  };

  B.laptop = {
    enter(d) { d.stage = 0; d.dur = rnd(9, 12); d.verb = pick(['Cogitating', 'Pondering', 'Noodling', 'Percolating', 'Clauding', 'Scampering', 'Ruminating']); d.i = 0; d.ti = 0; },
    update(dt) {
      const d = P.d; const glyphs = ['✻', '✽', '✶', '✳', '✢', '·'];
      if (d.stage === 0) {
        const txt = '> claude'; const n = Math.min(txt.length, Math.floor(P.mt * 7));
        if (n !== d.ti) { d.ti = n; say('<span class="o">></span> ' + txt.slice(2, n) + '▌', 600, 'term', true); }
        if (P.mt > 1.6) { d.stage = 1; d.t1 = P.mt; }
      } else if (d.stage === 1) {
        const tt = P.mt - d.t1, idx = Math.floor(tt * 6);
        if (idx !== d.i) { d.i = idx; say(`<span class="o">${glyphs[idx % glyphs.length]}</span> ${d.verb}… (${Math.floor(tt)}s)`, 700, 'term', true); }
        if (tt > d.dur - 3) { d.stage = 2; d.t2 = P.mt; say('<span class="o">✓</span> Done!', 2000, 'term', true); }
      } else if (P.mt - d.t2 > 1.6) { setMode('hop', { vx: 0 }); }
    },
    pose(p) {
      const d = P.d; base(p); p.legs = 'tuck'; p.prop = 'laptop'; p.ey = -0; p.ex = 0;
      const typing = d.stage < 2; const s = Math.floor(P.mt * 11) % 2;
      p.armL = [-1, typing ? (s ? 1 : -1) : 0, 3]; p.armR = [-1, typing ? (s ? -1 : 1) : 0, 3];
      p.eye = d.stage === 2 ? 'happy' : 'open'; p.mouth = d.stage === 2 ? 'smile' : null; p.blush = d.stage === 2 ? 0.7 : 0;
    }
  };

  B.hiccup = {
    enter(d) { d.n = 0; d.nt = 0.5; },
    update(dt) {
      const d = P.d; d.nt -= dt;
      if (d.nt <= 0) { d.n++; d.nt = 1; d.hic = 0.15; say('嗝!', 700); if (d.n >= 3) setMode('idle', { dur: 1 }); }
      if (d.hic > 0) d.hic -= dt;
    },
    pose(p) { const d = P.d; base(p); p.lift = d.hic > 0 ? 1.5 : 0; p.sy = d.hic > 0 ? 1.08 : 1; p.mouth = d.hic > 0 ? 'o' : null; p.eye = d.hic > 0 ? 'wide' : 'open'; }
  };

  B.sneeze = {
    enter(d) { d.dur = 2.6; d.done = false; },
    update(dt) {
      const d = P.d;
      if (!d.done && P.mt > 1.15) {
        d.done = true; say('阿——嚏!!', 1400); dust(8, -P.face);
        for (let i = 0; i < 5; i++) spawn('dust', P.x + P.face * 8 * S, P.y - 8 * S, { vx: P.face * rnd(60, 160), vy: rnd(-20, 10), life: 0.5, size: 1.2 });
      }
      if (d.done && P.mt < 1.5) { const pl = wander(); P.x = clamp(P.x - P.face * 90 * k * dt, pl.x1 + petW * 0.5, pl.x2 - petW * 0.5); }
      if (!d.done && P.mt > 0.1 && P.mt < 0.12) say('阿…阿…', 900);
      if (P.mt > d.dur) decide();
    },
    pose(p) {
      const d = P.d; base(p); const t = P.mt;
      if (t < 1.15) { const s = t / 1.15; p.sy = 1 + 0.1 * s; p.rot = -P.face * 0.18 * s; p.eye = s > 0.5 ? 'closed' : 'open'; p.mouth = 'o'; armsUp(p, s * 0.6); }
      else if (t < 1.6) { p.sx = 1.18; p.sy = 0.86; p.rot = P.face * 0.1; p.eye = '><'; p.mouth = 'big'; }
      else { p.eye = t % 0.5 < 0.2 ? 'closed' : 'open'; p.mouth = 'flat'; p.blush = 0.6; }
    }
  };

  B.moonwalk = {
    enter(d) { d.dur = 3.8; d.nt = 0; say('♪ 月球漫步~', 1600); },
    update(dt) {
      const d = P.d; const pl = wander(); const sp = 55 * k;
      P.x -= P.face * sp * dt; P.legT += dt * 8; d.nt -= dt; if (d.nt <= 0) { d.nt = 0.5; note('#7ad0ff'); }
      if (P.x < pl.x1 + petW * 0.5 || P.x > pl.x2 - petW * 0.5) { P.x = clamp(P.x, pl.x1 + petW * 0.5, pl.x2 - petW * 0.5); setMode('idle', { dur: 1 }); return; }
      if (P.mt > d.dur) decide();
    },
    pose(p) { base(p); p.legs = 'walk'; p.legT = -P.legT; p.eye = 'happy'; p.mouth = 'smile'; p.rot = -P.face * 0.05; p.armL = [1, -3, 3]; p.armR = [1, -6, 3]; p.dy = -0.3; }
  };

  B.bow = {
    enter(d) { d.dur = 2; say(pick(['请多指教!', '谢谢观看~', '今天也辛苦啦']), 1800); },
    update() { if (P.mt > P.d.dur) decide(); },
    pose(p) { base(p); const s = P.mt / P.d.dur; p.rot = P.face * 0.5 * pulse(s * 1.15); p.eye = 'closed'; p.mouth = 'smile'; p.blush = 0.6; p.pivot = [0, -1]; }
  };

  B.hop = {
    enter(d) { setMode('crouch', { vx: d.vx != null ? d.vx : rnd(-1, 1) * 40 * k, vy: -rnd(380, 520) * k, tag: 'hop' }); }
  };

  B.crouch = {
    enter(d) { d.dur = 0.2; if (d.vx) P.face = sign(d.vx); },
    update() { const d = P.d; if (P.mt > d.dur) startJump(d.vx, d.vy, d.tag); },
    pose(p) { base(p); const s = P.mt / P.d.dur; p.sy = 1 - 0.2 * s; p.sx = 1 + 0.1 * s; p.legs = 'tuck'; p.dy = 0; }
  };

  B.air = {
    update(dt) {
      const G = G0 * k, d = P.d;
      const px = P.x, py = P.y;
      P.vy += G * dt; if (!P.thrown && P.vy > 950 * k) P.vy = 950 * k;
      P.x += P.vx * dt; P.y += P.vy * dt;
      if (P.thrown) P.rot += (d.vr || 0) * dt;
      const m = petW / 2;
      if (P.x < m) { P.x = m; if (P.thrown && Math.abs(P.vx) > 250 * k) { P.vx = -P.vx * 0.5; d.vr = -(d.vr || 0) * 0.5; bonk(); } else P.vx = 0; }
      else if (P.x > W - m) { P.x = W - m; if (P.thrown && Math.abs(P.vx) > 250 * k) { P.vx = -P.vx * 0.5; d.vr = -(d.vr || 0) * 0.5; bonk(); } else P.vx = 0; }
      if (P.y < petH + 4 * S) { if (P.vy < 0) { P.y = petH + 4 * S; if (P.thrown && Math.abs(P.vy) > 500 * k) { stars(5); say('哎哟!', 900); } P.vy = Math.abs(P.vy) * 0.25; } }
      if (P.vy > 0) {
        const lp = findLanding(P.x, py, P.y);
        if (lp) { landOn(lp, P.vy); return; }
        if (P.y > groundY) { landOn(plats[0], P.vy); }
      }
    },
    pose(p) {
      base(p); const d = P.d; p.legs = 'air'; p.shadow = 0.5;
      const up = P.vy < 0;
      p.legLift = up ? 1 : -0.4; p.sy = up ? 1.06 : 1.1; p.sx = up ? 0.96 : 0.94; p.dy = 0;
      p.rot = P.thrown ? P.rot : 0;
      const fast = Math.abs(P.vy) > 600 * k || P.thrown;
      if (fast) { armsUp(p); p.eye = 'wide'; p.mouth = 'o'; }
      else { p.armL = [1, up ? -3 : -5, 3]; p.armR = [1, up ? -3 : -5, 3]; p.eye = 'open'; p.mouth = up ? 'smile' : 'o'; }
      if (d.tag === 'pounce') { p.armR = [2, -4, 3]; p.armL = [2, -4, 3]; p.eye = 'open'; p.mouth = 'big'; }
    }
  };
  function bonk() { stars(4); dust(3); }
  function landOn(pl, impact) {
    const thrown = P.thrown;
    if (thrown && impact > 650 * k && P.bounces < 2) {
      P.bounces++; P.y = pl.y; attachKeep(pl);
      P.vy = -impact * 0.36; P.vx *= 0.7; P.plat = null; P.platKey = null; dust(4); return;
    }
    P.rot = 0; attach(pl); P.thrown = false;
    setMode('land', { impact, thrown });
  }
  function attachKeep(pl) { P.y = pl.y; }

  B.land = {
    enter(d) {
      d.dur = 0.24; const strong = clamp(d.impact / (900 * k), 0, 1.4);
      d.sq = d.soft ? 0.12 : 0.1 + 0.25 * strong;
      if (!d.soft) dust(Math.round(2 + strong * 5));
      if (d.thrown && d.impact > 1250 * k) { d.stun = true; stars(6); say(pick(['哎呀!', '好晕…']), 1200); }
    },
    update() {
      const d = P.d;
      if (P.mt > d.dur) {
        if (P.afterLand === 'dizzy' || d.stun) { P.afterLand = null; setMode('dizzy', { dur: 2.2 }); }
        else if (P.greet) { P.greet = false; setMode('wave', { greet: true }); }
        else decide();
      }
    },
    pose(p) { const d = P.d; base(p); const s = 1 - P.mt / d.dur; p.sy = 1 - d.sq * s; p.sx = 1 + d.sq * 0.8 * s; p.legs = 'tuck'; p.dy = 0; p.eye = d.stun ? 'x' : 'open'; p.mouth = d.stun ? 'o' : null; }
  };

  B.grab = {
    enter(d) {
      d.ox = d.ox || 0; d.oy = d.oy || 0; d.hist = []; d.rev = 0; d.lastS = 0; d.revT = 0; d.swing = 0;
      P.plat = null; P.platKey = null; P.thrown = false; P.vx = P.vy = 0; P.rot = 0;
      say(pick(['哇!', '放我下来~', '呀!']), 1000);
    },
    update(dt) {
      const d = P.d;
      P.x = cur.x - d.ox; P.y = cur.y - d.oy;
      P.x = clamp(P.x, petW / 2, W - petW / 2); P.y = clamp(P.y, petH + 6 * S, H);
      P.legT += dt * 7;
      d.hist.push([now, cur.x, cur.y]); while (d.hist.length && now - d.hist[0][0] > 0.12) d.hist.shift();
      // 晃动检测
      const s = Math.abs(cur.vx) > 500 ? sign(cur.vx) : 0;
      if (s && s !== d.lastS) { if (now - d.revT < 1.3) d.rev++; else d.rev = 1; d.revT = now; d.lastS = s; }
      // 摆动(单摆)
      const target = clamp(-cur.vx * 0.0006, -0.8, 0.8) + Math.sin(P.mt * 5) * 0.06;
      P.rot += (target - P.rot) * Math.min(1, dt * 9);
      if (d.rev >= 6 && !d.wobbly) { d.wobbly = true; say('晕晕晕…', 1500); }
    },
    pose(p) {
      const d = P.d; base(p); p.legs = 'dangle'; p.legT = P.legT; p.shadow = 0;
      p.pivot = [d.px || 0, d.py || -9]; p.rot = P.rot;
      const f = Math.sin(P.mt * 8);
      p.armL = [1, -3 + (f > 0 ? 1 : 0), 3]; p.armR = [1, -3 + (f > 0 ? 0 : 1), 3];
      p.eye = d.wobbly ? 'x' : 'wide'; p.mouth = d.wobbly ? 'o' : (P.mt > 2.5 ? 'frown' : 'o');
      if (d.wobbly) p.dizzy = true;
    }
  };

  B.hold = {
    enter(d) { d.h = 0; },
    update(dt) { const d = P.d; d.h -= dt; if (d.h <= 0) { d.h = 0.7; if (P.mt > 1.2) hearts(1); } },
    pose(p) { base(p); p.eye = 'happy'; p.mouth = 'smile'; p.blush = 0.8; p.rot = Math.sin(P.mt * 12) * 0.02; p.dy = 0; }
  };

  B.petted = {
    enter(d) { d.idle = 0; d.h = 0; P.love++; Life.bump('pet'); Director.event('pet'); if (chance(0.5)) say(Life.line('pet_' + Life.stage()), 1600); },
    update(dt) {
      const d = P.d; d.h -= dt;
      if (petting) d.idle = 0; else d.idle += dt;
      if (petting && d.h <= 0) { d.h = 0.45; hearts(1, 6); }
      if (d.idle > 0.9) { if (P.love >= 8) { P.love = 0; setMode('love'); } else decide(); }
    },
    pose(p) {
      base(p); p.eye = 'happy'; p.mouth = 'smile'; p.blush = 1; p.rot = Math.sin(P.mt * 14) * 0.04;
      p.dy = Math.sin(P.mt * 10) > 0 ? -0.5 : 0; p.legs = 'stand';
    }
  };

  B.love = {
    enter(d) { d.dur = 3.4; say('最喜欢你啦 ❤', 3000); hearts(10, 10); d.nt = 0; },
    update(dt) { const d = P.d; d.nt -= dt; if (d.nt <= 0) { d.nt = 0.3; hearts(1, 9); } if (P.mt > d.dur) decide(); },
    pose(p) { base(p); const h = Math.abs(Math.sin(P.mt * 6)); p.eye = 'heart'; p.mouth = 'big'; p.blush = 1; p.lift = h * 1.6; p.prop = P.mt > 0.6 ? 'heart' : null; p.armR = [1, -6, 3]; p.shadow = 1 - h * 0.2; }
  };

  B.poke = {
    enter(d) { d.dur = 0.55; spawn('text', P.x + 7 * S, P.y - 13 * S, { text: '!', color: '#ffd23f', bold: true, vy: -20, life: 0.7, size: 1.4 }); if (chance(0.4)) say(Life.line('poke_' + Life.stage()), 1600); faceCursor(0); },
    update() { if (P.mt > P.d.dur) decide(); },
    pose(p) { base(p); const s = P.mt / P.d.dur; p.lift = pulse(s) * 3; p.sy = s < 0.12 ? 0.9 : 1.05; p.eye = s < 0.7 ? '><' : 'open'; p.mouth = 'o'; armsUp(p, 0.5); }
  };

  B.ouch = {
    enter(d) { d.dur = 4; d.p2 = false; say('呜哇!我的眼睛!', 1800); stars(3); },
    update() { const d = P.d; if (P.mt > 1.9 && !d.p2) { d.p2 = true; P.face = -P.face; say('哼!', 1200); spawn('text', P.x + 6 * S, P.y - 13 * S, { text: '💢', life: 1.2, size: 1.4, vy: -10 }); } if (P.mt > d.dur) decide(); },
    pose(p) {
      const d = P.d; base(p);
      if (!d.p2) { p.eye = '><'; p.mouth = 'frown'; p.tears = true; p.armL = [-2, -2, 3]; p.armR = [-2, -2, 3]; p.rot = Math.sin(P.mt * 20) * 0.03; }
      else { p.eye = 'sad'; p.mouth = 'flat'; p.blush = 0.5; p.ex = 1; p.legs = 'stand'; p.armL = [0, 0, 3]; p.armR = [0, 0, 3]; p.dy = P.mt % 0.8 < 0.15 ? -0.5 : 0; }
    }
  };

  B.tickle = {
    enter(d) { d.dur = 1.8; say('哈哈哈哈痒~', 1600); },
    update() { if (P.mt > P.d.dur) decide(); },
    pose(p) { base(p); p.eye = 'happy'; p.mouth = 'big'; p.blush = 1; p.rot = Math.sin(P.mt * 38) * 0.09; p.sx = 1 + Math.sin(P.mt * 30) * 0.04; p.lift = Math.abs(Math.sin(P.mt * 14)) * 0.8; armsUp(p, 0.5); }
  };

  B.dizzy = {
    enter(d) { d.dur = d.dur || 3.2; d.n = 0; P.dizzyCount++; Life.bump('dizzy'); if (!d.quiet) say(pick(['晕…晕了晕了', '转圈圈~', '地球在转…']), 2000); },
    update(dt) {
      const d = P.d; const pl = wander();
      P.x = clamp(P.x + Math.sin(P.mt * 2.2) * 25 * k * dt, pl.x1 + petW * 0.5, pl.x2 - petW * 0.5);
      P.legT += dt * 4;
      if (P.mt > d.dur) {
        if (P.dizzyCount >= 3) { P.dizzyCount = 0; setMode('party'); } else decide();
      }
    },
    pose(p) {
      base(p); p.dizzy = true; p.rot = Math.sin(P.mt * 4.4) * 0.2; p.eye = Math.floor(P.mt * 2) % 2 ? 'x' : 'dots'; p.mouth = 'o';
      p.legs = 'walk'; p.legT = P.legT; p.armL = [1, -2, 3]; p.armR = [1, -4, 3]; p.dy = 0;
    }
  };

  B.party = {
    enter(d) { d.dur = 6; d.nt = 0; d.s = 0; confetti(70, true); },
    update(dt) {
      const d = P.d; d.nt -= dt;
      if (d.nt <= 0) {
        d.nt = 0.12;
        spawn('text', rnd(0, W), -20, { text: '✻', color: pick(['#D97757', '#EC9D80', '#ffd23f']), vy: rnd(90, 200), vx: rnd(-20, 20), life: rnd(3, 4.5), size: rnd(1, 2), bold: true, rot: rnd(-0.4, 0.4) });
        if (P.mt < 3.5) confetti(3, true);
      }
      const phr = ['<span class="o">✻</span> 彩蛋触发!', '<span class="o">✻</span> Cogitating… (你戳了我好多次)', '<span class="o">✓</span> Done. 其实什么都没做 😄'];
      const idx = P.mt < 1.8 ? 0 : P.mt < 3.8 ? 1 : 2;
      if (idx !== d.s || P.mt < 0.05) { d.s = idx; say(phr[idx], 2400, 'term', true); }
      if (P.mt > d.dur) decide();
    },
    pose(p) { base(p); const h = Math.abs(Math.sin(P.mt * 6.5)); armsUp(p); p.lift = h * 3; p.eye = 'happy'; p.mouth = 'big'; p.blush = 0.9; p.hat = 'party'; p.shadow = 1 - h * 0.3; }
  };

  B.edge = {
    enter(d) { d.dur = rnd(7, 12); d.nt = 1; d.look = 0; },
    update(dt) {
      const d = P.d; P.legT += dt * 4.5; d.nt -= dt;
      if (d.nt <= 0) { d.nt = rnd(1.5, 2.5); note(); }
      if (P.mt > d.dur) decide();
    },
    pose(p) {
      base(p); p.legs = 'edge'; p.legT = P.legT; p.dy = 0; p.mouth = 'smile'; p.eye = P.mt % 5 > 4 ? 'closed' : 'open'; p.rot = Math.sin(P.mt * 1.6) * 0.02;
    }
  };

  B.follow = {
    enter(d) { d.dur = rnd(6, 10); d.arrived = 0; if (chance(0.6)) say(pick(['等等我~', '来啦来啦!', '跟着你~']), 1400); },
    update(dt) {
      const d = P.d, pl = P.plat; if (!pl) return;
      const tx = clamp(cur.x, pl.x1 + petW * 0.55, pl.x2 - petW * 0.55), dx = tx - P.x;
      if (Math.abs(dx) > 70 * k) {
        P.face = sign(dx); const sp = (Math.abs(dx) > 220 * k ? 210 : 120) * k;
        P.x += sign(dx) * Math.min(Math.abs(dx), sp * dt); P.legT += dt * sp / (6 * S) * Math.PI; d.run = sp > 150 * k; d.moving = true;
        if (d.run && chance(0.1)) dust(1, -P.face);
      } else { d.moving = false; d.arrived += dt; faceCursor(0); }
      if (cur.y < P.y - 110 * k && P.mt > 1 && chance(dt * 2)) {
        const plan = planJump(cur.x, cur.y); if (plan) { setMode('crouch', plan); return; }
      }
      if (P.mt > d.dur || d.arrived > 2.5) { if (d.arrived > 0) say(pick(['嘿嘿', '到啦', '❤']), 1200); decide(); }
    },
    pose(p) {
      const d = P.d; base(p);
      if (d.moving) { p.legs = d.run ? 'run' : 'walk'; p.legT = P.legT; p.dy = -Math.abs(Math.sin(P.legT)) * (d.run ? 1.3 : 0.7); p.rot = P.face * (d.run ? 0.1 : 0.03); p.mouth = 'big'; }
      else { p.mouth = 'smile'; p.blush = 0.5; p.ey = -1; p.dy = Math.sin(P.mt * 7) > 0 ? -0.5 : 0; p.armR = [1, -2, 3]; }
    }
  };

  B.pounce = {
    enter(d) { d.wig = 0.85; faceCursor(0); },
    update() {
      const d = P.d; if (P.mt < d.wig) return;
      const dx = clamp(cur.x - P.x, -260 * k, 260 * k); P.face = sign(dx || 1);
      const pl = P.plat; const T = 0.5; let vx = dx / T;
      startJump(vx, -560 * k, 'pounce');
    },
    pose(p) {
      base(p); const s = P.mt / P.d.wig; p.legs = 'tuck'; p.sy = 0.88 - 0.04 * s; p.sx = 1.06 + Math.sin(P.mt * 38) * 0.05 * s; p.ex = P.face > 0 ? 1 : 1; p.ey = 0; p.eye = 'wide'; p.mouth = 'cat';
    }
  };

  B.startle = {
    enter(d) {
      d.dur = 1.3; faceCursor(0);
      spawn('text', P.x + 7 * S, P.y - 13 * S, { text: '!', color: '#ffd23f', bold: true, vy: -24, life: 0.8, size: 1.6 });
      spawn('text', P.x - 8 * S, P.y - 11 * S, { text: '💦', vy: -12, life: 0.8, size: 1.1 });
      const away = -sign(cur.x - P.x);
      setMode('crouch', { vx: away * 190 * k, vy: -420 * k, tag: 'startle' });
      P.face = -away;
    },
    pose(p) { base(p); }
  };

  B.ball = {
    enter(d) {
      d.kicks = 0; d.max = Math.floor(rnd(5, 9)); d.cool = 0; d.t = 0;
      const pl = P.plat, dir = P.x > (pl.x1 + pl.x2) / 2 ? -1 : 1;
      ball.on = true; ball.x = clamp(P.x + dir * 45 * k, pl.x1 + 12, pl.x2 - 12); ball.y = P.y - 36 * k; ball.vx = 0; ball.vy = 0; ball.bounces = 0;
      say(pick(['看我的球!', '来玩球~']), 1400); d.move = false;
    },
    update(dt) {
      const d = P.d, pl = P.plat; d.cool -= dt;
      if (!ball.on || ball.y > groundY + 60 || ball.y > P.y + 140 * k && P.platKey !== 'g') { endBall(false); return; }
      if (!pl) return;
      const dx = ball.x - P.x; d.move = false;
      const bx = ball.x, by = ball.y;
      if (Math.abs(dx) > 18 * k) { P.face = sign(dx); const sp = 190 * k; P.x += sign(dx) * Math.min(Math.abs(dx) - 14 * k, sp * dt); P.legT += dt * sp / (6 * S) * Math.PI; d.move = true; P.x = clamp(P.x, pl.x1 + petW * 0.4, pl.x2 - petW * 0.4); }
      else if (d.cool <= 0 && ball.y > P.y - 22 * k) {
        P.face = sign(dx || P.face); d.kick = 0.3; d.cool = 0.9; d.kicks++;
        ball.vx = P.face * rnd(230, 380) * k; ball.vy = -rnd(280, 460) * k; hearts(0);
        spawn('spark', ball.x, ball.y - 6, { life: 0.3, size: 1.3 });
      }
      if (d.kick > 0) d.kick -= dt;
      if (d.kicks >= d.max && d.cool < 0.3) endBall(true);
      if (P.mt > 26) endBall(false);
    },
    pose(p) {
      const d = P.d; base(p); p.legs = d.move ? 'run' : 'stand'; p.legT = P.legT; p.mouth = 'big'; p.eye = 'open';
      p.ex = 0; p.ey = 1; p.dy = d.move ? -Math.abs(Math.sin(P.legT)) : p.dy;
      if (d.kick > 0) { p.rot = P.face * 0.12; p.armR = [1, -3, 3]; p.armL = [1, -3, 3]; }
    },
    leave() { ball.on = false; }
  };
  function endBall(ok) {
    for (let i = 0; i < 6; i++) spawn('spark', ball.x + rnd(-8, 8), ball.y - rnd(0, 14), { vx: rnd(-50, 50), vy: rnd(-60, -10), life: 0.6, size: 1.2 });
    ball.on = false;
    if (ok) { say('好玩!', 1400); Life.bump('play'); setMode('cheer', { quiet: true }); } else decide();
  }

  B.carry = {
    enter(d) {
      const prop = pick(['flower', 'balloon']); const pl = P.plat, pad = petW * 0.55;
      const dir = chance(0.5) ? 1 : -1;
      const tx = clamp(P.x + dir * rnd(220, 520) * k, pl.x1 + pad, pl.x2 - pad);
      say(prop === 'flower' ? '送你一朵小花~' : '气球!', 1600);
      setMode('walk', { tx, carry: prop, sp: 55 * k, noDrop: true });
    }
  };

  B.trip = {
    enter(d) { d.dur = 3.3; d.said = false; dust(5, P.face); },
    update(dt) {
      const d = P.d;
      if (P.mt < 0.5) { const pl = wander(); P.x = clamp(P.x + P.face * 70 * k * dt, pl.x1 + petW * 0.5, pl.x2 - petW * 0.5); }
      if (!d.said && P.mt > 1.0) { d.said = true; say(Life.line('trip'), 1800); }
      if (P.mt > d.dur) decide();
    },
    pose(p) {
      base(p); const t = P.mt; p.pivot = [0, -5];
      if (t < 0.35) { p.rot = P.face * 1.45 * ease(t / 0.35); p.eye = 'wide'; p.mouth = 'o'; armsUp(p, 0.8); p.legs = 'air'; p.legLift = 1; }
      else if (t < 1.6) { p.rot = P.face * 1.45; p.eye = t < 1.2 ? 'x' : 'dots'; p.mouth = 'o'; p.legs = 'air'; p.legLift = Math.sin(t * 12) * 0.6 + 0.4; p.armL = [1, -3, 3]; p.armR = [1, -3, 3]; }
      else if (t < 2.2) { p.rot = P.face * 1.45 * (1 - ease((t - 1.6) / 0.6)); p.eye = 'dots'; p.blush = 0.9; p.mouth = 'flat'; }
      else { p.eye = 'open'; p.ex = (Math.floor(t * 2) % 2 ? 1 : -1) * P.face; p.blush = 0.9; p.mouth = 'flat'; }
    }
  };

  B.doze = {
    enter(d) { d.dur = rnd(8, 13); d.jerk = false; d.nz = 1; Life.bump('nap'); },
    update(dt) {
      const d = P.d; d.nz -= dt; if (d.nz <= 0) { d.nz = 1.8; ztext('z'); }
      if (!d.jerk && P.mt > d.dur - 1.3) { d.jerk = true; d.jt = P.mt; spawn('text', P.x + 7 * S, P.y - 13 * S, { text: '!', color: '#ffd23f', bold: true, vy: -20, life: 0.8, size: 1.5 }); say(pick(['(惊醒)我没睡!', '咦?我睡着了吗', '!!', '我只是在思考…']), 1700); }
      if (P.mt > d.dur) setMode('stretch', { quietSay: true });
    },
    pose(p) {
      const d = P.d; base(p); p.legs = 'tuck'; p.glasses = null; p.pivot = [0, -3];
      if (!d.jerk) { const ph = (P.mt % 3.4) / 3.4; p.rot = P.face * 0.24 * ph * ph; p.eye = ph > 0.12 ? 'closed' : 'open'; p.blink = ph < 0.12 ? 0.6 : 0; p.blush = 0.3; p.mouth = ph > 0.5 ? 'o' : null; }
      else { const s = clamp((P.mt - d.jt) / 0.3, 0, 1); p.eye = 'wide'; p.mouth = 'o'; p.lift = pulse(s) * 2.5; p.rot = 0; }
    }
  };

  B.notice = {
    enter(d) { d.dur = 1.7; if (d.tx != null && Math.abs(d.tx - P.x) > 20) P.face = sign(d.tx - P.x); if (chance(0.6)) say(Life.line('winopen'), 1600); },
    update() { if (P.mt > P.d.dur) decide(); },
    pose(p) { base(p); p.eye = 'wide'; p.mouth = 'o'; p.ex = 1; p.ey = -1; p.lift = pulse(Math.min(1, P.mt / 0.35)) * 2.5; armsUp(p, 0.4); }
  };

  // 小虫子 / 蝴蝶
  B.critter = {
    enter(d) {
      const pl = P.plat;
      d.kind = (pl && pl.x2 - pl.x1 > petW * 3.5 && chance(0.5)) ? 'bug' : 'bfly';
      d.s = 'watch'; d.t = 0; d.miss = 0; d.hop = 0; d.hit = false; d.moving = false;
      Object.assign(crit, { on: true, kind: d.kind, t: 0, fast: false, fastT: 0 });
      if (d.kind === 'bug') {
        const dir = P.x > (pl.x1 + pl.x2) / 2 ? -1 : 1;
        crit.dir = dir; crit.x = clamp(P.x + dir * rnd(120, 190) * k, pl.x1 + 24, pl.x2 - 24); crit.y = pl.y;
        spawn('text', P.x + 7 * S, P.y - 13 * S, { text: '?', color: '#ffd23f', bold: true, vy: -20, life: 0.9, size: 1.5 });
        say(pick(['咦?那是什么', '有只小虫!', '嘘…有动静']), 1600);
      } else {
        const side = chance(0.5) ? -1 : 1;
        crit.x = clamp(P.x + side * 230 * k, 20, W - 20); crit.y = P.y - 80 * k; crit.vx = -side * 42 * k; crit.vy = 0;
        crit.color = pick(['#7ad0ff', '#ff9ff3', '#ffd23f']); crit.color2 = '#ffffff';
        say(pick(['哇 蝴蝶!', '好漂亮…', '嘘…它过来了']), 1600);
      }
      faceTo(crit.x);
    },
    update(dt) {
      const d = P.d, pl = P.plat; if (!pl) return;
      d.t += dt; crit.t += dt;
      if (d.kind === 'bug') {
        if (crit.fast) { crit.fastT -= dt; if (crit.fastT <= 0) crit.fast = false; }
        if (crit.on) crit.x += crit.dir * (crit.fast ? 150 : 16) * k * dt;
        if (crit.on && (crit.x < pl.x1 + 4 || crit.x > pl.x2 - 4)) { crit.on = false; if (d.s !== 'end') { d.s = 'end'; d.t = 0; say(pick(['跑掉了…', '溜走啦', '下次一定!']), 1500); } }
        switch (d.s) {
          case 'watch': faceTo(crit.x); if (d.t > 1.6) { d.s = 'stalk'; d.t = 0; } break;
          case 'stalk': {
            const dx = crit.x - P.x; P.face = sign(dx);
            if (Math.abs(dx) > 28 * k) { P.x = clamp(P.x + sign(dx) * 48 * k * dt, pl.x1 + petW * 0.4, pl.x2 - petW * 0.4); P.legT += dt * 48 * k / (6 * S) * Math.PI; d.moving = true; }
            else { d.moving = false; d.s = 'wiggle'; d.t = 0; }
            break;
          }
          case 'wiggle': faceTo(crit.x); if (d.t > 0.85) { d.s = 'pounce'; d.t = 0; d.hit = false; } break;
          case 'pounce':
            if (d.t > 0.22 && !d.hit) { d.hit = true; crit.fast = true; crit.fastT = 0.7; crit.dir = chance(0.5) ? 1 : -1; dust(4, P.face); spawn('spark', crit.x, crit.y - 4, { life: 0.3, size: 1.3 }); }
            if (d.t > 0.55) { d.miss++; d.s = 'look'; d.t = 0; }
            break;
          case 'look': if (d.t > 1.3) { if (crit.on && d.miss < 3) { d.s = 'stalk'; d.t = 0; } else { crit.on = false; d.s = 'end'; d.t = 0; say(pick(['被它跑掉了…', '哼 下次一定!']), 1500); } } break;
          case 'end': if (d.t > 1.5) decide(); break;
        }
      } else {
        const base0 = P.y - 72 * k;
        const flutter = () => {
          crit.x += crit.vx * dt; if (Math.abs(crit.x - P.x) > 190 * k) crit.vx = -sign(crit.x - P.x) * Math.abs(crit.vx);
          crit.x = clamp(crit.x, 12, W - 12); crit.y = base0 + Math.sin(crit.t * 3.1) * 14 * k + (d.dodge || 0);
          if (d.dodge) d.dodge *= Math.exp(-dt * 1.5);
        };
        switch (d.s) {
          case 'watch': flutter(); faceTo(crit.x); if (d.t > 2.6) { d.s = 'reach'; d.t = 0; d.n = 0; } break;
          case 'reach':
            flutter(); faceTo(crit.x);
            if (d.hop > 0) d.hop -= dt;
            if (d.hop <= 0 && d.t > d.n * 1.5 + 0.3 && d.n < 3) { d.hop = 0.5; d.n++; d.dodge = -26 * k; crit.vx *= -1; }
            if (d.n >= 3 && d.t > 4.9) { d.s = 'land'; d.t = 0; }
            break;
          case 'land': {
            const tx = P.x, ty = P.y - 13.8 * S - (P.hat ? 2 * S : 0), a = Math.min(1, dt * 2.2);
            crit.x += (tx - crit.x) * a; crit.y += (ty - crit.y) * a;
            if (Math.hypot(tx - crit.x, ty - crit.y) < 5) { d.s = 'freeze'; d.t = 0; say('嘘…别动', 2400); }
            break;
          }
          case 'freeze': crit.x = P.x + Math.sin(crit.t * 2) * 1.5; crit.y = P.y - 13.8 * S - (P.hat ? 2 * S : 0) + Math.sin(crit.t * 12) * 0.8;
            if (d.t > 3.6) { d.s = 'leave'; d.t = 0; crit.vy = -80 * k; crit.vx = rnd(-50, 50) * k; hearts(3); } break;
          case 'leave': crit.x += crit.vx * dt; crit.y += crit.vy * dt; if (d.t > 1.8) { crit.on = false; d.s = 'end'; d.t = 0; say(pick(['再见~', '它飞走啦']), 1500); } break;
          case 'end': if (d.t > 1.3) decide(); break;
        }
      }
      if (P.mt > 40) decide();
    },
    pose(p) {
      const d = P.d; base(p);
      if (d.kind === 'bug') {
        p.ey = 1; p.ex = 1; p.eye = 'wide'; p.sy = 0.94;
        if (d.s === 'stalk' && d.moving) { p.legs = 'walk'; p.legT = P.legT; p.sy = 0.9; p.dy = 0; }
        if (d.s === 'wiggle') { p.legs = 'tuck'; p.sy = 0.88; p.sx = 1.06 + Math.sin(P.mt * 38) * 0.05; p.mouth = 'cat'; }
        if (d.s === 'pounce') { p.lift = pulse(d.t / 0.5) * 3.2; p.sy = 1; armsUp(p, 0.6); p.mouth = 'big'; }
        if (d.s === 'look' || d.s === 'end') { p.sy = 1; p.eye = 'dots'; p.blush = 0.7; p.ex = (Math.floor(P.mt * 2) % 2 ? 1 : -1); p.ey = 0; p.mouth = 'flat'; }
      } else {
        p.eye = 'open'; p.mouth = 'o';
        const dx = crit.x - P.x; p.ex = (Math.abs(dx) > 20 * k ? sign(dx) : 0) * P.face; p.ey = -1;
        if (d.s === 'reach') { armsUp(p, 0.9); p.lift = d.hop > 0 ? pulse(1 - d.hop / 0.5) * 3.6 : 0; }
        if (d.s === 'land') { p.mouth = 'smile'; p.ex = 0; }
        if (d.s === 'freeze') { p.ex = 0; p.ey = -1; p.mouth = 'flat'; p.blush = 0.8; p.blink = 0; p.dy = 0; p.eye = 'dots'; }
        if (d.s === 'leave' || d.s === 'end') { p.mouth = 'smile'; p.blush = 0.7; p.armR = [1, -6 + (Math.sin(P.mt * 12) > 0 ? 1 : 0), 3]; }
      }
    }
  };
  function faceTo(x) { if (Math.abs(x - P.x) > 12) P.face = sign(x - P.x); }

  B.story = {
    enter() {},
    update() {},
    pose(p) { base(p); Director.applyPose(p); }
  };

  B.wiggle = { // 兼容占位
    enter() { setMode('idle'); }
  };

  // ---------------------------------------------------------------- jump planning
  function planJump(tx0, ty0) {
    const G = G0 * k, cands = [];
    for (const pl of plats) {
      if (pl === P.plat || pl.key === P.platKey && P.x >= pl.x1 && P.x <= pl.x2) continue;
      if (pl.x2 - pl.x1 < petW * 0.9) continue;
      const tx = clamp(tx0 != null ? tx0 : P.x, pl.x1 + petW * 0.45, pl.x2 - petW * 0.45);
      const dxh = Math.abs(tx - P.x), dy = pl.y - P.y;
      if (dy < -190 * k || dxh > 320 * k) continue;
      let w = 1 / (1 + dxh / (100 * k)) + (dy < 0 ? 0.6 : 0.2);
      if (ty0 != null) w += 2 / (1 + Math.abs(pl.y - ty0) / (60 * k));
      cands.push({ pl, tx, dy, w });
    }
    if (!cands.length) return null;
    let sum = cands.reduce((a, c) => a + c.w, 0), r = Math.random() * sum, c = cands[0];
    for (const x of cands) { r -= x.w; if (r <= 0) { c = x; break; } }
    const hx = 34 * k;
    const vy0 = -Math.sqrt(2 * G * (Math.max(0, -c.dy) + hx));
    const T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G * c.dy)) / G;
    const vx = (c.tx - P.x) / T;
    if (Math.abs(vx) > 430 * k) return null;
    return { vx, vy: vy0, tag: 'jump' };
  }

  // ---------------------------------------------------------------- decisions
  function decide() {
    if (Director.onFree()) return;
    if (!P.plat) { startFall(0, 0); return; }
    const pl = P.plat, width = pl.x2 - pl.x1, onWin = P.platKey !== 'g';
    const roomy = width > petW * 3, calmCur = cur.known;
    const w = [];
    const add = (n, wt) => { if (wt > 0 && n !== P.lastAct) w.push([n, wt]); };

    const dist = Math.hypot(cur.x - P.x, cur.y - P.y);
    const ui = userIdle();
    const sleepy = ui > 90 || (isNight() && chance(0.3));
    if (ui > 120 && !P.slept) { P.slept = true; pickAct('sleep'); return; }
    if (ui < 20) P.slept = false;

    if (calmCur && dist < 700 && cur.sp > 60 && roomy && chance(Life.followChance())) { pickAct('follow'); return; }
    if (calmCur && dist > 90 && dist < 420 && cur.sp < 250 && cur.sp > 15 && Math.abs(cur.y - P.y) < 260 * k && chance(0.14) && now - (P.lastPounce || 0) > 20) { P.lastPounce = now; pickAct('pounce'); return; }

    if (roomy) { add('walk', 22); add('run', 5); }
    add('idle', 12); add('sit', 7); add('wave', 3); add('dance', 4); add('stretch', 3); add('spin', 3);
    add('read', 3); add('coffee', 3); add('cookie', 2); add('laptop', 3); add('hop', 6); add('jump', 9);
    add('hiccup', 1.4); add('sneeze', 1.4); add('moonwalk', roomy ? 2 : 0); add('cheer', 2); add('bow', 1); add('flip', 2);
    if (roomy) { add('carry', 2.5); if (width > petW * 7) add('ball', 3); }
    if (onWin) add('edge', 8);
    add('sleep', sleepy ? 9 : 1);
    const sk = (Life.mem && Life.mem.skills) || {};
    for (const nm in sk) add('skill:' + nm, 1.3);
    const ws = Life.weights(w, { typing: isTyping() }).filter(([n]) => n !== P.lastAct);
    pickAct(wpick(ws));
  }
  function wpick(list) {
    let s = 0; for (const [, x] of list) s += x;
    let r = Math.random() * s; for (const [n, x] of list) { r -= x; if (r <= 0) return n; }
    return 'idle';
  }
  function pickAct(n) {
    P.lastAct = n;
    if (n.startsWith('skill:')) { if (!Director.playSkill(n.slice(6))) setMode('idle'); return; }
    const pl = P.plat;
    switch (n) {
      case 'run': return setMode('walk', { sp: 190 * k * rnd(0.9, 1.15) });
      case 'jump': { const plan = planJump(); return plan ? setMode('crouch', plan) : setMode('walk'); }
      case 'edge': return goEdge();
      case 'sleep': return setMode('sleep', { auto: userIdle() > 60 });
      case 'critter': return (pl.x2 - pl.x1 > petW * 3) ? setMode('critter') : setMode('idle');
      default: return setMode(n);
    }
  }
  function goEdge() {
    const pl = P.plat; if (P.platKey === 'g') return setMode('walk');
    const left = P.x - pl.x1 < pl.x2 - P.x;
    const tx = left ? pl.x1 + 7 * S + 2 : pl.x2 - 7 * S - 2;
    if (pl.x2 - pl.x1 < 16 * S) return setMode('sit');
    P.face = left ? -1 : 1;
    setMode('walk', { tx, sp: 80 * k, noDrop: true, done: () => { P.face = left ? -1 : 1; setMode('edge'); } });
  }

  // ---------------------------------------------------------------- input / interactions
  let down = null, clicks = [], petAcc = 0, lastOverMove = 0, petting = false;
  let circAng = null, circAcc = 0, circT = 0, lastStartle = 0;

  function onMouseDownPet(e) {
    if (e.button !== 0) return;
    setCursor(e.clientX, e.clientY);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (hitboxEl) hitboxEl.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
    setInteractive(true);
  }

  if (hitboxEl) {
    hitboxEl.addEventListener('mouseenter', () => {
      setInteractive(true);
    });
    hitboxEl.addEventListener('mouseleave', () => {
      if (!down && P.mode !== 'grab') hoverCheck();
    });
    hitboxEl.addEventListener('mousedown', onMouseDownPet);
    hitboxEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (api && api.openChat) api.openChat({ x: P.x, y: P.y, ctx: Life.summary() });
    });
  }

  window.addEventListener('mousedown', e => {
    setCursor(e.clientX, e.clientY);
    if (e.button !== 0 || !overPet(e.clientX, e.clientY)) return;
    onMouseDownPet(e);
  });
  window.addEventListener('mousemove', e => {
    setCursor(e.clientX, e.clientY);
    if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
      down.moved = true;
      startGrab(down.x, down.y);
      if (hitboxEl) hitboxEl.style.cursor = 'grabbing';
    }
  });
  window.addEventListener('mouseup', e => {
    if (!down) return;
    const dn = down; down = null;
    if (hitboxEl) hitboxEl.style.cursor = 'grab';
    document.body.style.cursor = 'grab';
    if (dn.moved) release();
    else if (performance.now() - dn.t < 450) onClick(dn.x, dn.y);
    else if (P.mode === 'hold') decide();
    hoverCheck();
  });
  window.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (api && api.openChat && overPet(e.clientX, e.clientY)) api.openChat({ x: P.x, y: P.y, ctx: Life.summary() });
  });

  function startGrab(x, y) {
    const lx = (x - P.x) / S * P.face, ly = (y - P.y) / S;
    setMode('grab', { ox: x - P.x, oy: y - P.y, px: lx, py: ly });
    if (hitboxEl) hitboxEl.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
  }
  function release() {
    const d = P.d; if (P.mode !== 'grab') return;
    const wob = d.wobbly;
    let vx = clamp(cur.vx, -2800, 2800), vy = clamp(cur.vy, -2800, 2800);
    if (Math.hypot(vx, vy) < 120) { vx = 0; vy = 0; }
    startFall(vx, vy, true);
    Life.bump('throw'); Director.event('throw');
    if (Math.hypot(vx, vy) > 700) say(Life.line(Life.mem && Life.mem.throws > 8 ? 'throw_many' : 'throw'), 1700);
    P.d.vr = clamp(vx * 0.004, -9, 9) + (wob ? 6 : 0);
    if (wob) P.afterLand = 'dizzy';
    if (hitboxEl) hitboxEl.style.cursor = 'grab';
    document.body.style.cursor = 'grab';
  }

  function onClick(x, y) {
    if (AIR.has(P.mode) || P.mode === 'air' || P.mode === 'dizzy' || P.mode === 'party' || P.mode === 'love') return;
    Director.event('click');
    const t = performance.now(); clicks = clicks.filter(c => t - c < 2200); clicks.push(t);
    const n = clicks.length;
    const lx = (x - P.x) / S * P.face, ly = (y - P.y) / S;
    if (P.mode === 'sleep') { P.hat = P.baseHat; say(pick(['唔…谁呀', '别闹…再睡会儿']), 1600); setMode('poke'); return; }
    if (n >= 10) { clicks = []; P.dizzyCount = 3; setMode('dizzy', { dur: 1.6, quiet: true }); return; }
    if (n >= 5) { clicks = []; setMode('dizzy', { dur: 3 }); return; }
    if (n === 2 && t - (clicks[0] || 0) < 380) { setMode('flip'); return; }
    if (n === 3) { say(pick(['痛痛痛!', '再戳要晕啦~', '你好烦哦~']), 1400); setMode('poke'); return; }
    if (ly > -3.8 && ly < 1) { Life.bump('tickle'); Director.event('tickle'); setMode('tickle'); return; }               // 戳小短腿
    if (ly > -9.8 && ly < -5.2 && Math.abs(lx) > 1.4 && Math.abs(lx) < 5.2) { Life.bump('ouch'); setMode('ouch'); return; }  // 戳眼睛
    if (chance(0.25)) { hearts(3); }
    Life.bump('poke');
    setMode('poke');
  }

  // ---------------------------------------------------------------- per-frame global logic
  let clockT = 0, lastChime = -1, wanderT = 0;
  function globalUpdate(dt) {
    // 眨眼
    P.nextBlink -= dt;
    if (P.nextBlink <= 0 && P.blinkT < 0) { P.blinkT = 0; P.nextBlink = rnd(2, 5); if (chance(0.15)) P.nextBlink = 0.35; }
    if (P.blinkT >= 0) { P.blinkT += dt; const s = P.blinkT / 0.16; P.blink = s < 1 ? (s < 0.5 ? s * 2 : (1 - s) * 2) : 0; if (s >= 1) { P.blinkT = -1; P.blink = 0; } }
    // 发呆随机看
    P.look.t -= dt; if (P.look.t <= 0) { P.look.t = rnd(1, 2.8); P.look.x = pick([-1, 0, 0, 1]); P.look.y = pick([-1, 0, 0, 0, 1]); }

    cur.still = (performance.now() - cur.lastMove) / 1000;

    // 生命:情绪 / 记忆 / 自言自语 / 窗口冲浪 / 欢迎回来
    const calm0 = CALM.has(P.mode);
    P.surfT = Math.max(0, P.surfT - dt); surfAcc *= Math.exp(-dt * 2.2);
    if (surfAcc > 70 && P.platKey && P.platKey[0] === 'w' && !AIR.has(P.mode)) {
      surfAcc = 0; P.surfT = 1.6;
      if (now - lastSurfSay > 9 && bubT <= 0) { lastSurfSay = now; say(Life.line('surf'), 1600); }
    }
    const ui0 = userIdle();
    if (ui0 > 300) idleLong = Math.max(idleLong, ui0);
    else if (idleLong && ui0 < 2.5) {
      const long = idleLong > 1800; idleLong = 0; Life.bump('return');
      if (P.mode === 'sleep') wake(true);
      else if (calm0 && !Director.busy()) { say(Life.line(long ? 'back_long' : 'back'), 2800); setMode('wave', { dur: 2.2 }); return; }
    }
    const lo = Life.tick(dt, { calm: calm0, typing: isTyping(), userIdle: ui0, mode: P.mode });
    Director.update(dt);
    if (lo && !Director.busy()) {
      if (lo.kind === 'milestone') { say(lo.text, 4800); applyCosmetics(); if (lo.mode) { setMode(lo.mode, { quiet: true }); return; } }
      else say(lo.text, 3400);
    }
    if (performance.now() - cur.t > 90) { cur.vx *= 0.88; cur.vy *= 0.88; cur.sp = Math.hypot(cur.vx, cur.vy); }

    // 抚摸检测
    petAcc = Math.max(0, petAcc - 90 * dt);
    petting = performance.now() - lastOverMove < 260 && petAcc > 30 && !down && overPet(cur.x, cur.y);
    const calm = CALM.has(P.mode);
    if (calm && !down && petAcc > 140 && overPet(cur.x, cur.y)) { petAcc = 0; setMode('petted'); return; }

    // 鼠标绕圈圈 -> 晕
    if (calm || P.mode === 'petted') {
      const dx = cur.x - P.x, dy = cur.y - (P.y - 5 * S), r = Math.hypot(dx, dy);
      if (r > 40 && r < 260 && cur.sp > 280) {
        const a = Math.atan2(dy, dx);
        if (circAng != null) { let da = a - circAng; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU; circAcc = Math.abs(circAcc + da) > Math.abs(circAcc) || Math.sign(da) === Math.sign(circAcc) ? circAcc + da : da; circT = now; }
        circAng = a;
        if (Math.abs(circAcc) > TAU * 1.7) { circAcc = 0; circAng = null; say('别绕啦…头晕…', 1800); setMode('dizzy', { dur: 3, quiet: true }); return; }
      } else circAng = null;
      if (now - circT > 1.2) circAcc = 0;
    }

    // 鼠标猛冲过来 -> 受惊
    if (calm && P.mode !== 'startle' && now - lastStartle > 7 && cur.sp > 2200 && Math.hypot(cur.x - P.x, cur.y - (P.y - 5 * S)) < 130 * k && !down) {
      lastStartle = now; setMode('startle'); return;
    }

    // 长按
    if (down && !down.moved && performance.now() - down.t > 600 && P.mode !== 'hold' && !AIR.has(P.mode) && P.mode !== 'air') setMode('hold');

    // 钟表彩蛋
    clockT -= dt;
    if (clockT <= 0) {
      clockT = 1; const dtn = new Date(), h = dtn.getHours(), m = dtn.getMinutes();
      if (m === 0 && lastChime !== h && calm && !Director.busy()) {
        lastChime = h;
        if (h === 12 || h === 18) setMode('cookie', { meal: true });
        else if (h === 23 || h === 0) { say('夜深了…早点休息吧~', 3000); setMode('wave', { dur: 2 }); }
        else setMode('wave', { chime: h });
      }
    }
    if (P.shiny && chance(dt * 3)) spawn('spark', P.x + rnd(-8, 8) * S, P.y - rnd(0, 12) * S, { vy: -14, life: 0.6, size: 1 });
  }
  const CALM = new Set(['idle', 'walk', 'sit', 'wave', 'stretch', 'dance', 'read', 'coffee', 'cookie', 'edge', 'follow', 'hiccup', 'moonwalk', 'spin', 'bow', 'laptop', 'ball', 'doze', 'story']);

  // ---------------------------------------------------------------- frame loop
  let last = performance.now(), fullClear = true, prevBox = null, box = null;
  function touch(x1, y1, x2, y2) { if (!box) box = [x1, y1, x2, y2]; else { box[0] = Math.min(box[0], x1); box[1] = Math.min(box[1], y1); box[2] = Math.max(box[2], x2); box[3] = Math.max(box[3], y2); } }

  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const q = fx[i]; q.life -= dt;
      if (q.life <= 0) { fx.splice(i, 1); continue; }
      q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.vr) q.rot += q.vr * dt;
    }
  }
  function updateBall(dt) {
    if (!ball.on) return;
    const G = G0 * k * 0.8;
    const py = ball.y; ball.vy += G * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.rot += ball.vx * dt * 0.05;
    if (ball.x < 8) { ball.x = 8; ball.vx = Math.abs(ball.vx) * 0.7; }
    if (ball.x > W - 8) { ball.x = W - 8; ball.vx = -Math.abs(ball.vx) * 0.7; }
    if (ball.vy > 0) {
      const lp = findLanding(ball.x, py, ball.y);
      if (lp) { ball.y = lp.y; ball.vy = Math.abs(ball.vy) > 140 ? -ball.vy * 0.55 : 0; ball.vx *= 0.9; }
    }
    if (Math.abs(ball.vy) < 1) ball.vx *= (1 - 1.6 * dt);
  }

  function render() {
    if (fullClear) { ctx.clearRect(0, 0, cv.width, cv.height); fullClear = false; prevBox = null; }
    else if (prevBox) {
      const pad = 24;
      ctx.clearRect(Math.floor((prevBox[0] - pad) * dpr), Math.floor((prevBox[1] - pad) * dpr), Math.ceil((prevBox[2] - prevBox[0] + pad * 2) * dpr), Math.ceil((prevBox[3] - prevBox[1] + pad * 2) * dpr));
    }
    box = null;
    const pose = Rig.newPose();
    pose.hat = P.hat;
    const beh = B[P.mode];
    if (beh && beh.pose) beh.pose(pose); else base(pose);
    if (pose.hat === undefined) pose.hat = P.hat;
    if (P.surfT > 0 && P.mode !== 'sleep' && P.mode !== 'air' && !AIR.has(P.mode)) {
      const f = Math.sin(now * 18);
      pose.eye = 'wide'; pose.mouth = 'o'; pose.blink = 0; pose.dizzy = false; pose.rot += Math.sin(now * 15) * 0.16;
      pose.armL = [1, -6 + (f > 0 ? 1 : 0), 3]; pose.armR = [1, -6 + (f > 0 ? 0 : 1), 3];
    }
    if (P.shiny && !pose.hat) pose.hat = 'crown';
    Rig.drawPet(ctx, u, P.x * dpr, P.y * dpr, pose, P.face);
    touch(P.x - 26 * S, P.y - 44 * S, P.x + 26 * S, P.y + 8 * S);
    if (crit.on) { Rig.drawCritter(ctx, u, dpr, crit, now); touch(crit.x - 24, crit.y - 34, crit.x + 24, crit.y + 12); }
    if (ball.on) { Rig.drawBall(ctx, u, dpr, ball); touch(ball.x - 20, ball.y - 30, ball.x + 20, ball.y + 10); }
    for (const q of Director.itemParticles()) { Rig.drawParticle(ctx, u, dpr, q); touch(q.x - 30, q.y - 30, q.x + 30, q.y + 30); }
    for (const q of fx) { Rig.drawParticle(ctx, u, dpr, q); touch(q.x - 30, q.y - 30, q.x + 30, q.y + 30); }
    prevBox = box;
    updateHitbox();
  }

  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts; now = ts / 1000;
    P.mt += dt;
    if (P.pendX || P.pendY) {
      const a = 1 - Math.exp(-dt * 16), ax = P.pendX * a, ay = P.pendY * a;
      P.x += ax; P.y += ay; P.pendX -= ax; P.pendY -= ay;
      if (Math.abs(P.pendX) < 0.3 && Math.abs(P.pendY) < 0.3) { P.x += P.pendX; P.y += P.pendY; P.pendX = P.pendY = 0; }
    }
    globalUpdate(dt);
    const beh = B[P.mode]; if (beh && beh.update) beh.update(dt);
    // 地面兜底
    if (!AIR.has(P.mode) && P.mode !== 'air' && P.mode !== 'flip' && !P.plat && P.mode !== 'crouch') startFall(0, 0);
    updateFx(dt); updateBall(dt); updateBubble(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  function summon() {
    P.x = rnd(W * 0.3, W * 0.7); P.y = -60; P.face = chance(0.5) ? 1 : -1; P.greet = true;
    ball.on = false; startFall(0, 0);
  }

  function applyCosmetics() {
    const f = Life.today();
    P.baseHat = f ? f.hat : null; P.glasses = null;
    if (!P.baseHat) {
      const c = Life.cosmetics();
      if (c.length && chance(0.7)) { const x = pick(c); if (x.hat) P.baseHat = x.hat; if (x.glasses) P.glasses = x.glasses; }
    }
    P.hat = P.baseHat;
  }
  P.baseHat = null; P.hat = null;
  P.shiny = qs.get('shiny') === '1' || Math.random() < 1 / 48;
  if (P.shiny) Rig.setPalette(true);

  if (api) {
    api.onInfo(info => { sense = info.sense !== false; layout(info); });
    api.onCursor(p => { if (p.idle != null) { sysIdle = p.idle; sysIdleAt = performance.now(); } setCursor(p.x, p.y); });
    api.onWindows(list => {
      list = list || [];
      const ids = new Set(list.map(w => w.id));
      if (seenIds && seenIds.size > 0 && CALM.has(P.mode) && !Director.busy() && now - lastWinReact > 25 && chance(0.5)) {
        const nw = list.find(w => !seenIds.has(w.id));
        if (nw) { lastWinReact = now; setMode('notice', { tx: (nw.l + nw.r) / 2 }); }
      }
      seenIds = ids; winList = list; rebuild();
    });
    if (api.onApp) api.onApp(name => {
      if (!sense || !Life.mem) return;
      const r = Life.appReact(name); if (!r) return;
      if (CALM.has(P.mode) && !Director.busy()) { say(r.text, 2800); if (r.mode === 'sit') setMode('sit', { dur: 8 }); else setMode(r.mode, r.mode === 'cheer' ? { quiet: true } : {}); }
    });
    api.onDom(list => { domList = list || []; domStamp = performance.now(); rebuild(); });
    if (api.onStory) api.onStory(m => { if (m && m.payload) Director.play(m.payload, { premise: m.premise }); });
    if (api.onThinking) api.onThinking(on => Director.thinking(on));
    if (api.onSay) api.onSay(t => say(String(t).slice(0, 80), 4200, 'force'));
    api.onCommand(c => {
      if (c !== 'stopStory' && Director.active()) Director.stop(true);
      if (c === 'stopStory') { if (Director.active()) Director.stop(false); }
      else if (c === 'summon') summon();
      else if (c === 'sleep') setMode('sit', { dur: 0.8 }), setTimeout(() => setMode('sleep', {}), 850);
      else if (c === 'wake') wake();
      else if (c === 'dance') setMode('dance');
    });
    Promise.all([api.getInfo(), api.loadMemory ? api.loadMemory() : Promise.resolve(null)]).then(([info, memo]) => {
      sense = info.sense !== false; layout(info);
      Life.init(memo, m => api.saveMemory && api.saveMemory(m));
      start();
    });
  } else {
    layout(null);
    const LS = 'clawd-mem';
    let stored = null; try { stored = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (_) {}
    Life.init(stored, m => { try { localStorage.setItem(LS, JSON.stringify(m)); } catch (_) {} });
    // 开发预览:用页面上带 .plat 的元素当平台
    setInterval(() => {
      const L = []; let i = 0;
      document.querySelectorAll('.plat').forEach(el => { const r = el.getBoundingClientRect(); L.push({ id: i++, x1: r.left, x2: r.right, y: r.top }); });
      if (L.length) { domList = L; domStamp = performance.now(); rebuild(); }
    }, 250);
    start();
  }

  Director.init({
    P, cur, ball, S: () => S, k: () => k, petW: () => petW, W: () => W, now: () => now,
    setMode, say, sayStory, hideBubble, spawn, hearts, stars, confetti, dust, note, ztext, decide,
    askText: api && api.askText ? q => api.askText(q) : null,
    llmContinue: api && api.llmContinue ? st => api.llmContinue(st) : null,
    skills: () => (Life.mem && Life.mem.skills) || {},
    saveSkill: (name, nd) => {
      const m = Life.mem; if (!m) return; m.skills = m.skills || {};
      const keys = Object.keys(m.skills); if (!(name in m.skills) && keys.length >= 12) delete m.skills[keys[0]];
      m.skills[name] = nd; Life.save();
    },
    bump: (ev, arg) => Life.bump(ev, arg)
  });

  function start() {
    applyCosmetics();
    if (api && api.reportPet) setInterval(() => api.reportPet({ x: P.x, y: P.y, ctx: Life.summary() }), 1500);
    P.greetText = Life.greeting();
    summon();
    if (P.shiny) setTimeout(() => say('✨ 闪光 Clawd 出现了!', 3600, 'force'), 6500);
    requestAnimationFrame(t => { last = t; frame(t); });
  }

  window.__clawd = { P, B, cur, fx, ball, crit, Life, Director, setMode, say, decide, spawn, get plats() { return plats; }, hearts, stars, confetti, layout, startFall, setHat: h => { P.hat = P.baseHat = h; } };
  const force = qs.get('force');
  if (force) setTimeout(() => { P.greet = false; setMode(force, {}); }, 900);
})();
