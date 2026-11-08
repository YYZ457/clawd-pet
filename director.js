'use strict';
/* 导演:把"剧本"(内置的,或大模型写的 JSON)演出来。
   剧本只是数据:每个节点类型都在白名单里,数值有范围,文字会被截断;这里不执行任何模型生成的代码。
   v1.3:支持"流式剧本"(节点边到边演)、变量/条件/随机/循环、多道具、换装、氛围滤镜、二维追逐。 */
(() => {
  const ST = ScriptTools;
  let A = null;                       // brain 提供的接口
  let active = false, nodes = [], byId = {}, idx = 0, node = null, st = { t: 0 };
  let vars = {}, meta = { kind: 'story', title: '', premise: '', seg: 1, log: [], silent: false };
  let holdPose = null, animState = null, items = [], think = null, chipsEl = null, tintEl = null;
  let stream = null, steps = 0, loops = {}, wear = null, savedLook = null, carry = null, itemSeq = 0;
  const MAX_STEPS = 1500, MAX_SEG = 8;
  const INTERRUPT = new Set(['air', 'grab', 'petted', 'poke', 'ouch', 'tickle', 'dizzy', 'hold', 'startle', 'land', 'crouch', 'love', 'trip']);
  const DEF = { lift: 0, dy: 0, sx: 1, sy: 1, rot: 0, ex: 0, ey: 0, blush: 0, blink: 0, armL: [0, 0, 3], armR: [0, 0, 3] };
  const G = ['✻', '✽', '✶', '✳', '✢', '·'], V = ['Cogitating', 'Pondering', 'Noodling', 'Percolating', 'Scampering'];
  const TINT = { night: [20, 30, 90], sunset: [255, 140, 60], forest: [40, 140, 70], ocean: [40, 120, 200], rose: [255, 100, 160], gold: [255, 200, 60], dusk: [120, 70, 160] };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const sign = v => (v < 0 ? -1 : 1);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const fmt = t => ST.fmt(t, vars);

  const D = {};
  D.init = api => { A = api; chipsEl = document.getElementById('choices'); tintEl = document.getElementById('tint'); };
  D.active = () => active;
  D.busy = () => active || !!think;
  D.state = () => ({
    active, node: node && node.id, type: node && node.t, vars, title: meta.title, seg: meta.seg, log: meta.log, items: items.map(i => i.key), think: !!think,
    n: nodes.length, streaming: !!(stream && stream.open), carry: carry && carry.key, steps,
    choices: chipsEl && chipsEl.classList.contains('show') ? [...chipsEl.children].map(b => b.textContent) : []
  });
  D.chipsVisible = () => !!chipsEl && chipsEl.classList.contains('show');
  D.chipsRect = () => (D.chipsVisible() ? chipsEl.getBoundingClientRect() : null);

  // ------------------------------------------------------------ 开演 / 收场
  function teardown() {
    active = false; think = null; hideChips(); holdPose = null; animState = null; items = []; carry = null; stream = null; wear = null;
    restoreLook(); setTint({ color: 'none' });
  }
  function reset(raw, opts) {
    nodes = []; byId = {}; idx = 0; node = null; st = { t: 0 };
    if (!opts.cont) { vars = {}; loops = {}; steps = 0; meta = { kind: raw.kind, title: raw.title || '', name: raw.name || '', premise: opts.premise || '', seg: 1, log: [], silent: !!opts.silent }; items = []; carry = null; }
    else { meta.seg++; loops = {}; }
    active = true; hideChips(); holdPose = null; animState = null;
  }
  function titleCard(opts) { if (!opts.cont && meta.kind === 'story' && meta.title && !meta.silent) A.sayStory('🎬 《' + meta.title + '》', 1800, 'term'); }

  /** 整段剧本一次给齐(内置剧场 / 短回答 / 自创动作) */
  D.play = (raw, opts = {}) => {
    const r = ST.sanitize(raw);
    if (!r.ok) { A.say('这个剧本我看不懂…(' + (r.error || '') + ')', 3200, 'force'); return false; }
    think = null;
    if (r.kind === 'chat') {
      if (active) D.stop(true);
      A.say(r.say, clamp(2400 + r.say.length * 140, 2400, 9000), 'force');
      A.setMode('poke'); return true;
    }
    if (opts.cont && !active) opts = Object.assign({}, opts, { cont: false });
    if (active && !opts.cont) teardown();
    reset(r, opts);
    nodes = r.nodes; nodes.forEach((n, i) => { byId[n.id] = i; });
    stream = opts.truncated ? { id: -1, open: false, truncated: true } : null;
    ensureStory(); titleCard(opts);
    go(0, !opts.cont && meta.title && !meta.silent ? 1.2 : 0);
    return true;
  };

  D.playSkill = name => {
    const s = A.skills()[name]; if (!s) return false;
    return D.play({ kind: 'skill', name, nodes: [s] }, { silent: true });
  };

  /** 流式剧本:先 begin,再一批批 nodes,最后 end。节点一到就演。 */
  D.beginStream = m => {
    if (!m) return false;
    think = null;
    const cont = !!m.cont && active && node && node.t === 'continue';
    if (active && !cont) teardown();
    reset({ kind: 'story', title: m.title }, { cont, premise: m.premise });
    stream = { id: m.id, open: true, truncated: false, error: '' };
    ensureStory(); titleCard({ cont });
    node = { id: '__wait', t: '__wait', want: null, need: 0, from: -1, first: true }; st = { t: cont ? 0 : -1.2 };
    return true;
  };
  D.pushNodes = m => {
    if (!stream || !m || m.id !== stream.id || !Array.isArray(m.nodes)) return;
    for (const n of m.nodes) { if (n && n.id && byId[n.id] == null && nodes.length < ST.MAX_NODES) { byId[n.id] = nodes.length; nodes.push(n); } }
    if (think && active) think = null;
  };
  D.endStream = m => {
    if (!stream || !m || m.id !== stream.id) return;
    stream.open = false; stream.truncated = !!(m.ok && m.finish === 'length'); if (!m.ok) stream.error = m.error || '中断了';
  };

  D.stop = silent => {
    const was = active, open = !!(stream && stream.open);
    teardown();
    if (open && A.genAbort) A.genAbort();
    if (was && !silent) { A.sayStory('好啦~演完了!', 1600); A.setMode('idle', { dur: 1 }); }
  };

  function finish() {
    if (!active) return;
    teardown();
    if (!meta.silent && meta.kind === 'story') A.bump('story', meta.title);
    A.setMode('idle', { dur: 1 });
  }
  function endSoon() { node = { id: '__end', t: 'end', text: '' }; st = { t: 0, dur: 1.4 }; }
  function endOfScript() {
    if (stream && stream.error && !meta.silent) { A.sayStory('(信号断了,先演到这里~)', 2600); return endSoon(); }
    if (stream && stream.truncated && meta.seg < MAX_SEG && A.llmContinue) return requestContinue({ id: '__auto', t: 'continue', hint: '上一段被截断了,请自然地接着往下演' });
    if (meta.kind === 'skill' && !meta.silent) return askSave();
    finish();
  }

  function ensureStory() { const m = A.P.mode; if (m !== 'story' && !INTERRUPT.has(m)) A.setMode('story'); }

  // ------------------------------------------------------------ 流程控制
  /** 解析"下一个节点":返回下标,或 {wait:id}(目标节点还没从流里到达) */
  function nextOf(n, id) {
    const t = id != null && id !== '' ? id : n.next;
    if (t) { if (byId[t] != null) return byId[t]; if (stream && stream.open) return { wait: t }; }
    return idx + 1;
  }
  const adv = () => go(nextOf(node));
  function jump(id) { go(nextOf(node, id)); }
  function setWait(want, from) { node = { id: '__wait', t: '__wait', want: want || null, need: nodes.length, from: from == null ? idx : from }; st = { t: 0 }; }

  function go(i, delay) {
    let guard = 0;
    for (;;) {
      if (!active) return;
      if (i && typeof i === 'object') return setWait(i.wait, idx);
      if (i == null || i >= nodes.length) {
        if (stream && stream.open) return setWait(null, nodes.length - 1);
        return endOfScript();
      }
      if (++steps > MAX_STEPS) { A.sayStory('(绕晕了…先演到这里)', 2200); return endSoon(); }
      idx = i; node = nodes[i]; st = { t: 0 };
      if (delay) { st = { t: -delay, deferred: true }; return; }
      const nxt = enter(node);
      if (nxt === undefined) return;                       // 需要计时的节点,交给 update
      i = nxt; if (++guard > 300) return finish();
    }
  }

  // ------------------------------------------------------------ 进入节点
  function enter(n) {
    if (n.fx) spawnFx({ kind: n.fx, n: n.fxn || 3 });
    switch (n.t) {
      case 'say': {
        const text = fmt(n.text);
        st.dur = (n.ms ? n.ms : clamp(text.length * 170 + 1100, 1500, 7000)) / 1000;
        if (n.pose) holdPose = Object.assign(holdPose || {}, n.pose);
        if (n.act) A.setMode(n.act, { quiet: true }); else ensureStory();
        A.sayStory(text, st.dur * 1000 + 300); return;
      }
      case 'act': holdPose = null; animState = null; st.max = n.max || 6; A.setMode(n.name, n.name === 'sit' ? { dur: 3, quiet: true } : { quiet: true }); return;
      case 'anim': ensureStory(); holdPose = null; animState = { keys: n.keys, dur: n.dur, t: 0, loop: n.loop || 1 }; return;
      case 'move': ensureStory(); holdPose = null; setupMove(n); return;
      case 'face': ensureStory(); A.P.face = n.dir === 'left' ? -1 : n.dir === 'right' ? 1 : (A.cur.x < A.P.x ? -1 : 1); return nextOf(n);
      case 'fx': ensureStory(); spawnFx(n); st.dur = 0.55; return;
      case 'item': ensureStory(); if (n.remove) removeItems(n.remove); else addItem(n); st.dur = 0.5; return;
      case 'take': ensureStory(); doTake(n); st.dur = 0.5; return;
      case 'put': ensureStory(); doPut(); st.dur = 0.4; return;
      case 'wear': ensureStory(); doWear(n); st.dur = 0.6; return;
      case 'tint': setTint(n); return nextOf(n);
      case 'wait': ensureStory(); st.dur = n.sec; return;
      case 'ask': ensureStory(); A.sayStory(fmt(n.text), 150000); showChips(n.choices.map(c => ({ text: fmt(c.text), next: c.next, set: c.set })), true); st.limit = n.sec || 60; return;
      case 'wait_for': ensureStory(); st.hold = 0; return;
      case 'ask_text': {
        ensureStory(); A.sayStory(fmt(n.text), 150000); st.limit = 170;
        const me = n;
        (A.askText ? A.askText(fmt(n.text)) : Promise.resolve(null)).then(ans => {
          if (!active || node !== me) return;
          A.hideBubble();
          const v = ans ? String(ans).replace(/[<>{}\u0000-\u001f]/g, '').trim().slice(0, 16) : '';
          vars[me.key] = v || '朋友'; meta.log.push('回答' + me.key + '=' + vars[me.key]);
          adv();
        });
        return;
      }
      case 'set': ST.applySet(vars, n.vars); return nextOf(n);
      case 'if': { const ok = ST.compare(vars[n.key], n.op, n.value); return nextOf(n, (ok ? n.then : n.else) || n.next); }
      case 'random': {
        const live = n.to.filter(id => byId[id] != null || (stream && stream.open));
        return nextOf(n, live.length ? live[Math.floor(Math.random() * live.length)] : n.next);
      }
      case 'loop': { const c = (loops[n.id] = (loops[n.id] || 0) + 1); return c <= n.n ? nextOf(n, n.to) : nextOf(n, n.next); }
      case 'continue': requestContinue(n); return;
      case 'end': {
        ensureStory(); st.dur = 2.6;
        if (n.text) A.sayStory(fmt(n.text), 2600); else A.sayStory('完~', 1800);
        A.setMode('cheer', { quiet: true }); return;
      }
    }
    return nextOf(n);
  }

  // ------------------------------------------------------------ 每帧
  D.update = dt => {
    if (think) {
      think.t += dt; const i = Math.floor(think.t * 7);
      if (i !== think.i) { think.i = i; A.sayStory(`<span class="o">${G[i % G.length]}</span> ${V[Math.floor(think.t / 1.7) % V.length]}…`, 700, 'term', true); }
      if (think.t > 120) { think = null; if (!active) A.decide(); }
    }
    if (!active || !node) return;
    st.t += dt;
    if (st.t < 0) return;
    if (st.deferred) { st.deferred = false; st.t = 0; const nxt = enter(node); if (nxt !== undefined) go(nxt); return; }
    switch (node.t) {
      case '__wait': waitTick(); break;
      case 'say': if (st.t >= st.dur) { if (node.act) A.setMode('story'); adv(); } break;
      case 'fx': case 'item': case 'take': case 'put': case 'wear': case 'wait': if (st.t >= st.dur) adv(); break;
      case 'act': if (st.t >= st.max) { A.setMode('story'); adv(); } break;
      case 'anim': {
        animState.t += dt;
        if (animState.t >= animState.dur * animState.loop) { if (node.hold) holdPose = sample(animState.keys, 1); animState = null; adv(); }
        break;
      }
      case 'move': doMove(dt); break;
      case 'ask': if (st.t > st.limit) { hideChips(); A.sayStory('……(你不在吗?)', 2200); meta.log.push('没回应'); if (node.timeout) jump(node.timeout); else endSoon(); } break;
      case 'wait_for': checkWait(dt); break;
      case 'ask_text': if (st.t > st.limit) { A.hideBubble(); vars[node.key] = '朋友'; adv(); } break;
      case 'continue': if (st.t > 120) { A.sayStory('(故事线断了…)', 2200); endSoon(); } break;
      case 'end': if (st.t >= st.dur) finish(); break;
    }
    updateItems(dt);
  };

  // 等流里的下一批节点
  function waitTick() {
    const n = node;
    const ready = n.want ? byId[n.want] != null : nodes.length > n.need;
    if (ready) { think = null; return go(n.want ? byId[n.want] : n.need); }
    if (!stream || !stream.open) { if (n.want) return go(n.from + 1); return endOfScript(); }
    if (st.t > 1.0 && !think && !n.first) think = { t: 0, i: 0 };
    if (n.first && st.t > 1.0 && !think) think = { t: 0, i: 0 };
    if (st.t > 90) { stream.open = false; stream.error = '等太久了'; }
  }

  D.onFree = () => {
    if (!active) { if (think) { A.setMode('story'); return true; } return false; }
    if (node && node.t === 'act' && !st.advanced) { st.advanced = true; adv(); return true; }
    A.setMode('story'); return true;
  };

  D.event = name => {
    if (!active || !node || node.t !== 'wait_for' || st.t < 0.25) return;
    const w = node.what;
    if (w === name || (w === 'click' && name === 'tickle')) { meta.log.push('触发' + w); jump(node.next); }
  };

  // ------------------------------------------------------------ 等用户做某事
  function checkWait(dt) {
    const n = node, P = A.P, k = A.k(), S = A.S(), c = A.cur, W = A.W(), H = A.H();
    if (st.t > n.sec) { meta.log.push('没等到' + n.what); return jump(n.timeout); }
    let ok = null, need = 0.5;
    switch (n.what) {
      case 'near': ok = Math.hypot(c.x - P.x, c.y - (P.y - 5 * S)) < 110 * k; need = 0.6; break;
      case 'far': ok = Math.hypot(c.x - P.x, c.y - (P.y - 5 * S)) > 420 * k; need = 0.6; break;
      case 'hover': ok = A.overPet(c.x, c.y); need = 0.9; break;
      case 'still': ok = c.known && c.still > 2.5; need = 0.1; break;
      case 'move': ok = c.sp > 800; need = 0.2; break;
      case 'left': ok = c.known && c.x < W * 0.2; break;
      case 'right': ok = c.known && c.x > W * 0.8; break;
      case 'top': ok = c.known && c.y < H * 0.1; break;
      case 'bottom': ok = c.known && c.y > H * 0.9; break;
      case 'type': ok = A.typing(); break;
      default: return;                                    // 其余靠事件(pet / click / tickle / throw / grab)
    }
    st.hold = ok ? st.hold + dt : 0;
    if (st.hold > need) { meta.log.push('触发' + n.what); jump(n.next); }
  }

  // ------------------------------------------------------------ 移动(二维导航,可以追着鼠标跳上跳下)
  function setupMove(n) {
    st.moving = false; A.navReset();
    const P = A.P, pl = P.plat, pw = A.petW(), S = A.S();
    if (n.to === 'up' || n.to === 'down' || n.to === 'window' || n.to === 'ground') {
      const t = A.navPick(n.to);
      if (!t) { st.skip = true; return; }
      st.tx = t.x; st.ty = t.y; return;
    }
    if (pl && (n.to === 'left' || n.to === 'right' || n.to === 'center')) {
      const lo = pl.x1 + pw * 0.55, hi = pl.x2 - pw * 0.55;
      st.tx = n.to === 'left' ? lo : n.to === 'right' ? hi : (lo + hi) / 2; st.ty = P.y - 5.5 * S;
    }
  }
  function doMove(dt) {
    const n = node, S = A.S();
    if (st.skip) { return adv(); }
    let tx = st.tx, ty = st.ty;
    if (n.to === 'cursor') { tx = A.cur.x; ty = A.cur.y; }
    else if (n.to === 'item') {
      const it = findItem(n.item);
      if (!it || it.carried) return adv();
      tx = it.x; ty = it.y - 5.5 * S;
    }
    if (tx == null) { tx = A.P.x; ty = A.P.y - 5.5 * S; }
    const r = A.navStep(tx, ty, { run: n.run, dt, leap: n.to === 'cursor' });
    st.moving = A.navMoving();
    if (r === 'arrived' || r === 'stuck' || st.t > (n.to === 'cursor' ? 30 : 20)) { st.moving = false; adv(); }
  }

  // ------------------------------------------------------------ 选项按钮
  function showChips(list) {
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
    if (c.set) ST.applySet(vars, c.set);
    jump(c.next);
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
    if (meta.seg >= MAX_SEG || !A.llmContinue) { A.sayStory('(故事先讲到这里~)', 2200); return endSoon(); }
    node = n.id === '__auto' ? n : node; st = { t: 0 };
    think = { t: 0, i: 0 }; const me = node;
    A.llmContinue({ title: meta.title, premise: meta.premise, hint: n.hint, seg: meta.seg, log: meta.log, vars }).then(r => {
      if (!active || node !== me) return;
      if (!r || !r.ok) { think = null; A.sayStory('(故事线断了…' + ((r && r.error) || '') + ')', 3200); return endSoon(); }
      // 成功:接下来由 beginStream(cont) 或 play(cont) 接管
    }).catch(() => { think = null; if (active && node === me) { A.sayStory('(故事线断了…)', 2200); endSoon(); } });
  }

  // ------------------------------------------------------------ 特效 / 道具 / 换装 / 滤镜
  function spawnFx(n) {
    const P = A.P, S = A.S(), W = A.W(), c = n.n || 3;
    const txt = (t, color, o) => A.spawn('text', P.x + rnd(-2, 6) * S, P.y - 14 * S, Object.assign({ text: t, color, bold: true, vy: -22, vx: rnd(-8, 8), life: 1.4, size: 2.2 }, o || {}));
    switch (n.kind) {
      case 'heart': A.hearts(c); break;
      case 'star': A.stars(c); break;
      case 'note': for (let i = 0; i < c; i++) A.note(); break;
      case 'confetti': A.confetti(c * 6); break;
      case 'dust': A.dust(c); break;
      case 'zzz': A.ztext('z'); break;
      case 'text': A.spawn('text', P.x, P.y - 14 * S, { text: n.text || '!', color: '#ffd23f', bold: true, vy: -22, life: 1.5, size: 2.4 }); break;
      case 'question': txt('?', '#7ad0ff'); break;
      case 'exclaim': txt('!', '#ff6b6b'); break;
      case 'sweat': txt('💦', '#fff'); break;
      case 'anger': txt('💢', '#fff'); break;
      case 'sparkle': A.stars(c); txt('✨', '#fff', { vy: -14 }); break;
      case 'snow': for (let i = 0; i < c * 10; i++) A.spawn('confetti', rnd(0, W), rnd(-80, 0), { vx: rnd(-25, 25), vy: rnd(50, 110), life: rnd(5, 8), size: rnd(0.9, 1.6), color: '#fff', rot: rnd(0, 6), vr: rnd(-3, 3) }); break;
      case 'rain': for (let i = 0; i < c * 12; i++) A.spawn('confetti', rnd(0, W), rnd(-80, 0), { vx: rnd(-20, 0), vy: rnd(520, 760), life: rnd(1.6, 2.4), size: 0.7, color: '#7ad0ff', rot: 1.2, vr: 0 }); break;
      case 'fireworks': for (let b = 0; b < Math.min(3, c); b++) { const fx = rnd(0.2, 0.8) * W, fy = rnd(0.12, 0.4) * A.H(), col = ['#ffd23f', '#ff6b6b', '#7ad0ff', '#ff9ff3'][b % 4]; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, sp = rnd(120, 220); A.spawn('star', fx, fy, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 160, life: rnd(0.8, 1.3), size: rnd(1, 1.6), color: col }); } } break;
      case 'bubbles': for (let i = 0; i < c; i++) A.spawn('text', P.x + rnd(-6, 10) * S, P.y - rnd(8, 12) * S, { text: '○', color: '#bfe9ff', vx: rnd(-10, 10), vy: rnd(-40, -20), life: rnd(1.4, 2.2), size: rnd(0.9, 1.8), bold: true }); break;
    }
  }
  function addItem(n) {
    const P = A.P, pl = P.plat || { x1: 0, x2: A.W(), y: P.y }, pw = A.petW(), k = A.k(), S = A.S();
    let x, y = pl.y;
    switch (n.at) {
      case 'left': x = pl.x1 + pw * 1.2; break;
      case 'right': x = pl.x2 - pw * 1.2; break;
      case 'center': x = (pl.x1 + pl.x2) / 2; break;
      case 'far': x = P.x - P.face * 260 * k; break;
      case 'cursor': x = A.cur.x; y = A.cur.y + 5.5 * S; break;
      case 'random': x = rnd(pl.x1 + pw, pl.x2 - pw); break;
      default: x = P.x + P.face * 100 * k;
    }
    const it = { key: n.key || ('i' + (++itemSeq)), emoji: n.emoji, x: clamp(x, n.at === 'cursor' ? 20 : pl.x1 + pw * 0.6, n.at === 'cursor' ? A.W() - 20 : pl.x2 - pw * 0.6), y, t: 0, carried: false };
    items = items.filter(q => q.key !== it.key); items.push(it); if (items.length > 6) items.shift();
  }
  function removeItems(r) {
    if (r === true) { items = []; carry = null; return; }
    items = items.filter(q => q.key !== r); if (carry && carry.key === r) carry = null;
  }
  function findItem(key) { return (key && items.find(q => q.key === key)) || items[items.length - 1] || null; }
  function doTake(n) {
    let it = n.key ? items.find(q => q.key === n.key) : null;
    if (!it) { let best = null, bd = 1e9; for (const q of items) { if (q.carried) continue; const d = Math.abs(q.x - A.P.x) + Math.abs(q.y - A.P.y); if (d < bd) { bd = d; best = q; } } it = best; }
    if (!it) { A.spawn('text', A.P.x, A.P.y - 14 * A.S(), { text: '?', color: '#7ad0ff', bold: true, vy: -20, life: 1.2, size: 2.2 }); return; }
    if (carry) carry.carried = false;
    it.carried = true; carry = it; A.hearts(1);
  }
  function doPut() { if (!carry) return; carry.carried = false; carry.x = A.P.x + A.P.face * 40 * A.k(); carry.y = A.P.y; carry = null; }
  function updateItems(dt) { for (const it of items) { it.t += dt; if (it.carried) { it.x = A.P.x; it.y = A.P.y; } } }
  D.itemParticles = () => items.map(it => {
    const bob = Math.abs(Math.sin(it.t * 3)) * 3;
    if (it.carried) return { k: 'text', text: it.emoji, x: A.P.x + A.P.face * 1.5 * A.S(), y: A.P.y - 15.5 * A.S() - (A.P.hat ? 4.5 * A.S() : 0) - bob, life: 1, max: 1, size: 2.3 };
    return { k: 'text', text: it.emoji, x: it.x, y: it.y - 5.5 * A.S() - bob, life: 1, max: 1, size: 2.3 };
  });
  function doWear(n) {
    const P = A.P;
    if (!savedLook) savedLook = { hat: P.hat, base: P.baseHat, glasses: P.glasses };
    wear = wear || {};
    if (n.hat) { P.hat = P.baseHat = n.hat === 'none' ? null : n.hat; }
    if (n.glasses) P.glasses = n.glasses === 'none' ? null : n.glasses;
    if (n.prop) wear.prop = n.prop === 'none' ? null : n.prop;
    A.stars(5);
  }
  function restoreLook() { if (savedLook) { const P = A.P; P.hat = savedLook.hat; P.baseHat = savedLook.base; P.glasses = savedLook.glasses; savedLook = null; } }
  function setTint(n) {
    if (!tintEl) return;
    if (!n || n.color === 'none') { tintEl.style.opacity = '0'; return; }
    const c = TINT[n.color]; if (!c) return;
    tintEl.style.background = `rgb(${c[0]},${c[1]},${c[2]})`; tintEl.style.opacity = String(n.a || 0.2);
  }

  // ------------------------------------------------------------ 姿态(自创动作)
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
    if (animState) { const ph = (animState.t / animState.dur) % 1; Object.assign(p, sample(animState.keys, animState.t >= animState.dur * animState.loop ? 1 : clamp(ph, 0, 1))); }
    if (wear && wear.prop && !p.prop) p.prop = wear.prop;
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
