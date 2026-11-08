'use strict';
/* 剧本(剧情 / 自创动作)的格式定义与"消毒":大模型输出的只是数据,必须先过这里才允许播放。
   既在渲染进程使用,也能在 Node 里测试(UMD)。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScriptTools = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ACTS = ['wave', 'dance', 'cheer', 'spin', 'flip', 'stretch', 'bow', 'hiccup', 'sneeze', 'moonwalk', 'sit', 'read', 'coffee', 'cookie', 'laptop', 'hop', 'love', 'trip', 'doze', 'startle', 'critter'];
  const TYPES = ['say', 'act', 'anim', 'move', 'face', 'fx', 'item', 'wait', 'ask', 'wait_for', 'ask_text', 'continue', 'end'];
  const ENUM = {
    eye: ['open', 'happy', 'closed', 'wide', 'angry', 'sad', 'x', 'heart', 'dots', '><'],
    mouth: ['smile', 'o', 'big', 'yawn', 'frown', 'flat', 'cat', 'munch'],
    legs: ['stand', 'walk', 'run', 'tuck', 'air', 'dangle'],
    prop: ['book', 'mug', 'cookie', 'flower', 'balloon', 'sign', 'heart', 'laptop'],
    hat: ['santa', 'party', 'crown', 'bow', 'nightcap', 'pumpkin', 'redcap']
  };
  const NUM = { lift: [0, 5], dy: [-4, 4], sx: [0.5, 1.5], sy: [0.5, 1.5], rot: [-1.7, 1.7], ex: [-1, 1], ey: [-1, 1], blush: [0, 1], blink: [0, 1] };
  const FX = ['heart', 'star', 'note', 'confetti', 'dust', 'zzz', 'text'];
  const WAITS = ['pet', 'click', 'near', 'far', 'throw', 'tickle'];
  const EMOJI = /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|️)*$/u;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? clamp(v, a, b) : d; };
  const str = (v, n) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n) : '');

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
    const src = raw.nodes.slice(0, 24), nodes = [], ids = new Set();
    src.forEach((n, i) => {
      if (!n || typeof n !== 'object' || !TYPES.includes(n.t)) return;
      let id = str(n.id, 12) || 'n' + i; if (ids.has(id)) id = id + '_' + i; ids.add(id);
      const c = { id, t: n.t };
      if (n.next != null) c.next = str(n.next, 12);
      switch (n.t) {
        case 'say': c.text = str(n.text, 60); if (!c.text) return; if (n.ms != null) c.ms = num(n.ms, 600, 8000, 2200); break;
        case 'act': if (!ACTS.includes(n.name)) return; c.name = n.name; c.max = num(n.max, 1, 10, 0) || undefined; break;
        case 'anim': {
          if (!Array.isArray(n.keys) || !n.keys.length) return;
          c.dur = num(n.dur, 0.2, 8, 1.5);
          c.keys = n.keys.slice(0, 12).map(k => Object.assign({ t: num(k && k.t, 0, 1, 0) }, pose(k))).sort((a, b) => a.t - b.t);
          if (n.hold) c.hold = true; break;
        }
        case 'move': c.to = ['left', 'right', 'center', 'cursor', 'item'].includes(n.to) ? n.to : 'center'; c.run = !!n.run; break;
        case 'face': c.dir = ['left', 'right', 'cursor'].includes(n.dir) ? n.dir : 'cursor'; break;
        case 'fx': c.kind = FX.includes(n.kind) ? n.kind : 'star'; c.n = Math.round(num(n.n, 1, 10, 4)); c.text = str(n.text, 4); break;
        case 'item':
          if (n.remove) c.remove = true;
          else { const e = str(n.emoji, 8); if (!EMOJI.test(e)) return; c.emoji = e; c.at = ['left', 'right', 'center', 'near', 'far'].includes(n.at) ? n.at : 'near'; }
          break;
        case 'wait': c.sec = num(n.sec, 0.2, 15, 1); break;
        case 'ask': {
          c.text = str(n.text, 40);
          c.choices = (Array.isArray(n.choices) ? n.choices : []).slice(0, 3).map(x => ({ text: str(x && x.text, 10), next: str(x && x.next, 12) })).filter(x => x.text);
          if (!c.text || c.choices.length < 1) return; break;
        }
        case 'wait_for': c.what = WAITS.includes(n.what) ? n.what : 'pet'; c.sec = num(n.sec, 2, 30, 12); if (n.timeout != null) c.timeout = str(n.timeout, 12); break;
        case 'ask_text': c.text = str(n.text, 40); c.key = (str(n.key, 10).replace(/\W/g, '') || 'ans'); if (!c.text) return; break;
        case 'continue': c.hint = str(n.hint, 80); break;
        case 'end': c.text = str(n.text, 40); break;
      }
      nodes.push(c);
    });
    if (!nodes.length) return { ok: false, error: '没有可用节点' };
    const have = new Set(nodes.map(n => n.id));
    for (const n of nodes) {
      if (n.next && !have.has(n.next)) delete n.next;
      if (n.timeout && !have.has(n.timeout)) delete n.timeout;
      if (n.choices) n.choices.forEach(c => { if (c.next && !have.has(c.next)) c.next = ''; });
    }
    if (kind === 'skill') {
      const a = nodes.find(n => n.t === 'anim'); if (!a) return { ok: false, error: '动作里没有 anim' };
      return { ok: true, kind, name: str(raw.name, 8) || '新动作', nodes: [a] };
    }
    return { ok: true, kind, title: str(raw.title, 16), nodes };
  }

  function fmt(text, vars) { return String(text || '').replace(/\{(\w{1,10})\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : '你')); }

  return { sanitize, pose, fmt, ACTS, TYPES, ENUM, NUM };
});
