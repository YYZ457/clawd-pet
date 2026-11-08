'use strict';
/* 大模型接入(OpenAI 兼容格式,默认 DeepSeek)。只在主进程里运行,Key 不会进入渲染进程。
   设计目标:token 极省 —— 固定很短的系统提示(命中缓存)、限制输出、JSON 输出。 */

const SYSTEM = `你是桌面宠物 Clawd(橙色像素小生物,圆滚滚,爱吃饼干,呆萌)的编剧。只输出 1 个 JSON 对象,不要任何解释。
按用户请求选 kind:
1) {"kind":"chat","say":"≤30字的回答"} 闲聊/问答/随口一句
2) {"kind":"story","title":"≤10字","nodes":[...]} 演一出互动小剧场,6~14 个节点
3) {"kind":"skill","name":"动作名≤6字","nodes":[{"t":"anim",...}]} 学新动作,只含 1 个 anim
节点(id 是短字符串;next 缺省=顺序下一个):
{"id","t":"say","text","ms"?}
{"id","t":"act","name":动作,"max"?秒} 动作可选: wave dance cheer spin flip stretch bow hiccup sneeze moonwalk sit read coffee cookie laptop hop love trip doze startle critter
{"id","t":"anim","dur":秒,"keys":[{"t":0~1,姿态...}],"hold"?} 自创动作。姿态字段: lift(0~5,跳起) dy sx sy(0.6~1.4,挤压) rot(-1.6~1.6) ex ey(-1~1,眼神) eye(open happy closed wide angry sad x heart dots ><) mouth(smile o big yawn frown flat cat munch) blush(0~1) tears armL armR([dx,dy,h]; dy=-6 为举手) legs(stand walk run tuck air) prop(book mug cookie flower balloon sign heart laptop) hat(santa party crown bow nightcap pumpkin redcap)
{"id","t":"move","to":"left|right|center|cursor|item","run"?true}
{"id","t":"face","dir":"left|right|cursor"}
{"id","t":"fx","kind":"heart|star|note|confetti|dust|zzz|text","n":1~10,"text"?}
{"id","t":"item","emoji":"单个emoji","at":"left|right|center|near|far"} 或 {"id","t":"item","remove":true}
{"id","t":"wait","sec"}
{"id","t":"ask","text","choices":[{"text":≤8字,"next":节点id}]} 给用户 2~3 个按钮
{"id","t":"wait_for","what":"pet|click|near|far|throw|tickle","sec","next":触发后,"timeout":超时后} 等用户摸/点/靠近/远离/扔/挠它
{"id","t":"ask_text","text","key":"变量名","next"} 让用户打字回答,之后文字里可用 {变量名} 引用
{"id","t":"continue","hint":"后续走向"} 暂停,等用户互动后再续写下一段
{"id","t":"end","text"?}
要求:台词像呆萌小动物,每句≤24字;必须有真正的互动(ask / wait_for / ask_text 至少一个),每个分支都要能走到 end 或 continue;动作要丰富(多用 anim/act/fx/item),别只说话。`;

function buildAsk(ctx, text) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `[状态] ${ctx || '无'}\n用户说:${String(text).slice(0, 200)}` }
  ];
}

function buildContinue(ctx, st) {
  const last = st.seg >= st.maxSeg;
  const log = (st.log || []).slice(-8).join(';').slice(0, 400);
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `[状态] ${ctx || '无'}\n故事《${String(st.title || '').slice(0, 16)}》,开场:${String(st.premise || '').slice(0, 80)}。` +
        `已演第${st.seg}段。${last ? '这是最后一段,必须以 end 收尾。' : '可继续(continue)也可收尾(end)。'}\n` +
        `用户的互动:${log || '无'}\n走向提示:${String(st.hint || '').slice(0, 80)}\n` +
        `请输出下一段 {"kind":"story","title":"${String(st.title || '').slice(0, 16)}","nodes":[...]},6~10 个节点,不要重复前文。`
    }
  ];
}

function extractJSON(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('模型没有返回 JSON');
  return JSON.parse(s.slice(a, b + 1));
}

class LLMError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

async function chat(cfg, messages, opt = {}) {
  const base = String(cfg.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  const body = { model: cfg.model || 'deepseek-flash', messages, max_tokens: opt.maxTokens || 900, temperature: opt.temperature != null ? opt.temperature : 1.1, stream: false };
  if (opt.json !== false) body.response_format = { type: 'json_object' };
  const post = async b => {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), opt.timeout || 45000);
    try {
      return await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(b), signal: ctl.signal });
    } finally { clearTimeout(to); }
  };
  let res;
  try { res = await post(body); }
  catch (e) { throw new LLMError(e && e.name === 'AbortError' ? '请求超时了' : ('网络连接失败: ' + (e && e.message || '连不上服务器')), 'net'); }
  if (res.status === 400 && body.response_format) {   // 个别兼容服务不支持 json_object
    delete body.response_format;
    try { res = await post(body); } catch (e) { throw new LLMError('连不上服务器: ' + (e && e.message || ''), 'net'); }
  }
  if (!res.ok) {
    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson && (errJson.error && errJson.error.message || errJson.message);
    } catch (_) {}
    const m = { 401: 'Key 无效或已失效', 402: '账户余额不足', 403: '没有权限', 404: '地址或模型名不对 (404)', 429: '请求太快了,稍后再试' }[res.status];
    throw new LLMError(detail || m || ('服务返回 ' + res.status), 'http' + res.status);
  }
  const j = await res.json();
  const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new LLMError('模型没有回答', 'empty');
  const u = j.usage || {};
  return { text, tokens: u.total_tokens || Math.ceil((JSON.stringify(messages).length + text.length) / 1.5) };
}

module.exports = { SYSTEM, buildAsk, buildContinue, extractJSON, chat, LLMError };
