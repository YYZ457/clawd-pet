'use strict';
/* 像素道具库:一批内置的手绘像素图(热气球、云、梯子、宝箱……),加上大模型即时设计的"自定义像素图"的绘制。
   所有图都是字符画:一个字符 = 一个像素,'.' = 透明,字符对应调色板(默认调色板见 DEF,自定义图可以覆盖)。
   既能在渲染进程里画,也能在 Node 里取名字列表(给提示词用)。 */
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

  const names = Object.keys(lib);

  // ---------------- 规范化 / 绘制
  const norm = new WeakMap();
  function normalize(spr) {
    if (!spr) return null;
    let n = norm.get(spr); if (n) return n;
    const rows = (spr.rows || []).map(r => String(r));
    const w = Math.max(1, ...rows.map(r => r.length)), h = rows.length || 1;
    const pal = Object.assign({}, DEF, spr.pal || {});
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

  return { DEF, lib, names, get, draw, size, normalize };
});
