'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const on = (ch, cb) => ipcRenderer.on(ch, (_e, v) => cb(v));
contextBridge.exposeInMainWorld('clawd', {
  getInfo: () => ipcRenderer.invoke('info'),
  setIgnore: v => ipcRenderer.send('ignore', !!v),
  onInfo: cb => on('info', cb),
  onCursor: cb => on('cursor', cb),
  onWindows: cb => on('windows', cb),
  onDom: cb => on('dom', cb),
  onApp: cb => on('app', cb),
  loadMemory: () => ipcRenderer.invoke('mem:get'),
  saveMemory: m => ipcRenderer.send('mem:set', m),
  onStory: cb => on('story', cb),
  onThinking: cb => on('thinking', cb),
  onGen: cb => { on('gen:begin', v => cb('begin', v)); on('gen:nodes', v => cb('nodes', v)); on('gen:end', v => cb('end', v)); },
  genAbort: () => ipcRenderer.send('gen:abort'),
  onSay: cb => on('say', cb),
  openChat: o => ipcRenderer.send('chat:open', o),
  reportPet: o => ipcRenderer.send('pet:report', o),
  askText: q => ipcRenderer.invoke('ask-text', q),
  llmContinue: st => ipcRenderer.invoke('story:continue', st),
  storyWarn: m => ipcRenderer.send('story:warn', String(m).slice(0, 300)),
  // 聊天窗口 / 设置窗口使用
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  chatAsk: t => ipcRenderer.invoke('chat:ask', t),
  chatBuiltin: id => ipcRenderer.send('chat:builtin', id),
  chatReply: t => ipcRenderer.send('chat:reply', t),
  chatClose: () => ipcRenderer.send('chat:close'),
  chatBusy: v => ipcRenderer.send('chat:busy', !!v),
  chatSettings: () => ipcRenderer.send('chat:settings'),
  setGet: () => ipcRenderer.invoke('set:get'),
  setSave: o => ipcRenderer.invoke('set:save', o),
  setTest: () => ipcRenderer.invoke('set:test'),
  onCommand: cb => on('cmd', cb)
});
