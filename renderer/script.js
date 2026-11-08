'use strict';
/* 剧本(剧情 / 自创动作)的格式定义与"消毒":大模型输出的只是数据,必须先过这里才允许播放。
   既在渲染进程使用,也能在 Node 里测试(UMD)。
   v2:节点从 13 种扩到 21 种(变量/条件/随机/循环/多道具/换装/滤镜/二维追逐…),上限从 24 个放宽到 160 个。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScriptTools = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_NODES = 160;
  const ACTS = ['wave', 'dance', 'cheer', 'spin', 'flip', 'stretch', 'bow', 'hiccup', 'sneeze', 'moonwalk', 'sit', 'read', 'coffee', 'cookie', 'laptop', 'hop', 'love', 'trip', 'doze', 'startle', 'critter', 'party', 'ball', 'pounce', 'poke', 'ouch', 'notice'];
  const TYPES = ['say', 'act', 'anim', 'move', 'face', 'fx', 'item', 'take', 'put', 'wear', 'tint', 'wait', 'ask', 'wait_for', 'ask_text', 'set', 'if', 'random', 'loop', 'continue', 'end', 'sprite', 'platform', 'fly', 'jump', 'fall'];
  const ENUM = {
    eye: ['open', 'happy', 'closed', 'wide', 'angry', 'sad', 'x', 'heart', 'dots', '><'],
    mouth: ['smile', 'o', 'big', 'yawn', 'frown', 'flat', 'cat', 'munch'],
    legs: ['stand', 'walk', 'run', 'tuck', 'air', 'dangle'],
    prop: ['book', 'mug', 'cookie', 'flower', 'balloon', 'sign', 'heart', 'laptop'],
    hat: ['santa', 'party', 'crown', 'bow', 'nightcap', 'pumpkin', 'redcap'],
    glasses: ['shades']
  };
  const NUM = { lift: [0, 6], dy: [-4, 4], sx: [0.5, 1.5], sy: [0.5, 1.5], rot: [-3.2, 3.2], ex: [-1, 1], ey: [-1, 1], blush: [0, 1], blink: [0, 1] };
  const FX = ['heart', 'star', 'note', 'confetti', 'dust', 'zzz', 'text', 'question', 'exclaim', 'sweat', 'anger', 'sparkle', 'snow', 'rain', 'fireworks', 'bubbles'];
  const WAITS = ['pet', 'click', 'near', 'far', 'throw', 'tickle', 'hover', 'grab', 'still', 'move', 'left', 'right', 'top', 'bottom', 'type'];
  const MOVES = ['left', 'right', 'center', 'cursor', 'item', 'up', 'down', 'window', 'ground', 'plat', 'point'];
  const PLAT_STYLES = ['rope', 'plank', 'cloud', 'ledge', 'ice', 'beam'];
  const ANIMS = ['none', 'bob', 'float', 'spin', 'swing', 'pulse', 'blink', 'drift'];
  const TAKES = ['head', 'hold', 'balloon', 'back'];
  const FLY_TO = ['top', 'bottom', 'ground', 'left', 'right', 'center', 'cursor', 'up', 'down', 'point'];
  const FLY_STYLE = ['float', 'dash', 'bounce'];
  const FLY_THEN = ['hover', 'fall', 'land'];
  const JUMP_TO = ['plat', 'cursor', 'left', 'right'];
  const AT3 = ['left', 'right', 'center'];
  const ATS = ['left', 'right', 'center', 'near', 'far', 'cursor', 'random'];
  const TINTS = ['night', 'sunset', 'forest', 'ocean', 'rose', 'gold', 'dusk', 'none'];
  const OPS = ['==', '!=', '>', '<', '>=', '<='];
  const EMOJI = /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|️)*$/u;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? clamp(v, a, b) : d; };
  const str = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n) : '');
  const key = (v, n = 10) => str(v, n).replace(/[^\w一-龥]/g, '');

  function pose(o) {
    const out = {};
    if (!o || typeof o !== 'object') return out;
    for (const k in NUM) if (o[k] != null) { const v = Number(o[k]); if (Number.isFinite(v)) out[k] = clamp(v, NUM[k][0], NUM[k][1]); }
    for (const k in ENUM) if (o[k] != null && ENUM[k].includes(o[k])) out[k] = o[k];
    for (const k of ['armL', 'armR']) {
      if (Array.isArray(o[k]) && o[k].length >= 2) out[k] = [num(o[k][0], -6, 6, 0), num(o[k][1], -9, 4, 0), num(o[k][2], 1, 6, 3)];
    }
    if (o.tears != null) out.tears = !!o.tears;
    if (o.dizzy != null) out.dizzy = !!o.dizzy;
    return out;
  }

  function varMap(o, max = 4) {
    const out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    let n = 0;
    for (const k of Object.keys(o)) { const kk = key(k); if (!kk || n >= max) continue; const v = str(o[k], 12); if (v === '' && typeof o[k] !== 'number') continue; out[kk] = v; n++; }
    return out;
  }

  /** 清洗单个节点;返回 null 表示丢弃。ids: 已用 id 的 Set(会被更新)。引用完整性由 finalize 负责。 */
  function sanitizeNode(n, i, ids) {
    if (!n || typeof n !== 'object' || !TYPES.includes(n.t)) return null;
    let id = key(n.id, 12) || 'n' + i; if (ids.has(id)) id = id + '_' + i; ids.add(id);
    const c = { id, t: n.t };
    if (n.next != null && typeof n.next !== 'object') c.next = key(n.next, 12);
    if (FX.includes(n.fx) && n.t !== 'fx') { c.fx = n.fx; c.fxn = Math.round(num(n.fxn, 1, 8, 3)); }
    switch (n.t) {
      case 'say': {
        c.text = str(n.text, 90); if (!c.text) return null;
        if (n.ms != null) c.ms = num(n.ms, 600, 9000, 2200);
        const p = pose(n.pose); if (Object.keys(p).length) c.pose = p;
        if (ACTS.includes(n.act)) c.act = n.act;
        break;
      }
      case 'act': if (!ACTS.includes(n.name)) return null; c.name = n.name; c.max = num(n.max, 1, 12, 0) || undefined; break;
      case 'anim': {
        if (!Array.isArray(n.keys) || !n.keys.length) return null;
        c.dur = num(n.dur, 0.2, 20, 1.5);
        c.keys = n.keys.slice(0, 24).map(k => Object.assign({ t: num(k && k.t, 0, 1, 0) }, pose(k))).sort((a, b) => a.t - b.t);
        if (n.hold) c.hold = true;
        if (n.loop != null) c.loop = Math.round(num(n.loop, 1, 8, 1));
        break;
      }
      case 'move':
        c.to = MOVES.includes(n.to) ? n.to : 'center'; c.run = !!n.run; if (n.item != null) c.item = key(n.item, 8);
        if (c.to === 'plat') { c.key = key(n.key, 8); c.at = AT3.includes(n.at) ? n.at : 'center'; if (!c.key) return null; }
        if (c.to === 'point') { c.x = num(n.x, 0, 1, 0.5); c.y = num(n.y, 0.1, 0.95, 0.8); }
        break;
      case 'face': c.dir = ['left', 'right', 'cursor'].includes(n.dir) ? n.dir : 'cursor'; break;
      case 'fx': c.kind = FX.includes(n.kind) ? n.kind : 'star'; c.n = Math.round(num(n.n, 1, 12, 4)); c.text = str(n.text, 6); break;
      case 'item':
        if (n.remove) c.remove = n.remove === true ? true : (key(n.remove, 8) || true);
        else {
          const e = str(n.emoji, 8), art = key(n.art, 10);
          if (art) c.art = art; else if (EMOJI.test(e)) c.emoji = e; else return null;
          c.at = ATS.includes(n.at) ? n.at : 'near';
          if (n.x != null) c.x = num(n.x, 0, 1, 0.5);
          if (n.y != null) c.y = num(n.y, 0.05, 0.98, 0.5);
          if (n.scale != null) c.scale = num(n.scale, 0.5, 6, 1);
          if (ANIMS.includes(n.anim) && n.anim !== 'none') c.anim = n.anim;
          if (n.layer === 'back') c.layer = 'back';
          if (n.flip) c.flip = true;
          const k = key(n.key, 8); if (k) c.key = k;
        }
        break;
      case 'take': if (n.key != null) c.key = key(n.key, 8); c.how = TAKES.includes(n.how) ? n.how : 'head'; break;
      case 'put': break;
      case 'wear': {
        for (const k of ['hat', 'glasses', 'prop']) { if (n[k] === 'none') c[k] = 'none'; else if (ENUM[k].includes(n[k])) c[k] = n[k]; }
        if (!c.hat && !c.glasses && !c.prop) return null;
        break;
      }
      case 'tint': c.color = TINTS.includes(n.color) ? n.color : 'none'; c.a = num(n.a, 0.05, 0.4, 0.2); break;
      case 'wait': c.sec = num(n.sec, 0.2, 20, 1); break;
      case 'ask': {
        c.text = str(n.text, 60);
        c.choices = (Array.isArray(n.choices) ? n.choices : []).slice(0, 4).map(x => {
          const o = { text: str(x && x.text, 12), next: key(x && x.next, 12) }; const s = varMap(x && x.set, 3); if (Object.keys(s).length) o.set = s; return o;
        }).filter(x => x.text);
        if (!c.text || c.choices.length < 1) return null;
        if (n.timeout != null) c.timeout = key(n.timeout, 12);
        c.sec = num(n.sec, 5, 90, 60);
        break;
      }
      case 'wait_for': c.what = WAITS.includes(n.what) ? n.what : 'pet'; c.sec = num(n.sec, 2, 40, 12); if (n.timeout != null) c.timeout = key(n.timeout, 12); break;
      case 'ask_text': c.text = str(n.text, 50); c.key = key(n.key, 10) || 'ans'; if (!c.text) return null; break;
      case 'set': { c.vars = varMap(n.vars, 4); if (!Object.keys(c.vars).length) return null; break; }
      case 'if': {
        c.key = key(n.key, 10); if (!c.key) return null;
        c.op = OPS.includes(n.op) ? n.op : '=='; c.value = str(n.value, 12);
        c.then = key(n.then, 12); c.else = key(n.else, 12); break;
      }
      case 'random': {
        const to = (Array.isArray(n.to) ? n.to : []).slice(0, 6).map(x => key(x, 12)).filter(Boolean);
        if (!to.length) return null; c.to = to; break;
      }
      case 'loop': c.n = Math.round(num(n.n, 1, 8, 2)); c.to = key(n.to, 12); if (!c.to) return null; break;
      case 'continue': c.hint = str(n.hint, 120); break;
      case 'end': c.text = str(n.text, 50); break;
      case 'sprite': {
        const name = key(n.name, 8); if (!name || !Array.isArray(n.rows)) return null;
        const rows = n.rows.slice(0, 24).map(r => String(r == null ? '' : r).replace(/[\u0000-\u001f\u007f\s]/g, '.').slice(0, 24));
        if (rows.length < 2 || !rows.some(r => /[^.]/.test(r))) return null;
        const pal = {};
        if (n.pal && typeof n.pal === 'object' && !Array.isArray(n.pal)) {
          let cnt = 0; for (const ch of Object.keys(n.pal)) { if ([...ch].length !== 1 || ch === '.' || cnt >= 12) continue; const v = String(n.pal[ch]); if (/^#[0-9a-fA-F]{6}$/.test(v)) { pal[ch] = v; cnt++; } }
        }
        ids.__sp = (ids.__sp || 0) + 1; if (ids.__sp > 8) return null;
        c.name = name; c.rows = rows; c.pal = pal; c.anchor = n.anchor === 'c' ? 'c' : 'b';
        break;
      }
      case 'platform': {
        if (n.remove) { c.remove = n.remove === true ? true : (key(n.remove, 8) || true); break; }
        c.key = key(n.key, 8) || 'pl';
        let x1 = num(n.x1, 0, 1, 0.3), x2 = num(n.x2, 0, 1, 0.7); if (x2 < x1) { const t = x1; x1 = x2; x2 = t; } if (x2 - x1 < 0.08) x2 = Math.min(1, x1 + 0.08);
        c.x1 = x1; c.x2 = x2; c.y = num(n.y, 0.15, 0.92, 0.5); c.style = PLAT_STYLES.includes(n.style) ? n.style : 'plank';
        break;
      }
      case 'fly':
        c.to = FLY_TO.includes(n.to) ? n.to : ((n.x != null || n.y != null) ? 'point' : 'top');
        if (n.x != null) c.x = num(n.x, 0, 1, 0.5); if (n.y != null) c.y = num(n.y, 0.08, 0.95, 0.5);
        c.sec = num(n.sec, 0.5, 15, 3); c.style = FLY_STYLE.includes(n.style) ? n.style : 'float'; c.then = FLY_THEN.includes(n.then) ? n.then : 'hover';
        break;
      case 'jump':
        c.h = n.h === 'top' ? 1 : num(n.h, 0.05, 1, 0.4); c.to = JUMP_TO.includes(n.to) ? n.to : '';
        if (n.key != null) c.key = key(n.key, 8); c.at = AT3.includes(n.at) ? n.at : 'center'; c.dx = num(n.dx, -1, 1, 0);
        if (c.to === 'plat' && !c.key) c.to = '';
        break;
      case 'fall': break;
    }
    return c;
  }

  /** 把引用了不存在 id 的字段清掉(整段剧本到齐之后调用) */
  function finalize(nodes) {
    const have = new Set(nodes.map(n => n.id));
    const ok = id => (id && have.has(id) ? id : '');
    for (const n of nodes) {
      if (n.next && !have.has(n.next)) delete n.next;
      if (n.timeout && !have.has(n.timeout)) delete n.timeout;
      if (n.t === 'if') { n.then = ok(n.then); n.else = ok(n.else); }
      if (n.t === 'random') { n.to = n.to.filter(x => have.has(x)); }
      if (n.t === 'loop' && !have.has(n.to)) n.n = 0;
      if (n.choices) n.choices.forEach(c => { if (c.next && !have.has(c.next)) c.next = ''; });
    }
    return nodes.filter(n => !(n.t === 'random' && !n.to.length));
  }

  /** 返回 {ok, kind, title, name, say, nodes, error} */
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: '剧本不是对象' };
    const kind = raw.kind;
    if (kind === 'chat') {
      const s = str(raw.say || raw.text, 80);
      return s ? { ok: true, kind: 'chat', say: s } : { ok: false, error: '空回答' };
    }
    if (kind !== 'story' && kind !== 'skill') return { ok: false, error: '未知类型' };
    if (!Array.isArray(raw.nodes) || !raw.nodes.length) return { ok: false, error: '没有节点' };
    const ids = new Set(); let nodes = [];
    raw.nodes.slice(0, MAX_NODES).forEach((n, i) => { const c = sanitizeNode(n, i, ids); if (c) nodes.push(c); });
    if (!nodes.length) return { ok: false, error: '没有可用节点' };
    nodes = finalize(nodes);
    if (kind === 'skill') {
      const a = nodes.find(n => n.t === 'anim'); if (!a) return { ok: false, error: '动作里没有 anim' };
      return { ok: true, kind, name: str(raw.name, 8) || '新动作', nodes: [a] };
    }
    return { ok: true, kind, title: str(raw.title, 16), nodes };
  }

  function fmt(text, vars) { return String(text || '').replace(/\{([\w一-龥]{1,10})\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : '你')); }

  /** 变量赋值:"+2" / "-1" 表示增减,其它表示直接赋值 */
  function applySet(vars, map) {
    for (const k of Object.keys(map || {})) {
      const v = String(map[k]);
      if (/^[+-]\d+$/.test(v)) vars[k] = String((parseInt(vars[k], 10) || 0) + parseInt(v, 10));
      else vars[k] = v;
    }
  }
  function compare(a, op, b) {
    a = a == null ? '0' : String(a); b = String(b);
    const na = Number(a), nb = Number(b), numeric = a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb);
    const x = numeric ? na : a, y = numeric ? nb : b;
    switch (op) { case '==': return x === y; case '!=': return x !== y; case '>': return x > y; case '<': return x < y; case '>=': return x >= y; case '<=': return x <= y; }
    return false;
  }

  return { sanitize, sanitizeNode, finalize, pose, fmt, applySet, compare, ACTS, TYPES, ENUM, NUM, FX, WAITS, MOVES, TINTS, MAX_NODES, PLAT_STYLES, ANIMS, TAKES, FLY_TO, FLY_STYLE, FLY_THEN, JUMP_TO };
});
