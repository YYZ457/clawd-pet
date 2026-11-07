// 把内容脚本收集到的元素位置转发给本机的 Clawd(只发 127.0.0.1)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'clawd-dom') return;
  fetch('http://127.0.0.1:23333/dom', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(msg.data)
  }).catch(() => {});  // Clawd 没开就静默忽略
});
