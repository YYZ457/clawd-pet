'use strict';
/* 导演:把"剧本"(内置的,或大模型写的 JSON)演出来。
   剧本只是数据:每个节点类型都在白名单里,数值有范围,文字会被截断;这里不执行任何模型生成的代码。 */
(() => {
  let A = null;                       // brain 提供的接口
  let active = false, nodes = [], byId = {}, idx = 0, node = null, st = { t: 0 };
  let vars = {}, meta = { kind: 'story', title: '', premise: '', seg: 1, log: [], silent: false };
  let holdPose = null, animState = null, items = [], think = null, chipsEl = null;
  const INTERRUPT = new Set(['air', 'grab', 'petted', 'poke', 'ouch', 'tickle', 'dizzy', 'hold', 'startle', 'land', 'crouch', 'love', 'trip']);
  const DEF = { lift: 0, dy: 0, sx: 1, sy: 1, rot: 0, ex: 0, ey: 0, blush: 0, blink: 0, armL: [0, 0, 3], armR: [0, 0, 3] };
  const ENUMS = ['eye', 'mouth', 'legs', 'prop', 'hat'];
  const G = ['✻', '✽', '✶', '✳', '✢', '·'], V = ['Cogitating', 'Pondering', 'Noodling', 'Percolating', 'Scampering'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const sign = v => (v < 0 ? -1 : 1);
  const fmt = t => ScriptTools.fmt(t, vars);

  const D = {};
  D.init = api => { A = api; chipsEl = document.getElementById('choices'); };
  D.active = () => active;
  D.busy = () => active || !!think;
  D.state = () => ({ active, node: node && node.id, type: node && node.t, vars, title: meta.title, seg: meta.seg, log: meta.log, items: items.length, think: !!think, choices: chipsEl && chipsEl.classList.contains('show') ? [...chipsEl.children].map(b => b.textContent) : [] });
  D.chipsVisible = () => !!chipsEl && chipsEl.classList.contains('show');
  D.chipsRect = () => (D.chipsVisible() ? chipsEl.getBoundingClientRect() : null);

  // ------------------------------------------------------------ 播放
  D.play = (raw, opts = {}) => {
    const r = ScriptTools.sanitize(raw);
    if (!r.ok) { A.say('这个剧本我看不懂…(' + (r.error || '') + ')', 3200, 'force'); return false; }
    if (r.kind === 'chat') {
      think = null;
      if (active) D.stop(true);
      A.say(r.say, clamp(2400 + r.say.length * 140, 2400, 9000), 'force');
      A.setMode('poke'); return true;
    }
    think = null;
    if (active && !opts.cont) D.stop(true);
    nodes = r.nodes; byId = {}; nodes.forEach((n, i) => { byId[n.id] = i; });
    if (!opts.cont) {
      vars = {};
      meta = { kind: r.kind, title: r.title || '', name: r.name || '', premise: opts.premise || '', seg: 1, log: [], silent: !!opts.silent };
      items = [];
    } else meta.seg++;
    active = true; hideChips(); holdPose = null; animState = null;
    ensureStory();
    if (!opts.cont && meta.kind === 'story' && meta.title && !meta.silent) A.sayStory('🎬 《' + meta.title + '》', 1800, 'term');
    go(0, !opts.cont && meta.title && !meta.silent ? 1.2 : 0);
    return true;
  };

  D.playSkill = name => {
    const s = A.skills()[name]; if (!s) return false;
    return D.play({ kind: 'skill', name, nodes: [s] }, { silent: true });
  };

  D.stop = silent => {
    const was = active;
    active = false; think = null; hideChips(); holdPose = null; animState = null; items = [];
    if (was && !silent) { A.sayStory('好啦~演完了!', 1600); }
    if (was && !silent) A.setMode('idle', { dur: 1 });
  };

  function finish() {
    if (!active) return;
    active = false; hideChips(); holdPose = null; animState = null; items = [];
    if (!meta.silent && meta.kind === 'story') A.bump('story', meta.title);
    A.setMode('idle', { dur: 1 });
  }

  function ensureStory() { const m = A.P.mode; if (m !== 'story' && !INTERRUPT.has(m)) A.setMode('story'); }
  const nextIdx = () => ((node && node.next && byId[node.next] != null) ? byId[node.next] : idx + 1);
  const adv = () => go(nextIdx());
  function jump(id) { if (id && byId[id] != null) go(byId[id]); else adv(); }

  function go(i, delay) {
    if (!active) return;
    if (i == null || i >= nodes.length) { if (meta.kind === 'skill' && !meta.silent) return askSave(); return finish(); }
    idx = i; node = nodes[i];
    if (delay) { st = { t: -delay, deferred: true }; return; }
    st = { t: 0 };
    enter(node);
  }

  // ------------------------------------------------------------ 节点
  function enter(n) {
    switch (n.t) {
      case 'say': {
        ensureStory(); const text = fmt(n.text);
        st.dur = (n.ms ? n.ms : clamp(text.length * 170 + 1100, 1500, 6500)) / 1000;
        A.sayStory(text, st.dur * 1000 + 300); break;
      }
      case 'act': holdPose = null; animState = null; st.max = n.max || 6; A.setMode(n.name, n.name === 'sit' ? { dur: 3, quiet: true } : { quiet: true }); break;
      case 'anim': ensureStory(); holdPose = null; animState = { keys: n.keys, dur: n.dur, t: 0 }; break;
      case 'move': ensureStory(); holdPose = null; st.moving = false; break;
      case 'face': ensureStory(); A.P.face = n.dir === 'left' ? -1 : n.dir === 'right' ? 1 : (A.cur.x < A.P.x ? -1 : 1); adv(); break;
      case 'fx': ensureStory(); spawnFx(n); st.dur = 0.55; break;
      case 'item': ensureStory(); if (n.remove) items = []; else addItem(n); st.dur = 0.5; break;
      case 'wait': ensureStory(); st.dur = n.sec; break;
      case 'ask': ensureStory(); A.sayStory(fmt(n.text), 90000); showChips(n.choices.map(c => ({ text: fmt(c.text), next: c.next })), true); st.limit = 60; break;
      case 'wait_for': ensureStory(); st.hold = 0; break;
      case 'ask_text': {
        ensureStory(); A.sayStory(fmt(n.text), 90000); st.limit = 50;
        const me = n;
        (A.askText ? A.askText(fmt(n.text)) : Promise.resolve(null)).then(ans => {
          if (!active || node !== me) return;
          A.hideBubble();
          const v = ans ? String(ans).replace(/[<>{}\u0000-\u001f]/g, '').trim().slice(0, 16) : '';
          vars[me.key] = v || '(没说话)'; meta.log.push('回答' + me.key + '=' + vars[me.key]);
          adv();
        });
        break;
      }
      case 'continue': requestContinue(n); break;
      case 'end': {
        ensureStory(); st.dur = 2.6;
        if (n.text) A.sayStory(fmt(n.text), 2600); else A.sayStory('完~', 1800);
        A.setMode('cheer', { quiet: true }); break;
      }
    }
  }

  D.update = dt => {
    if (think) {
      think.t += dt; const i = Math.floor(think.t * 7);
      if (i !== think.i) { think.i = i; A.sayStory(`<span class="o">${G[i % G.length]}</span> ${V[Math.floor(think.t / 1.7) % V.length]}…`, 700, 'term', true); }
      if (think.t > 75) { think = null; if (!active) A.decide(); }
    }
    if (!active || !node) { return; }
    st.t += dt;
    if (st.t < 0) return;
    if (st.deferred) { st.deferred = false; st.t = 0; enter(node); return; }
    const P = A.P;
    switch (node.t) {
      case 'say': case 'fx': case 'item': case 'wait': if (st.t >= st.dur) adv(); break;
      case 'act': if (st.t >= st.max) { A.setMode('story'); adv(); } break;
      case 'anim':
        animState.t += dt;
        if (animState.t >= animState.dur) { if (node.hold) holdPose = finalPose(animState.keys); animState = null; adv(); }
        break;
      case 'move': doMove(dt); break;
      case 'ask': if (st.t > st.limit) { hideChips(); A.sayStory('……(你不在吗?)', 2200); meta.log.push('没回应'); endSoon(); } break;
      case 'wait_for': checkWait(dt); break;
      case 'ask_text': if (st.t > st.limit) { /* 由聊天窗口关闭来结束 */ } break;
      case 'continue': if (st.t > 80) { A.sayStory('(故事线断了…)', 2200); endSoon(); } break;
      case 'end': if (st.t >= st.dur) finish(); break;
    }
    updateItems(dt);
  };

  function endSoon() { node = { id: '__end', t: 'end', text: '' }; st = { t: 0, dur: 1.4 }; }

  D.onFree = () => {
    if (!active) { if (think) { A.setMode('story'); return true; } return false; }
    if (node && node.t === 'act' && !st.advanced) { st.advanced = true; adv(); return true; }
    if (node && node.t === 'end' && !st.advanced) { A.setMode('story'); return true; }
    A.setMode('story'); return true;
  };

  D.event = name => {
    if (!active || !node || node.t !== 'wait_for' || st.t < 0.25) return;
    const w = node.what;
    if (w === name || (w === 'click' && name === 'tickle')) jump(node.next);
  };

  function checkWait(dt) {
    const n = node, P = A.P, k = A.k(), S = A.S();
    if (st.t > n.sec) return jump(n.timeout);
    if (n.what === 'near' || n.what === 'far') {
      const d = Math.hypot(A.cur.x - P.x, A.cur.y - (P.y - 5 * S));
      const ok = n.what === 'near' ? d < 110 * k : d > 420 * k;
      st.hold = ok ? st.hold + dt : 0;
      if (st.hold > 0.6) jump(n.next);
    }
  }

  function doMove(dt) {
    const P = A.P, pl = P.plat, k = A.k(), pw = A.petW();
    if (!pl || P.mode !== 'story') { st.moving = false; return; }
    const lo = pl.x1 + pw * 0.55, hi = pl.x2 - pw * 0.55;
    let tx;
    switch (node.to) {
      case 'left': tx = lo; break;
      case 'right': tx = hi; break;
      case 'cursor': tx = A.cur.x; break;
      case 'item': tx = items.length ? items[items.length - 1].x : (lo + hi) / 2; break;
      default: tx = (lo + hi) / 2;
    }
    tx = clamp(tx, lo, hi);
    const dx = tx - P.x, sp = (node.run ? 190 : 80) * k;
    if (Math.abs(dx) < 9 * k || st.t > 14) { st.moving = false; adv(); return; }
    P.face = sign(dx); P.x += sign(dx) * Math.min(Math.abs(dx), sp * dt); P.legT += dt * sp / (6 * A.S()) * Math.PI; st.moving = true;
  }

  // ------------------------------------------------------------ 选项按钮
  function showChips(list, sticky) {
    chipsEl.innerHTML = '';
    list.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c.text;
      b.addEventListener('click', e => { e.stopPropagation(); pick(c); });
      chipsEl.appendChild(b);
    });
    chipsEl.classList.add('show');
  }
  function hideChips() { if (chipsEl) { chipsEl.classList.remove('show'); chipsEl.innerHTML = ''; } }
  function pick(c) {
    if (!active || !node || node.t !== 'ask') return;
    hideChips(); A.hideBubble();
    if (c.cb) return c.cb();
    meta.log.push('选:' + c.text);
    if (c.next && byId[c.next] != null) go(byId[c.next]); else adv();
  }

  function askSave() {
    const a = nodes.find(n => n.t === 'anim');
    node = { id: '__save', t: 'ask', text: '', choices: [] }; st = { t: 0, limit: 45 };
    ensureStory();
    A.sayStory(`学会「${meta.name || '新动作'}」啦!收下吗?`, 90000);
    showChips([
      { text: '收下 ✓', cb: () => { A.saveSkill(meta.name || '新动作', a); A.sayStory('收进动作书啦!以后会偶尔表演~', 2600); endSoon(); } },
      { text: '不要', cb: () => { A.sayStory('好吧~', 1400); endSoon(); } }
    ]);
  }

  function requestContinue(n) {
    if (meta.seg >= 4 || !A.llmContinue) { A.sayStory('(故事先讲到这里~)', 2200); return endSoon(); }
    think = { t: 0, i: 0 }; const me = n;
    A.llmContinue({ title: meta.title, premise: meta.premise, hint: n.hint, seg: meta.seg, log: meta.log }).then(r => {
      think = null; if (!active || node !== me) return;
      if (!r || !r.ok) { A.sayStory('(故事线断了…' + ((r && r.error) || '') + ')', 3200); return endSoon(); }
      D.play(r.payload, { cont: true });
    }).catch(() => { think = null; if (active && node === me) { A.sayStory('(故事线断了…)', 2200); endSoon(); } });
  }

  // ------------------------------------------------------------ 特效 / 道具
  function spawnFx(n) {
    const P = A.P, S = A.S();
    switch (n.kind) {
      case 'heart': A.hearts(n.n); break;
      case 'star': A.stars(n.n); break;
      case 'note': for (let i = 0; i < n.n; i++) A.note(); break;
      case 'confetti': A.confetti(n.n * 6); break;
      case 'dust': A.dust(n.n); break;
      case 'zzz': A.ztext('z'); break;
      case 'text': A.spawn('text', P.x, P.y - 14 * S, { text: n.text || '!', color: '#ffd23f', bold: true, vy: -22, life: 1.5, size: 2.4 }); break;
    }
  }
  function addItem(n) {
    const P = A.P, pl = P.plat || { x1: 0, x2: A.W(), y: P.y }, pw = A.petW(), k = A.k();
    let x;
    switch (n.at) {
      case 'left': x = pl.x1 + pw * 1.2; break;
      case 'right': x = pl.x2 - pw * 1.2; break;
      case 'center': x = (pl.x1 + pl.x2) / 2; break;
      case 'far': x = P.x - P.face * 260 * k; break;
      default: x = P.x + P.face * 100 * k;
    }
    items = [{ emoji: n.emoji, x: clamp(x, pl.x1 + pw * 0.6, pl.x2 - pw * 0.6), y: pl.y, t: 0 }];
  }
  function updateItems(dt) { for (const it of items) { it.t += dt; if (A.P.plat) it.y = A.P.plat.y; } }
  D.itemParticles = () => items.map(it => ({ k: 'text', text: it.emoji, x: it.x, y: it.y - 5.5 * A.S() - Math.abs(Math.sin(it.t * 3)) * 3, life: 1, max: 1, size: 2.3 }));

  // ------------------------------------------------------------ 姿态(自创动作)
  function finalPose(keys) { return sample(keys, 1); }
  function sample(keys, tt) {
    const out = {};
    const names = new Set();
    keys.forEach(k => Object.keys(k).forEach(n => { if (n !== 't') names.add(n); }));
    for (const name of names) {
      const has = keys.filter(k => k[name] !== undefined);
      let a = null, b = null;
      for (const k of has) { if (k.t <= tt) a = k; else if (!b) b = k; }
      if (name in DEF) {
        const d = DEF[name];
        const va = a ? a[name] : d, vb = b ? b[name] : va;
        const ta = a ? a.t : 0, tb = b ? b.t : ta;
        const f = tb > ta ? ease((tt - ta) / (tb - ta)) : 0;
        out[name] = Array.isArray(va) ? va.map((x, i) => lerp(x, vb[i], f)) : lerp(va, vb, f);
      } else if (a) out[name] = a[name];
    }
    return out;
  }
  D.applyPose = p => {
    if (holdPose) Object.assign(p, holdPose);
    if (animState) Object.assign(p, sample(animState.keys, clamp(animState.t / animState.dur, 0, 1)));
    if (think && !animState) { p.eye = 'dots'; p.ey = -1; p.ex = 0; p.mouth = 'flat'; p.rot = Math.sin(A.now() * 3) * 0.05; }
    if (node && node.t === 'move' && st.moving) { const run = node.run; p.legs = run ? 'run' : 'walk'; p.legT = A.P.legT; p.dy = -Math.abs(Math.sin(A.P.legT)) * (run ? 1.3 : 0.7); p.rot = A.P.face * (run ? 0.1 : 0.03); if (run) p.mouth = 'big'; }
    if (node && node.t === 'ask') { p.mouth = p.mouth || 'smile'; }
  };

  D.thinking = on => {
    if (on) { if (!think) think = { t: 0, i: 0 }; if (!active) A.setMode('story'); }
    else if (think) { think = null; if (!active) { A.hideBubble(); A.decide(); } }
  };

  window.Director = D;
})();
