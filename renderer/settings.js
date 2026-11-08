'use strict';
(() => {
  const api = window.clawd, $ = id => document.getElementById(id);
  const msg = (t, k) => { $('msg').textContent = t || ''; $('msg').className = 'msg ' + (k || ''); };
  function fill(s) {
    $('enabled').checked = !!s.enabled; $('base').value = s.baseUrl; $('model').value = s.model;
    $('calls').value = s.dailyCalls; $('tokens').value = s.dailyTokens;
    $('keyinfo').textContent = s.hasKey ? (s.encrypted ? '(已保存,已加密)' : '(已保存,本机明文——系统不支持加密)') : '(还没填)';
    $('key').value = '';
  }
  api.setGet().then(fill);
  $('save').onclick = async () => {
    const r = await api.setSave({ enabled: $('enabled').checked, baseUrl: $('base').value, model: $('model').value, dailyCalls: $('calls').value, dailyTokens: $('tokens').value, key: $('key').value });
    if (r.ok) { fill(r.state); msg('已保存 ✓', 'ok'); } else msg(r.error, 'err');
  };
  $('test').onclick = async () => {
    msg('测试中…');
    const s = await api.setSave({ baseUrl: $('base').value, model: $('model').value, key: $('key').value });
    if (!s.ok) return msg(s.error, 'err');
    fill(s.state);
    const r = await api.setTest();
    r.ok ? msg(`连接成功 ✓ (${r.ms} ms)`, 'ok') : msg('失败:' + r.error, 'err');
  };
  $('clear').onclick = async () => { const r = await api.setSave({ clearKey: true }); if (r.ok) { fill(r.state); msg('Key 已清除', 'ok'); } };
})();
