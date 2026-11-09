'use strict';
/* 大模型接入(OpenAI 兼容格式,默认 DeepSeek)。只在主进程里运行,Key 不会进入渲染进程。
   v1.3:
   - DeepSeek 新模型默认开着"思考模式",思考内容会吃掉 max_tokens,导致正文为空/被截断 → 默认显式关闭(thinking: disabled)
   - 流式输出 + 增量解析:剧本里每个节点一到齐就能开演,不用等整段写完
   - 输出上限大幅放宽(默认 8000 token),剧本表达力从 13 种节点扩到 21 种 */

const Props = require('./renderer/props.js');
const SYSTEM = `你是桌面宠物 Clawd(橙色像素小生物,圆滚滚,爱吃饼干,呆萌)的导演兼编剧。只输出 1 个 JSON 对象,不要解释,不要代码块。
按用户请求选 kind:
1) {"kind":"chat","say":"≤40字的回答"} 闲聊/问答/随口一句
2) {"kind":"story","title":"≤10字","nodes":[...]} 互动小剧场,下面的节点自由组合(title 必须写在 nodes 之前)
3) {"kind":"skill","name":"动作名≤6字","nodes":[{"t":"anim",...}]} 学新动作,只含 1 个 anim

【节点】每个节点 {"id":短字符串,"t":类型,...};next 缺省=数组里的下一个。任意节点可加 "fx":特效名,"fxn":1~8 顺带放特效。
say{text≤90,ms?,pose?{姿态字段同 anim},act?动作名(边说边做)} 台词
act{name,max?秒} 动作:wave dance cheer spin flip stretch bow hiccup sneeze moonwalk sit read coffee cookie laptop hop love trip doze startle critter party ball pounce poke ouch notice
anim{dur≤20,keys:[{t:0~1,姿态}],hold?,loop?1~8} 自编动作(原地),关键帧之间自动平滑。姿态字段:lift(0~12 离地高度) dy sx sy(0.6~1.4挤压拉伸,sx 负数=镜像) rot(弧度,±6.28=转一圈;1.57 躺倒,3.14 倒立) size(0.3~3 整体变大变小) alpha(0~1 透明,0=隐身) ex ey(-1~1眼神) eye(open happy closed wide angry sad x heart dots ><) mouth(smile o big yawn frown flat cat munch) blush(0~1) tears dizzy armL armR([dx,dy,h],dy=-6 为举手) legs(stand walk run tuck air dangle) prop(book mug cookie flower balloon sign heart laptop) hat(santa party crown bow nightcap pumpkin redcap) glasses(shades)
move{to:left|right|center|cursor|item|up|down|window|ground|plat|point,item?,run?} 走过去。cursor=真的去追用户的鼠标(会跳上跳下,x 和 y 都会靠近);item=走到道具;up/down/window=跳到更高/更低/随机的别的窗口上;ground=回到地面;plat(key,at:left|right|center)=走到自己造的平台上(够不着会自动大跳);point(x,y 屏幕比例)
face{dir:left|right|cursor|item,key?} 转身(item=朝向某个道具,之后眼睛会一直看着它)
fx{kind:heart star note confetti dust zzz text question exclaim sweat anger sparkle snow rain fireworks bubbles,n:1~12,text?≤6}
item{art:道具名(内置库 / 自己 sprite 的 name / 常见英文名如 bicycle guitar) 或 emoji:单个emoji(会自动变成像素风),px?:8~32(emoji 的像素格数,默认16,细节多的写 20~24),recolor?:{原色字母:新颜色}(给内置道具换色,如蓝气球 {"R":"blue"}),at:left|right|center|near|far|cursor|random 或 x,y(0~1 屏幕比例,可悬在半空),scale?0.5~6(默认1),anim?bob|float|spin|swing|pulse|blink|drift,layer?back,flip?,solid?:true(顶上能站人:箱子 石头 桌子…),key?≤8字母} 放道具(同屏最多 10 个);同一个 key 再写一次 item 且不给位置 = 原地换样子(蛋→小鸡、花苞→花);{"t":"item","remove":true 或 key} 拿走
  内置像素道具库(优先用,不用自己画):${Props.names.join(' ')}
sprite{name≤8字母, 四种画法选一种(越靠前越稳越好看):
  ①emoji:"🐲",px? 用某个 emoji 当底图,自动像素化
  ②base:内置道具名,recolor:{字母:颜色} 内置道具换色
  ③shapes:[几何形状…],w,h(画布 4~32 格,默认 16),mirror?:true(只画左半边,自动左右对称) 用形状拼,程序自动栅格化并加明暗
     坐标从画布左上角(0,0)起,x 向右 y 向下,单位=像素格,后画的盖住先画的:{k:"rect",x,y,w,h,c} {k:"circle",x,y,r,c}(x,y 是圆心) {k:"ellipse",x,y,rx,ry,c} {k:"tri"或"poly",pts:[[x,y],…],c} {k:"line",x1,y1,x2,y2,t:粗细,c};c=颜色字母/#rrggbb/颜色名,c:"." 表示挖掉
     例(灯塔):{"t":"sprite","name":"tower","w":12,"h":20,"mirror":true,"shapes":[{"k":"tri","pts":[[2,5],[10,5],[6,0]],"c":"R"},{"k":"rect","x":3,"y":5,"w":6,"h":3,"c":"Y"},{"k":"rect","x":3,"y":8,"w":6,"h":11,"c":"W"},{"k":"rect","x":3,"y":11,"w":6,"h":2,"c":"R"},{"k":"rect","x":3,"y":16,"w":6,"h":2,"c":"R"},{"k":"rect","x":1,"y":19,"w":10,"h":1,"c":"S"}]}
  ④rows:[字符画…](每行≤32 字符,一个字符一个像素,.=透明),frames?:[rows,rows…](≤4 帧动画),fps? 最容易画歪,尽量别用
  通用可选:pal?:{字母:"#rrggbb"},shade?:false(关掉自动明暗),outline?:true(描深色边,在花哨的桌面上更显眼),anchor?:b|c
  默认调色板字母:R红 r暗红 O橙 o暗橙 Y黄 y暗黄 G绿 g暗绿 B蓝 b暗蓝 P紫 p暗紫 N棕 n暗棕 S灰 s暗灰 W白 w浅灰 K黑 C青 c浅青 M粉 L米 T褐;一出戏最多 12 个 sprite,放在用到它的 item 之前
use{key,how,to?,power?,dx?,at?} 和道具互动(推荐!它会自己走到合适的位置、朝向道具、摆好姿势,道具也会有反应,不用自己算坐标):
  how: pick捡起来(at 指定挂哪) kick踢飞(power 0~1) push推着走(dx 推几个身位,负数=往回拉) hit打一下(power 大会打飞) poke戳戳 hug抱抱 eat吃掉(道具会消失) open打开(宝箱/礼物/门/箱子会变成打开的样子) throw扔出去(to:[x,y] 或 目标道具 key 或 "cursor",砸中会有反应) sit坐上去 stand站上去 hide躲到后面 ride骑上去(小道具如扫帚滑板会垫到脚下跟着宠物走;大道具如船 龙 火车 摩天轮,宠物会爬到它上面,之后让这个道具 motion / 转动,宠物就跟着坐在上面一起动、一起绕圈,而且保持直立) look盯着看
  道具有物理:踢飞/扔出去会画抛物线、落地弹几下、滚一段、撞墙弹回、掉出平台边缘会掉下去
take{key?,at:head|hand|hands|back|front|under,dx?,dy?,rot?,line?,sink?,layer?} 把道具挂到身上(离得远会先走过去捡),会跟着姿态、翻滚一起动:hand=前手拿着 hands=双手举过头顶 head=顶在头上 back=背着 front=抱在身前 under=骑着/站在上面(扫帚 滑板 魔毯 云 船 火箭…;sink 0~1 身体陷进去多深,0=站在上面,0.5=骑着/坐在船里,1=只露出脑袋)。dx,dy=偏移(像素格,宠物约 14 格宽,dx 朝面向的方向,dy 负=往上),line:true=从手牵一根线过去(气球、风筝;dy 越负飞得越高)
put 放下(在空中放手道具会掉下去)
platform{key,x1,x2(0~1),y(0.15~0.9 屏幕高度比例),style:rope|plank|cloud|ledge|ice|beam} 在屏幕上凭空造一个能站的平台(钢丝/木板/云…,最多 6 个);{"t":"platform","remove":true 或 key} 拆掉(站在上面的会掉下来)
fly{to:top|bottom|ground|left|right|center|cursor|up|down(或 x,y),sec,style:float|dash|bounce,then:hover|fall|land} 飞到某处的简便写法(复杂轨迹用 motion)
jump{h:0~1(起跳高度占屏幕高度,1=顶到屏幕顶),dx:-1~1,to?:plat(key,at)|cursor|left|right,spin?:true 翻滚着飞出去还会弹几下} 真实物理的跳/被弹飞,落地才继续
motion{who?:"pet"或道具key,sec:0.3~20,path?:[[x,y],…],to?,rel?,orbit?,pace?,hop?,sway?,spin?,tilt?,grow?,keys?,trail?,face?,then?,async?} 万能运动:让宠物或任何道具沿路线动
  path=途经点(指宠物脚底;举起的手比脚高约 1.3 个身高,吊在绳上要往下让出这段),默认屏幕比例(0~1,y 越大越靠下);rel:true 时改为相对起点的偏移,单位=宠物身高([3,-2]=往右 3 个身位、往上 2 个)
  orbit{x,y 圆心(屏幕比例;或 dx,dy 相对),r 半径(身高),a:[依次经过的角度]} 0=圆心正下方 90=右 180=正上方 270=左:[-50,50,-40,40]=来回荡,[0,360]=转一整圈,[270,180,90]=从左边越过顶上到右边
  pace:smooth 慢起慢停|linear 匀速|in 越来越快(下落、冲刺)|out 越来越慢|each 每段都慢进慢出(荡、一跳一跳、一级一级爬)
  hop=每段路上弹起几个身高;sway{x,y,f}=叠加摇摆(幅度单位身高,f 每秒几次);spin=转几圈(负=反向);tilt 0~1=身体顺着运动方向倾斜;grow=结束时变成几倍大
  keys=途中的姿态关键帧(同 anim,t 0~1);trail=拖尾 dust smoke fire star sparkle heart note bubbles snow speed;face:auto|left|right|keep
  then:stay 停在原处(空中也行)|land 缓缓落到下面能站的地方|fall 带着惯性松手掉下去|back 回到起点。缺省:宠物下一个节点还是运动就 stay,否则 land;道具缺省 stay
  to=终点的简写:[x,y] 或 pet cursor top ground left right center up down away(飞出屏幕)或某个道具 key(飞到它那里)
  async:true=不等它做完就继续下一个节点,用来让好几样东西同时动
  宠物骑着/举着的道具被 motion → 宠物跟着一起动;宠物骑在大道具上时 motion 宠物 → 那个大道具载着它动
follow{who:道具key,to?:pet|cursor|道具key(默认 pet),gap?:隔几个身位(默认1.3),side?:behind|front|any,fly?:true(在空中跟),stop?:true(不跟了)} 让道具一直跟着走,直到 stop 或剧终:遛狗、小鸡跟着妈妈、被幽灵追、宠物带着跟班;牵绳就再加一根 shape line 从 "hand" 连到它
shape{key,kind:line|rect|circle|arc,from,to?,color?,w?,r?,sag?,alpha?,fill?,wave?,solid?,dash?,layer?,colors?} 画几何图形:绳子 钢索 滑梯 鱼线 水面 洞 彩虹 光束…(最多 12 个)
  from/to=[x,y] 屏幕比例,或绑定点 "pet"(身体中心) "hand"(前手) "handL" "hands" "head" "feet",或道具 key(可加 .top .bottom .left .right .tip);绑定的端点会一直跟着动
  line:从 from 到 to,w=粗细(像素格),sag=下垂(身高);rect:from 左上 to 右下,wave:true 顶边是波浪,solid:true 顶边能站;circle:from 圆心 r 半径(身高);arc:from 为圆心朝上的半圆拱,colors 多色条(彩虹)
  color:#rrggbb 或 red orange yellow green blue sky water purple pink brown wood rope gray white black grass snow;layer:front=画在宠物前面(水面盖住下半身);{"t":"shape","remove":true 或 key} 删掉
fall 立刻松手掉下来
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
- 道具要有画面感,按这个顺序找:①内置像素道具库 ②emoji(item 直接写 emoji,几乎什么都有:🚲🎸🦖🍕🚂🏰🌋🤖👻…,自动变成像素风)③sprite 用 shapes 拼 ④字符画。别用 emoji 当道具以外的装饰文字。想在空中放东西,用 item 的 x,y。
【怎么演出任何动作】没有现成的动作也要演出来:先想清楚画面,再拆成积木组合——
  ①场景:能站的地方(platform / shape solid)、线和面(shape)、道具(item)
  ②运动:谁、从哪到哪、走什么轨迹(motion path/orbit + pace hop sway spin tilt);真实物理用 jump / fall / then:"fall"
  ③身体:姿态和表情(motion.keys / anim / say.pose):蜷缩 legs:tuck、躺下 rot:1.57、倒立 rot:3.14、变大 size、隐身 alpha、举手 armL/armR
  ④关系:和道具怎么互动(use:捡 踢 推 打 吃 抱 开 扔 坐 躲 骑),挂在身上哪里(take at),绳子两端绑着谁(shape 端点),几样东西同时动(async)
  和道具打交道优先用 use,别用 move+anim+motion 自己拼(你不知道道具在屏幕上的精确位置,拼出来会对不上)
  道具不会自己动:要它动就写 motion(移动/转圈)、follow(一直跟着)、use(踢 扔 推)、或再写一次同 key 的 item 给新位置(它会走/飘过去)。光在台词里说"火箭起飞了"画面上是不会动的
  spin 和 anim:"spin" 会把整张图一起转,只适合本身就该整体转的东西(轮子 硬币 风车叶 星星 被踢飞的东西);有底座、分上下的东西(房子 树 摩天轮 动物)整体转会很怪,要表现"在转",就让骑在它上面的宠物 / 别的小道具绕着它 motion orbit
  拆法示例(只是演示思路,别照抄):荡秋千=shape line 从[0.5,0.08]到"hands" + motion orbit{x:0.5,y:0.08,r:7,a:[-45,45,-40,40,0]} then:"stay";骑扫帚=item broom + take at:"under" sink:0.5 + motion path 多个点 tilt:0.4 trail:"sparkle";滑滑梯=shape line w:3 斜放 + motion 沿着线 pace:"in" tilt:1 then:"fall";游泳=shape rect wave color:water layer:"front" alpha:0.7 + motion sway + keys 交替划手。
- 连续在空中做几件事(中间插台词)时,前一个 motion 写 then:"stay";做完记得 then:"land" 或 fall 回到地面。
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
