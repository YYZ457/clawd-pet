'use strict';
/* 分镜。所有时间单位:秒。每个场景函数 fn(lt) 只依赖本地时间 lt。 */
const SCN = [
  { id: 'hook',   dur: 3.9, iris: [600, 950] },
  { id: 'title',  dur: 3.4, iris: [540, 1100] },
  { id: 'wins',   dur: 6.4, iris: [540, 1150] },
  { id: 'div',    dur: 5.2, iris: [540, 1000] },
  { id: 'mouse',  dur: 7.2, iris: [540, 1150] },
  { id: 'tiles',  dur: 5.0, iris: [540, 950] },
  { id: 'memory', dur: 3.3, iris: [540, 1100] },
  { id: 'story',  dur: 6.4, iris: [540, 1100] },
  { id: 'egg',    dur: 2.7, iris: [540, 1000] },
  { id: 'end',    dur: 4.6, iris: [540, 1000] }
];
let _t = 0; for (const s of SCN) { s.t0 = _t; _t += s.dur; s.t1 = _t; }
const TOTAL = _t;
const T0 = {}; SCN.forEach(s => T0[s.id] = s.t0);

const CAP = { fill: '#fff', stroke: INK, sw: 22, shadow: ORANGE, sd: 10, size: 92, bob: 5 };
const cap = (t, s, a, b, y = 330, o = {}) => { if (t >= a && t < b + .3) popText(s, 540, y, t, a, Object.assign({}, CAP, o, { out: b })); };
const sparkles = (t, t0, x, y, seed = 3) => burst(t, t0, x, y, { kind: 'star2', n: 9, spd: 340, life: .9, g: 300, a0: -Math.PI, a1: 0, size: 1.2, seed, colors: ['#F6C945', '#fff', '#FF9AB0'] });
const hearts = (t, t0, x, y, seed = 5, n = 5) => burst(t, t0, x, y, { kind: 'heart', n, spd: 230, life: 1.1, g: -120, a0: -Math.PI * .85, a1: -Math.PI * .15, size: 1.1, seed });
const dust = (t, t0, x, y, seed = 9) => burst(t, t0, x, y, { kind: 'dust', n: 8, spd: 190, life: .55, g: 60, a0: -Math.PI, a1: 0, size: 1.1, seed, u: 16, colors: ['rgba(255,255,255,.95)', 'rgba(255,240,225,.9)'] });
const landDust = (t, P, base) => { for (const q of P.s) if (q.k === 'land') dust(t, base + q.t0, q.x, q.y, Math.floor(q.t0 * 10)); };

// ====================================================== 0 钩子:安静的桌面
(function () {
  const B = T0.hook, winX = 150, winW = 780, winTop = 800, winH = 640, px = 600, u = 20;
  const P = new Path(px, winTop + 150).stay(1.95).jump(px, winTop, .42, 330, { crouch: .22, land: .3 }).stay(3, { mode: 'wave' });
  addEvents(P, B);
  ev(B + .95, 'pop'); ev(B + 2.62, 'sparkle'); ev(B + 2.9, 'hello');
  const GRAY = { bg1: '#E3E6EA', bg2: '#D9DDE2', bar: '#C8CED6', body: '#ffffff', ink: '#838a94', line: '#D8DDE3', tbar: '#B9C0C9', gray: true };
  const COL = { bg1: '#FFE6D6', bg2: '#FFD7C2', bar: '#FFB89B', body: '#FFFAF4', ink: INK, line: '#F3DACD', tbar: '#FFC9AF', gray: false };
  function pass(t, pal) {
    bgDots(pal.bg1, pal.bg2, t, { speed: pal.gray ? 0 : 22 });
    if (!pal.gray) floaties(t, 4, ['#EF3F5B', '#F6C945', '#ff9ab0'], 7);
    ctx.fillStyle = pal.tbar; ctx.fillRect(0, 1730, W, 190); ctx.fillStyle = pal.gray ? '#aab1ba' : INK; ctx.fillRect(0, 1730, W, 5);
    for (let i = 0; i < 5; i++) rr(300 + i * 100, 1775, 64, 64, 16, pal.gray ? '#d5dae0' : ['#FF9AB0', '#F6C945', '#8bd49a', '#6CC3FF', '#C9B6FF'][i], pal.gray ? null : INK, 4);
    const s = P.at(t, u); let y = s.y; if (t < 1.2) y += kf(t, [[.65, 120], [1.1, 0]], eo3);
    const behind = y > winTop + 4 && t < 2.5;
    const petDraw = () => {
      const o = { x: s.x, y, u, t, face: s.face, mode: s.mode, k: s.k, up: s.up };
      if (t < 1.95) {
        const look = Math.sin(t * 3.2) > .1 ? 1 : -1;
        o.mode = 'idle'; o.face = look; o.pose = { ex: t < 1.1 ? 0 : 1, eye: t > 1.6 ? 'wide' : 'open', mouth: null, shadow: 0 };
      }
      pet(o);
    };
    if (behind) petDraw();
    windowBox(winX, winTop, winW, winH, { title: pal.gray ? '无标题 - 文档' : '你好呀！', bar: pal.tbar, body: pal.body, content: (w, h) => { lines(w, h, pal.line, 44, 8, 52); if (Math.floor(t * 2) % 2 === 0 && pal.gray) { ctx.fillStyle = pal.ink; ctx.fillRect(44 + 120, 44 + 7 * 52 - 6, 5, 28); } } });
    if (!behind) petDraw();
  }
  SCN[0].fn = function (t) {
    pass(t, GRAY);
    const r = eo3(seg(t, 2.55, 3.5)) * 2100;
    if (r > 1) { ctx.save(); ctx.beginPath(); ctx.arc(px, winTop, r, 0, 7); ctx.clip(); pass(t, COL); ctx.restore(); }
    landDust(t, P, 0);
    hearts(t, 3.0, px, winTop - 200, 4, 4);
    if (t < 2.5 && t > .15) popText('你的桌面，是不是有点太安静了？', 540, 400, t, .15, { size: 58, fill: '#7d848e', stroke: '#fff', sw: 14, gap: .03, out: 2.0 });
    cap(t, '有只小东西…', 2.15, 2.9, 330, { size: 96, gap: .07 });
    if (t >= 2.62) bubble('嗨～', px + 20, winTop - 250, { scale: eob(seg(t, 2.65, 2.95)) });
    cap(t, '想住进你的桌面', 3.05, 99, 330, { size: 88 });
  };
})();

// ====================================================== 1 标题
(function () {
  const B = T0.title, gy = 1420, u = 30;
  ev(B + .45, 'land'); ev(B + .5, 'sparkle'); ev(B + .62, 'pop'); ev(B + .95, 'pop'); ev(B + 1.5, 'pop');
  SCN[1].fn = function (t) {
    bgDots('#FFE0CC', '#FFD0B4', t); floaties(t, 21, ['#EF3F5B', '#F6C945', '#fff', '#ff9ab0'], 12);
    const tf = .45; let y, mode = 'idle', k = 0;
    if (t < tf) { y = lerp(-400, gy, ei3(t / tf) * .9 + .1 * t / tf); mode = 'air'; }
    else { y = gy; const lt = t - tf; if (lt < .35) { mode = 'land'; k = lt / .35; } else mode = (Math.sin(lt * 3.4) > .92) ? 'cheer' : 'wave'; }
    const hop = t > .9 ? Math.abs(Math.sin((t - .9) * 3.5)) * 26 : 0;
    pet({ x: 540, y: y - hop, u, t, mode, k, up: false, pose: Object.assign({ shadow: t < tf ? 0 : 1 - hop / 80 }, mode === 'wave' ? { mouth: 'smile' } : {}) });
    sparkles(t, tf, 540, gy - 120, 8); hearts(t, tf + .1, 540, gy - 330, 6, 6); dust(t, tf, 400, gy); dust(t, tf, 680, gy, 14);
    popText('Clawd', 540, 520, t, .6, { size: 250, fill: ORANGE, stroke: INK, sw: 30, shadow: INK, sd: 16, gap: .07, bob: 7 });
    popText('桌宠', 540, 760, t, .95, { size: 220, fill: '#fff', stroke: INK, sw: 30, shadow: INK, sd: 16, gap: .12, bob: 7 });
    popText('一只住在你电脑里的小东西', 540, 940, t, 1.5, { size: 54, fill: INK, stroke: '#FFE0CC', sw: 12, gap: .035 });
  };
})();

// ====================================================== 2 在窗口上散步
(function () {
  const B = T0.wins, u = 16;
  const A = { x: 60, y: 1290, w: 440, h: 300 }, Bw = { x: 360, y: 1100, w: 440, h: 330 }, C = { x: 620, y: 1340, w: 400, h: 280 };
  const P = new Path(120, A.y, 1).stay(.35).walk(330, .8).jump(430, Bw.y, .55, 330).walk(730, .9).jump(870, C.y, .5, 150).stay(3);
  addEvents(P, B); const landC = P.T - 3;
  ev(B + landC + .45, 'click'); ev(B + landC + 1.0, 'whoosh'); ev(B + landC + 1.7, 'whoosh');
  const dragT = landC + .5;
  const off = t => ({ x: kf(t, [[dragT, 0], [dragT + .6, -190], [dragT + 1.4, 110], [dragT + 2.0, -40]]), y: kf(t, [[dragT, 0], [dragT + .6, -140], [dragT + 1.4, 40], [dragT + 2.0, -70]]) });
  const content = c => (w, h) => { lines(w, h, c, 36, 4, 46); };
  SCN[2].fn = function (t) {
    bgDots('#D9F3E3', '#C8EBD6', t); floaties(t, 31, ['#fff', '#8bd49a', '#F6C945'], 9);
    ctx.save(); ctx.translate(0, -200);
    const s = P.at(t, u), dragging = t > dragT, o = dragging ? off(t) : { x: 0, y: 0 };
    const o2 = off(t + .05), vx = dragging ? (o2.x - o.x) / .05 : 0;
    windowBox(A.x, A.y, A.w, A.h, { title: 'notes.txt', bar: '#FFD9C7', content: content('#F3E3DA') });
    windowBox(Bw.x, Bw.y, Bw.w, Bw.h, { title: 'music', bar: '#E7D9FF', content: content('#E8E0F6') });
    windowBox(C.x + o.x, C.y + o.y, C.w, C.h, { title: 'photos', bar: '#CFE9FF', rot: dragging ? clamp(vx / 6000, -.05, .05) : 0, content: content('#DCEBF7') });
    let x = s.x, y = s.y;
    const onC = s.state === 'stay' && t >= landC - .01;
    if (onC) { x += o.x; y += o.y; }
    const surf = dragging && onC;
    if (surf) for (let i = 0; i < 4; i++) { const ph = (t * 3 + i * .27) % 1; const lx = x - Math.sign(vx || 1) * (90 + ph * 200), ly = y - 40 - i * 36; ctx.globalAlpha = (1 - ph) * clamp(Math.abs(vx) / 200); ctx.fillStyle = '#fff'; ctx.fillRect(lx, ly, 90, 8); ctx.globalAlpha = 1; }
    pet({ x, y, u, t, face: surf ? (vx < -10 ? -1 : vx > 10 ? 1 : s.face) : s.face, mode: surf ? 'idle' : s.mode, phase: s.phase, k: s.k, up: s.up, pose: surf ? { eye: 'happy', mouth: 'big', armL: [3, -1, 3], armR: [3, -1, 3], rot: clamp(vx / 1800, -.18, .18) } : undefined });
    landDust(t, P, 0);
    if (t > landC + .1) {
      const tx = C.x + C.w / 2 + o.x, ty = C.y + 27 + o.y, f = eo3(seg(t, landC + .1, dragT + .05));
      const cx = dragging ? tx : lerp(1120, tx, f), cy = dragging ? ty : lerp(900, ty, f);
      cursor(cx, cy, { ring: t > dragT && t < dragT + .45 ? seg(t, dragT, dragT + .45) : 0, ringCol: ORANGE });
    }
    ctx.restore();
    cap(t, '在你的窗口上散步', .25, landC + .3, 330);
    cap(t, '拖动窗口，它跟着冲浪！', landC + .5, 99, 330, { size: 80 });
  };
})();

// ====================================================== 3 网页里的 <div>
(function () {
  const B = T0.div, u = 16, Bx = 60, By = 690, Bw = 960, Bh = 780;
  const cards = [{ x: 110, y: 1030, w: 250, h: 310, c: '#FFD9C7' }, { x: 400, y: 940, w: 250, h: 400, c: '#E7D9FF' }, { x: 690, y: 1080, w: 250, h: 260, c: '#CFE9FF' }];
  const P = new Path(205, cards[0].y).stay(.45).walk(320, .5).jump(470, cards[1].y, .5, 210).walk(590, .45).jump(780, cards[2].y, .5, 170).walk(890, .4).stay(3);
  addEvents(P, B);
  SCN[3].fn = function (t) {
    bgDots('#E9E1FB', '#DDD2F7', t); floaties(t, 41, ['#fff', '#B9A4F0', '#F6C945'], 9);
    windowBox(Bx, By, Bw, Bh, {
      title: 'my-page.html', bar: '#DCD0F8', barH: 62, content: (w, h) => {
        rr(30, 12, w - 60, 36, 18, '#fff', INK, 3); text('https://my-page.html', 60, 31, { size: 22, fill: '#8d8397', align: 'left', mono: true });
        rr(30, 70, 340, 26, 13, '#EAE4F4'); rr(w - 230, 70, 200, 26, 13, '#EAE4F4');
        rr(30, 120, w - 60, 90, 22, '#F6F0FF');
      }
    });
    const s = P.at(t, u);
    let act = -1; if (s.state !== 'air' && s.state !== 'crouch') cards.forEach((c, i) => { if (s.x >= c.x - 10 && s.x <= c.x + c.w + 10 && Math.abs(s.y - c.y) < 6) act = i; });
    cards.forEach((c, i) => {
      const on = i === act;
      rr(c.x, c.y, c.w, c.h, 18, c.c, null);
      rr(c.x + 24, c.y + c.h - 120, c.w - 48, 20, 10, 'rgba(58,42,34,.12)'); rr(c.x + 24, c.y + c.h - 80, (c.w - 48) * .6, 20, 10, 'rgba(58,42,34,.12)');
      rr(c.x + 24, c.y + 60, c.w - 48, 90, 14, 'rgba(255,255,255,.7)');
      if (on) rr(c.x, c.y, c.w, c.h, 18, 'rgba(110,170,235,.20)');
      rr(c.x, c.y, c.w, c.h, 18, null, on ? '#3b82c4' : INK, on ? 8 : 4);
      if (on) pill('div.card', c.x + c.w / 2, c.y + 112, { fill: '#2f3340', color: '#9cdcfe', mono: true, size: 28, padX: 36, padY: 24, flat: true });
    });
    pet({ x: s.x, y: s.y, u, t, face: s.face, mode: s.mode, phase: s.phase, k: s.k, up: s.up });
    landDust(t, P, 0);
    cap(t, '网页里的每个 <div>', .25, 99, 330, { size: 76 });
    popText('都是它的小路', 540, 450, t, .85, { size: 76, fill: '#fff', stroke: INK, sw: 22, shadow: ORANGE, sd: 10, bob: 5 });
  };
})();

// ====================================================== 4 鼠标互动
(function () {
  const B = T0.mouse, u = 24, gy = 1290, cx = 540;
  const tPet0 = 1.5, tPet1 = 3.1, tClk = 3.2, tLift = 3.5, tRel = 4.55;
  ev(B + tClk, 'click'); ev(B + tRel, 'whoosh');
  for (let i = 0; i < 6; i++) ev(B + tPet0 + .15 + i * .3, 'heart');
  const cpos = t => {
    if (t < 1.0) return { x: kf(t, [[0, 1100], [.9, 840]], eo3), y: kf(t, [[0, 700], [.9, 980]], eo3) };
    if (t < tPet0) return { x: kf(t, [[1.0, 840], [1.5, 300]], eio), y: kf(t, [[1.0, 980], [1.5, 900]], eio) };
    if (t < tPet1) { const k = t - tPet0; return { x: cx + Math.sin(k * 9) * 85, y: gy - 11 * u - 30 + Math.sin(k * 5) * 12 }; }
    if (t < tLift) return { x: cx, y: gy - 11 * u - 20 };
    if (t < 4.05) return { x: cx + kf(t, [[tLift, 0], [4.05, 120]], eio), y: kf(t, [[tLift, gy - 11 * u - 20], [4.05, 560]], eio) };
    if (t < tRel) return { x: kf(t, [[4.05, cx + 120], [tRel, 720]], eio) + Math.sin(t * 20) * 8, y: kf(t, [[4.05, 560], [tRel, 640]], eio) };
    return { x: 720 + (t - tRel) * 380, y: 640 - (t - tRel) * 180 };
  };
  const g = 2800, x0 = 720, y0 = 640 + 12 * u * .82;
  function sim(tt, omega) {
    let x = x0, y = y0, vx = -330, vy = -380, rot = 0, n = 0, tl = 0, lastImp = -1, first = -1; const dt = 1 / 240;
    for (let s = 0; s < tt / dt; s++) {
      vy += g * dt; x += vx * dt; y += vy * dt; tl += dt; if (n === 0) rot += omega * dt;
      if (y >= gy) { y = gy; if (Math.abs(vy) > 160) { vy = -vy * .42; vx *= .6; n++; lastImp = tl; if (first < 0) first = tl; } else vy = 0; }
    }
    return { x, y, rot: n ? 0 : rot, n, lastImp, first };
  }
  let tImp = 0.8; { const r = sim(3, 0); tImp = r.first; } const OMEGA = Math.PI * 4 / tImp; // 两圈,正好正着落地
  ev(B + tRel + tImp, 'land'); ev(B + tRel + tImp + .45, 'land');
  SCN[4].fn = function (t) {
    bgDots('#FFF0B8', '#FFE79A', t); floaties(t, 51, ['#fff', '#F6C945', '#ff9ab0'], 9);
    rr(110, gy, 860, 150, 34, '#F8DD8F', INK, 6); rr(110, gy, 860, 28, 14, '#FFE9A8');
    const c = cpos(t);
    const o = { x: cx, y: gy, u, t, face: 1, mode: 'idle' };
    if (t < tPet0) { o.face = c.x < cx - 30 ? -1 : 1; o.pose = { ex: Math.abs(c.x - cx) > 200 ? 1 : 0, ey: c.y < gy - 200 ? -1 : 0, eye: 'open', mouth: 'smile' }; }
    else if (t < tPet1) {
      o.mode = 'love'; o.pose = { eye: 'happy', blush: 1, mouth: 'smile', rot: Math.sin((t - tPet0) * 9) * .06, sy: .94 + Math.sin((t - tPet0) * 18) * .01, sx: 1.04 };
      for (let i = 0; i < 6; i++) hearts(t, tPet0 + .15 + i * .3, cx + Math.sin(i * 2) * 60, gy - 250, 20 + i, 3);
    }
    else if (t < tLift) { o.pose = { eye: 'wide', mouth: 'o', sy: .9, sx: 1.08 }; }
    else if (t < tRel) { o.mode = 'hold'; o.x = c.x; o.y = c.y + 12 * u * .82; }
    else {
      const b = sim(t - tRel, OMEGA); o.x = b.x; o.y = b.y; o.face = -1;
      if (b.n === 0) { o.mode = 'spin'; o.pose = { rot: b.rot }; }
      else {
        const since = (t - tRel) - b.lastImp;
        o.mode = t < 6.35 ? 'dizzy' : t < 6.75 ? 'idle' : 'wave'; if (o.mode === 'idle') o.pose = { eye: 'open', mouth: 'o' };
        if (since < .22) o.pose = Object.assign(o.pose || {}, { sy: 1 - .22 * Math.cos(since / .22 * 1.5), sx: 1.12 });
      }
    }
    pet(o);
    const ringT = t - tClk;
    cursor(c.x, c.y, { ring: ringT > 0 && ringT < .5 ? ringT / .5 : 0, ringCol: ORANGE, scale: t >= tLift && t < tRel ? .85 : 1 });
    hearts(t, 6.85, o.x, o.y - 250, 77, 5);
    cap(t, '鼠标靠近，它会看你', .25, 1.45, 330, { size: 78 });
    cap(t, '摸摸它～', tPet0 + .1, 3.0, 330);
    cap(t, '拎起来！', tClk + .1, 4.4, 330);
    cap(t, '扔出去……会晕的！', 4.55, 99, 330, { size: 80 });
  };
})();

// ====================================================== 5 小动作拼贴
(function () {
  const B = T0.tiles, tw = 450, th = 330, gx = 30, gy = 24, x0 = (W - (tw * 2 + gx)) / 2, y0 = 470, GH = 70;
  const defs = [
    { n: '困了会睡', c: '#DDE6FF', ground: '#C3D0F5' }, { n: '饿了会吃', c: '#FFE3D1', ground: '#F5C8AE' },
    { n: '爱看书', c: '#E1F4E6', ground: '#BFE3C8' }, { n: '开心跳舞', c: '#FFD9EA', ground: '#F5B8D3' },
    { n: '扑蝴蝶', c: '#FFF2C4', ground: '#F1DC8C' }, { n: '偶尔耍酷', c: '#E8DEFA', ground: '#CDBDF0' }
  ];
  defs.forEach((d, i) => ev(B + .2 + i * .24, 'pop'));
  const inner = [
    (t, u) => { pet({ x: 0, y: 8, u, t, mode: 'sleep' }); for (let k = 0; k < 3; k++) { const ph = (t * .55 + k / 3) % 1; text('z', 60 + ph * 50, -120 - ph * 90, { size: 36 + k * 10, fill: '#7a8fe0', stroke: '#fff', sw: 8, alpha: Math.sin(ph * Math.PI) }); } },
    (t, u) => { const n = 1 - ((t * .42) % 1); pet({ x: 0, y: 8, u, t, mode: 'idle', pose: { prop: 'cookie', propT: n, mouth: 'munch', eye: 'happy', armL: [-1, -1, 3], armR: [-1, -1, 3] } }); burst(t % 2.38, 0, 20, -60, { kind: 'crumb', n: 5, spd: 90, life: .6, g: 500, a0: -2.4, a1: -.7, size: 1.2, u: 11, seed: 3, colors: ['#d9a65f'] }); },
    (t, u) => { pet({ x: 0, y: 8, u, t, mode: 'idle', pose: { prop: 'book', ey: 1, mouth: null, eye: Math.sin(t * 1.3) > .96 ? 'closed' : 'open' } }); },
    (t, u) => { const b = Math.abs(Math.sin(t * 6.5)); pet({ x: 0, y: 8, u, t, mode: 'cheer', pose: { hat: 'party', lift: b * 3, rot: Math.sin(t * 3.25) * .13 } }); burst(t % 1.2, 0, 0, -150, { kind: 'confetti', n: 12, spd: 160, life: 1, g: 300, a0: -2.8, a1: -.3, size: 1.4, u: 11, seed: 4, colors: ['#ff6fa0', '#F6C945', '#6CC3FF', '#8bd49a'] }); },
    (t, u) => { const px = Math.sin(t * 1.6) * 40, bx = Math.sin(t * 2.3 + 1) * 130, by = -170 + Math.sin(t * 4) * 28 - Math.max(0, Math.sin(t * 2.3)) * 20, pounce = Math.max(0, Math.sin(t * 2.3 + 2.2)) > .7 ? 30 : 0; pet({ x: px, y: 8 - pounce, u, t, face: bx > px ? 1 : -1, mode: 'idle', pose: { ey: -1, ex: 1, eye: 'wide', mouth: 'o' } }); Rig.drawCritter(ctx, 12, 1, { x: bx, y: by, kind: 'butterfly', color: '#ff8fb8', color2: '#fff' }, t); },
    (t, u) => { pet({ x: 0, y: 8, u, t, mode: 'idle', pose: { glasses: 'shades', mouth: 'smile', rot: Math.sin(t * 2.2) * .05, armL: [0, 1, 3], armR: [0, 1, 3] } }); const ph = (t * 1.1) % 1; if (ph < .35) sprite('sparkle', -34, -122, 5, { X: '#fff' }, { scale: Math.sin(ph / .35 * Math.PI), rot: ph * 3 }); }
  ];
  function tile(i, lt) {
    const d = defs[i], col = i % 2, row = Math.floor(i / 2), x = x0 + col * (tw + gx), y = y0 + row * (th + gy);
    const t0 = .2 + i * .24, s = eob(seg(lt, t0, t0 + .4)); if (s <= 0.01) return;
    ctx.save(); ctx.translate(x + tw / 2, y + th / 2); ctx.scale(s, s); ctx.translate(-tw / 2, -th / 2);
    rr(0, 12, tw, th, 34, 'rgba(58,42,34,.16)');
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, tw, th, 34); ctx.clip();
    ctx.fillStyle = d.c; ctx.fillRect(0, 0, tw, th); ctx.fillStyle = d.ground; ctx.fillRect(0, th - GH, tw, GH);
    ctx.translate(tw / 2, th - GH); inner[i](lt - t0, i === 3 ? 10 : 12);
    ctx.restore();
    rr(0, 0, tw, th, 34, null, INK, 6);
    pill(d.n, 20 + (d.n.length * 30 + 36) / 2, 4, { size: 30, padX: 36, padY: 26, flat: true, fill: '#fff', color: INK });
    ctx.restore();
  }
  SCN[5].fn = function (t) {
    bgDots('#FFE0EE', '#FFCFE4', t); floaties(t, 61, ['#fff', '#ff6fa0', '#F6C945'], 10);
    for (let i = 0; i < 6; i++) tile(i, t);
    cap(t, '几十种小动作，从不重样', .1, 99, 340, { size: 78 });
  };
})();

// ====================================================== 6 记得你
(function () {
  const B = T0.memory, u = 24, gy = 1440;
  for (let i = 0; i < 7; i++) ev(B + .35 + i * .13, 'tick');
  ev(B + 1.25, 'pop'); ev(B + 1.75, 'sparkle'); ev(B + 2.1, 'sparkle'); ev(B + 2.45, 'sparkle');
  SCN[6].fn = function (t) {
    bgDots('#D6EEFF', '#C4E4FA', t); floaties(t, 71, ['#fff', '#6CC3FF', '#ff9ab0'], 10);
    const cs = eob(seg(t, 0, .4)), n = Math.min(7, 1 + Math.floor(Math.max(0, t - .35) / .13));
    const flip = ((t - .35) / .13) % 1, fs = t < .35 + .78 ? Math.abs(Math.cos(clamp(flip) * Math.PI)) * .3 + .7 : 1 + .06 * Math.max(0, Math.sin((t - 1.15) * 10)) * Math.exp(-(t - 1.15) * 3);
    ctx.save(); ctx.translate(540, 700); ctx.scale(cs * .85, cs * .85);
    rr(-230, -150 + 14, 460, 340, 36, 'rgba(58,42,34,.16)'); rr(-230, -150, 460, 340, 36, '#fff', INK, 6);
    ctx.save(); ctx.beginPath(); ctx.roundRect(-227, -147, 454, 100, [33, 33, 0, 0]); ctx.clip(); ctx.fillStyle = '#EF5B6B'; ctx.fillRect(-230, -150, 460, 106); ctx.restore();
    ctx.fillStyle = INK; ctx.fillRect(-227, -47, 454, 5);
    for (const rx of [-120, 120]) rr(rx - 10, -180, 20, 56, 10, '#fff', INK, 5);
    text('我们认识的', 0, -98, { size: 46, fill: '#fff' });
    text('第 ' + n + ' 天', 0, 50, { size: 150, fill: ORANGE, stroke: INK, sw: 16, scaleY: fs, scale: 1, shadow: INK, sd: 8 });
    ctx.restore();
    const hats = [[1.75, 'santa'], [2.1, 'pumpkin'], [2.45, 'party']]; let hat = null; for (const h of hats) if (t >= h[0]) hat = h[1];
    pet({ x: 540, y: gy, u, t, mode: 'love', pose: { hat, lift: Math.abs(Math.sin(t * 4)) * .6 } });
    if (t > 1.25) bubble('你回来啦！', 700, gy - 11 * u - 40, { shift: 130, scale: eob(seg(t, 1.25, 1.55)) });
    hearts(t, 1.3, 540, gy - 270, 31, 5);
    for (const h of hats) sparkles(t, h[0], 540, gy - 11 * u - 20, Math.floor(h[0] * 10));
    cap(t, '它记得你', .2, 1.6, 330, { size: 96 });
    cap(t, '还陪你过节', 1.7, 99, 330, { size: 96 });
  };
})();

// ====================================================== 7 互动剧场
(function () {
  const B = T0.story, u = 24, gy = 1250, Xx = 820, tType = .55, str = '演一出海盗寻宝';
  for (let i = 0; i < str.length; i++) ev(B + tType + i * .1, 'tick');
  ev(B + 1.5, 'click'); ev(B + 1.65, 'whoosh'); ev(B + 3.75, 'click'); ev(B + 2.8, 'pop'); ev(B + 3.1, 'pop'); ev(B + 5.1, 'sparkle'); ev(B + 4.85, 'pop');
  ev(B + 4.65, 'thud'); ev(B + 4.85, 'thud');
  SCN[7].fn = function (t) {
    bgDots('#CFEAFF', '#BEE0FA', t); floaties(t, 81, ['#fff', '#6CC3FF', '#F6C945'], 9);
    const chatOut = eio(seg(t, 2.2, 2.7));
    if (chatOut < 1) {
      ctx.save(); ctx.globalAlpha = 1 - chatOut; ctx.translate(0, chatOut * 260);
      const cs = eob(seg(t, 0, .4)); ctx.translate(540, 760); ctx.scale(cs, cs); ctx.translate(-540, -760);
      windowBox(90, 560, 900, 420, {
        title: '和 Clawd 说话', titleSize: 32, barH: 64, bar: '#FFD9C7', body: '#FFFAF4', content: (w, h) => {
          if (t > 1.5) { const m = eob(seg(t, 1.55, 1.85)); ctx.save(); ctx.translate(w - 50, 70); ctx.scale(m, m); rr(-400, -42, 400, 84, 36, ORANGE, INK, 4); text(str, -200, 3, { size: 46, fill: '#fff' }); ctx.restore(); }
          if (t > 1.7 && t < 2.3) for (let i = 0; i < 3; i++) { ctx.fillStyle = '#B9A090'; ctx.beginPath(); ctx.arc(80 + i * 34, 150 - Math.abs(Math.sin(t * 9 + i * .8)) * 14, 9, 0, 7); ctx.fill(); }
          rr(30, h - 108, w - 200, 80, 40, '#fff', INK, 5);
          const nChars = clamp(Math.floor((t - tType) / .1), 0, str.length);
          if (t < 1.5) text(str.slice(0, nChars) + (Math.floor(t * 3) % 2 ? '|' : ''), 70, h - 66, { size: 46, fill: INK, align: 'left' });
          pill('发送', w - 95, h - 68, { size: 40, padX: 44, padY: 30, press: t > 1.45 && t < 1.6 });
        }
      });
      ctx.restore();
    }
    const sIn = eob(seg(t, 2.4, 3.0)); if (sIn > 0.01) {
      ctx.save(); ctx.globalAlpha = clamp(sIn); ctx.translate(0, (1 - sIn) * 120);
      rr(120, gy, 840, 150, 40, '#F5D79E', INK, 6); rr(120, gy, 840, 26, 13, '#FFE8B8');
      if (t <= 4.8) { ctx.fillStyle = '#E04B4B'; for (let k = -2; k <= 2; k++) { ctx.fillRect(Xx + k * 9 - 4, gy - 8 + k * 9 - 4, 14, 14); ctx.fillRect(Xx + k * 9 - 4, gy - 8 - k * 9 - 4, 14, 14); } }
      let x = 300, mode = 'cheer', y = gy, k = 0, phase;
      if (t < 3.85) mode = t < 2.9 ? 'cheer' : 'idle';
      else if (t < 4.55) { mode = 'run'; x = lerp(300, Xx - 70, eio(seg(t, 3.85, 4.5))); phase = (x - 300) / (6 * u) * Math.PI; }
      else { x = Xx - 70; mode = t < 5.0 ? 'crouch' : 'cheer'; k = .5 + .5 * Math.sin((t - 4.55) * 20); if (t >= 5.0) y = gy - Math.abs(Math.sin((t - 5.0) * 7)) * 36; }
      pet({ x, y, u, t, face: 1, mode, k, phase, pose: { hat: 'redcap', shadow: 1 } });
      if (t >= 4.55 && t < 5.0) burst(t, 4.6, Xx, gy - 6, { kind: 'crumb', n: 12, spd: 260, life: .6, g: 900, a0: -2.5, a1: -.6, size: 1.6, u: 22, seed: 12, colors: ['#b98a4a', '#8a6232'] });
      if (t >= 4.85) { const gk = seg(t, 4.85, 5.35), gx = lerp(Xx, Xx + 40, gk), gyy = gy - 40 - Math.sin(gk * Math.PI) * 200 - gk * 90; sprite('gem', gx, gyy, 9, GEM_P, { scale: 1 + .08 * Math.sin(t * 8) }); }
      if (t >= 5.1) { sparkles(t, 5.1, Xx + 40, gy - 150, 33); hearts(t, 5.2, x, gy - 260, 34, 5); }
      if (t > 2.75 && t < 3.9) bubble('船长！宝藏埋哪边？', 330, gy - 11 * u - 62, { scale: eob(seg(t, 2.75, 3.05)) });
      if (t > 4.85) bubble('找到宝石啦！', x + 30, gy - 11 * u - 62 - 40, { scale: eob(seg(t, 4.85, 5.15)) });
      if (t > 3.05 && t < 4.0) {
        const cs = eob(seg(t, 3.05, 3.35)) * (1 - eio(seg(t, 3.85, 4.0)));
        pill('往左走', 300, 690, { scale: cs, fill: '#6CC3FF', size: 50, padX: 76, padY: 54 });
        pill('往右走', 780, 690, { scale: cs, fill: ORANGE, size: 50, padX: 76, padY: 54, press: t > 3.75 });
        cursor(kf(t, [[3.1, 960], [3.7, 800]], eo3), kf(t, [[3.1, 500], [3.7, 705]], eo3), { ring: t > 3.75 && t < 4.2 ? seg(t, 3.75, 4.2) : 0, ringCol: ORANGE });
      }
      ctx.restore();
    }
    cap(t, '你说一句，它演一出', .2, 2.3, 330, { size: 80 });
    cap(t, '还会让你做选择！', 2.9, 99, 330, { size: 84 });
    if (t > 3.2) { ctx.save(); ctx.globalAlpha = eo3(seg(t, 3.2, 3.6)) * .85; text('可选接入 DeepSeek（需自备 Key）· 内置也有离线小剧场', 540, 1510, { size: 30, fill: INK }); ctx.restore(); }
  };
})();

// ====================================================== 8 彩蛋
(function () {
  const B = T0.egg, u = 30, gy = 1180;
  ev(B + .8, 'flash'); ev(B + .85, 'sparkle');
  SCN[8].fn = function (t) {
    ctx.fillStyle = '#1f1d3d'; ctx.fillRect(0, 0, W, H);
    const r = rng(5); for (let i = 0; i < 46; i++) { const x = r() * W, y = r() * H, tw = .5 + .5 * Math.sin(t * 3 + i); sprite('sparkle', x, y, 3 + r() * 3, { X: i % 3 ? '#fff' : '#F6C945' }, { alpha: .25 + .6 * tw }); }
    const shiny = t >= .8;
    if (!shiny) Object.assign(Rig.PAL, { body: '#2d2a5e', dark: '#25224f', light: '#3a3777' });
    pet({ x: 540, y: gy, u, t, mode: shiny ? 'cheer' : 'idle', pose: { shadow: .6, eye: shiny ? 'happy' : 'open', lift: shiny ? Math.abs(Math.sin((t - .8) * 6)) * 1.4 * Math.exp(-(t - .8) * .8) : 0 }, shiny });
    if (!shiny) { Rig.setPalette(false); for (let i = 0; i < 3; i++) text('?', 330 + i * 210, 760 + Math.sin(t * 3 + i * 2) * 20, { size: 140, fill: '#F6C945', stroke: '#1f1d3d', sw: 18 }); }
    else { sparkles(t, .85, 540, gy - 190, 61); sparkles(t, .95, 400, gy - 120, 62); sparkles(t, 1.0, 680, gy - 130, 63); }
    const E = { fill: '#F6E7A8', stroke: '#1f1d3d', shadow: '#6a5ad6' };
    cap(t, '还藏着好多彩蛋……', .05, .85, 430, Object.assign({}, E, { size: 80 }));
    cap(t, '遇见金色 Clawd 的概率是', 1.0, 99, 400, Object.assign({}, E, { size: 62, gap: .03 }));
    popText('1/48', 540, 570, t, 1.45, { size: 190, fill: '#F6C945', stroke: INK, sw: 28, shadow: '#6a5ad6', sd: 14, bob: 6 });
    const fl = 1 - seg(t, .8, 1.15); if (t >= .8 && fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + fl + ')'; ctx.fillRect(0, 0, W, H); }
  };
})();

// ====================================================== 9 片尾
(function () {
  const B = T0.end, u = 26, gy = 1090;
  ev(B + .3, 'pop'); ev(B + .75, 'pop'); ev(B + 1.0, 'sparkle'); ev(B + 1.5, 'heart');
  SCN[9].fn = function (t) {
    bgDots('#FFE0CC', '#FFD0B4', t); floaties(t, 91, ['#EF3F5B', '#F6C945', '#fff', '#ff9ab0'], 12);
    popText('Clawd 桌宠', 540, 440, t, .2, { size: 158, fill: ORANGE, stroke: INK, sw: 26, shadow: INK, sd: 13, gap: .06, bob: 6 });
    const tags = ['Windows', '免费', '开源'], gapT = 22; ctx.font = 'bold 42px ' + FONT;
    const ws = tags.map((s, i) => { ctx.font = 'bold 42px ' + (i === 0 ? MONO : FONT); return ctx.measureText(s).width + 64; });
    let x = 540 - (ws.reduce((a, b) => a + b, 0) + gapT * 2) / 2;
    tags.forEach((s, i) => { pill(s, x + ws[i] / 2, 610, { size: 42, scale: eob(seg(t, .75 + i * .12, 1.05 + i * .12)), fill: ['#6CC3FF', '#8bd49a', '#F6C945'][i], color: INK, mono: i === 0, padX: 64, padY: 46 }); x += ws[i] + gapT; });
    pet({ x: 540, y: gy - Math.abs(Math.sin(t * 3.2)) * 20, u, t, mode: t < 1.2 ? 'wave' : 'love', pose: { prop: t > 1.2 ? 'heart' : null, shadow: 1 } });
    hearts(t, 1.0, 540, gy - 300, 91, 6); hearts(t, 2.6, 540, gy - 300, 92, 5);
    popText('没有功能，只负责可爱', 540, 1240, t, 1.3, { size: 62, fill: INK, stroke: '#FFE0CC', sw: 14, gap: .04 });
    pill('github.com/YYZ457/clawd-pet', 540, 1370, { size: 38, scale: eob(seg(t, 1.9, 2.3)), fill: '#fff', color: INK, mono: true, padX: 70, padY: 54 });
    ctx.save(); ctx.globalAlpha = eo3(seg(t, 2.4, 2.9)) * .85;
    text('非官方粉丝作品 · 与 Anthropic 无关', 540, 1470, { size: 28, fill: INK }); text('美术全部由代码绘制 · 代码 MIT 开源', 540, 1510, { size: 28, fill: INK });
    ctx.restore();
  };
})();

// ====================================================== 总渲染(带“圆形光圈”转场)
function render(t) {
  t = clamp(t, 0, TOTAL - 1e-4);
  let i = SCN.findIndex(s => t < s.t1); if (i < 0) i = SCN.length - 1;
  const sc = SCN[i], lt = t - sc.t0, maxR = Math.hypot(W, H) * .62, cIn = .34, cOut = .34;
  let r = null;
  if (i > 0 && lt < cIn) r = sstep(lt / cIn) * maxR;
  if (i < SCN.length - 1 && sc.t1 - t < cOut) r = sstep((sc.t1 - t) / cOut) * maxR;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  if (r !== null) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.arc(sc.iris[0], sc.iris[1], Math.max(1, r), 0, 7); ctx.clip(); sc.fn(lt); ctx.restore();
  } else { ctx.save(); sc.fn(lt); ctx.restore(); }
}
for (let i = 1; i < SCN.length; i++) ev(SCN[i].t0 - .3, 'whoosh');
window.render = render; window.TOTAL = TOTAL; window.AUDIO = AUDIO; window.SCN = SCN; window.FPS = FPS;
