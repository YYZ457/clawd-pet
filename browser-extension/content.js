// 收集页面里"能站人"的元素顶边(位置只是几个数字,不读取页面文字内容)
(() => {
  const TAGS = 'div,section,article,header,nav,aside,footer,main,form,img,video,button,a,p,h1,h2,h3,li,pre,input,textarea,table,figure';
  const ids = new WeakMap(); let nextId = 1;
  const idOf = el => { let v = ids.get(el); if (!v) { v = nextId++; ids.set(el, v); } return v; };
  let timer = null, lastSend = 0, lastJson = '';

  function collect() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return null;   // 只在前台标签页工作
    const vw = window.innerWidth, vh = window.innerHeight, rects = [];
    const els = document.querySelectorAll(TAGS);
    for (let i = 0; i < els.length && rects.length < 160; i++) {
      const el = els[i], r = el.getBoundingClientRect();
      if (r.width < 70 || r.height < 24) continue;
      if (r.top < 50 || r.top > vh - 12 || r.right < 0 || r.left > vw) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const l = Math.max(0, r.left), w = Math.min(vw, r.right) - l;
      if (w < 70) continue;
      rects.push([idOf(el), Math.round(l), Math.round(r.top), Math.round(w), Math.round(r.height)]);
    }
    return rects;
  }

  function send(force) {
    const now = Date.now();
    const rects = collect();
    if (!rects) return;
    const data = {
      screenX: window.screenX, screenY: window.screenY, outerW: window.outerWidth, outerH: window.outerHeight,
      innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio, rects
    };
    const j = JSON.stringify(data);
    if (!force && j === lastJson && now - lastSend < 900) return;
    lastJson = j; lastSend = now;
    try { chrome.runtime.sendMessage({ type: 'clawd-dom', data }); } catch (_) {}
  }

  const throttled = () => { if (timer) return; timer = setTimeout(() => { timer = null; send(false); }, 70); };
  window.addEventListener('scroll', throttled, { passive: true, capture: true });
  window.addEventListener('resize', throttled);
  setInterval(() => send(false), 600);
  send(true);
})();
