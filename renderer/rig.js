'use strict';
/* Clawd 像素小人:全部用矩形程序化绘制,所以任何姿势都能"拼"出来,不需要美术素材。
   坐标单位 = 1 个"像素格"(unit);原点在脚底中心,y 向上为负。 */
const Rig = (() => {
  const PAL = {};
  let SKIN = 'clawd', SHINY = false, VAR = 'A';
  const SKIN_PAL = {
    clawd: [{ body: '#D97757', dark: '#B85C3E', light: '#EC9D80', belly: '#EC9D80' }, { body: '#F6BE2C', dark: '#CF9412', light: '#FFE488', belly: '#FFE488' }],
    whale: [{ body: '#4D6BFE', dark: '#3550D8', light: '#8FA3FF', belly: '#DCE4FF' }, { body: '#F6BE2C', dark: '#CF9412', light: '#FFE488', belly: '#FFF4CF' }]
  };
  function setPalette(shiny) { SHINY = !!shiny; Object.assign(PAL, SKIN_PAL[SKIN][SHINY ? 1 : 0]); }
  function setSkin(id, variant) { SKIN = SKIN_PAL[id] ? id : 'clawd'; if (variant) VAR = variant; setPalette(SHINY); }
  Object.assign(PAL, {
    eye: '#1f1a17', white: '#ffffff', blush: '#FF7C96', heart: '#EF3F5B',
    tear: '#6CC3FF', red: '#D6403A', green: '#4b9a4a', blue: '#4f6bd8', gold: '#F6C945'
  });
  setPalette(false);

  function newPose() {
    return {
      dy: 0, lift: 0, sx: 1, sy: 1, rot: 0, pivot: [0, -6],
      legs: 'stand', legT: 0, legLift: 0,
      armL: [0, 0, 3], armR: [0, 0, 3],
      eye: 'open', ex: 0, ey: 0, blink: 0, mouth: null, blush: 0, tears: false,
      hat: null, prop: null, propT: 1, shadow: 1, dizzy: false, t: 0, mt: 0
    };
  }

  const LEGX = [-6, -3, 1, 4];
  function legGeom(p) {
    const m = p.legs, T = p.legT, legs = [];
    let bb = -3;
    if (m === 'tuck') bb = -1;
    if (m === 'edge') bb = 0;
    for (let i = 0; i < 4; i++) {
      let x = LEGX[i], y = -3, h = 3;
      const pair = (i === 0 || i === 3) ? 0 : Math.PI;
      if (m === 'walk' || m === 'run') {
        const s = Math.sin(T + pair), run = m === 'run';
        y = -3 - Math.max(0, s) * (run ? 2.4 : 1.4);
        x += Math.cos(T + pair) * (run ? 0.9 : 0.5);
      } else if (m === 'tuck') { y = -1; h = 1; }
      else if (m === 'air') { y = -3 - p.legLift * 1.5; x += (i < 2 ? -1 : 1) * Math.abs(p.legLift) * 0.8; }
      else if (m === 'dangle') { x += Math.sin(T + i * 0.9) * 1.1; y = -3 - Math.max(0, Math.sin(T + i)) * 0.6; }
      else if (m === 'edge') { x += Math.sin(T + pair) * 0.9; y = 0 + Math.max(0, -Math.sin(T + pair)) * 0.5; }
      legs.push([x, y, 2, h]);
    }
    return { bb, legs };
  }

  function drawPet(ctx, u, px, py, p, face) {
    const rx = v => Math.round(v * u);
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    if (p.alpha != null && p.alpha < 1) { if (p.alpha <= 0.01) { ctx.restore(); return; } ctx.globalAlpha = p.alpha; }

    // 影子(不受翻转/旋转影响)
    if (p.shadow > 0.02) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.16 * p.shadow).toFixed(3) + ')';
      const sw = 15 * u * (0.55 + 0.45 * p.shadow);
      ctx.beginPath();
      ctx.ellipse(0, 0, sw / 2, 1.5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(0, -Math.round(p.lift * u));
    ctx.scale(face * p.sx, p.sy);
    ctx.translate(rx(p.pivot[0]), rx(p.pivot[1]));
    ctx.rotate(p.rot * face);
    ctx.translate(-rx(p.pivot[0]), -rx(p.pivot[1]));

    const R = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      const X = rx(x), Y = rx(y);
      ctx.fillRect(X, Y, rx(x + w) - X, rx(y + h) - Y);
    };
    R.ga = a => { ctx.globalAlpha = Math.min(1, a) * (p.alpha != null ? p.alpha : 1); };
    if (SKIN === 'whale') { drawWhale(R, p); ctx.restore(); return; }
    const { bb, legs } = legGeom(p);
    const B = bb + p.dy;     // 身体底部
    const top = B - 8;

    // 腿
    for (const l of legs) R(l[0], l[1] + (p.legs === 'edge' ? 0 : p.dy * 0), l[2], l[3], PAL.body);
    // 腿的暗部
    for (const l of legs) R(l[0], l[1] + l[3] - 1, l[2], 1, PAL.dark);

    // 背后的东西
    if (p.prop === 'balloon') {
      const sway = Math.sin(p.t * 2) * 1.2;
      R(10, B - 26, 1, 22, '#e8e2dc');
      R(6 + sway, B - 36, 9, 10, PAL.red);
      R(5 + sway, B - 34, 11, 6, PAL.red);
      R(8 + sway, B - 34, 2, 2, '#ff9d97');
      R(9.5 + sway, B - 26, 2, 1, '#a82b27');
    }

    // 身体
    R(-6, top, 12, 1, PAL.body);
    R(-7, top + 1, 14, 6, PAL.body);
    R(-6, B - 1, 12, 1, PAL.dark);
    R(-5, top + 1, 3, 1, PAL.light);

    // 脸
    if (p.blush > 0.02) {
      ctx.globalAlpha = Math.min(1, p.blush);
      R(-6, B - 3, 2, 1, PAL.blush); R(4, B - 3, 2, 1, PAL.blush);
      ctx.globalAlpha = 1;
    }
    drawEyes(R, p, B);
    if (p.glasses === 'shades') {
      R(-5, B - 6, 4, 3, '#15151a'); R(1, B - 6, 4, 3, '#15151a'); R(-1, B - 6, 2, 1, '#15151a');
      R(-4, B - 6, 1, 1, '#6d6d7a'); R(2, B - 6, 1, 1, '#6d6d7a');
    }
    drawMouth(R, p, B);
    if (p.tears) {
      const o = Math.floor((p.t * 7) % 4);
      R(-4, B - 3 + o, 1, 2, PAL.tear); R(3, B - 3 + ((o + 2) % 4), 1, 2, PAL.tear);
    }

    // 手臂
    const aL = p.armL, aR = p.armR;
    R(-9 - aL[0], B - 5 + aL[1], 2, aL[2], PAL.body);
    R(7 + aR[0], B - 5 + aR[1], 2, aR[2], PAL.body);

    drawProp(R, p, B);
    drawHat(R, p, top);

    if (p.dizzy) {
      for (let i = 0; i < 3; i++) {
        const a = p.t * 6 + i * 2.1;
        const sx = Math.cos(a) * 8, sy = top - 3 + Math.sin(a) * 1.8;
        R(sx - 1, sy, 3, 1, PAL.gold); R(sx, sy - 1, 1, 3, PAL.gold);
      }
    }
    ctx.restore();
  }

  function drawEyes(R, p, B) {
    const e = p.eye, ex = Math.round(p.ex), ey = Math.round(p.ey);
    const L = -4 + ex, Rr = 2 + ex;
    const bot = B - 3 + ey; // 眼睛底部(开区间)
    const E = PAL.eye;
    if (e === 'open' || e === 'wide' || e === 'angry' || e === 'sad') {
      let h = e === 'wide' ? 4 : 3;
      h = Math.max(1, Math.round(h * (1 - p.blink)));
      const y = bot - h;
      R(L, y, 2, h, E); R(Rr, y, 2, h, E);
      if (h >= 3 && e !== 'angry') { R(L + 1, y, 1, 1, PAL.white); R(Rr + 1, y, 1, 1, PAL.white); }
      if (e === 'angry') {
        R(L - 1, y - 2, 2, 1, E); R(L + 1, y - 1, 2, 1, E);
        R(Rr + 1, y - 2, 2, 1, E); R(Rr - 1, y - 1, 2, 1, E);
      } else if (e === 'sad') {
        R(L - 1, y - 1, 2, 1, E); R(L + 1, y - 2, 2, 1, E);
        R(Rr + 1, y - 1, 2, 1, E); R(Rr - 1, y - 2, 2, 1, E);
      }
    } else if (e === 'happy') {          // ^ ^
      const y = B - 6 + ey;
      for (const x0 of [-5 + ex, 2 + ex]) { R(x0, y + 1, 1, 1, E); R(x0 + 1, y, 2, 1, E); R(x0 + 3, y + 1, 1, 1, E); }
    } else if (e === 'closed') {          // - -
      R(-5 + ex, B - 4, 3, 1, E); R(2 + ex, B - 4, 3, 1, E);
    } else if (e === 'x') {
      for (const x0 of [-5 + ex, 2 + ex]) {
        const y = B - 6;
        R(x0, y, 1, 1, E); R(x0 + 2, y, 1, 1, E); R(x0 + 1, y + 1, 1, 1, E); R(x0, y + 2, 1, 1, E); R(x0 + 2, y + 2, 1, 1, E);
      }
    } else if (e === 'heart') {
      const pulse = 1 + (Math.sin(p.t * 9) > 0 ? 0 : 0);
      for (const x0 of [-6, 1]) {
        const y = B - 7;
        R(x0 + 1, y, 1, 1, PAL.heart); R(x0 + 3, y, 1, 1, PAL.heart);
        R(x0, y + 1, 5, 1, PAL.heart); R(x0 + 1, y + 2, 3, 1, PAL.heart); R(x0 + 2, y + 3, 1, 1, PAL.heart);
      }
    } else if (e === 'dots') {            // 小圆点眼(发呆)
      R(L, bot - 2, 1, 1, E); R(Rr + 1, bot - 2, 1, 1, E);
    } else if (e === '><') {              // > <
      const y = B - 6;
      R(-5, y, 1, 1, E); R(-4, y + 1, 1, 1, E); R(-5, y + 2, 1, 1, E);
      R(4, y, 1, 1, E); R(3, y + 1, 1, 1, E); R(4, y + 2, 1, 1, E);
    }
  }

  function drawMouth(R, p, B) {
    const m = p.mouth, E = PAL.eye;
    if (!m) return;
    if (m === 'smile') { R(-2, B - 3, 1, 1, E); R(-1, B - 2, 2, 1, E); R(1, B - 3, 1, 1, E); }
    else if (m === 'o') { R(-1, B - 3, 2, 2, E); }
    else if (m === 'big') { R(-2, B - 3, 4, 2, E); R(-1, B - 2, 2, 1, '#e8647a'); }
    else if (m === 'yawn') { R(-2, B - 4, 4, 3, E); R(-1, B - 2, 2, 1, '#e8647a'); }
    else if (m === 'frown') { R(-1, B - 3, 2, 1, E); R(-2, B - 2, 1, 1, E); R(1, B - 2, 1, 1, E); }
    else if (m === 'flat') { R(-1, B - 2, 2, 1, E); }
    else if (m === 'munch') {
      const o = Math.sin(p.t * 16) > 0 ? 2 : 1;
      R(-1, B - 3, 2, o, E);
    } else if (m === 'cat') { R(-2, B - 3, 1, 1, E); R(-1, B - 2, 1, 1, E); R(0, B - 3, 1, 1, E); R(1, B - 2, 1, 1, E); R(2, B - 3, 1, 1, E); }
  }

  function drawHat(R, p, top) {
    const h = p.hat;
    if (!h) return;
    if (h === 'santa') {
      R(-6, top - 1, 12, 2, PAL.white);
      R(-5, top - 3, 10, 2, PAL.red);
      R(-4, top - 5, 9, 2, PAL.red);
      R(-2, top - 7, 8, 2, PAL.red);
      R(5, top - 8, 3, 3, PAL.white);
    } else if (h === 'party') {
      R(-4, top - 2, 8, 2, '#ff7ab6'); R(-3, top - 4, 6, 2, '#ffd23f');
      R(-2, top - 6, 4, 2, '#ff7ab6'); R(-1, top - 8, 2, 2, '#ffd23f'); R(-1, top - 10, 2, 2, PAL.white);
    } else if (h === 'pumpkin') {
      R(-5, top - 3, 10, 4, '#F28C28'); R(-6, top - 2, 12, 2, '#F28C28');
      R(-3, top - 3, 1, 4, '#c96a14'); R(2, top - 3, 1, 4, '#c96a14');
      R(-1, top - 5, 2, 2, PAL.green);
    } else if (h === 'nightcap') {
      R(-6, top - 1, 12, 2, PAL.white);
      R(-5, top - 3, 10, 2, PAL.blue); R(-4, top - 5, 8, 2, PAL.blue);
      R(1, top - 6, 6, 2, PAL.blue); R(6, top - 5, 3, 4, PAL.blue); R(7, top - 2, 3, 3, PAL.white);
    } else if (h === 'crown') {
      R(-5, top - 3, 10, 3, PAL.gold); R(-5, top - 5, 2, 2, PAL.gold); R(-1, top - 6, 2, 3, PAL.gold); R(3, top - 5, 2, 2, PAL.gold);
      R(-1, top - 2, 2, 1, PAL.red);
    } else if (h === 'redcap') {
      R(-6, top - 1, 12, 2, PAL.gold); R(-5, top - 3, 10, 2, PAL.red); R(-4, top - 5, 8, 2, PAL.red);
      R(-1, top - 3, 2, 1, PAL.gold); R(-1, top - 6, 2, 2, PAL.gold);
    } else if (h === 'bow') {
      R(-1, top - 2, 2, 2, '#ff6fa0'); R(-4, top - 3, 3, 3, '#ff6fa0'); R(1, top - 3, 3, 3, '#ff6fa0');
    }
  }

  function drawProp(R, p, B) {
    const pr = p.prop;
    if (!pr || pr === 'balloon') return;
    if (pr === 'book') {
      R(-7, B - 3, 14, 5, '#3b6fb6'); R(-6, B - 2, 5, 3, '#fbf7ee'); R(1, B - 2, 5, 3, '#fbf7ee'); R(-1, B - 3, 2, 5, '#274f86');
      R(-5, B - 1, 3, 1, '#c9c2b6'); R(2, B - 1, 3, 1, '#c9c2b6');
    } else if (pr === 'laptop') {
      R(-8, B - 3, 16, 5, '#7b8089'); R(-8, B - 3, 16, 1, '#a6abb3'); R(-9, B + 2, 18, 1, '#585c63');
      R(-1, B - 1, 3, 1, PAL.body); R(0, B - 2, 1, 3, PAL.body);
    } else if (pr === 'mug') {
      R(8, B - 8, 5, 5, PAL.white); R(8, B - 8, 5, 1, '#6b3f2a'); R(13, B - 7, 1, 3, PAL.white); R(8, B - 4, 5, 1, '#d8d2c8');
    } else if (pr === 'cookie') {
      const n = Math.max(0, p.propT);
      if (n <= 0.02) return;
      const w = Math.max(1, Math.round(6 * n));
      R(3 + (6 - w) / 2, B - 6 + (6 - w) / 2, w, w, '#d9a65f');
      if (w >= 4) { R(4, B - 5, 1, 1, '#5b3a22'); R(6, B - 3, 1, 1, '#5b3a22'); R(7, B - 5, 1, 1, '#5b3a22'); }
    } else if (pr === 'flower') {
      R(10, B - 7, 1, 7, PAL.green); R(11, B - 4, 2, 1, PAL.green);
      R(9, B - 11, 3, 3, '#ff7aa8'); R(10, B - 12, 1, 5, '#ff7aa8'); R(8, B - 10, 5, 1, '#ff7aa8'); R(10, B - 10, 1, 1, '#ffd23f');
    } else if (pr === 'sign') {
      R(8, B - 14, 12, 7, '#f3e3b4'); R(8, B - 14, 12, 1, '#a07838'); R(8, B - 8, 12, 1, '#a07838'); R(13, B - 7, 1, 9, '#a07838');
    } else if (pr === 'heart') {
      const y = B - 13;
      R(9, y, 2, 1, PAL.heart); R(12, y, 2, 1, PAL.heart); R(8, y + 1, 7, 2, PAL.heart); R(9, y + 3, 5, 1, PAL.heart); R(10, y + 4, 3, 1, PAL.heart); R(11, y + 5, 1, 1, PAL.heart);
    }
  }


  // ---------------- 大肥鱼(蓝色胖鲸鱼,参考 DeepSeek 图标):和 Clawd 共用同一套 pose ----------------
  // 侧面像,前方 = +x。整只鲸鱼是一张 22x16 的像素图(由图标缩小后手工修整):
  //   # 身体  w 白色月牙(嘴/肚皮)  e 眼白  p 瞳孔  t 尾巴(会摆)
  // 没有腿:legs 状态改成 蹦跶 / 压扁 / 拉长 / 甩尾;armL/armR 画成胸鳍(平时收着,动起来才露出来)。
  const WHALE = [
    '......t...............',
    '.....tt....######.....',
    'ttt.ttt...##########..',
    'ttttttt..############.',
    '.ttttt..#############.',
    '...tt..###############',
    '...#######eee#####wwww',
    '....######epp####wwww#',
    '....######epp###wwwww#',
    '....############wwwww#',
    '.....#########wwwwww#.',
    '.....########wwwwwww#.',
    '......######ww##wwww..',
    '.....######ww##wwww#..',
    '.....##############...',
    '..........#######.....'
  ];
  const WX = -12, WROWS = WHALE.length;           // 第 c 列 → x = c + WX;最后一行 → y = -1
  function drawWhale(R, p) {
    const m = p.legs, T = p.legT, E = PAL.eye, WH = PAL.white;
    let hop = 0, wag = Math.sin(p.t * 2.2) * 0.8, squash = 0;
    if (m === 'walk' || m === 'run') { hop = Math.abs(Math.sin(T)) * (m === 'run' ? 2.2 : 1.2); wag = Math.sin(T) * 1.4; }
    else if (m === 'air') wag = Math.max(-1.5, Math.min(1.5, (p.legLift || 0) * 1.5));
    else if (m === 'dangle') wag = Math.sin(T) * 1.6;
    else if (m === 'edge') wag = Math.sin(T * 0.6);
    if (m === 'tuck') squash = 2; else if (m === 'edge') squash = 1;
    squash += Math.round(p.dy || 0);                 // dy>0 压扁, dy<0 拉长
    squash = Math.max(-2, Math.min(3, squash));
    const air = m === 'air' || m === 'dangle';
    const base = -Math.round(hop) + (air ? -2 : 0);  // 整体底部
    // 行映射:压扁时去掉中间几行,拉长时重复中间一行
    const rows = [];
    for (let r = 0; r < WROWS; r++) {
      if (squash > 0 && r >= 9 && r < 9 + squash) continue;
      rows.push(r); if (squash < 0 && r === 9) for (let k = 0; k < -squash; k++) rows.push(r);
    }
    const n = rows.length, Y = i => base - (n - i);   // 第 i 个输出行的 y
    const rowY = {}; rows.forEach((r, i) => { if (rowY[r] == null) rowY[r] = Y(i); });
    const top = Y(1), B = rowY[8] + 5;              // B:和 Clawd 一样的"脸基线",眼睛在 B-6..B-3 附近

    if (p.prop === 'balloon') {
      const sway = Math.sin(p.t * 2) * 1.2;
      R(10, B - 26, 1, 22, '#e8e2dc'); R(6 + sway, B - 36, 9, 10, PAL.red); R(5 + sway, B - 34, 11, 6, PAL.red);
      R(8 + sway, B - 34, 2, 2, '#ff9d97'); R(9.5 + sway, B - 26, 2, 1, '#a82b27');
    }
    const w = Math.round(wag), LC = SHINY ? PAL.belly : WH;
    const eyeOpen = (p.eye === 'open' || p.eye === 'wide' || p.eye === 'angry' || p.eye === 'sad') && p.blink < 0.6;
    for (let i = 0; i < n; i++) {
      const line = WHALE[rows[i]], y = Y(i);
      for (let c = 0; c < line.length; c++) {
        const ch = line[c]; if (ch === '.') continue;
        const x = c + WX;
        if (ch === 't') { R(x, y + (c < 4 ? w : (c < 6 ? Math.round(w / 2) : 0)), 1, 1, PAL.body); continue; }
        let col = PAL.body;
        if (ch === 'w') col = LC;
        else if ((ch === 'e' || ch === 'p') && eyeOpen) col = ch === 'p' ? E : WH;
        R(x, y, 1, 1, col);
      }
    }
    // 眼睛:睁眼时用像素图里的白眼珠 + 瞳孔(随视线挪 1 格);其他表情借用 Clawd 的单只眼画法
    const ex = Math.max(-1, Math.min(1, Math.round(p.ex))), ey = Math.max(-1, Math.min(1, Math.round(p.ey)));
    const eyX = -2, eyY = rowY[6];
    if (eyeOpen) {
      R(eyX, eyY, 3, 3, WH);
      R(eyX + 1 + Math.min(0, ex), eyY + 1 + Math.min(0, ey), 2, 2, E);
      if (p.eye === 'wide') R(eyX - 1, eyY - 1, 3, 1, WH);
      if (p.eye === 'angry') { R(eyX - 2, eyY - 2, 2, 1, E); R(eyX, eyY - 1, 2, 1, E); }
      if (p.eye === 'sad') { R(eyX - 2, eyY - 1, 2, 1, E); R(eyX, eyY - 2, 2, 1, E); }
    } else {
      const pe = Object.assign({}, p, { ex: 0, ey: 0 });
      if (pe.eye === 'open' || pe.eye === 'wide' || pe.eye === 'angry' || pe.eye === 'sad') pe.eye = 'closed';
      // Clawd 的右眼画在 x≥0、y≈B-6..B-3;平移到大肥鱼的眼睛位置
      const dx = eyX - 3, dy = (eyY + 3) - (B - 3);
      drawEyes((x, y, ww, hh, c) => { if (x >= 0) R(x + dx, y + dy, ww, hh, c); }, pe, B);
    }
    if (p.blush > 0.02) { R.ga && R.ga(p.blush); R(eyX - 1, eyY + 4, 2, 1, PAL.blush); R.ga && R.ga(1); }
    if (p.glasses === 'shades') { R(eyX - 2, eyY, 5, 3, '#15151a'); R(eyX + 3, eyY, 5, 1, '#15151a'); R(eyX - 1, eyY, 1, 1, '#6d6d7a'); }
    if (p.tears) { const o = Math.floor((p.t * 7) % 4); R(eyX, eyY + 3 + o, 1, 2, PAL.tear); }
    // 嘴:白色月牙本身就是笑着的嘴;其他嘴型画在最前端的嘴角上(小小的,不抢眼睛)
    const mo = p.mouth, mx = 8, my = rowY[6];
    if (mo === 'o') R(mx, my, 2, 2, E);
    else if (mo === 'big') { R(mx - 1, my, 3, 2, E); R(mx, my + 2, 2, 1, '#e8647a'); }
    else if (mo === 'yawn') { R(mx - 1, my, 3, 3, E); R(mx, my + 2, 2, 1, '#e8647a'); }
    else if (mo === 'frown') { R(mx - 2, my, 4, 1, PAL.body); R(mx - 1, my + 1, 2, 1, E); R(mx - 2, my + 2, 1, 1, E); }
    else if (mo === 'flat') { R(mx - 2, my, 4, 1, PAL.body); R(mx - 2, my + 1, 4, 1, E); }
    else if (mo === 'munch') R(mx, my, 2, Math.sin(p.t * 16) > 0 ? 2 : 1, E);
    else if (mo === 'cat') { R(mx - 2, my, 4, 1, PAL.body); R(mx - 2, my + 1, 1, 1, E); R(mx - 1, my + 2, 1, 1, E); R(mx, my + 1, 1, 1, E); R(mx + 1, my + 2, 1, 1, E); }
    // 喷水(头顶的气孔)
    const spout = p.spout || (p.mouth === 'big' && p.eye === 'happy') || (m === 'stand' && (p.t % 13) < 1.1 && !p.hat);
    if (spout) {
      const k = Math.floor(p.t * 8) % 2, W = '#8fd3ff', W2 = '#e6f7ff', sx = 1;
      R(sx, top - 2, 1, 2, W); R(sx, top - 4, 1, 2, W2);
      R(sx - 1 - k, top - 5, 1, 1, W); R(sx + 1 + k, top - 5, 1, 1, W); R(sx - 2 - k, top - 4, 1, 1, W2); R(sx + 2 + k, top - 4, 1, 1, W2);
    }
    // 胸鳍(= 手臂):平时收在身体里,动起来才露出来
    const fin = (x, a, side) => {
      if (!a[0] && !a[1] && a[2] === 3) return;
      const y = B - 5 + a[1], up = a[1] < -2;
      R(x, y, 2, a[2], PAL.dark);
      R(x + (side > 0 ? 2 : -1), up ? y : y + a[2] - 1, 1, 1, PAL.dark);
    };
    fin(-9 - p.armL[0], p.armL, -1);
    fin(9 + p.armR[0], p.armR, 1);
    drawProp(R, p, B);
    drawHat((x, y, ww, hh, c) => R(x + 2, y, ww, hh, c), p, top + 1);
    if (p.dizzy) {
      for (let i = 0; i < 3; i++) {
        const a = p.t * 6 + i * 2.1, sx = 2 + Math.cos(a) * 8, sy = top - 3 + Math.sin(a) * 1.8;
        R(sx - 1, sy, 3, 1, PAL.gold); R(sx, sy - 1, 1, 3, PAL.gold);
      }
    }
  }

  // ---------------- 粒子 ----------------
  function drawParticle(ctx, u, dpr, q) {
    const a = Math.max(0, Math.min(1, q.life / Math.min(0.4, q.max)));
    if (a <= 0) return;
    ctx.globalAlpha = a * (q.alpha == null ? 1 : q.alpha);
    const x = Math.round(q.x * dpr), y = Math.round(q.y * dpr);
    const s = Math.max(1, Math.round((q.size || 1) * u * 0.5));
    const R = (dx, dy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx * s, y + dy * s, w * s, h * s); };
    switch (q.k) {
      case 'heart':
        R(-2, -2, 1, 1, PAL.heart); R(1, -2, 1, 1, PAL.heart);
        R(-3, -1, 5, 1, PAL.heart); R(-2, 0, 3, 1, PAL.heart); R(-1, 1, 1, 1, PAL.heart);
        R(-2, -2, 1, 1, PAL.heart); R(-1, -1, 1, 1, '#ff9aa9');
        break;
      case 'star': R(-1, 0, 3, 1, q.color || PAL.gold); R(0, -1, 1, 3, q.color || PAL.gold); R(0, 0, 1, 1, '#fff6c8'); break;
      case 'spark': R(-1, 0, 3, 1, q.color || '#fff'); R(0, -1, 1, 3, q.color || '#fff'); break;
      case 'dust': R(0, 0, 2, 2, q.color || 'rgba(255,255,255,.8)'); break;
      case 'crumb': R(0, 0, 1, 1, q.color || '#d9a65f'); break;
      case 'tear': R(0, 0, 1, 2, PAL.tear); break;
      case 'confetti': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot || 0);
        ctx.fillStyle = q.color; ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2); ctx.restore(); break;
      }
      case 'text': {
        ctx.font = (q.bold ? 'bold ' : '') + Math.round((q.size || 1) * u * 3.4) + 'px "Segoe UI Emoji","Apple Color Emoji","Microsoft YaHei UI","Noto Sans CJK SC","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = q.color || '#fff';
        if (q.rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot); ctx.fillText(q.text, 0, 0); ctx.restore(); }
        else ctx.fillText(q.text, x, y);
        break;
      }
      case 'steam': ctx.globalAlpha *= 0.55; R(0, 0, 1, 3, '#fff'); break;
    }
    ctx.globalAlpha = 1;
  }

  function drawCritter(ctx, u, dpr, c, t) {
    const x = Math.round(c.x * dpr), y = Math.round(c.y * dpr), s = Math.max(2, Math.round(u * (c.kind === 'bug' ? 0.7 : 0.8)));
    const R = (dx, dy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + dx * s, y + dy * s, w * s, h * s); };
    if (c.kind === 'bug') {
      const f = Math.floor(t * (c.fast ? 24 : 9)) % 2, d = c.dir || 1;
      R(-2, -2, 4, 2, '#2d2a28'); R(d > 0 ? 1 : -3, -3, 2, 1, '#2d2a28'); R(-1, -2, 1, 1, '#c0392b'); R(1, -2, 1, 1, '#c0392b');
      R(-2 + f, 0, 1, 1, '#2d2a28'); R(0 - f, 0, 1, 1, '#2d2a28'); R(2 - f, 0, 1, 1, '#2d2a28');
    } else {
      const f = Math.floor(t * 14) % 3, wing = c.color || '#7ad0ff', wing2 = c.color2 || '#ffffff';
      const h = f === 0 ? 3 : f === 1 ? 2 : 1;
      R(0, -1, 1, 3, '#3a2a22');
      R(-3, -h, 3, h, wing); R(1, -h, 3, h, wing); R(-2, 0, 2, 2, wing2); R(1, 0, 2, 2, wing2);
    }
    ctx.fillStyle = 'rgba(0,0,0,.08)';
  }

  function drawBall(ctx, u, dpr, b) {
    const x = Math.round(b.x * dpr), y = Math.round(b.y * dpr), r = Math.round(2.4 * u);
    ctx.save(); ctx.translate(x, y - r); ctx.rotate(b.rot || 0);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.red; ctx.beginPath(); ctx.arc(0, 0, r, -0.4, 1.2); ctx.lineTo(0, 0); ctx.fill();
    ctx.fillStyle = PAL.blue; ctx.beginPath(); ctx.arc(0, 0, r, 2.7, 4.3); ctx.lineTo(0, 0); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  }

  return { newPose, drawPet, drawParticle, drawBall, drawCritter, setPalette, setSkin, skin: () => SKIN, PAL };
})();
if (typeof module !== 'undefined') module.exports = Rig;
