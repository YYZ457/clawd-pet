'use strict';
/* 像素道具库:一批内置的手绘像素图(热气球、云、梯子、宝箱……),加上大模型即时设计的"自定义像素图"的绘制。
   所有图都是字符画:一个字符 = 一个像素,'.' = 透明,字符对应调色板(默认调色板见 DEF,自定义图可以覆盖)。
   既能在渲染进程里画,也能在 Node 里取名字列表(给提示词用)。
   v1.6:大模型逐字写字符画很容易画歪,所以多了三条更稳的路:
     fromEmoji  任何 emoji → 自动缩成像素风道具(颜色量化),模型只要说出 emoji
     fromShapes 用几何形状(矩形/圆/椭圆/三角/多边形/线)拼图,程序栅格化成像素并自动加明暗、描边、对称
     fromRows   字符画的自动修复:行宽对齐、未知字母兜底配色、对称补全、自动明暗
   另外模型写的未知道具名(bicycle、吉他…)会自动映射到 emoji。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Props = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 默认调色板:大写 = 亮色,小写 = 同色系的暗部
  const DEF = {
    K: '#2b211c', D: '#3a2a22', W: '#ffffff', w: '#e4dfd6', L: '#f7e6c4',
    R: '#e04b4b', r: '#a82e2e', O: '#f2994a', o: '#c26a1b', Y: '#f6c945', y: '#c9961a',
    G: '#4caf50', g: '#2e7d32', B: '#4f8fe0', b: '#2f5fa8', P: '#b06fd6', p: '#7b42a6',
    N: '#8b5a3c', n: '#5e3a24', S: '#9aa3ad', s: '#69727c', C: '#6cc3ff', c: '#bfe9ff',
    M: '#ff8fb8', m: '#d6608f', T: '#d9a65f', t: '#a9773a'
  };
  const lib = {};
  const def = (name, rows, anchor, extra) => { lib[name] = Object.assign({ name, rows, anchor: anchor || 'b' }, extra || {}); };
  const gen = (w, h, fn) => { const rows = []; for (let y = 0; y < h; y++) { let s = ''; for (let x = 0; x < w; x++) s += fn(x, y) || '.'; rows.push(s); } return rows; };

  // ---------------- 天上飘的
  def('balloon', ['..RRRR..', '.RRRRRR.', 'RRwRRRRR', 'RRwRRRRR', 'RRRRRRRR', 'RRRRRRrR', 'RRRRRRrr', '.RRRRrr.', '..RRrr..', '...RR...', '...rr...'], 'c');
  def('hotballoon', (() => {
    const W = 18, widths = [8, 12, 14, 16, 18, 18, 18, 18, 18, 18, 16, 14, 12, 10, 8];
    const rows = widths.map((wd, i) => {
      let s = ''; const off = (W - wd) / 2;
      for (let x = 0; x < W; x++) {
        if (x < off || x >= off + wd) { s += '.'; continue; }
        const stripe = (x < 5 || x >= 13) ? 'R' : (x < 7 || x >= 11 ? 'Y' : 'W');
        const edge = x >= off + wd - 2 ? stripe.toLowerCase() : (x === off + 1 && i > 0 && i < 8 ? 'W' : stripe);
        s += edge === 'w' && stripe === 'W' ? 'w' : edge;
      }
      return s;
    });
    const rope = '.......s.....s.......'.slice(0, 18).padEnd(18, '.');
    const r2 = '.....s.......s.....'.slice(0, 18);
    rows.push('.....s........s...', '......s......s....', '......s......s....', '.......NNNNNN.....', '.......NnNNnN.....', '.......nnnnnn.....');
    return rows;
  })(), 'c');
  def('umbrella', ['....RRRRRR....', '..RRWWRRWWRR..', '.RRRWWRRWWRRR.', 'RRRRWWRRWWRRRR', 'RR.RR.RR.RR.RR', '.......N......', '.......N......', '.......N......', '.......N......', '......NN......'], 'c');
  def('kite', ['.....R.....', '....RRR....', '...RRWRR...', '..RRRWRRR..', '.RRRRWRRRR.', 'WWWWWWWWWWW', '.RRRRWRRRR.', '..RRRWRRR..', '...RRWRR...', '....RWR....', '.....R.....', '.....s.....', '....s......', '.....Y.....', '......s....', '.....B.....'], 'c');
  def('cloud', ['......WWW.......', '....WWWWWWW.WW..', '..WWWWWWWWWWWWW.', '.WWWWWWWWWWWWWWW', 'WWWWWWWWWWWWWWWw', 'wWWWWWWWWWWWWWww', '.wwwwwwwwwwwwww.'], 'c');
  def('sun', gen(13, 13, (x, y) => {
    const dx = x - 6, dy = y - 6, d = Math.hypot(dx, dy);
    if (d <= 3.6) return d > 2.6 && dx + dy > 3 ? 'y' : 'Y';
    const ang = Math.atan2(dy, dx), step = Math.PI / 4, near = Math.abs(((ang / step) + 0.5) % 1 - 0.5) < 0.12;
    return d > 4.6 && d <= 6.4 && near ? 'O' : '.';
  }), 'c');
  def('moon', gen(10, 11, (x, y) => { const d1 = Math.hypot(x - 4.5, y - 5), d2 = Math.hypot(x - 7, y - 4); return d1 <= 4.6 && d2 > 3.8 ? (x < 3 ? 'L' : 'Y') : '.'; }), 'c');
  def('star', ['....Y....', '....Y....', '...YYY...', 'YYYYYYYYY', '.YYYYYYY.', '..YYYYY..', '..YYYYY..', '.YYY.YYY.', '.YY...YY.'], 'c');
  def('heart', ['.RR...RR.', 'RRRR.RRRR', 'RRRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'], 'c');
  def('bird', ['....BBB..', '...BBBBB.', 'BB.BKBBY.', '.BBBBBBYY', '..BBBBB..', '...BBB...', '....Y.Y..'], 'c');
  def('ufo', ['.....cCCCCc.....', '....cCCCCCCc....', '...cCCCCCCCCc...', '..SSSSSSSSSSSS..', '.SSSYSSYSSYSSSS.', 'SSSSSSSSSSSSSSSS', '.ssssssssssssss.', '...Y..Y..Y..Y...'], 'c');
  def('note', ['...PP', '...PPP', '...P.P', '...P..', '...P..', 'PP.P..', 'PPPP..', '.PP...'], 'c');
  def('bomb', ['.......Y.', '......Y..', '.....nn..', '...DDDD..', '..DDDDDD.', '.DDwDDDDD', '.DDwDDDDD', '.DDDDDDDD', '..DDDDDD.', '...DDDD..'], 'c');
  def('bell', ['...YY...', '..YYYY..', '.YYYYYY.', '.YYYYYY.', '.YYYYYY.', 'YYYYYYYY', 'yyyyyyyy', '...yy...'], 'c');
  def('coin', ['..YYY..', '.YYWYY.', 'YYYYYyY', 'YYYYYyY', 'YYYYYyY', '.YYyyY.', '..yyy..'], 'c');
  def('gem', ['..bbb..', '.bBBBb.', 'bBcBBBb', '.bBBBb.', '..bBb..', '...b...'], 'c');
  def('key', ['.YY........', 'Y..Y.......', 'Y..YYYYYYYY', 'Y..Y...Y.Y.', '.YY........'], 'c');
  def('wand', ['......Y..', '.....YYY.', '......Y..', '.....N...', '....N....', '...N.....', '..N......', '.N.......', 'N........'], 'c');

  // ---------------- 立在地上的
  def('tree', gen(14, 18, (x, y) => {
    const dx = x - 6.5, dy = y - 6;
    if (y <= 12 && (dx * dx) / 36 + (dy * dy) / 30 <= 1) return dx > 2 && dy > -1 ? 'g' : (x === 3 && y === 3 ? 'C' : 'G');
    if (y > 12 && x >= 6 && x <= 8) return x === 8 ? 'n' : 'N';
    return '.';
  }));
  def('bush', ['...GGGG.....', '.GGGGGGGG...', 'GGGGGgGGGGG.', 'GGGGGGGGGGGG', 'gGGGGGGGGGgG']);
  def('flower', ['..MM.MM..', '.MMMMMMM.', '.MMYYYMM.', '.MMYYYMM.', '.MMMMMMM.', '..MM.MM..', '....G....', '..G.G....', '..GGG....', '....G.G..', '....GGG..', '....G....', '....G....']);
  def('mushroom', ['..RRRRR..', '.RRWRRWR.', 'RRRRRRRRR', 'RWRRRWRRR', '..LLLLL..', '...LLL...', '...LLL...', '...LLL...']);
  def('house', ['.......RR.......', '......RRRR......', '.....RRRRRR.....', '....RRRRRRRR....', '...RRRRRRRRRR...', '..RRRRRRRRRRRR..', '.RRRRRRRRRRRRRR.', 'RRRRRRRRRRRRRRRR', '.LLLLLLLLLLLLLL.', '.LLLLLLLLLLLLLL.', '.LLCCLLLLLLCCLL.', '.LLCCLLNNLLCCLL.', '.LLLLLLNNLLLLLL.', '.LLLLLLNNLLLLLL.', '.TTTTTTNNTTTTTT.']);
  def('door', ['..NNNN..', '.NNNNNN.', 'NNNNNNNN', 'NNnNNnNN', 'NNnNNnNN', 'NNNNNNNN', 'NNNNNNNY', 'NNnNNnNN', 'NNnNNnNN', 'NNNNNNNN', 'NNNNNNNN', 'NNNNNNNN', 'nnnnnnnn']);
  def('ladder', gen(6, 18, (x, y) => (x === 0 || x === 5) ? 'N' : (y % 3 === 1 ? 'n' : '.')));
  def('chest', ['..NNNNNNNN..', '.NNNNNNNNNN.', 'NNNNNNNNNNNN', 'nnnnnYYnnnnn', 'NNNNNYYNNNNN', 'NNNNNNNNNNNN', 'NNNNNNNNNNNN', 'NNNNNNNNNNNN', 'nnnnnnnnnnnn']);
  def('sword', ['..W..', '.WSs.', '.WSs.', '.WSs.', '.WSs.', '.WSs.', '.WSs.', '.WSs.', 'YYYYY', '..N..', '..N..', '..Y..']);
  def('lantern', ['...s...', '..sss..', '.NNNNN.', '.NYYYN.', '.NYWYN.', '.NYYYN.', '.NNNNN.', '..nnn..']);
  def('campfire', ['.....R.....', '....RRR....', '...RROOR...', '..RROOOOR..', '..ROOYYOR..', '...OYYYO...', '..NNNNNNN..', '.nNNnnNNNn.']);
  def('rocket', ['...RR...', '..RRRR..', '..RRRR..', '.WWWWWW.', '.WWBBWW.', '.WWBBWW.', '.WWWWWW.', '.WWWWWW.', '.WWWWWW.', '.WWWWWw.', 'RWWWWWwR', 'RRWWWWRR', 'RR.WW.RR', '...OO...', '..OYYO..', '..OYYO..', '...YY...']);
  def('boat', ['......N.......', '......NWW.....', '......NWWWW...', '......NWWWWW..', '......NWWWWWW.', '......N.......', 'NNNNNNNNNNNNNN', '.NNNNNNNNNNNN.', '..nnnnnnnnnn..']);
  def('fish', ['...OOOO...O', '.OOOOOOO.OO', 'OOOWKOOOOOO', '.OOOOOOO.OO', '...OOOO...O'], 'c');
  def('cake', ['.....Y....', '.....W....', '..MMMMMM..', '.MMWMMWMM.', 'MMMMMMMMMM', 'LLLLLLLLLL', 'LLLLLLLLLL', 'NNNNNNNNNN', 'nnnnnnnnnn']);
  def('gift', ['..YY.YY..', '.Y..Y..Y.', '..YYYYY..', 'RRRRYRRRR', 'RRRRYRRRR', 'YYYYYYYYY', 'RRRRYRRRR', 'RRRRYRRRR', 'rrrrYrrrr']);
  def('flag', ['nRRRRRR..', 'nRRRRRRR.', 'nRRRRRR..', 'nRRRR....', 'n........', 'n........', 'n........', 'n........', 'n........', 'n........', 'n........', 'n........', 'n........', 'nn.......']);
  def('trophy', ['Y.YYYYY.Y', 'YYYYYYYYY', '.YYYYYYY.', '..YYYYY..', '...YYY...', '....Y....', '....Y....', '..YYYYY..', '.NNNNNNN.']);
  def('trampoline', ['BBBBBBBBBBBBBBBB', 'bbbbbbbbbbbbbbbb', 's..............s', 's..............s', 's..............s', 'ss............ss']);
  def('rock', ['..SSSS...', '.SSSSSSS.', 'SSSSSsSSS', 'SSSSSSSSS', 'sssSSssss']);
  def('signpost', ['.NNNNNNNNNN.', 'NNLLLLLLLLNN', 'NNLLLLLLLLNN', '.NNNNNNNNNN.', '.....nn.....', '.....nn.....', '.....nn.....', '.....nn.....', '.....nn.....', '.....nn.....', '.....nn.....']);
  def('box', ['NNNNNNNN', 'NnnNNnnN', 'NnNnnNnN', 'NNnNNnNN', 'NNnNNnNN', 'NnNnnNnN', 'NnnNNnnN', 'NNNNNNNN']);

  // ---------------- 能骑 / 能拿 / 能玩的(v1.5)
  def('broom', ['.yYY..................', 'yYYYYn................', 'YYYYYnNNNNNNNNNNNNNNNN', 'yYYYYn................', '.yYY..................'], 'c');
  def('skateboard', ['.RRRRRRRRRRRR.', 'RRrrrrrrrrrrRR', '..ss......ss..', '..KK......KK..']);
  def('surfboard', ['...MMMMMMMMMMM....', '.MMWWWWWWWWWWWMMM.', 'MMMMMMMMMMMMMMMMMm', '.mmmmmmmmmmmmmmm..']);
  def('carpet', ['Y.PPPPPPPPPPPPPPPP.Y', '.PPYPPYPPYPPYPPYPPP.', '.PPPPPPPPPPPPPPPPPP.', 'Y.pppppppppppppppp.Y']);
  def('seat', ['NNNNNNNNNNNN', 'nnnnnnnnnnnn']);
  def('parachute', ['.....RRRRRR.....', '...RRWWRRWWRR...', '..RRRWWRRWWRRR..', '.RRRRWWRRWWRRRR.', 'RRrRRrRRrRRrRRrR', 's..............s', '.s............s.', '..s..........s..', '...s........s...', '....s......s....', '.....s....s.....', '......s..s......', '.......ss.......']);
  def('cannon', ['...........DD.', '..........DDDD', '.........DDDDD', '........DDDDD.', '.......DDDDD..', '......DDDDD...', '.....DDDDD....', '...NNDDDD.....', '..NnnNDD......', '.NnNNnN.......', '.NnNNnN.......', '..NnnN........']);
  def('rod', ['...........s', '..........s.', '.........s..', '........N...', '.......N....', '......N.....', '.....N......', '....N.......', '...N........', '..nN........', '..nn........', '.n..........']);
  def('car', ['....RRRRRR......', '...RcccRccR.....', '..RcccRcccRR....', '.RRRRRRRRRRRRRR.', 'RRRRRRRRRRRRRRRY', 'RRRRRRRRRRRRRRRR', 'rrKKKrrrrrrKKKrr', '..KSK......KSK..', '...K........K...']);
  def('paperplane', ['WW..........', 'wWWW........', '.wWWWWW.....', '..wwWWWWWWWW', '...wwwwWW...', '....ww......'], 'c');
  def('snowball', ['.WWW.', 'WWWWW', 'WWWWw', 'wWWww', '.www.'], 'c');
  def('snowman', ['....KK....', '...KKKK...', '..KKKKKK..', '...WWWW...', '..WKWWKW..', '..WWOOWW..', '...WWWW...', '..RRRRRRR.', '.WWWWWWWW.', '.WWWKWWWW.', 'WWWWWWWWWW', 'WWWWKWWWWW', 'WWWWWWWWWW', 'wWWWWWWWWw', '.wwwwwwww.']);
  def('apple', ['...n...', '...nG..', '.RRnRR.', 'RRWRRRR', 'RWRRRRR', 'RRRRRRr', '.RRRRr.', '..RRr..'], 'c');
  def('ball', ['..RRW..', '.RRRWW.', 'RRRWWWB', 'YYYYBBB', 'YYYBBBB', '.YYBBB.', '..YBB..'], 'c');
  def('bucket', ['.s....s.', 's......s', 'SSSSSSSS', '.BBBBBB.', '.BBBBBB.', '.bBBBBb.', '..bbbb..']);
  def('planet', ['......PPPP......', '....PPPPPPPP....', 'YY.PPMPPPPPPP.YY', '.YYYPPPPPPPPYYY.', '..YYYYYYYYYYYY..', '...PPPPPPPPPP...', '....pPPPPPPp....', '......pppp......'], 'c');
  def('cat', ['.......K.K', 'K......KKK', 'K......KYK', '.KKKKKKKKK', '.KKKKKKKK.', '.KKKKKKK..', '.K.K..K.K.', '.K.K..K.K.']);
  def('ghost', ['...WWW...', '..WWWWW..', '.WWWWWWW.', '.WKWWKWW.', '.WKWWKWW.', '.WWWWWWW.', 'WWWMMWWWW', 'WWWWWWWWW', 'WWWWWWWWW', 'W.WW.WW.W'], 'c');
  def('chick', ['..YYY..', '.YYKYY.', '.YYYYOO', 'YYYYYY.', 'YYYYYY.', '.YYYY..', '..O.O..']);

  // ---------------- 打开后的样子(use how:"open" 会自动换成 xxx_o)
  def('chest_o', ['.NNNNNNNNNN.', 'NnnnnnnnnnnN', 'N.Y.YW.Y.Y.N', 'NYWYYYYYWYYN', 'nnnnnYYnnnnn', 'NNNNNYYNNNNN', 'NNNNNNNNNNNN', 'NNNNNNNNNNNN', 'nnnnnnnnnnnn']);
  def('gift_o', ['RRRRY......', 'rrrrY......', '...........', '.Y.......Y.', '.RRRRYRRRR.', '.RRRRYRRRR.', '.YYYYYYYYY.', '.RRRRYRRRR.', '.rrrrYrrrr.']);
  def('door_o', ['..NNNN..', '.NKKKKN.', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'NKKKKKKN', 'nnnnnnnn']);
  def('box_o', ['N......N', '.N....N.', 'NNNNNNNN', 'NnnNNnnN', 'NnNnnNnN', 'NNnNNnNN', 'NnNnnNnN', 'NnnNNnnN', 'NNNNNNNN']);
  def('egg', ['..WWW..', '.WWWWW.', 'WWWWWWW', 'WWwWWWW', 'WWWWWWw', '.WWWWw.', '..www..'], 'c');

  const names = Object.keys(lib).filter(n => !/_o$/.test(n));

  // ---------------- 规范化 / 绘制
  const norm = new WeakMap();
  function normalize(spr) {
    if (!spr) return null;
    let n = norm.get(spr); if (n) return n;
    const rows = (spr.rows || []).map(r => String(r));
    const w = Math.max(1, ...rows.map(r => r.length)), h = rows.length || 1;
    const pal = Object.assign({}, DEF, spr.pal || {});
    for (const r of rows) for (const ch of r) if (ch !== '.' && ch !== ' ' && !pal[ch]) pal[ch] = pal[ch.toUpperCase()] || pal[ch.toLowerCase()] || DEF.K;   // 没定义的字母不会"隐身"
    n = { w, h, rows: rows.map(r => r.padEnd(w, '.')), pal, anchor: spr.anchor || 'b' };
    norm.set(spr, n); return n;
  }
  const bmCache = new WeakMap();
  function bitmap(spr, px) {
    const n = normalize(spr); if (!n) return null;
    let m = bmCache.get(spr); if (!m) { m = new Map(); bmCache.set(spr, m); }
    let c = m.get(px); if (c) return c;
    c = document.createElement('canvas'); c.width = n.w * px; c.height = n.h * px;
    const g = c.getContext('2d');
    for (let y = 0; y < n.h; y++) for (let x = 0; x < n.w; x++) {
      const ch = n.rows[y][x]; if (ch === '.' || ch === ' ') continue;
      const col = n.pal[ch]; if (!col) continue;
      g.fillStyle = col; g.fillRect(x * px, y * px, px, px);
    }
    m.set(px, c); return c;
  }
  /** 画一张像素图。(x,y) 是锚点:anchor 'b' = 底边中点,'c' = 中心。px = 每个像素多少屏幕像素。返回包围盒。 */
  function draw(ctx, spr, x, y, px, o) {
    o = o || {};
    px = Math.max(1, Math.round(px));
    const bm = bitmap(spr, px); if (!bm) return null;
    const n = normalize(spr), anchor = o.anchor || n.anchor;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (o.rot) ctx.rotate(o.rot);
    if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1);
    if (o.flip) ctx.scale(-1, 1);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bm, -Math.round(bm.width / 2), anchor === 'c' ? -Math.round(bm.height / 2) : -bm.height);
    ctx.restore();
    const r = Math.hypot(bm.width, bm.height) / 2 + 4;
    return { x1: x - r, y1: y - (anchor === 'c' ? r : bm.height + 4), x2: x + r, y2: y + (anchor === 'c' ? r : 6) };
  }
  const size = (spr, px) => { const n = normalize(spr); return n ? { w: n.w * px, h: n.h * px } : { w: 0, h: 0 }; };
  const get = name => lib[name] || null;

  // ================= v1.6:更稳的造图方式 =================
  const NAMED = { red: '#e04b4b', orange: '#f2994a', yellow: '#f6c945', green: '#4caf50', blue: '#4f8fe0', sky: '#8fd3ff', water: '#3d9be9', purple: '#b06fd6', pink: '#ff8fb8', brown: '#8b5a3c', wood: '#a8733f', gray: '#9aa3ad', grey: '#9aa3ad', white: '#ffffff', black: '#2b211c', gold: '#f6c945', silver: '#c9d1d9', grass: '#5fbf5f', snow: '#f4f8ff', ice: '#bfe9ff', cream: '#f7e6c4', skin: '#f2c9a0', dark: '#3a2a22', navy: '#2f3f7a', cyan: '#6cc3ff', lime: '#9be15d', beige: '#e8d5b0', orange2: '#ff7a1a', clawd: '#d97757' };
  const hex2rgb = h => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
  const rgb2hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixc = (h, t, a) => rgb2hex(hex2rgb(h).map((v, i) => v + (t[i] - v) * a));
  const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  /** 颜色:调色板字母 / #hex / 颜色名 → #hex */
  function colOf(v, pal) {
    if (typeof v !== 'string') return null;
    const s = v.trim(); if (!s) return null;
    if ([...s].length === 1) return (pal && pal[s]) || DEF[s] || DEF[s.toUpperCase()] || null;
    const t = s.toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(t)) return t;
    if (/^#[0-9a-f]{3}$/.test(t)) return '#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
    return NAMED[t] || null;
  }
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+-=?@^~';

  /** 颜色网格(二维数组,元素 #hex 或 null)→ sprite。o.shade 自动明暗(光从左上来),o.outline 描一圈深色边 */
  function fromGrid(grid, o) {
    o = o || {};
    let g = grid.map(r => r.slice());
    // 去掉四周的空行空列
    const on = (x, y) => y >= 0 && y < g.length && x >= 0 && x < (g[y] || []).length && !!g[y][x];
    while (g.length && !g[0].some(Boolean)) g.shift();
    while (g.length && !g[g.length - 1].some(Boolean)) g.pop();
    if (!g.length) return null;
    let w = Math.max(...g.map(r => r.length)); g = g.map(r => { const a = r.slice(); while (a.length < w) a.push(null); return a; });
    let l = 0; while (l < w && g.every(r => !r[l])) l++;
    let rr = w - 1; while (rr > l && g.every(r => !r[rr])) rr--;
    g = g.map(r => r.slice(l, rr + 1)); w = rr - l + 1; const h = g.length;
    if (o.shade) {
      const out = g.map(r => r.slice());
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = g[y][x]; if (!c) continue;
        const sc = (on(x, y - 1) ? 0 : 1) + (on(x - 1, y) ? 0 : 0.5) - (on(x, y + 1) ? 0 : 1) - (on(x + 1, y) ? 0 : 0.5);
        if (sc > 0) out[y][x] = mixc(c, [255, 255, 255], Math.min(0.32, 0.2 * sc));
        else if (sc < 0) out[y][x] = mixc(c, [28, 18, 24], Math.min(0.32, 0.2 * -sc));
      }
      g = out;
    }
    if (o.outline) {
      const W2 = w + 2, H2 = h + 2, out = [];
      for (let y = 0; y < H2; y++) { const row = []; for (let x = 0; x < W2; x++) row.push(on(x - 1, y - 1) ? g[y - 1][x - 1] : null); out.push(row); }
      const fixed = typeof o.outline === 'string' ? o.outline : null;
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        if (out[y][x]) continue;
        const nb = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => on(x - 1 + dx, y - 1 + dy) ? g[y - 1 + dy][x - 1 + dx] : null).find(Boolean);
        if (nb) out[y][x] = '~' + (fixed || mixc(nb, [30, 18, 22], 0.62));
      }
      g = out.map(r => r.map(c => (c && c[0] === '~' ? c.slice(1) : c)));
    }
    const pal = {}, idx = {}; let n = 0;
    const rows = g.map(r => r.map(c => {
      if (!c) return '.';
      if (!idx[c]) { if (n >= CH.length) { let best = null, bd = 1e9; const a = hex2rgb(c); for (const k in idx) { const b = hex2rgb(k), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = k; } } return idx[best]; } idx[c] = CH[n++]; pal[idx[c]] = c; }
      return idx[c];
    }).join(''));
    return { rows, pal, anchor: o.anchor || 'c' };
  }
  /** 左右对称:以左半边为准复制到右半边(左边空、右边有的格子反过来补到左边) */
  function mirrorGrid(g) {
    const w = Math.max(...g.map(r => r.length)); g = g.map(r => { const a = r.slice(); while (a.length < w) a.push(null); return a; });
    for (const r of g) for (let x = 0; x < Math.floor(w / 2); x++) { const y = w - 1 - x; if (r[x]) r[y] = r[x]; else if (r[y]) r[x] = r[y]; }
    return g;
  }

  /** 几何形状 → 像素图。spec: {w,h,shapes:[{k:rect|circle|ellipse|tri|poly|line, c:颜色, ...}], pal?, mirror?, shade?(默认开), outline?, anchor?} */
  function fromShapes(spec) {
    const w = Math.max(4, Math.min(32, Math.round(spec.w || 16))), h = Math.max(4, Math.min(32, Math.round(spec.h || 16)));
    let g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill(null));
    const inPoly = (px, py, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
    const segD = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)); return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); };
    for (const q of (spec.shapes || []).slice(0, 60)) {
      if (!q || typeof q !== 'object') continue;
      const k = q.k || q.kind || 'rect', erase = q.c === '.' || q.c === 'none' || q.erase;
      const col = erase ? null : (colOf(q.c, spec.pal) || DEF.K);
      const N = v => (Number.isFinite(+v) ? +v : 0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5; let hit = false;
        if (k === 'rect') hit = px >= N(q.x) && px <= N(q.x) + N(q.w || 1) && py >= N(q.y) && py <= N(q.y) + N(q.h || 1);
        else if (k === 'circle' || k === 'ellipse') { const rx = N(q.rx || q.r || 1), ry = N(q.ry || q.r || 1), cx = N(q.x != null ? q.x : q.cx), cy = N(q.y != null ? q.y : q.cy); hit = rx > 0 && ry > 0 && ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1.0; }
        else if ((k === 'tri' || k === 'poly') && Array.isArray(q.pts) && q.pts.length >= 3) hit = inPoly(px, py, q.pts.slice(0, 16).map(p => [N(p && p[0]), N(p && p[1])]));
        else if (k === 'line') hit = segD(px, py, N(q.x1), N(q.y1), N(q.x2), N(q.y2)) <= Math.max(0.5, N(q.t || 1) / 2) + 0.05;
        if (hit) g[y][x] = col;
      }
    }
    if (spec.mirror) g = mirrorGrid(g);
    return fromGrid(g, { shade: spec.shade !== false, outline: spec.outline, anchor: spec.anchor || 'c' });
  }

  /** 字符画自动修复:一个字符串里带换行的拆开、短行居中补齐(模型最常见的错是某几行少写了几个字符)、对称补全、自动明暗 */
  function fromRows(spec) {
    let rows = spec.rows || [];
    if (typeof rows === 'string') rows = rows.split(/\r?\n/);
    rows = rows.map(r => String(r == null ? '' : r).replace(/\s/g, '.'));
    while (rows.length && !/[^.]/.test(rows[0])) rows.shift();
    while (rows.length && !/[^.]/.test(rows[rows.length - 1])) rows.pop();
    if (!rows.length) return null;
    const lens = rows.map(r => r.length), cnt = {}; lens.forEach(n => { cnt[n] = (cnt[n] || 0) + 1; });
    const mode = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || b - a)[0], W = Math.max(mode, ...lens);
    // 短行怎么补齐:在"右边补点 / 居中 / 左边补点"里选内容中心最接近标准宽度行的那种
    const span = r => { const a = r.search(/[^.]/), b = r.length - 1 - [...r].reverse().join('').search(/[^.]/); return a < 0 ? null : (a + b) / 2; };
    const refs = rows.filter(r => r.length === mode).map(span).filter(v => v != null).sort((a, b) => a - b), ref = refs.length ? refs[refs.length >> 1] : (mode - 1) / 2;
    rows = rows.map(r => {
      if (r.length >= mode) return r;
      const d = mode - r.length, c0 = span(r); if (c0 == null) return r.padEnd(mode, '.');
      let best = 0; for (const sft of [0, Math.floor(d / 2), d]) if (Math.abs(c0 + sft - ref) < Math.abs(c0 + best - ref) - 0.01) best = sft;
      return '.'.repeat(best) + r + '.'.repeat(d - best);
    });
    const pal = Object.assign({}, DEF, spec.pal || {});
    let g = rows.map(r => { const a = [...r].map(ch => (ch === '.' ? null : (pal[ch] || pal[ch.toUpperCase()] || pal[ch.toLowerCase()] || DEF.K))); while (a.length < W) a.push(null); return a; });
    if (spec.mirror) g = mirrorGrid(g);
    return fromGrid(g, { shade: !!spec.shade, outline: spec.outline, anchor: spec.anchor || 'b' });
  }

  /** emoji → 像素风道具:用系统彩色 emoji 字体画大图,按格子求平均,再把颜色量化到少数几种 */
  const emojiCache = new Map();
  function fromEmoji(ch, grid) {
    if (typeof document === 'undefined' || !ch) return null;
    const G = Math.max(8, Math.min(32, Math.round(grid || 16))), ck = ch + '|' + G;
    if (emojiCache.has(ck)) return emojiCache.get(ck);
    const F = 112, C = Math.round(F * 1.6), cv = document.createElement('canvas'); cv.width = cv.height = C;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.font = F + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, C / 2, C / 2);
    const d = g.getImageData(0, 0, C, C).data;
    let x1 = C, y1 = C, x2 = -1, y2 = -1;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (d[(y * C + x) * 4 + 3] > 40) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    if (x2 < 0) { emojiCache.set(ck, null); return null; }
    const bw = x2 - x1 + 1, bh = y2 - y1 + 1, cell = Math.max(bw, bh) / G, gw = Math.max(1, Math.round(bw / cell)), gh = Math.max(1, Math.round(bh / cell));
    const cells = [];
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const sx0 = x1 + gx * cell, sy0 = y1 + gy * cell; let a = 0, r = 0, gg = 0, b = 0, n = 0;
      for (let y = Math.floor(sy0); y < Math.min(C, Math.ceil(sy0 + cell)); y++) for (let x = Math.floor(sx0); x < Math.min(C, Math.ceil(sx0 + cell)); x++) { const i = (y * C + x) * 4, al = d[i + 3]; n++; a += al; r += d[i] * al; gg += d[i + 1] * al; b += d[i + 2] * al; }
      cells.push(a / (n * 255) > 0.42 ? [r / a, gg / a, b / a] : null);
    }
    // k-means 颜色量化(像素画通常只有几种颜色)
    const pts = cells.filter(Boolean); const K = Math.min(9, Math.max(2, Math.round(Math.sqrt(pts.length) / 1.6)), pts.length);
    const srt = pts.slice().sort((p, q) => lum(p) - lum(q));
    let cen = []; for (let i = 0; i < K; i++) cen.push(srt[Math.floor((i + 0.5) / K * srt.length)].slice());
    const near = p => { let bi = 0, bd = 1e12; cen.forEach((c, i) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = i; } }); return bi; };
    for (let it = 0; it < 8; it++) {
      const acc = cen.map(() => [0, 0, 0, 0]);
      for (const p of pts) { const i = near(p); acc[i][0] += p[0]; acc[i][1] += p[1]; acc[i][2] += p[2]; acc[i][3]++; }
      cen = cen.map((c, i) => (acc[i][3] ? [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]] : c));
    }
    const hexes = cen.map(c => rgb2hex(c.map((v, i) => { const m = (c[0] + c[1] + c[2]) / 3; return m + (v - m) * 1.12; })));   // 稍微提一点饱和度
    const grid2 = []; for (let y = 0; y < gh; y++) { const row = []; for (let x = 0; x < gw; x++) { const p = cells[y * gw + x]; row.push(p ? hexes[near(p)] : null); } grid2.push(row); }
    const spr = fromGrid(grid2, { anchor: 'c' });
    if (spr) spr.name = 'emoji:' + ch;
    emojiCache.set(ck, spr); return spr;
  }

  /** 换色:{原颜色字母: 新颜色} → 新的 sprite(缓存) */
  const recCache = new WeakMap();
  function recolor(spr, map) {
    if (!spr || !map) return spr;
    const key = JSON.stringify(map); let m = recCache.get(spr); if (!m) { m = new Map(); recCache.set(spr, m); }
    if (m.has(key)) return m.get(key);
    const n = normalize(spr), pal = Object.assign({}, n.pal);
    for (const k of Object.keys(map)) {
      const c = colOf(map[k]); if (!c || !pal[k]) continue; pal[k] = c;
      const lo = k.toLowerCase(); if (lo !== k && pal[lo] && map[lo] == null) pal[lo] = mixc(c, [28, 18, 24], 0.32);   // 只换了亮色就自动配上暗部
    }
    const out = { name: spr.name, rows: n.rows, pal, anchor: n.anchor }; m.set(key, out); return out;
  }

  /** 模型常写的道具名 → emoji(库里没有、也没自己画的时候用) */
  const ALIAS = {};
  'bicycle,bike,自行车,单车:🚲|guitar,吉他:🎸|piano,钢琴:🎹|drum,鼓:🥁|violin,小提琴:🎻|trumpet,喇叭,小号:🎺|microphone,mic,麦克风,话筒:🎤|dinosaur,dino,恐龙:🦖|dragon,龙:🐉|unicorn,独角兽:🦄|dog,puppy,狗,小狗:🐶|rabbit,bunny,兔子:🐰|bear,熊:🐻|panda,熊猫:🐼|pig,猪:🐷|cow,牛:🐮|horse,马:🐴|monkey,猴子:🐵|frog,青蛙:🐸|turtle,乌龟:🐢|snake,蛇:🐍|octopus,章鱼:🐙|whale,鲸鱼:🐳|dolphin,海豚:🐬|shark,鲨鱼:🦈|crab,螃蟹:🦀|penguin,企鹅:🐧|owl,猫头鹰:🦉|butterfly,蝴蝶:🦋|bee,蜜蜂:🐝|ladybug,瓢虫:🐞|snail,蜗牛:🐌|mouse,老鼠:🐭|fox,狐狸:🦊|lion,狮子:🦁|tiger,老虎:🐯|elephant,大象:🐘|giraffe,长颈鹿:🦒|duck,鸭子:🦆|chicken,hen,鸡:🐔|pizza,披萨:🍕|burger,hamburger,汉堡:🍔|icecream,冰淇淋:🍦|donut,甜甜圈:🍩|cookie,饼干:🍪|candy,糖果:🍬|lollipop,棒棒糖:🍭|banana,香蕉:🍌|grape,葡萄:🍇|watermelon,西瓜:🍉|strawberry,草莓:🍓|cherry,樱桃:🍒|carrot,胡萝卜,萝卜:🥕|corn,玉米:🌽|bread,面包:🍞|egg,鸡蛋,蛋:🥚|cheese,奶酪:🧀|milk,牛奶:🥛|tea,茶:🍵|coffee,咖啡:☕|noodle,面条:🍜|rice,米饭:🍚|dumpling,饺子:🥟|sushi,寿司:🍣|train,火车:🚂|bus,公交车:🚌|truck,卡车:🚚|plane,airplane,飞机:✈️|helicopter,直升机:🚁|ship,轮船:🚢|sailboat,帆船:⛵|tractor,拖拉机:🚜|scooter,滑板车:🛴|motorcycle,摩托车:🏍️|ambulance,救护车:🚑|firetruck,消防车:🚒|police,警车:🚓|castle,城堡:🏰|tent,帐篷:⛺|volcano,火山:🌋|mountain,山:⛰️|island,岛:🏝️|cactus,仙人掌:🌵|palm,椰子树:🌴|leaf,叶子:🍃|maple,枫叶:🍁|sunflower,向日葵:🌻|rose,玫瑰:🌹|tulip,郁金香:🌷|clover,四叶草:🍀|pumpkin,南瓜:🎃|christmastree,圣诞树:🎄|snowflake,雪花:❄️|rain,雨:🌧️|lightning,thunder,闪电:⚡|rainbow,彩虹:🌈|fire,火:🔥|water,水滴:💧|wave,浪:🌊|tornado,龙卷风:🌪️|comet,彗星:☄️|earth,地球:🌍|crown,王冠:👑|hat,帽子:🎩|glasses,眼镜:👓|shirt,衣服:👕|dress,裙子:👗|shoe,鞋:👟|backpack,书包:🎒|book,书:📖|pencil,铅笔:✏️|scissors,剪刀:✂️|paint,palette,调色板:🎨|camera,相机:📷|phone,手机:📱|computer,电脑:💻|tv,电视:📺|radio,收音机:📻|clock,钟:⏰|hourglass,沙漏:⌛|lamp,灯:💡|candle,蜡烛:🕯️|magnet,磁铁:🧲|hammer,锤子:🔨|wrench,扳手:🔧|shovel,铲子:🪏|axe,斧头:🪓|bow,弓:🏹|shield,盾:🛡️|crystal,水晶球:🔮|potion,药水:🧪|scroll,卷轴:📜|map,地图:🗺️|compass,指南针:🧭|telescope,望远镜:🔭|robot,机器人:🤖|alien,外星人:👽|ghost2,鬼:👻|skull,骷髅:💀|zombie,僵尸:🧟|mermaid,美人鱼:🧜|fairy,仙女:🧚|wizard,巫师:🧙|santa,圣诞老人:🎅|snowman2:⛄|soccer,football,足球:⚽|basketball,篮球:🏀|baseball,棒球:⚾|tennis,网球:🎾|volleyball,排球:🏐|pingpong,乒乓球:🏓|bowling,保龄球:🎳|dice,骰子:🎲|puzzle,拼图:🧩|teddy,玩具熊:🧸|kite2:🪁|yoyo,溜溜球:🪀|firework,烟花:🎆|confetti,彩带:🎉|ribbon,蝴蝶结:🎀|medal,奖牌:🏅|money,钱:💰|letter,mail,信:✉️|envelope,信封:✉️|package,包裹:📦|toilet,马桶:🚽|bath,浴缸:🛁|bed,床:🛏️|chair,椅子:🪑|couch,sofa,沙发:🛋️|window,窗户:🪟|mirror,镜子:🪞|umbrella2:☂️|balloon2:🎈|pear,梨:🍐|peach,桃子:🍑|lemon,柠檬:🍋|mushroom2:🍄|cloud2:☁️|moon2:🌙|tooth,牙齿:🦷|bone,骨头:🦴|feather,羽毛:🪶|egg2:🥚|nest,鸟窝:🪺|worm,虫子:🪱|spider,蜘蛛:🕷️|web,蜘蛛网:🕸️|bat,蝙蝠:🦇|squid,鱿鱼:🦑|seal,海豹:🦭|sloth,树懒:🦥|hedgehog,刺猬:🦔|koala,考拉:🐨|hamster,仓鼠:🐹|parrot,鹦鹉:🦜|swan,天鹅:🦢|flamingo,火烈鸟:🦩|peacock,孔雀:🦚|trex:🦖|sauropod,雷龙:🦕'.split('|').forEach(e => { const [ks, em] = e.split(':'); ks.split(',').forEach(k => { ALIAS[k] = em; }); });
  /** 名字 → sprite:内置库 → 别名 emoji;找不到返回 null */
  function byName(name, grid) {
    if (!name) return null;
    if (lib[name]) return lib[name];
    const k = String(name).toLowerCase(), em = ALIAS[k] || ALIAS[k.replace(/s$/, '')];
    return em ? fromEmoji(em, grid) : null;
  }

  /** 一张图转起来像不像"本来就该转的东西":轮廓转 90° / 180° 后和自己重合得越多越像(球、轮子、硬币、星星 ≈ 1;房子、树、带底座的摩天轮 < 0.75) */
  const roundCache = new WeakMap();
  function roundness(spr) {
    if (!spr) return 0; if (roundCache.has(spr)) return roundCache.get(spr);
    const n = normalize(spr), N = Math.max(n.w, n.h), ox = (N - n.w) / 2, oy = (N - n.h) / 2;
    const on = (x, y) => { const sx = Math.round(x - ox), sy = Math.round(y - oy); return sx >= 0 && sy >= 0 && sx < n.w && sy < n.h && n.rows[sy][sx] !== '.'; };
    const iou = f => { let a = 0, u = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const p = on(x, y), [rx, ry] = f(x, y), q = on(rx, ry); if (p && q) a++; if (p || q) u++; } return u ? a / u : 0; };
    const r = Math.min(iou((x, y) => [N - 1 - x, N - 1 - y]), (iou((x, y) => [y, N - 1 - x]) + iou((x, y) => [N - 1 - y, x])) / 2);
    roundCache.set(spr, r); return r;
  }
  return { roundness, DEF, lib, names, get, draw, size, normalize, fromGrid, fromShapes, fromRows, fromEmoji, recolor, byName, colOf, ALIAS };
});
