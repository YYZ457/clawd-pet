'use strict';
/* 大模型接入(OpenAI 兼容格式,默认 DeepSeek)。只在主进程里运行,Key 不会进入渲染进程。
   v1.3:
   - DeepSeek 新模型默认开着"思考模式",思考内容会吃掉 max_tokens,导致正文为空/被截断 → 默认显式关闭(thinking: disabled)
   - 流式输出 + 增量解析:剧本里每个节点一到齐就能开演,不用等整段写完
   - 输出上限大幅放宽(默认 8000 token),剧本表达力从 13 种节点扩到 21 种 */

const SYSTEM = `你是桌面宠物 Clawd(橙色像素小生物,圆滚滚,爱吃饼干,呆萌)的导演兼编剧。只输出 1 个 JSON 对象,不要解释,不要代码块。
按用户请求选 kind:
1) {"kind":"chat","say":"≤40字的回答"} 闲聊/问答/随口一句
2) {"kind":"story","title":"≤10字","nodes":[...]} 互动小剧场,下面的节点自由组合(title 必须写在 nodes 之前)
3) {"kind":"skill","name":"动作名≤6字","nodes":[{"t":"anim",...}]} 学新动作,只含 1 个 anim

【节点】每个节点 {"id":短字符串,"t":类型,...};next 缺省=数组里的下一个。任意节点可加 "fx":特效名,"fxn":1~8 顺带放特效。
say{text≤90,ms?,pose?{姿态字段同 anim},act?动作名(边说边做)} 台词
act{name,max?秒} 动作:wave dance cheer spin flip stretch bow hiccup sneeze moonwalk sit read coffee cookie laptop hop love trip doze startle critter party ball pounce poke ouch notice
anim{dur≤20,keys:[{t:0~1,姿态}],hold?,loop?1~8} 自编动作,关键帧之间自动平滑。姿态字段:lift(0~6跳起) dy sx sy(0.6~1.4挤压拉伸) rot(-3~3翻滚/歪头) ex ey(-1~1眼神) eye(open happy closed wide angry sad x heart dots ><) mouth(smile o big yawn frown flat cat munch) blush(0~1) tears dizzy armL armR([dx,dy,h],dy=-6 为举手) legs(stand walk run tuck air dangle) prop(book mug cookie flower balloon sign heart laptop) hat(santa party crown bow nightcap pumpkin redcap) glasses(shades)
move{to:left|right|center|cursor|item|up|down|window|ground,item?,run?} 走过去。cursor=真的去追用户的鼠标(会跳上跳下,x 和 y 都会靠近);item=走到道具;up/down/window=跳到更高/更低/随机的别的窗口上;ground=回到地面
face{dir:left|right|cursor}
fx{kind:heart star note confetti dust zzz text question exclaim sweat anger sparkle snow rain fireworks bubbles,n:1~12,text?≤6}
item{emoji:单个emoji,at:left|right|center|near|far|cursor|random,key?≤8字} 放道具(同屏最多 6 个);{"t":"item","remove":true 或 key} 拿走
take{key?} 把道具举在头顶带着走;put 放下
wear{hat?,glasses?,prop?}(值 none=摘掉) 换装
tint{color:night|sunset|forest|ocean|rose|gold|dusk|none,a?0.05~0.4} 给屏幕加一层氛围色
wait{sec}
ask{text,choices:[{text≤8字,next,set?{变量:值}}](2~4 个),timeout?,sec?} 按钮选择
wait_for{what,sec,next,timeout} 等用户做某事。what: pet摸它 click点它 tickle挠它 near鼠标靠近 far鼠标远离 throw扔它 hover鼠标停在它身上 grab拎起它 still鼠标不动 move鼠标乱动 left/right/top/bottom鼠标去屏幕某一边 type在打字
ask_text{text,key,next} 让用户打字回答,之后任何文字里可写 {key} 引用
set{vars:{名:"+1"|"-1"|"值"}} 变量(+n/-n 表示增减,其它直接赋值;台词里可写 {名})
if{key,op:==|!=|>|<|>=|<=,value,then,else} 条件分支
random{to:[id,...]} 随机去其中一个
loop{n:1~8,to:id} 回到 id 重复 n 次
continue{hint} 暂停,等用户互动后再续写下一段(最多可续 8 段,适合长故事)
end{text?}

【要求】
- 台词呆萌简短,每句≤24字。节奏:台词、动作、特效、道具穿插,别连续超过 3 句台词;多用 anim 自编动作表达情绪(开心/害怕/害羞/得意/困惑),多用 say 的 pose。
- 真正互动:至少 3 处让用户参与(ask / wait_for / ask_text / 追鼠标),用户的选择会改变后面发生的事:用 set 记分/好感度/线索,用 if 判定结局;用户打的字要在后面被引用。
- 结构:story 建议 25~80 个节点,至少 2 个分支和 2 个不同结局;每条路径都必须走到 end 或 continue;id 全局唯一。想写长故事就多用 continue 分段。
- 善用场景:tint 营造氛围,item+take 做寻宝/送礼/收集,move up/down/window 在窗口间上蹿下跳,move cursor 追着用户的鼠标玩,wear 换装扮演角色。
- 只输出上面定义的字段。
示例(片段):{"kind":"story","title":"偷饼干","nodes":[{"id":"a","t":"say","text":"嘘…我要偷饼干","pose":{"eye":"closed","mouth":"cat"}},{"id":"b","t":"move","to":"window"},{"id":"c","t":"ask","text":"饼干在哪?","choices":[{"text":"左边","next":"l","set":{"hint":"1"}},{"text":"右边","next":"r"}]},{"id":"l","t":"item","emoji":"🍪","at":"left","key":"ck"},{"id":"l2","t":"move","to":"item","item":"ck","next":"z"},{"id":"r","t":"say","text":"空的!","pose":{"eye":"sad"},"next":"z"},{"id":"z","t":"end","text":"完"}]}`;

function buildAsk(ctx, text) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `[状态] ${ctx || '无'}\n用户说:${String(text).slice(0, 200)}` }
  ];
}

function buildContinue(ctx, st) {
  const maxSeg = st.maxSeg || 8, last = st.seg >= maxSeg;
  const log = (st.log || []).slice(-12).join(';').slice(0, 600);
  const vars = Object.keys(st.vars || {}).slice(0, 8).map(k => k + '=' + st.vars[k]).join(',');
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `[状态] ${ctx || '无'}\n故事《${String(st.title || '').slice(0, 16)}》,开场:${String(st.premise || '').slice(0, 80)}。` +
        `已演第${st.seg}段(最多${maxSeg}段)。${last ? '这是最后一段,必须以 end 收尾。' : '可继续(continue)也可收尾(end)。'}\n` +
        `用户的互动:${log || '无'}\n当前变量:${vars || '无'}\n走向提示:${String(st.hint || '').slice(0, 120)}\n` +
        `请输出下一段 {"kind":"story","title":"${String(st.title || '').slice(0, 16)}","nodes":[...]},15~60 个节点,不要重复前文,要有新的互动和变化。`
    }
  ];
}

// 括号补全式修复:模型被截断时,尽量救回已经写好的部分
function closersFor(s) {
  const st = []; let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') st.push(c); else if (c === '}' || c === ']') st.pop();
  }
  let out = inStr ? '"' : '';
  while (st.length) out += st.pop() === '{' ? '}' : ']';
  return out;
}
function repairJSON(s) {
  s = String(s).replace(/[,\s]+$/, '');
  for (let n = 0; n < 60 && s; n++) {
    const cand = s + closersFor(s);
    try { JSON.parse(cand); return cand; } catch (_) { /* 往回退到上一个逗号 */ }
    const k = s.lastIndexOf(','); if (k < 0) break;
    s = s.slice(0, k);
  }
  throw new Error('不完整');
}

function extractJSON(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const a = s.indexOf('{');
  if (a < 0) throw new Error('模型没有返回 JSON');
  const b = s.lastIndexOf('}');
  if (b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { /* 往下尝试修复 */ } }
  try { return JSON.parse(repairJSON(s.slice(a))); } catch (_) { throw new Error('模型返回的 JSON 不完整'); }
}

/** 增量解析:一边收文字,一边把"数组 nodes 里已经写完的节点"一个个吐出来 */
class NodeStream {
  constructor() { this.buf = ''; this.i = 0; this.depth = 0; this.inStr = false; this.esc = false; this.arrDepth = -1; this.itemStart = -1; this.kind = null; this.title = ''; this.metaDone = false; this.count = 0; }
  feed(chunk) {
    this.buf += chunk;
    const out = [], b = this.buf;
    for (; this.i < b.length; this.i++) {
      const c = b[this.i];
      if (this.inStr) { if (this.esc) this.esc = false; else if (c === '\\') this.esc = true; else if (c === '"') this.inStr = false; continue; }
      if (c === '"') { this.inStr = true; continue; }
      if (c === '{' || c === '[') {
        if (c === '[' && this.depth === 1 && this.arrDepth < 0 && /"nodes"\s*:\s*$/.test(b.slice(Math.max(0, this.i - 24), this.i))) {
          this.arrDepth = 2; this.meta(b.slice(0, this.i));
        }
        this.depth++;
        if (c === '{' && this.arrDepth === 2 && this.depth === 3) this.itemStart = this.i;
      } else if (c === '}' || c === ']') {
        if (c === '}' && this.arrDepth === 2 && this.depth === 3 && this.itemStart >= 0) {
          try { out.push(JSON.parse(b.slice(this.itemStart, this.i + 1))); this.count++; } catch (_) { /* 坏节点丢弃 */ }
          this.itemStart = -1;
        }
        if (c === ']' && this.arrDepth === 2 && this.depth === 2) this.arrDepth = -2;   // nodes 数组结束
        this.depth--;
      }
    }
    if (!this.kind && this.depth >= 1) { const m = /"kind"\s*:\s*"(\w+)"/.exec(b); if (m) this.kind = m[1]; }
    return out;
  }
  meta(prefix) {
    const k = /"kind"\s*:\s*"(\w+)"/.exec(prefix), t = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(prefix);
    if (k) this.kind = k[1];
    if (t) { try { this.title = JSON.parse('"' + t[1] + '"'); } catch (_) { this.title = t[1]; } }
    this.metaDone = true;
  }
}

class LLMError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

const isDeepseek = base => /deepseek/i.test(String(base || 'https://api.deepseek.com'));
// DeepSeek 旧模型名(deepseek-chat / deepseek-reasoner)已下线,统一换成新名字
function normalizeModel(model, base) {
  const m = String(model || '').trim();
  if (isDeepseek(base) && (!m || m === 'deepseek-chat' || m === 'deepseek-reasoner')) return 'deepseek-flash';
  return m || 'deepseek-flash';
}

function buildRequest(cfg, messages, opt, stream) {
  const base = String(cfg.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  const body = { model: normalizeModel(cfg.model, base), messages, max_tokens: opt.maxTokens || 8000, temperature: opt.temperature != null ? opt.temperature : 1.1, stream: !!stream };
  if (opt.json !== false) body.response_format = { type: 'json_object' };
  if (isDeepseek(base) && opt.thinking !== true) body.thinking = { type: 'disabled' };   // 关键:不关的话思考内容会吃掉 token、拖慢首字
  if (stream) body.stream_options = { include_usage: true };
  return { url, body };
}

async function httpError(res) {
  let detail = '';
  try { const j = await res.json(); detail = (j && (j.error && j.error.message || j.message)) || ''; } catch (_) {}
  const m = { 401: 'Key 无效或已失效', 402: '账户余额不足', 403: '没有权限', 404: '地址或模型名不对 (404)', 429: '请求太快了,稍后再试' }[res.status];
  const d = String(detail).slice(0, 100);
  return new LLMError(m ? (m + (d && res.status !== 401 && res.status !== 402 ? ':' + d : '')) : (d || ('服务返回 ' + res.status)), 'http' + res.status);
}

/** 发请求;遇到 400 就逐个去掉可选字段(thinking / response_format / stream_options)重试,兼容各种 OpenAI 风格服务 */
async function send(cfg, messages, opt, stream, signal) {
  const { url, body } = buildRequest(cfg, messages, opt, stream);
  const optional = ['thinking', 'response_format', 'stream_options'];
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), opt.connectTimeout || 30000);
    const onAbort = () => ctl.abort(); if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    let res;
    try { res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(body), signal: ctl.signal }); }
    catch (e) {
      if (signal && signal.aborted) throw new LLMError('已取消', 'abort');
      throw new LLMError(e && e.name === 'AbortError' ? '连接超时了' : ('网络连接失败: ' + ((e && e.cause && e.cause.message) || (e && e.message) || '连不上服务器')), 'net');
    } finally { clearTimeout(to); if (signal) signal.removeEventListener('abort', onAbort); }
    if (res.status === 400) {
      const drop = optional.find(k => k in body);
      if (drop) { delete body[drop]; try { await res.arrayBuffer(); } catch (_) {} continue; }
    }
    if (!res.ok) throw await httpError(res);
    return res;
  }
  throw new LLMError('服务拒绝了请求(400)', 'http400');
}

/** 非流式:用于"测试连接"这类短请求 */
async function chat(cfg, messages, opt = {}) {
  const res = await send(cfg, messages, opt, false, opt.signal);
  const j = await res.json();
  const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new LLMError('模型没有回答', 'empty');
  const u = j.usage || {};
  return { text, tokens: u.total_tokens || Math.ceil((JSON.stringify(messages).length + text.length) / 1.5) };
}

/** 流式:onDelta(text) 每收到一段文字就回调。返回 {text, tokens, finish}。
    idleTimeout:多久没收到任何数据就放弃;totalTimeout:总时长上限。 */
async function chatStream(cfg, messages, opt = {}, onDelta) {
  const res = await send(cfg, messages, opt, true, opt.signal);
  const dec = new TextDecoder('utf-8'); let buf = '', text = '', usage = null, finish = '';
  const idle = opt.idleTimeout || 40000, total = opt.totalTimeout || 300000, t0 = Date.now();
  const reader = res.body.getReader();
  let timer = null, timedOut = false;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; try { reader.cancel(); } catch (_) {} }, idle); };
  const onAbort = () => { try { reader.cancel(); } catch (_) {} };
  if (opt.signal) opt.signal.addEventListener('abort', onAbort, { once: true });
  arm();
  const handleLine = line => {
    line = line.trim(); if (!line || line[0] === ':' || !line.startsWith('data:')) return;
    const d = line.slice(5).trim(); if (d === '[DONE]') return;
    let j; try { j = JSON.parse(d); } catch (_) { return; }
    if (j.usage) usage = j.usage;
    const ch = j.choices && j.choices[0]; if (!ch) return;
    if (ch.finish_reason) finish = ch.finish_reason;
    const t = ch.delta && ch.delta.content;
    if (t) { text += t; if (onDelta) onDelta(t); }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      buf += dec.decode(value, { stream: true });
      let k; while ((k = buf.indexOf('\n')) >= 0) { handleLine(buf.slice(0, k)); buf = buf.slice(k + 1); }
      if (Date.now() - t0 > total) { timedOut = true; try { reader.cancel(); } catch (_) {} break; }
    }
    if (buf) handleLine(buf);
  } catch (e) {
    if (opt.signal && opt.signal.aborted) throw new LLMError('已取消', 'abort');
    if (!text) throw new LLMError('读取回答时断开了: ' + ((e && e.message) || ''), 'net');
  } finally { clearTimeout(timer); if (opt.signal) opt.signal.removeEventListener('abort', onAbort); }
  if (opt.signal && opt.signal.aborted) throw new LLMError('已取消', 'abort');
  if (!text) throw new LLMError(timedOut ? '等太久了,模型没有回应' : '模型没有回答', timedOut ? 'net' : 'empty');
  return { text, finish: finish || (timedOut ? 'timeout' : ''), tokens: (usage && usage.total_tokens) || Math.ceil((JSON.stringify(messages).length + text.length) / 1.5) };
}

module.exports = { SYSTEM, buildAsk, buildContinue, extractJSON, repairJSON, NodeStream, chat, chatStream, LLMError, isDeepseek, normalizeModel };
