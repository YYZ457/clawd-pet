'use strict';
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell, powerMonitor, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const llm = require('./llm');
const Stories = require('./renderer/stories.js');
const ScriptTools = require('./renderer/script.js');

const isWin = process.platform === 'win32';
const TEST = process.env.CLAWD_SHOT; // 自测:截图后退出

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, tray = null, ps = null, domServer = null;
const LLM_DEFAULT = { enabled: false, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', keyEnc: '', keyPlain: '', dailyCalls: 40, dailyTokens: 80000 };
let settings = { scale: 4, quiet: false, autostart: false, sense: true, llm: Object.assign({}, LLM_DEFAULT) };
let chatWin = null, setWin = null, replyResolve = null, lastCtx = '', lastPet = { x: 400, y: 300 };
let lastFg = '';
let hiddenByUser = false, hiddenByFullscreen = false;
let lastWinJson = '';

// ------------------------------------------------------------ 设置
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch (_) {} settings.llm = Object.assign({}, LLM_DEFAULT, settings.llm || {}); }
function saveSettings() { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (_) {} }

// ------------------------------------------------------------ 记忆(只存在本机)
const memFile = () => path.join(app.getPath('userData'), 'memory.json');
function loadMemory() { try { return JSON.parse(fs.readFileSync(memFile(), 'utf8')); } catch (_) { return null; } }
function saveMemory(m) { try { fs.mkdirSync(path.dirname(memFile()), { recursive: true }); fs.writeFileSync(memFile(), JSON.stringify(m)); } catch (_) {} }

// ------------------------------------------------------------ 窗口
function display() { return screen.getPrimaryDisplay(); }
function info() {
  const d = display();
  const b = d.bounds, wa = d.workArea;
  return { width: b.width, height: b.height - 1, groundY: wa.y + wa.height - b.y, scale: settings.scale, quiet: settings.quiet, sense: settings.sense };
}

function createWindow() {
  const b = display().bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height - 1,
    transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    hasShadow: false, skipTaskbar: true, focusable: true, alwaysOnTop: true, show: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); });
  win.on('closed', () => { win = null; });
  if (TEST) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try { const img = await win.webContents.capturePage(); fs.writeFileSync(TEST, img.toPNG()); } catch (e) { console.error(e); }
        app.quit();
      }, Number(process.env.CLAWD_WAIT || 3500));
    });
  }
}

function applyVisibility() {
  if (!win) return;
  const hide = hiddenByUser || hiddenByFullscreen;
  if (hide && win.isVisible()) win.hide();
  else if (!hide && !win.isVisible()) win.showInactive();
}

// ------------------------------------------------------------ 光标轮询
let lastCur = { x: -1, y: -1 }, lastSend = 0;
function pollCursor() {
  if (!win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint(), b = display().bounds;
  const x = p.x - b.x, y = p.y - b.y, now = Date.now();
  if (x !== lastCur.x || y !== lastCur.y || now - lastSend > 400) {
    lastCur = { x, y }; lastSend = now;
    let idle = null;
    try { idle = powerMonitor.getSystemIdleTime(); } catch (_) {}
    win.webContents.send('cursor', { x, y, idle });
  }
}

// ------------------------------------------------------------ Windows 窗口枚举(让它能站在别的窗口顶上)
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$src = @'
using System; using System.Text; using System.Runtime.InteropServices;
public class CW {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  static uint fgPid = 0; static string fgName = "";
  public static string Foreground(uint self) {
    try {
      IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return "";
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == self) return fgName;
      if (pid != fgPid) {
        fgPid = pid;
        string n = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName;
        StringBuilder o = new StringBuilder();
        foreach (char c in n) { if (char.IsLetterOrDigit(c) || c == '_' || c == '-' || c == '+' || c == '.') o.Append(c); }
        fgName = o.ToString().ToLower();
      }
      return fgName;
    } catch (Exception) { return ""; }
  }
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int sz);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int sz);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static void Init() { SetProcessDPIAware(); }
  public static string Snapshot(uint self) {
    StringBuilder sb = new StringBuilder("{\\"fg\\":\\"" + Foreground(self) + "\\",\\"w\\":[");
    bool first = true;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h) || IsIconic(h)) return true;
      int ex = GetWindowLong(h, -20);
      if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return true;
      if ((ex & 0x08000000) != 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (pid == self) return true;
      int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4); if (cloaked != 0) return true;
      StringBuilder cn = new StringBuilder(64); GetClassName(h, cn, 64); string c = cn.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "Windows.UI.Core.CoreWindow" || c == "XamlExplorerHostIslandWindow") return true;
      if (GetWindowTextLength(h) == 0) return true;
      RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true;
      if (r.R - r.L < 60 || r.B - r.T < 30) return true;
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\\"id\\":").Append(h.ToInt64()).Append(",\\"l\\":").Append(r.L).Append(",\\"t\\":").Append(r.T).Append(",\\"r\\":").Append(r.R).Append(",\\"b\\":").Append(r.B).Append("}");
      return true;
    }, IntPtr.Zero);
    sb.Append("]}");
    return sb.ToString();
  }
}
'@
Add-Type -TypeDefinition $src -Language CSharp
[CW]::Init()
$self = [uint32]__PID__
while ($true) {
  [Console]::Out.WriteLine([CW]::Snapshot($self))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 90
}
`;

function startWindowWatcher() {
  if (!isWin) return;
  try {
    const script = PS_SCRIPT.replace('__PID__', String(process.pid));
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) handleWindows(line);
      }
    });
    ps.on('exit', () => { ps = null; });
  } catch (_) { /* 没有 PowerShell 就只用地面 */ }
}

function toDip(x, y) {
  try { const p = screen.screenToDipPoint({ x, y }); return { x: p.x, y: p.y }; }
  catch (_) { const f = display().scaleFactor || 1; return { x: x / f, y: y / f }; }
}

function handleWindows(line) {
  if (!win || win.isDestroyed()) return;
  let list;
  try {
    const obj = JSON.parse(line);
    list = Array.isArray(obj) ? obj : obj.w;
    const fg = Array.isArray(obj) ? '' : (obj.fg || '');
    if (fg && fg !== lastFg) { lastFg = fg; if (settings.sense) win.webContents.send('app', fg); }
  } catch (_) { return; }
  const d = display(), b = d.bounds, f = d.scaleFactor || 1;
  // 全屏程序(游戏/视频/PPT 放映)覆盖整个屏幕时,桌宠自动躲起来
  const phys = { w: Math.round(b.width * f), h: Math.round(b.height * f) };
  const top = list[0];
  hiddenByFullscreen = !!(top && (top.r - top.l) >= phys.w - 2 && (top.b - top.t) >= phys.h - 2 && top.t <= 2);
  applyVisibility();
  const out = [];
  for (const w of list) {
    const a = toDip(w.l, w.t), c = toDip(w.r, w.b);
    const o = { id: w.id, l: a.x - b.x, t: a.y - b.y, r: c.x - b.x, b: c.y - b.y };
    if (o.r < 0 || o.l > b.width || o.t > b.height) continue;
    out.push({ id: o.id, l: Math.round(o.l), t: Math.round(o.t), r: Math.round(o.r), b: Math.round(o.b) });
  }
  const js = JSON.stringify(out);
  if (js !== lastWinJson) { lastWinJson = js; win.webContents.send('windows', out); }
}

// ------------------------------------------------------------ 浏览器插件 -> 网页元素当平台
function startDomServer() {
  domServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'POST' || req.url !== '/dom') { res.writeHead(404); res.end(); return; }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
      try { handleDom(JSON.parse(body)); } catch (_) {}
    });
  });
  domServer.on('error', () => {});
  domServer.listen(23333, '127.0.0.1');
}

function handleDom(m) {
  if (!win || win.isDestroyed() || !m || !Array.isArray(m.rects)) return;
  const d = display(), b = d.bounds, s = d.scaleFactor || 1;
  const Z = (m.dpr || s) / s;                       // 页面缩放
  const border = Math.max(0, (m.outerW - m.innerW * Z) / 2);
  const vx0 = m.screenX + border - b.x;
  const vy0 = m.screenY + Math.max(0, m.outerH - m.innerH * Z - border) - b.y;
  const out = [];
  for (const r of m.rects) {                         // [id, left, top, width]
    const x1 = vx0 + r[1] * Z, y = vy0 + r[2] * Z, w = r[3] * Z;
    out.push({ id: r[0], x1: Math.round(x1), x2: Math.round(x1 + w), y: Math.round(y) });
  }
  win.webContents.send('dom', out);
}

// ------------------------------------------------------------ 大模型 / 聊天 / 剧情
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function setKey(k) {
  const c = settings.llm;
  if (!k) { c.keyEnc = ''; c.keyPlain = ''; return; }
  try {
    if (safeStorage.isEncryptionAvailable()) { c.keyEnc = safeStorage.encryptString(k).toString('base64'); c.keyPlain = ''; return; }
  } catch (_) {}
  c.keyPlain = k; c.keyEnc = '';
}
function getKey() {
  const c = settings.llm;
  try { if (c.keyEnc) return safeStorage.decryptString(Buffer.from(c.keyEnc, 'base64')); } catch (_) {}
  return c.keyPlain || '';
}
const usageFile = () => path.join(app.getPath('userData'), 'usage.json');
const dayStr = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
function usage() {
  let u = null; try { u = JSON.parse(fs.readFileSync(usageFile(), 'utf8')); } catch (_) {}
  if (!u || u.day !== dayStr()) u = { day: dayStr(), calls: 0, tokens: 0 };
  return u;
}
function addUsage(tokens) {
  const u = usage(); u.calls++; u.tokens += tokens || 0;
  try { fs.mkdirSync(path.dirname(usageFile()), { recursive: true }); fs.writeFileSync(usageFile(), JSON.stringify(u)); } catch (_) {}
}
async function runLLM(messages, opt = {}) {
  const c = settings.llm, key = getKey();
  if (!c.enabled) throw new llm.LLMError('还没开启大模型(托盘 → 大模型设置)', 'off');
  if (!key) throw new llm.LLMError('还没填 API Key(点聊天框右上角 ⚙)', 'nokey');
  const u = usage();
  if (u.calls >= c.dailyCalls || u.tokens >= c.dailyTokens) throw new llm.LLMError('今天的额度用完啦(设置里可以调整)', 'budget');
  const r = await llm.chat({ baseUrl: c.baseUrl, model: c.model, key }, messages, { maxTokens: opt.maxTokens || 900 });
  addUsage(r.tokens);
  return r;
}
const toOverlay = (ch, v) => { if (win && !win.isDestroyed()) win.webContents.send(ch, v); };
const setThinking = on => toOverlay('thinking', !!on);

async function handleAsk(text) {
  text = String(text || '').trim().slice(0, 200);
  if (!text) return { ok: false, error: '说点什么吧~' };
  let t = text;
  if (/^\/演/.test(t)) t = '演一出互动小剧场:' + t.slice(2);
  else if (/^\/学/.test(t)) t = '学一个新动作:' + t.slice(2);
  else if (/^\/聊/.test(t)) t = '闲聊:' + t.slice(2);
  setThinking(true);
  try {
    const r = await runLLM(llm.buildAsk(lastCtx, t));
    const obj = llm.extractJSON(r.text);
    const chk = ScriptTools.sanitize(obj);
    if (!chk.ok) throw new llm.LLMError('它写的剧本我看不懂:' + chk.error, 'format');
    toOverlay('story', { payload: obj, premise: text.slice(0, 80) });
    return { ok: true, kind: chk.kind };
  } catch (e) {
    const msg = (e && e.message) || String(e);
    toOverlay('say', '😵 ' + msg);
    return { ok: false, error: msg };
  } finally { setThinking(false); }
}

async function handleContinue(st) {
  st = st || {};
  const clean = {
    title: String(st.title || '').slice(0, 16), premise: String(st.premise || '').slice(0, 80), hint: String(st.hint || '').slice(0, 80),
    seg: clampN(Number(st.seg) || 1, 1, 5), maxSeg: 4, log: Array.isArray(st.log) ? st.log.slice(-8).map(x => String(x).slice(0, 40)) : []
  };
  try {
    const r = await runLLM(llm.buildContinue(lastCtx, clean));
    const obj = llm.extractJSON(r.text);
    const chk = ScriptTools.sanitize(obj);
    if (!chk.ok) throw new llm.LLMError('续写的剧本不对:' + chk.error, 'format');
    return { ok: true, payload: obj };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}

function openChat(opts = {}) {
  const now = Date.now();
  if (chatWin && !chatWin.isDestroyed()) {
    if (chatWin._openedAt && now - chatWin._openedAt < 500) return;
    const was = chatWin; chatWin = null; was.close(); if (!opts.force) return;
  }
  const mode = opts.mode === 'reply' ? 'reply' : 'talk';
  const w = 340, h = mode === 'reply' ? 150 : 262;
  const d = display(), b = d.bounds, wa = d.workArea;
  const px = b.x + (opts.x != null ? opts.x : lastPet.x), py = b.y + (opts.y != null ? opts.y : lastPet.y);
  let x = Math.round(px + 48), y = Math.round(py - h - 24);
  if (x + w > wa.x + wa.width - 8) x = Math.round(px - w - 48);
  x = clampN(x, wa.x + 8, Math.max(wa.x + 8, wa.x + wa.width - w - 8)); y = clampN(y, wa.y + 8, Math.max(wa.y + 8, wa.y + wa.height - h - 8));
  const cw = new BrowserWindow({
    x, y, width: w, height: h, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  cw._openedAt = now;
  chatWin = cw;
  cw.setAlwaysOnTop(true, 'screen-saver');
  cw.loadFile(path.join(__dirname, 'renderer', 'chat.html'), { query: { mode, q: opts.question || '' } });
  cw.once('ready-to-show', () => { cw.show(); try { app.focus({ steal: true }); } catch (_) {} cw.focus(); });
  cw.on('blur', () => setTimeout(() => {
    if (!cw.isDestroyed() && !cw.isFocused() && Date.now() - (cw._openedAt || 0) > 800) {
      cw.close();
    }
  }, 300));
  cw.on('closed', () => {
    if (chatWin === cw) chatWin = null;
    if (replyResolve) { const r = replyResolve; replyResolve = null; r(null); }
  });
}
function askText(q) {
  return new Promise(res => {
    if (replyResolve) { const r = replyResolve; replyResolve = null; r(null); }
    replyResolve = res; openChat({ mode: 'reply', question: String(q || '').slice(0, 40), force: true });
  });
}
function openSettings() {
  if (setWin && !setWin.isDestroyed()) { setWin.focus(); return; }
  setWin = new BrowserWindow({
    width: 440, height: 560, title: 'Clawd × 大模型设置', autoHideMenuBar: true, resizable: false, minimizable: false, maximizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  setWin.setMenu(null);
  setWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  setWin.on('closed', () => { setWin = null; });
}
function llmPublic() {
  const c = settings.llm;
  return { enabled: c.enabled, baseUrl: c.baseUrl, model: c.model, dailyCalls: c.dailyCalls, dailyTokens: c.dailyTokens, hasKey: !!getKey(), used: usage(), encrypted: (() => { try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; } })() };
}

ipcMain.handle('chat:status', () => Object.assign(llmPublic(), { builtin: Stories.list }));
ipcMain.handle('chat:ask', (_e, text) => handleAsk(text));
ipcMain.on('chat:builtin', (_e, id) => { const s = Stories.get(String(id)); if (s) toOverlay('story', { payload: s, premise: '内置:' + id }); if (chatWin && !chatWin.isDestroyed()) chatWin.close(); });
ipcMain.on('chat:reply', (_e, text) => { if (replyResolve) { const r = replyResolve; replyResolve = null; r(String(text || '').slice(0, 40)); } if (chatWin && !chatWin.isDestroyed()) chatWin.close(); });
ipcMain.on('chat:close', () => { if (chatWin && !chatWin.isDestroyed()) chatWin.close(); });
ipcMain.on('chat:settings', () => { openSettings(); if (chatWin && !chatWin.isDestroyed()) chatWin.close(); });
ipcMain.on('chat:open', (_e, o) => { if (o) { lastPet = { x: Number(o.x) || lastPet.x, y: Number(o.y) || lastPet.y }; if (typeof o.ctx === 'string') lastCtx = o.ctx.slice(0, 300); } openChat({ x: lastPet.x, y: lastPet.y }); });
ipcMain.on('pet:report', (_e, o) => {
  if (o) { lastPet = { x: Number(o.x) || lastPet.x, y: Number(o.y) || lastPet.y }; if (typeof o.ctx === 'string') lastCtx = o.ctx.slice(0, 300); }
});
ipcMain.handle('ask-text', (_e, q) => askText(q));
ipcMain.handle('story:continue', (_e, st) => handleContinue(st));
ipcMain.handle('set:get', () => llmPublic());
ipcMain.handle('set:save', (_e, o) => {
  o = o || {}; const c = settings.llm;
  if (typeof o.enabled === 'boolean') c.enabled = o.enabled;
  if (typeof o.baseUrl === 'string') {
    const u = o.baseUrl.trim();
    if (!/^https:\/\//i.test(u) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(u)) return { ok: false, error: '地址必须以 https:// 开头(本机测试可用 http://127.0.0.1)' };
    c.baseUrl = u.slice(0, 200);
  }
  if (typeof o.model === 'string' && o.model.trim()) c.model = o.model.trim().slice(0, 60);
  if (o.dailyCalls != null) c.dailyCalls = clampN(Math.round(Number(o.dailyCalls)) || 40, 1, 500);
  if (o.dailyTokens != null) c.dailyTokens = clampN(Math.round(Number(o.dailyTokens)) || 80000, 1000, 2000000);
  if (o.clearKey) setKey('');
  else if (typeof o.key === 'string' && o.key.trim()) setKey(o.key.trim());
  saveSettings();
  return { ok: true, state: llmPublic() };
});
ipcMain.handle('set:test', async () => {
  const c = settings.llm, key = getKey();
  if (!key) return { ok: false, error: '还没填 Key' };
  const t0 = Date.now();
  try {
    const model = (c.model && c.model.trim()) || 'deepseek-flash';
    const r = await llm.chat({ baseUrl: c.baseUrl, model, key }, [{ role: 'user', content: 'Say ok' }], { json: false, maxTokens: 60, timeout: 25000 });
    addUsage(r.tokens);
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

// ------------------------------------------------------------ 托盘
function trayIcon() {
  // 16x16 的像素 Clawd,直接用位图生成,不需要图片文件
  const px = [
    '................',
    '................',
    '..xxxxxxxxxxxx..',
    '.xxxxxxxxxxxxxx.',
    '.xxxxxxxxxxxxxx.',
    '.xxx..xxxx..xxx.',
    'xxxx..xxxx..xxxx',
    'xxxx..xxxx..xxxx',
    '.xxxxxxxxxxxxxx.',
    '.xxxxxxxxxxxxxx.',
    '..xxxxxxxxxxxx..',
    '..xx.xx..xx.xx..',
    '..xx.xx..xx.xx..',
    '................',
    '................',
    '................'
  ];
  const buf = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4, c = px[y][x];
    const eye = (y === 5 || y === 6 || y === 7) && c === '.' && ((x >= 4 && x <= 5) || (x >= 10 && x <= 11)) && y >= 5 && y <= 7;
    if (c === 'x') { buf[i] = 0x57; buf[i + 1] = 0x77; buf[i + 2] = 0xD9; buf[i + 3] = 255; } // BGRA
    else if (eye) { buf[i] = 0x17; buf[i + 1] = 0x1a; buf[i + 2] = 0x1f; buf[i + 3] = 255; }
    else buf[i + 3] = 0;
  }
  return nativeImage.createFromBitmap(buf, { width: 16, height: 16 });
}

function extensionDir() {
  const packed = path.join(process.resourcesPath || '', 'browser-extension');
  return fs.existsSync(packed) ? packed : path.join(__dirname, 'browser-extension');
}

function send(cmd) { if (win && !win.isDestroyed()) win.webContents.send('cmd', cmd); }

function buildMenu() {
  const sizes = [['小', 3], ['中(默认)', 4], ['大', 5], ['特大', 7]];
  return Menu.buildFromTemplate([
    { label: '🐾 召唤 Clawd', click: () => { hiddenByUser = false; applyVisibility(); send('summon'); } },
    { label: '😴 哄它睡觉', click: () => send('sleep') },
    { label: '☀️ 叫醒它', click: () => send('wake') },
    { label: '💃 跳个舞', click: () => send('dance') },
    { type: 'separator' },
    { label: '💬 和 Clawd 说话…(也可右键点它)', click: () => openChat({}) },
    { label: '🎭 内置剧场', submenu: Stories.list.map(s => ({ label: s.title + ' — ' + s.desc, click: () => { const sc = Stories.get(s.id); if (sc) toOverlay('story', { payload: sc, premise: '内置:' + s.id }); } })) },
    { label: '⏹ 结束当前剧情', click: () => send('stopStory') },
    { label: '🔑 大模型设置(DeepSeek)…', click: () => openSettings() },
    { type: 'separator' },
    { label: '大小', submenu: sizes.map(([n, v]) => ({ label: n, type: 'radio', checked: settings.scale === v, click: () => { settings.scale = v; saveSettings(); if (win) win.webContents.send('info', info()); } })) },
    { label: '💬 显示气泡文字', type: 'checkbox', checked: !settings.quiet, click: m => { settings.quiet = !m.checked; saveSettings(); if (win) win.webContents.send('info', info()); } },
    { label: '👀 感知我在用什么软件(仅本机,不上传)', type: 'checkbox', checked: settings.sense, click: m => { settings.sense = m.checked; saveSettings(); if (win) win.webContents.send('info', info()); } },
    { label: '开机自启', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: m => { settings.autostart = m.checked; saveSettings(); try { app.setLoginItemSettings({ openAtLogin: m.checked }); } catch (_) {} } },
    { label: '🌐 浏览器插件(让它在网页上走)…', click: () => shell.openPath(extensionDir()) },
    { type: 'separator' },
    { label: hiddenByUser ? '显示 Clawd' : '暂时藏起来', click: () => { hiddenByUser = !hiddenByUser; applyVisibility(); tray.setContextMenu(buildMenu()); } },
    { label: '退出', click: () => app.quit() }
  ]);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Clawd');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => { hiddenByUser = false; applyVisibility(); send('summon'); });
}

// ------------------------------------------------------------ 生命周期
ipcMain.handle('info', () => info());
ipcMain.handle('mem:get', () => loadMemory());
ipcMain.on('mem:set', (_e, m) => { if (m && typeof m === 'object') saveMemory(m); });
ipcMain.on('ignore', (_e, v) => {
  if (win && !win.isDestroyed()) {
    if (v) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
  }
});

app.on('second-instance', () => { hiddenByUser = false; applyVisibility(); send('summon'); });
app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => { try { if (ps) ps.kill(); } catch (_) {} try { if (domServer) domServer.close(); } catch (_) {} });

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  if (!TEST) createTray();
  startWindowWatcher();
  startDomServer();
  setInterval(pollCursor, 16);
  if (process.env.CLAWD_SELFTEST) selfTest();
  const refresh = () => { if (!win) return; const b = display().bounds; win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height - 1 }); win.webContents.send('info', info()); };
  screen.on('display-metrics-changed', refresh);
  screen.on('display-added', refresh);
  screen.on('display-removed', refresh);
});

// ------------------------------------------------------------ 自测(只在 CLAWD_SELFTEST=1 时运行)
function selfTest() {
  const out = process.env.CLAWD_SELFTEST_OUT || path.join(app.getPath('userData'), 'selftest.json');
  Object.assign(settings.llm, { enabled: true, baseUrl: process.env.CLAWD_LLM_URL, model: 'mock', dailyCalls: 50 });
  setKey('sk-test');
  win.webContents.on('did-finish-load', () => setTimeout(async () => {
    const res = {};
    res.ask = await handleAsk(process.env.CLAWD_SELFTEST_ASK || '演一出海盗寻宝');
    await new Promise(r => setTimeout(r, 1500));
    res.state = await win.webContents.executeJavaScript('JSON.stringify(window.__clawd.Director.state())').catch(e => String(e));
    res.usage = usage();
    res.status = llmPublic();
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
    app.quit();
  }, 3500));
}
