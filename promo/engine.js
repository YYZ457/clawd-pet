'use strict';
/* 宣传片引擎:每一帧都是 render(t) 的纯函数(没有累积状态),所以可以任意跳帧、并行渲染。 */
const W = 1080, H = 1920, FPS = 30;
const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;

const INK = '#3a2a22', ORANGE = '#D97757', ORANGE_D = '#B85C3E', CREAM = '#FFF4E6';
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const eo3 = t => 1 - Math.pow(1 - clamp(t), 3);
const ei3 = t => Math.pow(clamp(t), 3);
const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eob = t => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const seg = (t, a, b) => clamp((t - a) / (b - a));
const sgn = x => x < 0 ? -1 : 1;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// 关键帧插值 [[t,v],...]
function kf(t, k, ease = sstep) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
}

// ---------- 音效事件(视频和音频共用同一份时间表) ----------
const AUDIO = [];
const ev = (t, name, v = 1) => AUDIO.push({ t, name, v });

// ---------- 绘图小工具 ----------
const FONT = '"Noto Sans CJK SC","Microsoft YaHei","PingFang SC",sans-serif';
const MONO = '"DejaVu Sans Mono",Consolas,monospace';
function rr(x, y, w, h, r, fill, stroke, lw = 6) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function text(str, x, y, o = {}) {
  ctx.save(); ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.scale != null) ctx.scale(o.scale, o.scaleY != null ? o.scaleY : o.scale);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.font = (o.weight || 'bold') + ' ' + (o.size || 60) + 'px ' + (o.mono ? MONO : FONT);
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  if (o.shadow) { ctx.fillStyle = o.shadow; ctx.strokeStyle = o.shadow; ctx.lineWidth = o.sw || 0; const d = o.sd || 8; if (o.sw) ctx.strokeText(str, 0, d); ctx.fillText(str, 0, d); }
  if (o.stroke) { ctx.lineWidth = o.sw || 10; ctx.strokeStyle = o.stroke; ctx.strokeText(str, 0, 0); }
  ctx.fillStyle = o.fill || '#fff'; ctx.fillText(str, 0, 0);
  ctx.restore();
}
// 逐字弹出的文字:t0 开始出现,out 开始消失
function popText(str, x, y, t, t0, o = {}) {
  const gap = o.gap == null ? 0.045 : o.gap, size = o.size || 80, chars = [...str];
  ctx.font = (o.weight || 'bold') + ' ' + size + 'px ' + (o.mono ? MONO : FONT);
  const ws = chars.map(c => ctx.measureText(c).width + (o.spacing || 0));
  const total = ws.reduce((a, b) => a + b, 0);
  const outK = o.out == null ? 0 : eio(seg(t, o.out, o.out + 0.22));
  if (outK >= 1) return;
  let cx = x - total / 2;
  chars.forEach((ch, i) => {
    const ti = t - (t0 + i * gap);
    if (ti >= 0 && ch !== ' ') {
      const s = eob(ti / 0.3) * (1 - outK);
      const bob = o.bob ? Math.sin(t * 5 + i * 0.7) * o.bob : 0;
      text(ch, cx + ws[i] / 2, y + bob + outK * 30, Object.assign({}, o, { scale: s, align: 'center', rot: (o.rot || 0) + (o.wob ? Math.sin(t * 4 + i) * o.wob : 0) }));
    }
    cx += ws[i];
  });
}
// 像素贴图
const SPR = {
  heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  star: ['...X...', '...X...', '..XXX..', 'XXXXXXX', '..XXX..', '...X...', '...X...'],
  gem: ['..AAA..', '.ABBBA.', 'ABCBBBA', '.ABBBA.', '..ABA..', '...A...'],
  cookie: ['..XXX..', '.XOXXX.', 'XXXXOXX', 'XOXXXXX', 'XXXOXOX', '.XXXXX.', '..XXX..'],
  cursor: ['X...........', 'XX..........', 'XOX.........', 'XOOX........', 'XOOOX.......', 'XOOOOX......', 'XOOOOOX.....', 'XOOOOOOX....', 'XOOOOOOOX...', 'XOOOOOOOOX..', 'XOOOOOXXXXX.', 'XOOXOOX.....', 'XOX.XOOX....', 'XX..XOOX....', 'X....XOOX...', '.....XOOX...', '......XX....'],
  sparkle: ['..X..', '..X..', 'XXXXX', '..X..', '..X..']
};
function sprite(name, x, y, u, pal, o = {}) {
  const rows = SPR[name], w = rows[0].length, h = rows.length;
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); if (o.scale != null) ctx.scale(o.scale, o.scale);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  const ox = -w * u / 2, oy = -h * u / 2;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = rows[j][i]; if (c === '.') continue;
    ctx.fillStyle = pal[c] || pal.X || '#000'; ctx.fillRect(Math.round(ox + i * u), Math.round(oy + j * u), Math.ceil(u), Math.ceil(u));
  }
  ctx.restore();
}
const HEART_P = { X: '#EF3F5B' }, STAR_P = { X: '#F6C945' }, GEM_P = { A: '#2f7fb8', B: '#6CC3FF', C: '#e6f7ff' };
// 粒子:纯解析式,无状态
function burst(t, t0, x, y, o) {
  const dt = t - t0; if (dt < 0 || dt > o.life) return;
  const r = rng(o.seed || 1), a0 = o.a0 == null ? -Math.PI : o.a0, a1 = o.a1 == null ? 0 : o.a1;
  for (let i = 0; i < o.n; i++) {
    const ang = a0 + r() * (a1 - a0), sp = o.spd * (0.45 + r() * 0.75), life = o.life * (0.7 + r() * 0.3), col = o.colors ? o.colors[Math.floor(r() * o.colors.length)] : o.color, spin = (r() - .5) * 12, rot0 = r() * 6;
    if (dt > life) continue;
    const px = x + Math.cos(ang) * sp * dt, py = y + Math.sin(ang) * sp * dt + 0.5 * (o.g || 0) * dt * dt;
    if (o.kind === 'heart' || o.kind === 'star2') {
      sprite(o.kind === 'heart' ? 'heart' : 'star', px, py, (o.size || 1) * (o.kind === 'heart' ? 7 : 6), o.kind === 'heart' ? (col ? { X: col } : HEART_P) : { X: col || '#F6C945' }, { alpha: clamp(life - dt, 0, .4) / .4, scale: 0.6 + 0.4 * eob(dt / 0.25) });
    } else Rig.drawParticle(ctx, o.u || 16, 1, { k: o.kind, x: px, y: py, life: life - dt, max: life, size: o.size || 1.4, color: col, rot: rot0 + spin * dt, text: o.text, bold: true });
  }
}
// 背景:波点
function bgDots(c1, c2, t, o = {}) {
  const size = o.size || 96, r = o.r || 15, sp = o.speed == null ? 22 : o.speed;
  ctx.fillStyle = c1; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c2;
  const off = (t * sp) % size;
  for (let y = -size, row = 0; y < H + size; y += size, row++)
    for (let x = -size; x < W + size; x += size) {
      ctx.beginPath(); ctx.arc(x + (row % 2 ? size / 2 : 0) + off, y + off, r, 0, Math.PI * 2); ctx.fill();
    }
}
function floaties(t, seed, cols, n = 9) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, sp = 28 + r() * 40, ph = r() * 1000, k = r() < .5 ? 'heart' : 'star', u = 4 + r() * 4;
    const y = H + 80 - ((t * sp + ph) % (H + 160));
    sprite(k, x0 + Math.sin(t * 1.3 + i) * 24, y, u, { X: cols[i % cols.length] }, { alpha: .55 });
  }
}
// 窗口
function windowBox(x, y, w, h, o = {}) {
  ctx.save();
  if (o.rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.rot); ctx.translate(-(x + w / 2), -(y + h / 2)); }
  rr(x, y + 12, w, h, 26, 'rgba(58,42,34,.16)');
  rr(x, y, w, h, 26, o.body || '#fff', INK, 6);
  ctx.save(); ctx.beginPath(); ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 24); ctx.clip();
  ctx.fillStyle = o.bar || '#FFD9C7'; ctx.fillRect(x, y, w, o.barH || 54);
  ctx.fillStyle = INK; ctx.fillRect(x, y + (o.barH || 54) - 3, w, 5);
  ctx.restore();
  for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#FF7C96', '#F6C945', '#8bd49a'][i]; ctx.beginPath(); ctx.arc(x + 34 + i * 30, y + (o.barH || 54) / 2, 9, 0, 7); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); }
  if (o.title) text(o.title, x + w / 2, y + (o.barH || 54) / 2 + 2, { size: o.titleSize || 26, fill: INK, weight: 'bold' });
  if (o.content) { ctx.save(); ctx.translate(x, y + (o.barH || 54)); o.content(w, h - (o.barH || 54)); ctx.restore(); }
  ctx.restore();
}
function lines(w, h, col, pad = 36, n = 6, lh = 44) {
  const r = rng(7);
  for (let i = 0; i < n; i++) { const ww = (w - pad * 2) * (i === n - 1 ? .4 : .7 + r() * .3); rr(pad, pad + i * lh, ww, 16, 8, col); }
}
function cursor(x, y, o = {}) {
  if (o.ring) { ctx.save(); ctx.globalAlpha = 1 - o.ring; ctx.lineWidth = 8; ctx.strokeStyle = o.ringCol || '#fff'; ctx.beginPath(); ctx.arc(x, y, 20 + o.ring * 90, 0, 7); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.translate(x, y);
  const s = o.scale || 1; ctx.scale(s, s);
  const u = 6, rows = SPR.cursor;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] !== '.') ctx.fillRect(i * u + 5, j * u + 7, u, u);
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const c = rows[j][i]; if (c === '.') continue;
    ctx.fillStyle = c === 'X' ? INK : '#fff'; ctx.fillRect(i * u, j * u, u, u);
  }
  ctx.restore();
}
function bubble(str, x, y, o = {}) { // (x,y) = 气泡尾巴尖
  ctx.save();
  const sc = o.scale == null ? 1 : o.scale; if (sc <= 0.01) { ctx.restore(); return; }
  ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.font = 'bold ' + (o.size || 44) + 'px ' + FONT;
  const tw = Math.max(ctx.measureText(str).width, o.minW || 0), w = tw + 56, h = (o.size || 44) + 44, bx = -w / 2 + (o.shift || 0), by = -h - 30;
  rr(bx, by + 8, w, h, 26, 'rgba(58,42,34,.18)');
  ctx.beginPath(); ctx.moveTo(-14, by + h - 2); ctx.lineTo(0, 0); ctx.lineTo(18, by + h - 2); ctx.closePath();
  ctx.fillStyle = o.fill || '#fffdf8'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
  rr(bx, by, w, h, 26, o.fill || '#fffdf8', INK, 6);
  ctx.fillStyle = o.fill || '#fffdf8'; ctx.fillRect(-12, by + h - 7, 28, 10);
  text(str, bx + w / 2, by + h / 2 + 2, { size: o.size || 44, fill: INK, align: 'center' });
  ctx.restore();
}
function pill(str, x, y, o = {}) {
  ctx.font = 'bold ' + (o.size || 40) + 'px ' + (o.mono ? MONO : FONT);
  const w = ctx.measureText(str).width + (o.padX || 56), h = (o.size || 40) + (o.padY || 36);
  ctx.save(); ctx.translate(x, y); if (o.scale != null) ctx.scale(o.scale, o.scale); if (o.rot) ctx.rotate(o.rot);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (!o.flat) rr(-w / 2, -h / 2 + (o.press ? 2 : 7), w, h, h / 2, 'rgba(58,42,34,.3)');
  rr(-w / 2, -h / 2 + (o.press ? 5 : 0), w, h, h / 2, o.fill || ORANGE, INK, 5);
  text(str, 0, (o.press ? 5 : 0) + 2, { size: o.size || 40, fill: o.color || '#fff', mono: o.mono });
  ctx.restore(); return w;
}

// ---------- Clawd ----------
function blinkv(t, seed = 0) { const ph = (t + seed) % 3.4; return ph < .17 ? Math.sin(ph / .17 * Math.PI) : 0; }
function pet(o) {
  const t = o.t || 0, u = o.u || 16, p = Rig.newPose(), mode = o.mode || 'idle', face = o.face || 1;
  p.t = t; p.mt = t; p.mouth = 'smile'; p.blink = o.noBlink ? 0 : blinkv(t, o.seed || 0);
  p.sy = 1 + Math.sin(t * 3 + (o.seed || 0)) * 0.012;
  const k = o.k == null ? 0 : o.k;
  switch (mode) {
    case 'walk': case 'run': {
      const run = mode === 'run';
      p.legs = mode; p.legT = o.phase || 0; p.dy = -Math.abs(Math.sin(p.legT)) * (run ? 1.3 : 0.7); p.rot = run ? 0.09 : 0.03;
      const sw = Math.sin(p.legT); p.armL = [1, -1 - sw * 1.2, 3]; p.armR = [1, -1 + sw * 1.2, 3];
      if (run) p.mouth = 'big'; p.sy = 1; break;
    }
    case 'crouch': p.sy = 1 - 0.24 * k; p.sx = 1 + 0.14 * k; p.eye = 'happy'; p.mouth = 'smile'; p.armL = [0, 1, 3]; p.armR = [0, 1, 3]; break;
    case 'air': p.legs = 'air'; p.legLift = o.up ? 1 : -.2; p.sy = o.up ? 1.12 : 1.04; p.sx = o.up ? .92 : .97; p.armL = [1, -4, 3]; p.armR = [1, -4, 3]; p.mouth = 'big'; p.eye = o.up ? 'wide' : 'open'; p.shadow = o.shadow == null ? 0 : o.shadow; break;
    case 'land': p.sy = 1 - 0.2 * (1 - k) * Math.cos(k * 9); p.sx = 1 + 0.12 * (1 - k) * Math.cos(k * 9); p.eye = 'happy'; p.mouth = 'big'; p.armL = [1, -1, 3]; p.armR = [1, -1, 3]; break;
    case 'wave': p.eye = 'happy'; p.mouth = 'big'; p.armR = [1, -4 + Math.sin(t * 14) * 1.6, 3]; p.rot = Math.sin(t * 5) * .02; break;
    case 'cheer': p.eye = 'happy'; p.mouth = 'big'; p.armL = [1, -4 + Math.sin(t * 13) * 1, 3]; p.armR = [1, -4 + Math.sin(t * 13 + 2) * 1, 3]; p.lift = Math.abs(Math.sin(t * 6)) * 1.6; p.sy = 1; p.shadow = 1 - p.lift * .1; break;
    case 'love': p.eye = 'heart'; p.mouth = 'smile'; p.blush = 1; p.armL = [1, -2, 3]; p.armR = [1, -2, 3]; p.rot = Math.sin(t * 4) * .03; break;
    case 'hold': p.legs = 'dangle'; p.legT = t * 6; p.shadow = 0; p.eye = 'wide'; p.mouth = 'o'; p.armL = [1, -4, 3]; p.armR = [1, -4, 3]; p.rot = Math.sin(t * 7) * .06; p.sy = 1.03; break;
    case 'sleep': p.legs = 'tuck'; p.eye = 'closed'; p.mouth = null; p.hat = 'nightcap'; p.sy = 1 + Math.sin(t * 2.2) * .035; p.sx = 1 - Math.sin(t * 2.2) * .012; break;
    case 'dizzy': p.eye = 'x'; p.mouth = 'o'; p.dizzy = true; p.rot = Math.sin(t * 5) * .1; p.blush = .6; break;
    case 'spin': p.legs = 'air'; p.legLift = .4; p.eye = '><'; p.mouth = 'o'; p.armL = [1, -3, 3]; p.armR = [1, -3, 3]; p.shadow = 0; break;
  }
  if (o.pose) Object.assign(p, o.pose);
  if (o.shiny) Rig.setPalette(true);
  Rig.drawPet(ctx, u, o.x, o.y, p, face);
  if (o.shiny) Rig.setPalette(false);
}

// ---------- 路径:走/跳/等,自动生成脚步姿势和音效事件 ----------
class Path {
  constructor(x, y, face = 1) { this.x = x; this.y = y; this.face = face; this.T = 0; this.s = []; this.dist = 0; this.ev = []; }
  stay(d, o = {}) { if (o.face) this.face = o.face; this.s.push({ k: 'stay', t0: this.T, t1: this.T + d, x: this.x, y: this.y, face: this.face, mode: o.mode || 'idle', o }); this.T += d; return this; }
  walk(x1, d, o = {}) {
    const f = sgn(x1 - this.x); this.s.push({ k: 'walk', t0: this.T, t1: this.T + d, x0: this.x, x1, y: this.y, face: f, run: !!o.run, d0: this.dist }); this.dist += Math.abs(x1 - this.x);
    this.x = x1; this.face = f; this.T += d; return this;
  }
  jump(x1, y1, d, h, o = {}) {
    const cr = o.crouch == null ? 0.2 : o.crouch, ld = o.land == null ? 0.28 : o.land, f = sgn(x1 - this.x) || this.face;
    this.s.push({ k: 'crouch', t0: this.T, t1: this.T + cr, x: this.x, y: this.y, face: f });
    this.s.push({ k: 'air', t0: this.T + cr, t1: this.T + cr + d, x0: this.x, y0: this.y, x1, y1, h, face: f });
    this.ev.push({ t: this.T + cr, name: 'boing' }, { t: this.T + cr + d, name: 'land' });
    this.s.push({ k: 'land', t0: this.T + cr + d, t1: this.T + cr + d + ld, x: x1, y: y1, face: f });
    this.T += cr + d + ld; this.x = x1; this.y = y1; this.face = f; return this;
  }
  get end() { return this.T; }
  at(t, u = 16) {
    const S = this.s; let s = S[S.length - 1];
    for (const q of S) if (t < q.t1) { s = q; break; }
    const k = clamp((t - s.t0) / Math.max(1e-6, s.t1 - s.t0));
    switch (s.k) {
      case 'stay': return { x: s.x, y: s.y, face: s.face, mode: s.mode, k, state: 'stay' };
      case 'walk': { const e = 0.85 * k + 0.15 * sstep(k); const x = lerp(s.x0, s.x1, e); return { x, y: s.y, face: s.face, mode: s.run ? 'run' : 'walk', phase: (s.d0 + Math.abs(x - s.x0)) / (6 * u) * Math.PI, k, state: 'walk', moving: k < 1 }; }
      case 'crouch': return { x: s.x, y: s.y, face: s.face, mode: 'crouch', k: sstep(k), state: 'crouch' };
      case 'air': {
        const x = lerp(s.x0, s.x1, k), y = lerp(s.y0, s.y1, k) - s.h * 4 * k * (1 - k), vy = (s.y1 - s.y0) - 4 * s.h * (1 - 2 * k);
        return { x, y, face: s.face, mode: 'air', up: vy < 0 && k < .6, k, state: 'air', shadowY: lerp(s.y0, s.y1, k) };
      }
      case 'land': return { x: s.x, y: s.y, face: s.face, mode: 'land', k, state: 'land' };
    }
  }
}
function addEvents(path, base) { for (const e of path.ev) ev(base + e.t, e.name); }
