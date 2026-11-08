'use strict';
/* 导演:把"剧本"(内置的,或大模型写的 JSON)演出来。
   剧本只是数据:每个节点类型都在白名单里,数值有范围,文字会被截断;这里不执行任何模型生成的代码。
   v1.3:流式剧本(节点边到边演)、变量/条件/随机/循环、多道具、换装、氛围滤镜、二维追逐。
   v1.4:像素道具(内置道具库 + 模型自己设计的像素图)、凭空造平台(钢丝/木板/云…)、飞行(抓着气球)、任意高度大跳。 */
(() => {
  const ST = ScriptTools, Pr = window.Props;
  let A = null;                       // brain 提供的接口
  let active = false, nodes = [], byId = {}, idx = 0, node = null, st = { t: 0 };
  let vars = {}, meta = { kind: 'story', title: '', premise: '', seg: 1, log: [], silent: false };
  let holdPose = null, animState = null, items = [], think = null, chipsEl = null, tintEl = null;
  let stream = null, steps = 0, loops = {}, wear = null, savedLook = null, carry = null, itemSeq = 0;
  let sprites = {}, platforms = {}, hov = null, flyS = null;
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
    n: nodes.length, streaming: !!(stream && stream.open), carry: carry && carry.key, steps, platforms: Object.keys(platforms), sprites: Object.keys(sprites), flying: !!(A && A.P.fly), fly: flyS ? { phase: flyS.phase, t: +flyS.t.toFixed(2), then: flyS.then } : null,
    choices: chipsEl && chipsEl.classList.contains('show') ? [...chipsEl.children].map(b => b.textContent) : []
  });
  D.chipsVisible = () => !!chipsEl && chipsEl.classList.contains('show');
  D.chipsRect = () => (D.chipsVisible() ? chipsEl.getBoundingClientRect() : null);

  // ------------------------------------------------------------ 开演 / 收场
  function teardown() {
    active = false; think = null; hideChips(); holdPose = null; animState = null; items = []; carry = null; stream = null; wear = null;
    restoreLook(); setTint({ color: 'none' });
    if (A && A.P.fly) { A.P.fly = false; flyS = null; hov = null; A.startFall(0, 0); }
    flyS = null; hov = null; sprites = {};
    if (Object.keys(platforms).length) { platforms = {}; pushPlats(); }    // 站在剧情平台上的话,收场时会自然掉下来
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
    // 飞着的时候来了需要"站在平台上"的节点 → 先轻轻落地
    if (A.P.fly && (n.t === 'move' || n.t === 'jump' || n.t === 'act')) { endFly(); A.startFall(0, 0); }
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
      case 'sprite': sprites[n.name] = { name: n.name, rows: n.rows, pal: n.pal, anchor: n.anchor }; return nextOf(n);
      case 'platform': doPlatform(n); return nextOf(n);
      case 'fly': ensureStory(); startFly(n); return;
      case 'jump': ensureStory(); holdPose = null; st.phase = 0; return;
      case 'fall': if (A.P.fly) { endFly(); A.startFall(A.P.face * 30 * A.k(), 0); } return nextOf(n);
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
    // 飞到一半被用户拎起来 / 扔出去 → 放弃飞行
    if (A.P.fly && (A.P.mode === 'grab' || A.P.mode === 'air' || A.P.mode === 'hold')) { endFly(); if (node.t === 'fly') { adv(); return; } }
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
      case 'fly': flyTick(dt); break;
      case 'jump': jumpTick(dt); break;
      case 'ask': if (st.t > st.limit) { hideChips(); A.sayStory('……(你不在吗?)', 2200); meta.log.push('没回应'); if (node.timeout) jump(node.timeout); else endSoon(); } break;
      case 'wait_for': checkWait(dt); break;
      case 'ask_text': if (st.t > st.limit) { A.hideBubble(); vars[node.key] = '朋友'; adv(); } break;
      case 'continue': if (st.t > 120) { A.sayStory('(故事线断了…)', 2200); endSoon(); } break;
      case 'end': if (st.t >= st.dur) finish(); break;
    }
    if (A.P.fly && node && node.t !== 'fly') hoverTick(dt);
    updateItems(dt);
    ropeFx(dt);
  };

  // 等流里的下一批节点
  function waitTick() {
    const n = node;
    const ready = n.want ? byId[n.want] != null : nodes.length > n.need;
    if (ready) { think = null; return go(n.want ? byId[n.want] : n.need); }
    if (!stream || !stream.open) { if (n.want) return go(n.from + 1); return endOfScript(); }
    if (st.t > 1.0 && !think) think = { t: 0, i: 0 };
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
    const P = A.P, pl = P.plat, pw = A.petW(), S = A.S(), W = A.W(), H = A.H();
    if (n.to === 'up' || n.to === 'down' || n.to === 'window' || n.to === 'ground') {
      const t = A.navPick(n.to);
      if (!t) { st.skip = true; return; }
      st.tx = t.x; st.ty = t.y; return;
    }
    if (n.to === 'point') { st.tx = n.x * W; st.ty = n.y * H - 5.5 * S; return; }
    if (n.to === 'plat') {
      const p = platforms[n.key]; if (!p) { st.skip = true; return; }
      const m = pw * 0.55; st.tx = n.at === 'left' ? p.x1 * W + m : n.at === 'right' ? p.x2 * W - m : (p.x1 + p.x2) / 2 * W; st.ty = p.yy - 5.5 * S; return;
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
    // 去的是"凭空造出来的平台",而普通的跳跃够不着 → 自动大跳一次
    if (n.to === 'plat' && r === 'arrived' && A.P.platKey !== 'p' + n.key && !st.autoJump) { st.autoJump = true; if (A.bigJump({ to: 'plat', key: n.key, at: n.at })) return; }
    if (r === 'arrived' || r === 'stuck' || st.t > (n.to === 'cursor' ? 30 : 20)) { st.moving = false; adv(); }
  }

  // ------------------------------------------------------------ 大跳
  function jumpTick() {
    const P = A.P, n = node, S = A.S();
    if (st.phase === 0) {
      if (P.mode !== 'story' || !P.plat) { if (st.t > 4) adv(); return; }
      const sp = { h: n.h, dx: n.dx, to: n.to, key: n.key, at: n.at };
      st.phase = A.bigJump(sp) ? 1 : 2; st.t0 = st.t; return;
    }
    if (st.phase === 2) { adv(); return; }
    if (P.y < A.petH() + 8 * S && !st.bonk) { st.bonk = true; A.stars(6); A.spawn('text', P.x, P.y - 14 * S, { text: '!', color: '#ffd23f', bold: true, vy: -20, life: 0.9, size: 2.4 }); }
    if (st.t - st.t0 > 0.4 && P.mode === 'story' && P.plat) adv();
    else if (st.t - st.t0 > 8) adv();
  }

  // ------------------------------------------------------------ 飞行(抓着气球…)
  function flyTarget(n) {
    const P = A.P, W = A.W(), H = A.H(), S = A.S(), pw = A.petW(), gy = A.groundY();
    let ymin = A.petH() + 6 * S;
    if (carry && carry.how === 'balloon') { const sp = resolveSpr(carry), nh = sp && Pr ? Pr.normalize(sp).h : 11; ymin = Math.max(ymin, 21 * S + nh * S * carry.scale + 4 * S); }   // 抓着气球飞,气球本身也得留在屏幕里
    let x = P.x, y = P.y;
    switch (n.to) {
      case 'top': y = ymin + 6 * S; break;
      case 'bottom': case 'ground': y = gy; break;
      case 'left': x = W * 0.12; break;
      case 'right': x = W * 0.88; break;
      case 'center': x = W / 2; break;
      case 'cursor': x = A.cur.x; y = A.cur.y + 6 * S; break;
      case 'up': y = P.y - 0.3 * H; break;
      case 'down': y = P.y + 0.3 * H; break;
      case 'point': x = n.x * W; y = n.y * H; break;
    }
    return { x: clamp(x, pw / 2, W - pw / 2), y: clamp(y, ymin, gy) };
  }
  function startFly(n) {
    const P = A.P, t = flyTarget(n);
    P.plat = null; P.platKey = null; P.vx = P.vy = 0; P.fly = true; hov = null;
    flyS = { x0: P.x, y0: P.y, x1: t.x, y1: t.y, dur: n.sec, t: 0, style: n.style, then: n.then, phase: 1, px: P.x, py: P.y };
    A.dust(3); A.stars(3);
  }
  function endFly() { A.P.fly = false; flyS = null; hov = null; }
  function flyTick(dt) {
    const P = A.P, S = A.S(), f = flyS; if (!f) return adv();
    f.t += dt;
    if (f.phase === 1) {
      const u = clamp(f.t / f.dur, 0, 1), e = f.style === 'dash' ? 1 - Math.pow(1 - u, 3) : ease(u), env = Math.sin(Math.PI * u);
      const swayAmp = (f.style === 'dash' ? 3 : 10) * S, bob = f.style === 'bounce' ? Math.abs(Math.sin(f.t * 5)) * 5 * S : Math.sin(f.t * 4) * 1.2 * S;
      P.x = lerp(f.x0, f.x1, e) + Math.sin(f.t * 2.6) * swayAmp * env;
      P.y = lerp(f.y0, f.y1, e) - bob * (f.style === 'bounce' ? 1 : env);
      const dx = f.x1 - f.x0; if (Math.abs(dx) > 40 && u < 0.98) P.face = sign(dx);
      P.legT += dt * 5; f.vx = (P.x - f.px) / Math.max(dt, 0.001); f.px = P.x; f.py = P.y;
      if (f.style === 'dash' && Math.random() < dt * 14) A.dust(1, -P.face);
      if (u >= 1) {
        if (f.then === 'fall') { endFly(); A.startFall(P.face * 40 * A.k(), 0); adv(); }
        else if (f.then === 'land') { const pl = A.platBelow(P.x, P.y); f.land = pl; f.phase = 2; f.t = 0; f.y0 = P.y; f.x0 = P.x; }
        else { hov = { x: P.x, y: P.y, t: 0 }; flyS = null; adv(); }
      }
    } else if (f.phase === 2) {                          // 缓缓降落到下面的平台
      const u = clamp(f.t / 1.4, 0, 1), pl = f.land || A.platBelow(P.x, P.y);
      P.y = lerp(f.y0, pl.y, ease(u)); P.x = f.x0 + Math.sin(f.t * 2.4) * 4 * S * (1 - u); P.legT += dt * 4;
      if (u >= 1) { endFly(); A.P.x = clamp(P.x, pl.x1 + 4, pl.x2 - 4); A.attachTo(pl); A.dust(4); adv(); }
    }
  }
  function hoverTick(dt) {
    const P = A.P, S = A.S();
    if (!hov) hov = { x: P.x, y: P.y, t: 0 };
    hov.t += dt; P.legT += dt * 3.5;
    P.x = hov.x + Math.sin(hov.t * 1.3) * 5 * S; P.y = hov.y + Math.sin(hov.t * 2.1) * 2 * S;
  }

  // ------------------------------------------------------------ 平台(钢丝 / 木板 / 云 / 石台…)
  function pushPlats() {
    const W = A.W(), H = A.H(), S = A.S(), ymin = A.petH() + 12, gy = A.groundY();
    A.setExtraPlats(Object.values(platforms).map(p => { p.yy = clamp(p.y * H, ymin + 6 * S, gy - 20 * S); return { key: 'p' + p.key, x1: p.x1 * W, x2: p.x2 * W, y: p.yy }; }));
  }
  function doPlatform(n) {
    if (n.remove) { if (n.remove === true) platforms = {}; else delete platforms[n.remove]; pushPlats(); return; }
    if (!platforms[n.key] && Object.keys(platforms).length >= 6) return;
    platforms[n.key] = { key: n.key, x1: n.x1, x2: n.x2, y: n.y, style: n.style, t: 0, yy: 0 };
    pushPlats(); A.dust(2);
  }
  const onPlat = () => { const k = A.P.platKey; return k && k[0] === 'p' ? platforms[k.slice(1)] : null; };
  function ropeFx(dt) {                                  // 走钢丝:偶尔冒汗
    const p = onPlat(); if (p && p.style === 'rope' && A.P.mode === 'story' && Math.random() < dt * 0.5) A.spawn('text', A.P.x + 6 * A.S(), A.P.y - 13 * A.S(), { text: '💦', color: '#fff', bold: true, vy: -16, vx: 8, life: 1.1, size: 1.8 });
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
    }).catch(() => { think = null; if (active && node === me) { A.sayStory('(故事线断了…)', 2200); endSoon(); } });
  }

  // ------------------------------------------------------------ 特效
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

  // ------------------------------------------------------------ 道具(内置像素图 / 模型自己画的像素图 / emoji)
  const resolveSpr = it => it.art ? (sprites[it.art] || (Pr && Pr.get(it.art)) || (Pr && Pr.get('box'))) : null;
  function addItem(n) {
    const P = A.P, pl = P.plat || { x1: 0, x2: A.W(), y: P.y }, pw = A.petW(), k = A.k(), S = A.S(), W = A.W(), H = A.H();
    let x, y = pl.y, free = false;
    switch (n.at) {
      case 'left': x = pl.x1 + pw * 1.2; break;
      case 'right': x = pl.x2 - pw * 1.2; break;
      case 'center': x = (pl.x1 + pl.x2) / 2; break;
      case 'far': x = P.x - P.face * 260 * k; break;
      case 'cursor': x = A.cur.x; y = A.cur.y + 5.5 * S; free = true; break;
      case 'random': x = rnd(pl.x1 + pw, pl.x2 - pw); break;
      default: x = P.x + P.face * 100 * k;
    }
    if (n.x != null) { x = n.x * W; free = true; }
    if (n.y != null) { y = n.y * H; free = true; }
    const lo = free ? 16 : pl.x1 + pw * 0.6, hi = free ? W - 16 : pl.x2 - pw * 0.6;
    const it = { key: n.key || ('i' + (++itemSeq)), art: n.art || '', emoji: n.emoji || '', x: clamp(x, lo, Math.max(lo, hi)), y, free, scale: n.scale || 1, anim: n.anim || '', layer: n.layer || 'front', flip: !!n.flip, t: 0, carried: false, how: 'head' };
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
    it.carried = true; it.how = n.how || 'head'; carry = it; A.hearts(1);
  }
  function doPut() { if (!carry) return; carry.carried = false; carry.x = A.P.x + A.P.face * 40 * A.k(); carry.y = A.P.y; carry.free = false; carry = null; }
  function updateItems(dt) { for (const it of items) it.t += dt; }

  /** 画世界里的东西:平台、道具。layer: 'back'(在小人身后)/'front'(在小人前面) */
  D.draw = (ctx, u, dpr, touch, layer) => {
    if (!active && !items.length && !Object.keys(platforms).length) return;
    const S = A.S(), P = A.P, now = A.now();
    if (layer === 'back') {
      for (const k in platforms) drawPlatform(ctx, u, dpr, touch, platforms[k], now);
    }
    for (const it of items) {
      const isBack = it.carried ? it.how === 'back' : it.layer === 'back';
      if ((layer === 'back') !== isBack) continue;
      drawItem(ctx, u, dpr, touch, it, now, S, P);
    }
  };
  function animOf(it, now) {
    const o = {}; let dy = 0, dx = 0; const t = it.t;
    switch (it.anim) {
      case 'bob': dy = -Math.abs(Math.sin(t * 3)) * 3 * A.S(); break;
      case 'float': dy = Math.sin(t * 1.6) * 3 * A.S(); break;
      case 'drift': dx = Math.sin(t * 0.9) * 8 * A.S(); dy = Math.sin(t * 1.7) * 2 * A.S(); break;
      case 'spin': o.rot = t * 3; break;
      case 'swing': o.rot = Math.sin(t * 2.2) * 0.28; break;
      case 'pulse': o.sx = o.sy = 1 + Math.sin(t * 5) * 0.08; break;
      case 'blink': o.alpha = Math.sin(t * 6) > 0 ? 1 : 0.35; break;
    }
    return { o, dx, dy };
  }
  function drawItem(ctx, u, dpr, touch, it, now, S, P) {
    const spr = resolveSpr(it), px = u * it.scale, a = animOf(it, now);
    let x = it.x + a.dx, y = it.y + a.dy, o = Object.assign({ flip: it.flip }, a.o), strings = false;
    const szD = spr ? Pr.size(spr, Math.max(1, Math.round(px))) : { w: 0, h: 0 }, szc = { w: szD.w / dpr, h: szD.h / dpr };   // 屏幕上的 CSS 像素尺寸
    if (it.carried) {
      const fl = P.fly, sway = Math.sin(it.t * 2 + 1) * 3 * S;
      if (it.how === 'balloon') { x = P.x + sway + (fl ? -P.face * 3 * S : 0); y = P.y - 21 * S - (fl ? Math.sin(it.t * 3) * 1.5 * S : 0); o.anchor = 'b'; o.rot = (fl && flyS ? -clamp((flyS.vx || 0) / 400, -1, 1) * 0.05 : 0) + Math.sin(it.t * 1.7) * 0.03; strings = true; }
      else if (it.how === 'hold') { x = P.x + P.face * 8 * S; y = P.y - 6 * S; o.anchor = 'b'; o.flip = false; }
      else if (it.how === 'back') { x = P.x - P.face * 7 * S; y = P.y - 2 * S; o.anchor = 'b'; }
      else { x = P.x + P.face * 1.5 * S; y = P.y - 15.5 * S - (P.hat ? 4.5 * S : 0) + a.dy; o.anchor = 'b'; }
    } else if (spr && !it.free && (spr.anchor || 'b') === 'c') { y = it.y - szc.h / 2 + a.dy; }   // 站在地上的"中心锚点"图:把底边放到地面
    if (!spr) {                                           // emoji 道具(旧写法)
      const qy = it.carried ? y - 3 * S : it.y - 5.5 * S + a.dy;
      Rig.drawParticle(ctx, u, dpr, { k: 'text', text: it.emoji, x, y: qy, life: 1, max: 1, size: 2.3 * it.scale });
      touch(x - 40, qy - 40, x + 40, qy + 40); return;
    }
    if (strings) {                                        // 气球的绳子:从手到气球底部(大的热气球用两根)
      const hx = P.x, hy = P.y - 8 * S;
      ctx.save(); ctx.strokeStyle = 'rgba(70,60,55,.85)'; ctx.lineWidth = Math.max(1, Math.round(dpr * 1.2)); ctx.beginPath();
      if (szc.w > 12 * S) { ctx.moveTo((hx - 5 * S) * dpr, hy * dpr); ctx.lineTo((x - szc.w * 0.16) * dpr, y * dpr); ctx.moveTo((hx + 5 * S) * dpr, hy * dpr); ctx.lineTo((x + szc.w * 0.16) * dpr, y * dpr); }
      else { ctx.moveTo((hx + P.face * 6 * S) * dpr, hy * dpr); ctx.lineTo(x * dpr, y * dpr); }
      ctx.stroke(); ctx.restore();
      touch(Math.min(hx, x) - 60, y - szc.h - 10, Math.max(hx, x) + 60, hy + 10);
    }
    const box = Pr.draw(ctx, spr, x * dpr, y * dpr, px, o);
    if (box) touch(box.x1 / dpr - 6, box.y1 / dpr - 6, box.x2 / dpr + 6, box.y2 / dpr + 6);
  }
  function drawPlatform(ctx, u, dpr, touch, p, now) {
    const S = A.S(), x1 = p.x1 * A.W(), x2 = p.x2 * A.W(), y = p.yy || p.y * A.H(), w = x2 - x1;
    const R = (x, yy, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * dpr), Math.round(yy * dpr), Math.max(1, Math.round(ww * dpr)), Math.max(1, Math.round(hh * dpr))); };
    const ps = S;                                           // 一个"像素格"的 CSS 像素
    const wob = onPlat() === p ? Math.sin(now * 9) * 0.5 * ps : 0;
    switch (p.style) {
      case 'rope': {
        for (const px of [x1 - 2 * ps, x2]) { R(px, y - 3 * ps, 2 * ps, 17 * ps, '#7a4f2d'); R(px, y - 3 * ps, 2 * ps, 2 * ps, '#a8733f'); R(px - ps * 0.5, y - 3 * ps, 3 * ps, ps, '#5e3a24'); }
        const seg = 3 * ps; let i = 0;
        for (let x = x1; x < x2; x += seg, i++) R(x, y + wob * (i % 2 ? 1 : -1), Math.min(seg, x2 - x), 0.9 * ps, i % 2 ? '#b98a4a' : '#8f6a35');
        touch(x1 - 6 * ps, y - 5 * ps, x2 + 6 * ps, y + 16 * ps); break;
      }
      case 'plank': {
        R(x1, y, w, 2.2 * ps, '#c98f4a'); R(x1, y + 1.6 * ps, w, 0.9 * ps, '#8b5a2b'); R(x1, y, w, 0.5 * ps, '#e0aa66');
        for (const nx of [x1 + 1.5 * ps, x2 - 2.5 * ps]) R(nx, y + 0.8 * ps, ps, ps, '#5e3a24');
        touch(x1 - 4, y - 4, x2 + 4, y + 4 * ps); break;
      }
      case 'cloud': {
        const c = 2 * ps; R(x1 + c, y, w - 2 * c, c, '#ffffff'); R(x1, y + c, w, c * 1.6, '#ffffff'); R(x1 + c, y + c * 2.6, w - 2 * c, c * 1.2, '#e4eaf2'); R(x1 + 2 * c, y + c * 3.8, w - 4 * c, c * 0.6, '#cfd9e6');
        for (let x = x1 + 3 * c; x < x2 - 4 * c; x += 7 * c) { R(x, y - c * 0.9, 3 * c, c * 0.9, '#ffffff'); R(x + c * 0.5, y - c * 1.6, 2 * c, c * 0.7, '#ffffff'); }
        touch(x1 - 6, y - 4 * ps, x2 + 6, y + 9 * ps); break;
      }
      case 'ledge': {
        R(x1, y, w, 1.3 * ps, '#5fbf5f'); R(x1, y + 1.3 * ps, w, 4.5 * ps, '#9aa0a8'); R(x1, y + 5.4 * ps, w, 0.8 * ps, '#6c727a');
        for (let x = x1 + 4 * ps; x < x2 - 2 * ps; x += 8 * ps) R(x, y + 2.5 * ps, ps * 0.8, 3 * ps, '#7d848c');
        touch(x1 - 4, y - 4, x2 + 4, y + 8 * ps); break;
      }
      case 'ice': {
        R(x1, y, w, 4 * ps, '#bfe9ff'); R(x1, y, w, 0.8 * ps, '#ffffff'); R(x1, y + 3 * ps, w, ps, '#8bcdf0');
        for (let x = x1 + 3 * ps; x < x2 - 3 * ps; x += 9 * ps) R(x, y + 1.4 * ps, 2 * ps, 0.6 * ps, '#ffffff');
        touch(x1 - 4, y - 4, x2 + 4, y + 6 * ps); break;
      }
      default: {                                            // beam
        R(x1, y, w, 2.6 * ps, '#8d97a3'); R(x1, y, w, 0.6 * ps, '#c4ccd6'); R(x1, y + 2 * ps, w, 0.8 * ps, '#5d6670');
        for (let x = x1 + 2 * ps; x < x2 - ps; x += 6 * ps) R(x, y + ps, 0.8 * ps, 0.8 * ps, '#e3e8ee');
        touch(x1 - 4, y - 4, x2 + 4, y + 5 * ps);
      }
    }
  }

  // ------------------------------------------------------------ 穿戴 / 滤镜
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
    const P = A.P;
    if (holdPose) Object.assign(p, holdPose);
    if (animState) { const ph = (animState.t / animState.dur) % 1; Object.assign(p, sample(animState.keys, animState.t >= animState.dur * animState.loop ? 1 : clamp(ph, 0, 1))); }
    if (wear && wear.prop && !p.prop) p.prop = wear.prop;
    if (think && !animState) { p.eye = 'dots'; p.ey = -1; p.ex = 0; p.mouth = 'flat'; p.rot = Math.sin(A.now() * 3) * 0.05; }
    if (node && node.t === 'move' && st.moving) { const run = node.run; p.legs = run ? 'run' : 'walk'; p.legT = P.legT; p.dy = -Math.abs(Math.sin(P.legT)) * (run ? 1.3 : 0.7); p.rot = P.face * (run ? 0.1 : 0.03); if (run) p.mouth = 'big'; }
    if (node && node.t === 'ask') { p.mouth = p.mouth || 'smile'; }
    // 走钢丝:张开手臂保持平衡,身体微微摇晃
    const pl = onPlat();
    if (pl && pl.style === 'rope' && P.mode === 'story' && !animState) {
      const m = st.moving ? 1 : 0.5; p.armL = [3, -2.5, 3]; p.armR = [3, -2.5, 3]; p.rot = (p.rot || 0) + Math.sin(A.now() * 3.4) * 0.11 * m; p.eye = p.eye === 'open' || !p.eye ? 'wide' : p.eye; p.mouth = st.moving ? 'o' : p.mouth;
    }
    // 飞行:腿悬空,手抓着气球绳(没气球就张开手臂)
    if (P.fly) {
      p.legs = 'dangle'; p.legT = P.legT; p.shadow = 0; p.dy = 0;
      if (carry && carry.how === 'balloon') { p.armL = [1, -6, 3]; p.armR = [1, -6, 3]; } else { p.armL = [3, -3, 3]; p.armR = [3, -3, 3]; }
      if (!animState) { p.eye = 'happy'; p.mouth = 'big'; p.blush = 0.5; p.rot = (p.rot || 0) + clamp(((flyS && flyS.vx) || 0) / 2200, -0.14, 0.14) + Math.sin(A.now() * 1.8) * 0.03; }
    }
  };

  D.thinking = on => {
    if (on) { if (!think) think = { t: 0, i: 0 }; if (!active) A.setMode('story'); }
    else if (think) { think = null; if (!active) { A.hideBubble(); A.decide(); } }
  };

  window.Director = D;
})();
