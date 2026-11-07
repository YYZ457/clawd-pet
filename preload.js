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
  onCommand: cb => on('cmd', cb)
});
