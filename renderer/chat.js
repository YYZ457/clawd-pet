'use strict';
(() => {
  const api = window.clawd;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const reply = qs.get('mode') === 'reply';
  const inp = $('inp'), send = $('send'), status = $('status');
  let busy = false;

  const setStatus = (t, err) => { status.textContent = t || ''; status.className = 'status' + (err ? ' err' : ''); };

  if (reply) {
    $('title').textContent = 'Clawd 在问你';
    $('q').hidden = false; $('q').textContent = qs.get('q') || '';
    $('more').hidden = true; $('gear').hidden = true;
    inp.placeholder = '输入你的回答,Enter 发送(Esc 跳过)';
  }

  async function refresh() {
    try {
      const st = await api.chatStatus();
      $('quota').textContent = st.enabled && st.hasKey ? `今日 ${st.used.calls}/${st.dailyCalls} 次` : '(大模型未开启)';
      if (!reply) {
        const b = $('builtin'); b.innerHTML = '';
        for (const s of st.builtin) { const c = document.createElement('button'); c.className = 'chip'; c.textContent = '▶ ' + s.title; c.title = s.desc; c.onclick = () => api.chatBuiltin(s.id); b.appendChild(c); }
        const ideas = ['演一出海盗寻宝', '演一出外星人来访', '学个害羞转圈的动作', '讲个冷笑话', '陪我聊两句'];
        const i = $('ideas'); i.innerHTML = '';
        for (const t of ideas) { const c = document.createElement('button'); c.className = 'chip'; c.textContent = t; c.onclick = () => { inp.value = t; inp.focus(); }; i.appendChild(c); }
        if (!st.enabled || !st.hasKey) setStatus('没填 Key 也能玩内置剧场;想让它即兴编剧,点右上角 ⚙ 填 DeepSeek Key。');
      }
    } catch (_) {}
  }

  async function submit() {
    const text = inp.value.trim();
    if (!text || busy) return;
    if (reply) { api.chatReply(text); return; }
    busy = true; send.disabled = true; inp.disabled = true;
    const glyphs = ['✻', '✽', '✶', '✳', '✢'], verbs = ['Cogitating', 'Pondering', 'Noodling', 'Percolating'];
    let i = 0; const t = setInterval(() => setStatus(`${glyphs[i % 5]} ${verbs[Math.floor(i / 8) % 4]}…`), 140);
    try {
      const r = await api.chatAsk(text);
      clearInterval(t);
      if (r.ok) api.chatClose();
      else { setStatus('😵 ' + r.error, true); busy = false; send.disabled = false; inp.disabled = false; inp.focus(); }
    } catch (e) { clearInterval(t); setStatus('😵 ' + e.message, true); busy = false; send.disabled = false; inp.disabled = false; }
  }

  send.onclick = submit;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (reply) api.chatClose(); else api.chatClose(); } });
  $('gear').onclick = () => api.chatSettings();
  refresh();
  setTimeout(() => inp.focus(), 60);
})();
