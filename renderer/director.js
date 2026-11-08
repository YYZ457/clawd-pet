'use strict';
/* 导演:把"剧本"(内置的,或大模型写的 JSON)演出来。
   剧本只是数据:每个节点类型都在白名单里,数值有范围,文字会被截断;这里不执行任何模型生成的代码。
   v1.3:流式剧本(节点边到边演)、变量/条件/随机/循环、多道具、换装、氛围滤镜、二维追逐。
   v1.4:像素道具(内置道具库 + 模型自己设计的像素图)、凭空造平台(钢丝/木板/云…)、飞行(抓着气球)、任意高度大跳。
   v1.5:通用积木,不再为某个具体动作写死代码——
     motion  宠物或任何道具沿任意路径 / 圆弧运动,叠加蹦跳、摇摆、旋转、顺势倾斜、拖尾、变大变小,可以同时进行(async)
     shape   线 / 矩形 / 圆 / 彩虹;端点可以绑在宠物的手、头、脚或某个道具上,于是绳子、钓线、风筝线会跟着动
     take    道具挂在身体任意部位(手、双手举过头、头、背、身前、脚下骑着),位置跟着姿态和翻滚走 */
(() => {
  const ST = ScriptTools, Pr = window.Props;
  let A = null;                       // brain 提供的接口
  let active = false, nodes = [], byId = {}, idx = 0, node = null, st = { t: 0 };
  let vars = {}, meta = { kind: 'story', title: '', premise: '', seg: 1, log: [], silent: false };
  let holdPose = null, animState = null, items = [], think = null, chipsEl = null, tintEl = null;
  let stream = null, steps = 0, loops = {}, wear = null, savedLook = null, carry = null, itemSeq = 0;
  let sprites = {}, platforms = {}, hov = null, flyS = null;
  let shapes = {}, movers = [], lastPose = null, petSize = 1;
  const MAX_STEPS = 1500, MAX_SEG = 8;
  const INTERRUPT = new Set(['air', 'grab', 'petted', 'poke', 'ouch', 'tickle', 'dizzy', 'hold', 'startle', 'land', 'crouch', 'love', 'trip']);
  const DEF = { lift: 0, dy: 0, sx: 1, sy: 1, rot: 0, ex: 0, ey: 0, blush: 0, blink: 0, armL: [0, 0, 3], armR: [0, 0, 3], size: 1, alpha: 1 };
  const DEFP = { lift: 0, dy: 0, sx: 1, sy: 1, rot: 0, armL: [0, 0, 3], armR: [0, 0, 3], legs: 'stand' };
  const BODY_ANCH = new Set(['pet', 'hand', 'handL', 'hands', 'head', 'feet', 'back']);
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
    n: nodes.length, streaming: !!(stream && stream.open), carry: carry && carry.key, steps, platforms: Object.keys(platforms), sprites: Object.keys(sprites), shapes: Object.keys(shapes), movers: movers.length + (node && node.t === 'motion' && st.mv && !st.mv.done ? 1 : 0), size: +curSize().toFixed(2), pos: A ? [Math.round(A.P.x), Math.round(A.P.y)] : null, flying: !!(A && A.P.fly), fly: flyS ? { phase: flyS.phase, t: +flyS.t.toFixed(2), then: flyS.then } : null,
    choices: chipsEl && chipsEl.classList.contains('show') ? [...chipsEl.children].map(b => b.textContent) : []
  });
  D.chipsVisible = () => !!chipsEl && chipsEl.classList.contains('show');
  D.chipsRect = () => (D.chipsVisible() ? chipsEl.getBoundingClientRect() : null);

  // ------------------------------------------------------------ 开演 / 收场
  function teardown() {
    active = false; think = null; hideChips(); holdPose = null; animState = null; items = []; carry = null; stream = null; wear = null;
    restoreLook(); setTint({ color: 'none' });
    if (A && A.P.fly) { A.P.fly = false; flyS = null; hov = null; A.startFall(0, 0); }
    flyS = null; hov = null; sprites = {}; movers = []; petSize = 1;
    const hadSolid = Object.values(shapes).some(q => q.solid); shapes = {};
    if (Object.keys(platforms).length || hadSolid) { platforms = {}; pushPlats(); }    // 站在剧情平台上的话,收场时会自然掉下来
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
    if (PET_CTRL.has(n.t) || (n.t === 'motion' && n.who === 'pet')) movers = movers.filter(m => !m.isPet);
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
      case 'sprite': sprites[n.name] = { name: n.name, rows: n.rows, pal: n.pal, anchor: n.anchor, fps: n.fps || 4, frames: n.frames ? n.frames.map(r => ({ rows: r, pal: n.pal, anchor: n.anchor })) : null }; return nextOf(n);
      case 'shape': doShape(n); return nextOf(n);
      case 'motion': {
        ensureStory(); if (n.who === 'pet') animState = null;
        const m = makeMover(n); if (!m) return nextOf(n);
        if (n.async) { movers = movers.filter(q => q.n.who !== n.who); movers.push(m); return nextOf(n); }
        st.mv = m; return;
      }
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
    if (A.P.mode === 'grab' || A.P.mode === 'air' || A.P.mode === 'hold') {
      if (A.P.fly) endFly();
      if (movers.some(m => m.isPet)) movers = movers.filter(m => !m.isPet);
      if (node.t === 'fly' || (node.t === 'motion' && st.mv && st.mv.isPet && !st.mv.done)) { if (st.mv) st.mv.done = true; adv(); return; }
    }
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
      case 'motion': if (!st.mv) { adv(); break; } tickMover(st.mv, dt); if (st.mv.done) adv(); break;
      case 'ask': if (st.t > st.limit) { hideChips(); A.sayStory('……(你不在吗?)', 2200); meta.log.push('没回应'); if (node.timeout) jump(node.timeout); else endSoon(); } break;
      case 'wait_for': checkWait(dt); break;
      case 'ask_text': if (st.t > st.limit) { A.hideBubble(); vars[node.key] = '朋友'; adv(); } break;
      case 'continue': if (st.t > 120) { A.sayStory('(故事线断了…)', 2200); endSoon(); } break;
      case 'end': if (st.t >= st.dur) finish(); break;
    }
    if (movers.length) { for (const m of movers) tickMover(m, dt); movers = movers.filter(m => !m.done); }
    if (A.P.fly && node && node.t !== 'fly' && !petMover()) hoverTick(dt);
    for (const k in shapes) shapes[k].t += dt;
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
      const sp = { h: n.h, dx: n.dx, to: n.to, key: n.key, at: n.at, spin: n.spin };
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
    const ymin = topLimit();
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
    if (hov.still) { P.x = hov.x; P.y = hov.y; return; }       // motion then:"stay" → 原地停住(荡秋千停在半空、坐在云上…)
    P.x = hov.x + Math.sin(hov.t * 1.3) * 5 * S; P.y = hov.y + Math.sin(hov.t * 2.1) * 2 * S;
  }
  /** 宠物在空中时最高能到哪(举过头顶的道具也要留在屏幕里) */
  function topLimit() {
    const S = A.S(); let ymin = A.petH() + 6 * S;
    if (carry && carry.at === 'hands') { const sp = resolveSpr(carry), nh = sp && Pr ? Pr.normalize(sp).h : 11; ymin = Math.max(ymin, (carry.line ? 22 : 15) * S + nh * S * carry.scale + 4 * S); }
    return Math.min(ymin, A.H() * 0.5);
  }

  // ------------------------------------------------------------ 万能运动:宠物或道具沿任意路径 / 圆弧移动
  const PET_CTRL = new Set(['move', 'jump', 'fly', 'act', 'fall']);
  const PACE = { smooth: ease, linear: t => t, in: t => t * t, out: t => 1 - (1 - t) * (1 - t), each: t => t };
  const lineSeg = (a, b) => ({ len: Math.hypot(b[0] - a[0], b[1] - a[1]), f: s => [lerp(a[0], b[0], s), lerp(a[1], b[1], s)] });
  function crSeg(p0, p1, p2, p3) {                                   // Catmull-Rom:穿过每个点的平滑曲线
    const f = s => { const s2 = s * s, s3 = s2 * s, g = i => 0.5 * (2 * p1[i] + (p2[i] - p0[i]) * s + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * s2 + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * s3); return [g(0), g(1)]; };
    let len = 0, q = p1; for (let i = 1; i <= 10; i++) { const r = f(i / 10); len += Math.hypot(r[0] - q[0], r[1] - q[1]); q = r; }
    return { len, f };
  }
  function buildSegs(n, x0, y0) {
    const W = A.W(), H = A.H(), ph = A.petH(), segs = [], start = [x0, y0];
    if (n.orbit) {
      const o = n.orbit, cx = o.x != null ? o.x * W : x0 + o.dx * ph, cy = o.y != null ? o.y * H : y0 + o.dy * ph, r = o.r * ph;
      const at = a => [cx + r * Math.sin(a * Math.PI / 180), cy + r * Math.cos(a * Math.PI / 180)];   // 0°=圆心正下方 90°=右 180°=正上方
      const first = at(o.a[0]);
      if (Math.hypot(first[0] - x0, first[1] - y0) > 3) segs.push(lineSeg(start, first));
      for (let i = 0; i + 1 < o.a.length; i++) { const a0 = o.a[i], a1 = o.a[i + 1]; segs.push({ len: Math.max(1, r * Math.abs(a1 - a0) * Math.PI / 180), f: s => at(a0 + (a1 - a0) * s) }); }
      if (n.then === 'back') segs.push(lineSeg(at(o.a[o.a.length - 1]), start));
    } else {
      const pts = [start].concat((n.path || []).map(p => (n.rel ? [x0 + p[0] * ph, y0 + p[1] * ph] : [p[0] * W, p[1] * H])));
      if (n.then === 'back') pts.push(start);
      if (pts.length === 1) pts.push(start);
      const curve = pts.length > 2 && n.pace !== 'each' && !n.hop;
      for (let i = 0; i + 1 < pts.length; i++) segs.push(curve ? crSeg(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]) : lineSeg(pts[i], pts[i + 1]));
    }
    return segs;
  }
  function makeMover(n) {
    const P = A.P, isPet = n.who === 'pet';
    let it = null;
    if (isPet) { if (P.mode === 'grab' || P.mode === 'hold') return null; }
    else { it = items.find(q => q.key === n.who); if (!it) return null; freeItem(it); movers = movers.filter(m => m.it !== it); }
    const x0 = isPet ? P.x : it.x, y0 = isPet ? P.y : it.y;
    const segs = buildSegs(n, x0, y0), total = segs.reduce((a, q) => a + q.len, 0) || 1;
    const m = { n, isPet, it, segs, total, t: 0, dur: n.sec, x: x0, y: y0, vx: 0, vy: 0, phase: 1, spinR: 0, tilt: 0, u: 0, trailT: 0, size0: petSize, scale0: it ? it.scale : 1, startPlat: isPet ? P.plat : null };
    if (isPet) { P.plat = null; P.platKey = null; P.vx = P.vy = 0; P.fly = true; hov = null; flyS = null; if (P.mode !== 'story') A.setMode('story'); }
    return m;
  }
  function moverPos(m, u) {
    const n = m.n, segs = m.segs, ph = A.petH();
    let si = 0, s;
    if (n.pace === 'each') { const q = u * segs.length; si = Math.min(segs.length - 1, Math.floor(q)); s = u >= 1 ? 1 : ease(q - si); }
    else { let d = PACE[n.pace](u) * m.total; while (si < segs.length - 1 && d > segs[si].len) { d -= segs[si].len; si++; } s = segs[si].len > 0 ? clamp(d / segs[si].len, 0, 1) : 1; }
    let [x, y] = segs[si].f(s);
    if (n.hop) y -= n.hop * ph * Math.sin(Math.PI * s);
    if (n.sway) { const tt = u * m.dur, env = clamp(Math.min(tt, m.dur - tt) / 0.4, 0, 1), w = tt * n.sway.f * Math.PI * 2; x += n.sway.x * ph * Math.sin(w) * env; y += n.sway.y * ph * Math.sin(w * 1.5 + 1.2) * env; }
    return [x, y];
  }
  function tickMover(m, dt) {
    if (m.done) return;
    const P = A.P, S = A.S(), n = m.n;
    if (m.phase === 1) {
      m.t += dt; const u = clamp(m.t / m.dur, 0, 1);
      let [x, y] = moverPos(m, u);
      if (m.isPet) { x = clamp(x, A.petW() / 2, A.W() - A.petW() / 2); y = clamp(y, topLimit(), A.groundY()); }
      else { x = clamp(x, -60, A.W() + 60); y = clamp(y, -60, A.H() + 60); }
      const id = 1 / Math.max(dt, 1e-3);
      m.vx = lerp(m.vx, (x - m.x) * id, 0.45); m.vy = lerp(m.vy, (y - m.y) * id, 0.45);
      m.x = x; m.y = y; m.u = u;
      m.spinR = (n.spin || 0) * Math.PI * 2 * (n.pace === 'each' ? u : PACE[n.pace](u));
      if (n.tilt && Math.hypot(m.vx, m.vy) > 25) m.tilt = lerp(m.tilt, clamp(Math.atan2(m.vy, Math.abs(m.vx)) * n.tilt, -1.4, 1.4), 0.25);
      const face = n.face || (m.isPet ? 'auto' : 'keep');
      if (m.isPet) {
        P.x = x; P.y = y; P.legT += dt * 6;
        if (face === 'left') P.face = -1; else if (face === 'right') P.face = 1; else if (face === 'auto' && Math.abs(m.vx) > 40) P.face = sign(m.vx);
      } else {
        const it = m.it; it.x = x; it.y = y; it.rotM = m.spinR + m.tilt * (m.vx < 0 ? -1 : 1);
        if (n.grow) it.scale = m.scale0 * lerp(1, n.grow, ease(u));
        if (face === 'left') it.flip = true; else if (face === 'right') it.flip = false; else if (face === 'auto' && Math.abs(m.vx) > 40) it.flip = m.vx < 0;
      }
      if (n.trail) { m.trailT -= dt; if (m.trailT <= 0) { m.trailT = 0.06; const c = m.isPet ? anchor('pet') : itemPt(m.it, 'center'); trailFx(n.trail, c[0], c[1], m.vx, m.vy); } }
      if (u >= 1) finishPath(m);
    } else if (m.phase === 2) {                                    // 缓缓落到下面的平台
      m.t += dt; const u = clamp(m.t / m.ldur, 0, 1), pl = m.land;
      P.y = lerp(m.ly0, pl.y, ease(u)); P.x = m.lx0 + Math.sin(m.t * 2.4) * 3 * S * (1 - u); P.legT += dt * 4;
      if (u >= 1) { P.fly = false; hov = null; P.x = clamp(P.x, pl.x1 + 4, pl.x2 - 4); A.attachTo(pl); A.dust(3); m.done = true; }
    }
  }
  function autoThen(m) {
    if (m.n.async) return 'land';
    const ni = nextOf(node), nn = typeof ni === 'number' ? nodes[ni] : null;
    if (nn && ((nn.t === 'motion' && nn.who === 'pet') || nn.t === 'fly' || nn.t === 'fall')) return 'stay';
    return 'land';
  }
  function finishPath(m) {
    const n = m.n, P = A.P, k = A.k();
    if (!m.isPet) {
      const it = m.it;
      if (n.then === 'fall' || n.then === 'land') dropItem(it, n.then === 'fall' ? m.vx * 0.5 : 0, n.then === 'fall' ? m.vy * 0.5 : 0);
      m.done = true; return;
    }
    if (n.grow) petSize = n.grow;
    let then = n.then || autoThen(m);
    if (then === 'back') then = m.startPlat ? 'land' : 'stay';
    if (then === 'stay') { hov = { x: P.x, y: P.y, t: 0, still: true }; m.done = true; return; }
    if (then === 'fall') { P.fly = false; hov = null; A.startFall(clamp(m.vx, -900 * k, 900 * k), clamp(m.vy, -1400 * k, 900 * k)); m.done = true; return; }
    const pl = A.platBelow(P.x, P.y - 2);
    if (!pl) { P.fly = false; A.startFall(0, 0); m.done = true; return; }
    if (pl.y - P.y < 4) { P.fly = false; hov = null; A.attachTo(pl); m.done = true; return; }
    m.phase = 2; m.t = 0; m.land = pl; m.ly0 = P.y; m.lx0 = P.x; m.ldur = clamp((pl.y - P.y) / (420 * k), 0.35, 1.6);
  }
  function petMover() {
    if (node && node.t === 'motion' && st.mv && st.mv.isPet && !st.mv.done) return st.mv;
    for (const m of movers) if (m.isPet && !m.done) return m;
    return null;
  }
  function curSize() { const m = petMover(); return m && m.n.grow ? lerp(m.size0, m.n.grow, ease(m.u)) : petSize; }
  function trailFx(kind, x, y, vx, vy) {
    const sp = Math.hypot(vx, vy) || 1, bx = -vx / sp, by = -vy / sp, S = A.S();
    const o = (extra) => Object.assign({ vx: bx * rnd(20, 60) + rnd(-12, 12), vy: by * rnd(20, 60) + rnd(-12, 12), life: rnd(0.5, 0.9), size: rnd(0.8, 1.4) }, extra);
    switch (kind) {
      case 'fire': A.spawn('dust', x + bx * 6 * S, y + by * 6 * S, o({ color: Math.random() < 0.5 ? '#ffb347' : '#ff6b3d', life: rnd(0.25, 0.5) })); break;
      case 'smoke': A.spawn('dust', x + bx * 6 * S, y + by * 6 * S, o({ color: 'rgba(200,200,205,.8)', vy: -rnd(15, 40), life: rnd(0.8, 1.3), size: rnd(1.2, 2) })); break;
      case 'speed': A.spawn('confetti', x + bx * 8 * S, y + rnd(-5, 5) * S, o({ color: 'rgba(255,255,255,.85)', rot: Math.atan2(vy, vx), vr: 0, life: 0.3 })); break;
      case 'star': case 'sparkle': A.spawn(kind === 'star' ? 'star' : 'spark', x + rnd(-4, 4) * S, y + rnd(-4, 4) * S, o({ color: kind === 'star' ? '#ffd23f' : '#fff6a8' })); break;
      case 'heart': if (Math.random() < 0.35) A.spawn('heart', x, y, o({ vy: -30 })); break;
      case 'note': if (Math.random() < 0.3) A.note(); break;
      case 'bubbles': if (Math.random() < 0.5) A.spawn('text', x + rnd(-4, 4) * S, y, { text: '○', color: '#bfe9ff', vx: rnd(-8, 8), vy: -rnd(20, 40), life: rnd(1, 1.6), size: rnd(0.8, 1.5), bold: true }); break;
      case 'snow': A.spawn('confetti', x + rnd(-6, 6) * S, y, o({ color: '#ffffff', rot: rnd(0, 6), vr: rnd(-3, 3) })); break;
      default: A.spawn('dust', x + bx * 4 * S, y + 4 * S, o({})); break;
    }
  }

  // ------------------------------------------------------------ 身体挂点:跟着姿态、缩放、翻滚一起动
  D.notePose = p => { lastPose = p; };
  /** 说话气泡要躲开的"最高点":被抬高、变大、头顶/举着的道具都算(离得很远的风筝不算) */
  D.topY = () => {
    if (!A || (!active && !carry)) return null;
    const S = A.S(); let top = anchor('head')[1] - (A.P.hat ? 4.5 * S : 0);
    if (carry && carry.carried && carry.bx && (carry.at === 'head' || carry.at === 'hands' || carry.at === 'under') && carry.bx[1] > top - 45 * S) top = Math.min(top, carry.bx[1]);
    return top;
  };
  D.__itemPos = k => { const it = items.find(q => q.key === k); return it ? itemPt(it, 'center') : null; };   // 测试用
  function anchor(name) {
    const P = A.P, S = A.S(), p = lastPose || DEFP, f = P.face;
    const B = (p.legs === 'tuck' ? -1 : -3) + (p.dy || 0), aL = p.armL || DEFP.armL, aR = p.armR || DEFP.armR;
    const handY = a => (a[1] < -2 ? B - 5 + a[1] : B - 5 + a[1] + a[2]);
    let lx = 0, ly = B - 4;
    switch (name) {
      case 'hand': lx = 8 + aR[0]; ly = handY(aR); break;
      case 'handL': lx = -(8 + aL[0]); ly = handY(aL); break;
      case 'hands': lx = (aR[0] - aL[0]) / 2; ly = Math.min(handY(aL), handY(aR)); break;
      case 'head': ly = B - 9; break;
      case 'feet': ly = 0; break;
      case 'back': lx = -7; ly = B - 3; break;
    }
    const th = (p.rot || 0) * f, c = Math.cos(th), sn = Math.sin(th), y0 = ly + 6;   // 绕身体中心(pivot 0,-6)旋转
    const rx = lx * c - y0 * sn, ry = lx * sn + y0 * c - 6;
    return [P.x + f * (p.sx || 1) * rx * S, P.y - (p.lift || 0) * S + (p.sy || 1) * ry * S];
  }
  function itemPt(it, part) {
    const b = it.bx || [it.x - 10, it.y - 20, it.x + 10, it.y], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    switch (part) {
      case 'top': return [cx, b[1]];
      case 'bottom': return [cx, b[3]];
      case 'left': return [b[0], cy];
      case 'right': return [b[2], cy];
      case 'tip': return [it.flipD ? b[0] : b[2], b[1]];
      default: return [cx, cy];
    }
  }
  /** shape 端点 → 屏幕坐标 */
  function spt(v) {
    if (Array.isArray(v)) return [v[0] * A.W(), v[1] * A.H()];
    if (BODY_ANCH.has(v)) return anchor(v);
    const [k, part] = String(v).split('.'), it = items.find(q => q.key === k);
    return it ? itemPt(it, part) : null;
  }

  // ------------------------------------------------------------ 形状(绳子 / 滑梯 / 水面 / 彩虹 / 圆…)
  function doShape(n) {
    if (n.remove) { const had = Object.values(shapes).some(q => q.solid); if (n.remove === true) shapes = {}; else delete shapes[n.remove]; if (had) pushPlats(); return; }
    if (!shapes[n.key] && Object.keys(shapes).length >= 12) return;
    shapes[n.key] = Object.assign({}, n, { t: 0 });
    if (n.solid || Object.values(shapes).some(q => q.solid)) pushPlats();
  }
  const lighten = (hex, a) => { const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255, m = x => Math.round(x + (255 - x) * a); return `rgb(${m(r)},${m(g)},${m(b)})`; };
  function drawShape(ctx, dpr, touch, q, now) {
    const a = spt(q.from); if (!a) return;
    const b = q.to ? spt(q.to) : null, S = A.S(), ph = A.petH(), lw = Math.max(1, q.w * S);
    ctx.save(); ctx.globalAlpha = q.alpha; ctx.strokeStyle = ctx.fillStyle = q.color; ctx.lineWidth = lw * dpr; ctx.lineJoin = 'round';
    if (q.dash) ctx.setLineDash([3 * S * dpr, 2 * S * dpr]);
    const X = v => v * dpr;
    switch (q.kind) {
      case 'line': {
        if (!b) break;
        ctx.beginPath(); ctx.moveTo(X(a[0]), X(a[1]));
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + (q.sag || 0) * ph;
        if (q.sag) ctx.quadraticCurveTo(X(mx), X(my), X(b[0]), X(b[1])); else ctx.lineTo(X(b[0]), X(b[1]));
        ctx.stroke();
        touch(Math.min(a[0], b[0], mx) - lw - 8, Math.min(a[1], b[1], my) - lw - 8, Math.max(a[0], b[0], mx) + lw + 8, Math.max(a[1], b[1], my) + lw + 8); break;
      }
      case 'rect': {
        if (!b) break;
        const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]);
        if (q.wave) {                                        // 波浪顶边(水面 / 海)
          ctx.beginPath(); ctx.moveTo(X(x1), X(y2));
          for (let x = x1; x <= x2 + 1; x += 3 * S) ctx.lineTo(X(Math.min(x, x2)), X(y1 + Math.sin(x * 0.045 + now * 2.6) * 1.4 * S + Math.sin(x * 0.11 - now * 1.7) * 0.6 * S));
          ctx.lineTo(X(x2), X(y2)); ctx.closePath(); ctx.fill();
          ctx.fillStyle = lighten(q.color, 0.45); for (let x = x1 + 6 * S; x < x2 - 4 * S; x += 23 * S) ctx.fillRect(X(x + Math.sin(now + x) * 2 * S), X(y1 + 3 * S), X(5 * S), X(0.8 * S));
        } else if (q.fill) { ctx.fillRect(X(x1), X(y1), X(x2 - x1), X(y2 - y1)); ctx.fillStyle = lighten(q.color, 0.3); ctx.fillRect(X(x1), X(y1), X(x2 - x1), X(Math.min(S, y2 - y1))); }
        else ctx.strokeRect(X(x1), X(y1), X(x2 - x1), X(y2 - y1));
        touch(x1 - lw - 6, y1 - 3 * S - lw, x2 + lw + 6, y2 + lw + 6); break;
      }
      case 'circle': {
        const r = (q.r || 3) * ph; ctx.beginPath(); ctx.arc(X(a[0]), X(a[1]), X(r), 0, Math.PI * 2);
        if (q.fill) ctx.fill(); else ctx.stroke();
        touch(a[0] - r - lw - 4, a[1] - r - lw - 4, a[0] + r + lw + 4, a[1] + r + lw + 4); break;
      }
      case 'arc': {                                          // 半圆拱:彩虹 / 拱门 / 桥洞
        const r = (q.r || 6) * ph, cs = q.colors || [q.color];
        cs.forEach((col, i) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(X(a[0]), X(a[1]), Math.max(1, X(r - (i + 0.5) * lw)), Math.PI, Math.PI * 2); ctx.stroke(); });
        touch(a[0] - r - 6, a[1] - r - 6, a[0] + r + 6, a[1] + 6); break;
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ 平台(钢丝 / 木板 / 云 / 石台…)
  function pushPlats() {
    const W = A.W(), H = A.H(), S = A.S(), ymin = A.petH() + 12, gy = A.groundY();
    const list = Object.values(platforms).map(p => { p.yy = clamp(p.y * H, ymin + 6 * S, gy - 20 * S); return { key: 'p' + p.key, x1: p.x1 * W, x2: p.x2 * W, y: p.yy }; });
    for (const q of Object.values(shapes)) {                // 实心矩形(solid)的顶边也能站
      if (!q.solid || !Array.isArray(q.from) || !Array.isArray(q.to)) continue;
      const x1 = Math.min(q.from[0], q.to[0]) * W, x2 = Math.max(q.from[0], q.to[0]) * W, y = clamp(Math.min(q.from[1], q.to[1]) * H, ymin + 6 * S, gy - 4 * S);
      if (x2 - x1 > A.petW()) list.push({ key: 'ps_' + q.key, x1, x2, y });
    }
    A.setExtraPlats(list);
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
  const resolveSpr = it => {
    if (!it.art) return null;
    const s = sprites[it.art];
    if (s) return s.frames && s.frames.length > 1 ? s.frames[Math.floor(it.t * s.fps) % s.frames.length] : s;
    return (Pr && Pr.get(it.art)) || (Pr && Pr.get('box'));
  };
  const sprH = it => { const sp = resolveSpr(it); return (sp && Pr ? Pr.normalize(sp).h : 6) * it.scale; };   // 道具高度(像素格)
  /** 让道具变成"自由悬空"的坐标(x,y = 锚点位置) */
  function freeItem(it) {
    const sp = resolveSpr(it), anc = sp ? (sp.anchor || 'b') : 'c';
    if (it.carried || it.bx) {
      if (it.carried) { it.carried = false; if (carry === it) carry = null; }
      if (it.bx) { it.x = (it.bx[0] + it.bx[2]) / 2; it.y = anc === 'c' ? (it.bx[1] + it.bx[3]) / 2 : it.bx[3]; }
    } else if (!it.free && anc === 'c') it.y -= sprH(it) * A.S() / 2;
    it.free = true; it.falling = false; it.vy = 0; it.vx = 0;
  }
  /** 道具掉下去(受重力,落在下面的平台上) */
  function dropItem(it, vx, vy) {
    freeItem(it);
    const sp = resolveSpr(it); if (sp && (sp.anchor || 'b') === 'c') it.y += sprH(it) * A.S() / 2;
    it.free = false; it.falling = true; it.vx = vx || 0; it.vy = vy || 0; it.rotM = 0;
  }
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
    if (carry && carry !== it) { const old = carry; carry = null; if (A.P.plat && !A.P.fly) { old.carried = false; old.x = A.P.x - A.P.face * 30 * A.k(); old.y = A.P.y; old.free = false; old.bx = null; } else dropItem(old); }
    movers = movers.filter(m => m.it !== it);
    it.carried = true; it.falling = false; it.rotM = 0; it.how = n.how || n.at || 'head'; it.at = n.at || 'head'; it.line = !!n.line;
    it.cdx = n.dx || 0; it.cdy = n.dy || 0; it.crot = n.rot || 0; it.sink = n.sink != null ? n.sink : 0.45; it.clayer = n.layer || '';
    carry = it; A.hearts(1);
  }
  function doPut() {
    if (!carry) return; const it = carry; carry = null;
    if (A.P.fly || !A.P.plat) { dropItem(it); return; }        // 在空中松手 → 掉下去
    it.carried = false; it.x = A.P.x + A.P.face * 40 * A.k(); it.y = A.P.y; it.free = false; it.bx = null;
  }
  function updateItems(dt) {
    const k = A.k();
    for (const it of items) {
      it.t += dt;
      if (!it.falling || it.carried) continue;
      const py = it.y; it.vy += 2300 * k * dt; it.x += (it.vx || 0) * dt; it.y += it.vy * dt; it.rotM = (it.rotM || 0) + (it.vx || 0) * dt * 0.02;
      const pl = A.platBelow(it.x, py);
      if (pl && it.y >= pl.y) { it.y = pl.y; if (it.vy > 520 * k) { it.vy *= -0.32; it.vx *= 0.6; } else { it.falling = false; it.vy = 0; it.vx = 0; it.rotM = 0; } }
      else if (it.y > A.H() + 80) { it.falling = false; it.y = A.groundY(); }
    }
  }

  /** 画世界里的东西:平台、道具。layer: 'back'(在小人身后)/'front'(在小人前面) */
  D.draw = (ctx, u, dpr, touch, layer) => {
    if (!active && !items.length && !Object.keys(platforms).length && !Object.keys(shapes).length) return;
    const S = A.S(), P = A.P, now = A.now();
    if (layer === 'back') {
      for (const k in platforms) drawPlatform(ctx, u, dpr, touch, platforms[k], now);
    }
    for (const k in shapes) if ((shapes[k].layer === 'front') === (layer === 'front')) drawShape(ctx, dpr, touch, shapes[k], now);
    for (const it of items) {
      const isBack = it.carried ? (it.clayer ? it.clayer === 'back' : it.at === 'back') : it.layer === 'back';
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
      const fl = P.fly, f = P.face, lp = lastPose || DEFP, prot = (lp.rot || 0) * f, sway = Math.sin(it.t * 2 + 1) * 3 * S, dir = it.flip ? f > 0 : f < 0;
      o.anchor = 'b';
      switch (it.at) {
        case 'hands': {                                      // 双手举过头顶(气球 / 伞 / 降落伞 / 风筝…)
          const h = anchor('hands'), vx = (fl && flyS ? flyS.vx : 0) || ((petMover() || {}).vx || 0);
          x = h[0] + (it.line ? sway - (fl ? f * 3 * S : 0) : 0); y = h[1] - (it.line ? 8 * S + (fl ? Math.sin(it.t * 3) * 1.5 * S : 0) : -2 * S);
          o.rot = (it.line ? -clamp(vx / 400, -1, 1) * 0.06 + Math.sin(it.t * 1.7) * 0.03 : prot * 0.3); strings = it.line; break;
        }
        case 'hand': { const h = anchor('hand'); x = h[0]; y = h[1] + szc.h * 0.35; o.rot = prot; o.flip = dir; break; }
        case 'front': { const b = anchor('pet'); x = b[0] + f * 3 * S; y = b[1] + szc.h / 2; o.rot = prot; o.flip = dir; break; }
        case 'back': { const b = anchor('back'); x = b[0]; y = b[1] + szc.h * 0.5; o.rot = prot; o.flip = dir; break; }
        case 'under': { x = P.x; y = P.y; o.rot = prot; o.flip = dir; break; }   // 骑着:道具在脚下,小人被抬高
        default: { const h = anchor('head'); x = h[0]; y = h[1] - (P.hat ? 4.5 * S : 0) + a.dy; o.rot = prot; }
      }
      x += (it.cdx || 0) * S * f; y += (it.cdy || 0) * S;
      if (it.crot) o.rot = (o.rot || 0) + it.crot * f;
      if (it.line && it.at !== 'hands') strings = true;
    } else {
      if (spr && !it.free && (spr.anchor || 'b') === 'c') y = it.y - szc.h / 2 + a.dy;   // 站在地上的"中心锚点"图:把底边放到地面
      if (it.rotM) o.rot = (o.rot || 0) + it.rotM;
    }
    if (!spr) {                                           // emoji 道具(旧写法)
      const qy = it.carried ? y - 3 * S : (it.free ? y : it.y - 5.5 * S + a.dy), r = 1.3 * S * it.scale * 2.3;
      Rig.drawParticle(ctx, u, dpr, { k: 'text', text: it.emoji, x, y: qy, life: 1, max: 1, size: 2.3 * it.scale, rot: o.rot });
      it.bx = [x - r, qy - r, x + r, qy + r]; it.flipD = false;
      touch(x - 40 - r, qy - 40 - r, x + 40 + r, qy + 40 + r); return;
    }
    const anc = o.anchor || spr.anchor || 'b';
    it.bx = [x - szc.w / 2, anc === 'c' ? y - szc.h / 2 : y - szc.h, x + szc.w / 2, anc === 'c' ? y + szc.h / 2 : y]; it.flipD = !!o.flip;
    if (strings) {                                        // 牵绳:从手到道具底部(很宽的热气球用两根,从两只手各牵一根)
      const hR = anchor('hand'), hL = anchor('handL');
      ctx.save(); ctx.strokeStyle = 'rgba(70,60,55,.85)'; ctx.lineWidth = Math.max(1, Math.round(dpr * 1.2)); ctx.beginPath();
      if (szc.w > 12 * S && it.at === 'hands' && !it.cdx) { ctx.moveTo(hL[0] * dpr, hL[1] * dpr); ctx.lineTo((x - szc.w * 0.16 * P.face) * dpr, y * dpr); ctx.moveTo(hR[0] * dpr, hR[1] * dpr); ctx.lineTo((x + szc.w * 0.16 * P.face) * dpr, y * dpr); }
      else { const by = anc === 'c' ? y + szc.h / 2 : y; ctx.moveTo(hR[0] * dpr, hR[1] * dpr); ctx.quadraticCurveTo(((hR[0] + x) / 2) * dpr, (Math.max(hR[1], by) + 6 * S) * dpr, x * dpr, by * dpr); }
      ctx.stroke(); ctx.restore();
      touch(Math.min(hR[0], hL[0], x) - 60, Math.min(y - szc.h, hR[1]) - 10, Math.max(hR[0], hL[0], x) + 60, Math.max(hR[1], y) + 20);
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
    const pm = petMover(), hp = holdPose || {};
    if (pm) {                                               // 万能运动中:按是否踩着东西决定走路 / 悬空,再叠加关键帧、旋转、倾斜
      const pl = A.platBelow(P.x, P.y - 2), onSurf = pl && pl.y - P.y < 6 && pm.phase === 1;
      if (onSurf && Math.abs(pm.vx) > 30) { p.legs = Math.abs(pm.vx) > 260 * A.k() ? 'run' : 'walk'; p.legT = P.legT; p.dy = -Math.abs(Math.sin(P.legT)) * 0.7; }
      else if (!onSurf) { p.legs = 'dangle'; p.legT = P.legT; p.shadow = 0.25; p.dy = 0; if (!hp.armL && !(carry && (carry.at === 'hands' || carry.at === 'hand'))) { p.armL = [2, -3, 3]; p.armR = [2, -3, 3]; } }
      if (pm.n.keys) Object.assign(p, sample(pm.n.keys, pm.u));
      p.rot = (p.rot || 0) + pm.spinR + pm.tilt;
    } else if (P.fly) {                                     // 悬空(飞行 / 停在半空):腿悬空
      p.legs = 'dangle'; p.legT = P.legT; p.shadow = 0; p.dy = 0;
      if (!hp.armL) { p.armL = [3, -3, 3]; p.armR = [3, -3, 3]; }
      if (!animState && !(hov && hov.still)) { if (!hp.eye) p.eye = 'happy'; if (!hp.mouth) p.mouth = 'big'; p.blush = Math.max(p.blush || 0, 0.5); p.rot = (p.rot || 0) + clamp(((flyS && flyS.vx) || 0) / 2200, -0.14, 0.14) + Math.sin(A.now() * 1.8) * 0.03; }
    }
    // 道具挂在身上时的手臂 / 坐姿(关键帧里写了手臂就以关键帧为准)
    const kArms = (animState && animState.keys.some(q => q.armL || q.armR)) || (pm && pm.n.keys && pm.n.keys.some(q => q.armL || q.armR)) || hp.armL || hp.armR;
    if (carry && !kArms) {
      if (carry.at === 'hands') { p.armL = [1, -6, 3]; p.armR = [1, -6, 3]; }
      else if (carry.at === 'hand') p.armR = [1, -3, 3];
      else if (carry.at === 'front') { p.armL = [-1, -2, 3]; p.armR = [-1, -2, 3]; }
    }
    if (carry && carry.at === 'under') {                    // 骑着 / 站在道具上:被抬高,陷进去 sink 那么深
      p.lift = (p.lift || 0) + Math.max(0, sprH(carry) - carry.sink * 9); p.shadow = 0;   // sink 按宠物身体算:0=站在上面,0.5≈陷到腰,1≈只露出脑袋
      if (carry.sink >= 0.3 && !(pm && pm.n.keys && pm.n.keys.some(q => q.legs))) p.legs = 'tuck';
    }
    const sz = (p.size || 1) * curSize(); delete p.size;
    if (sz !== 1) { p.sx = (p.sx || 1) * sz; p.sy = (p.sy || 1) * sz; }
  };

  D.thinking = on => {
    if (on) { if (!think) think = { t: 0, i: 0 }; if (!active) A.setMode('story'); }
    else if (think) { think = null; if (!active) { A.hideBubble(); A.decide(); } }
  };

  window.Director = D;
})();
