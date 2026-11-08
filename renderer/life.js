'use strict';
/* Clawd 的"生命":性格、情绪、记忆、台词、节日。全部离线、全部本地。 */
const Life = (() => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const chance = p => Math.random() < p;
  const DAY = 86400000;
  const dayNum = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

  let mem = null, saver = null, saveT = 0, started = 0, nextMutter = 45, sessionT = 0;
  const mood = { joy: 0.6, energy: 0.9, affection: 0.25, boredom: 0.2, lonely: 0 };
  const visit = { kind: 'first', gap: 0, n: 1 };
  let traits = [];
  const TRAITS = ['playful', 'sleepy', 'curious', 'clingy'];
  const TRAIT_ZH = { playful: '爱玩', sleepy: '嗜睡', curious: '好奇', clingy: '黏人' };

  // ------------------------------------------------------------ 台词库
  const L = {
    poke_stranger: ['诶?', '有事吗?', '你好呀…', '(小声)你好', '请问有什么事~', '呃…嗨?'],
    poke_friend: ['嗯?', '在呢~', '怎么啦', '戳我干嘛~', '嘿嘿', '咋啦?', '我在我在', '被发现了~'],
    poke_buddy: ['最喜欢你戳我了~', '又想我啦?', '嘿嘿~被你发现了', '来啦来啦!', '想吃饼干吗?分你一半', '你一戳我就开心', '我就知道你会来找我'],
    pet_stranger: ['…好像还挺舒服', '有点害羞…', '嗯…可以再摸一下', '(僵硬但开心)'],
    pet_friend: ['嘿嘿~', '好舒服~', '呼噜呼噜', '再摸摸', '左边一点点', '(眯眼)'],
    pet_buddy: ['最喜欢被你摸了~', '(蹭蹭)', '今天也辛苦啦~', '你的手是暖的', '摸摸就不累了对不对', '嗯嗯嗯~(幸福)'],
    throw: ['呜哇——', '我会飞啦!', '你好坏…', '飞——~', '救命~', '唔啊啊啊'],
    throw_many: ['又来?!你是不是上瘾了', '我已经习惯被扔了…', '下次提前说一声嘛', '我是飞行员 Clawd!', '扔我之前先问问我同不同意!'],
    bored: ['好无聊呀…', '谁来陪我玩~', '(戳戳自己)', '要不…跳个舞?', '我在想今晚吃什么饼干', '数一数窗口有几个…', '无聊到想打滚'],
    sleepy: ['有点困…', '哈啊~', '眼睛睁不开啦', '想睡觉…', '(打哈欠)', '电量 15%…'],
    happy: ['今天心情真好~', '♪ ~', '想到好玩的事了', '我是不是又变可爱了?', '嘿嘿嘿', '开心!'],
    lonely: ['你在吗…', '有点想你…', '(望着鼠标的方向)', '你去哪里啦~', '我在这里等你哦', '还没回来吗…'],
    curious: ['那是什么?', '窗口好多呀', '我能去那边看看吗', '咦?', '好奇+1', '这个世界真大'],
    typing: ['你在认真工作呢,我不吵你~', '噼里啪啦~好厉害', '我也来陪你敲两下', '加油哦!', '我小声一点', '工作辛苦啦', '偷偷给你打气'],
    back: ['你回来啦!', '欢迎回来~', '你终于回来啦~', '想你了!', '嘿!你回来了!'],
    back_long: ['你去了好久…我都睡了一觉了', '欢迎回来!我一直在这里哦', '等你好久了,饼干都放凉了…', '终于等到你!'],
    night: ['这么晚了…早点睡吧', '熬夜不好哦', '我陪你,但你要早点睡', '夜深了,眼睛要休息', '该睡觉啦~'],
    morning: ['早上好~', '早安!今天也要加油', '新的一天开始啦', '早!我已经起床啦'],
    noon: ['中午啦,吃饭了吗?', '该吃午饭了~', '饿了…'],
    evening: ['晚上好~', '今天辛苦啦', '吃晚饭了吗?'],
    winopen: ['咦?新窗口!', '哇有新东西', '那是什么?', '来客人啦?'],
    winclose: ['拜拜~', '走啦?', '(挥手)'],
    surf: ['哇哇哇!地震啦!', '别晃我~', '冲浪!!', '我要掉下去啦', '稳住稳住稳住'],
    trip: ['哎呦!', '没人看见吧…', '我是故意的!', '地面攻击了我', '这里有个坑(没有)'],
    app_editor: ['在写代码呀,加油!', '让我看看你写的…(看不懂)', '写完记得保存哦~', 'bug 都给我退散!'],
    app_terminal: ['黑色的窗口!我也要敲~', '噼里啪啦~', '是在跑命令吗?'],
    app_music: ['有音乐!', '♪ 我想跳舞', '这首我会!(其实不会)'],
    app_video: ['看视频?我陪你看~', '我要坐前排', '有爆米花吗'],
    app_chat: ['有消息吗?', '在聊天呀~', '(假装没看见)'],
    app_office: ['好好工作!', '文档、表格…头大', '我给你加油~'],
    app_claude: ['是 Claude!是我的亲戚!', '那是…我的老乡?', 'Claude 在忙吗?我也想帮忙~']
  };

  const recent = {};
  function line(cat, vars) {
    const pool = L[cat]; if (!pool || !pool.length) return '';
    const rec = recent[cat] || (recent[cat] = []);
    let s = pool[0];
    for (let i = 0; i < 8; i++) { s = pick(pool); if (!rec.includes(s)) break; }
    rec.push(s); if (rec.length > Math.min(4, pool.length - 1)) rec.shift();
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k]) : s;
  }

  // ------------------------------------------------------------ 初始化 / 记忆
  function save() { if (saver && mem) try { saver(mem); } catch (_) {} }

  function init(stored, saveFn) {
    saver = saveFn;
    const now = new Date(), today = dayNum(now);
    mem = Object.assign({
      v: 1, first: now.getTime(), lastDay: 0, active: 0, streak: 0, minutes: 0,
      pets: 0, pokes: 0, throws: 0, dizzy: 0, tickles: 0, ouches: 0, cookies: 0, naps: 0, sessions: 0,
      traits: null, joy: 0.6, aff: 0.25, done: {}
    }, stored || {});
    if (!mem.lastDay) { visit.kind = 'first'; mem.streak = 1; mem.active = 1; }
    else if (mem.lastDay === today) visit.kind = 'same';
    else {
      const gap = today - mem.lastDay; visit.gap = gap; mem.active++;
      if (gap === 1) { visit.kind = 'next'; mem.streak++; } else { visit.kind = 'gap'; mem.streak = 1; }
    }
    mem.lastDay = today; mem.sessions++;
    if (!mem.traits || !mem.traits.length) mem.traits = TRAITS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    traits = mem.traits;
    visit.n = Math.floor((now.getTime() - mem.first) / DAY) + 1;
    mood.joy = clamp(mem.joy, 0.3, 0.9);
    mood.affection = clamp(Math.max(mem.aff, Math.min(0.6, mem.active * 0.012)) - (visit.gap > 3 ? 0.02 * visit.gap : 0), 0.08, 1);
    mood.energy = 0.9;
    started = performance.now();
    save();
  }

  const stage = () => (mem.active < 3 && mem.pets < 12) ? 'stranger' : (mem.active >= 14 || mem.pets >= 120) ? 'buddy' : 'friend';

  // ------------------------------------------------------------ 节日
  const LUNAR_NEWYEAR = ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'];
  const MIDAUTUMN = ['2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12'];
  const nearDate = (list, d, before, after) => list.some(s => { const t = dayNum(new Date(s + 'T00:00:00')); const n = dayNum(d); return n >= t - before && n <= t + after; });
  function today() {
    const d = new Date(), m = d.getMonth() + 1, da = d.getDate();
    const born = new Date(mem.first);
    if (visit.n > 300 && born.getMonth() === d.getMonth() && born.getDate() === da && visit.n >= 360) return { hat: 'party', name: 'anniv', greet: `今天是我们认识一周年!谢谢你一直陪着我 ❤` };
    if (nearDate(LUNAR_NEWYEAR, d, 1, 6)) return { hat: 'redcap', name: 'cny', greet: '新年快乐!恭喜发财~ 🧧' };
    if (nearDate(MIDAUTUMN, d, 0, 0)) return { hat: null, name: 'mid', greet: '中秋快乐~ 今天有月饼吗?🥮', meal: true };
    if (m === 1 && da === 1) return { hat: 'party', name: 'ny', greet: '新年快乐!' };
    if (m === 2 && da === 14) return { hat: 'bow', name: 'val', greet: '情人节快乐 ❤' };
    if (m === 6 && da === 1) return { hat: 'party', name: 'kid', greet: '儿童节快乐!我也是宝宝~' };
    if (m === 10 && da <= 7) return { hat: 'party', name: 'nat', greet: '国庆快乐!' };
    if (m === 10 && da >= 28) return { hat: 'pumpkin', name: 'hall', greet: '不给糖就捣蛋!🎃' };
    if (m === 12 && da >= 20 && da <= 26) return { hat: 'santa', name: 'xmas', greet: '圣诞快乐!🎄' };
    return null;
  }

  // ------------------------------------------------------------ 解锁的小饰品
  function cosmetics() {
    const c = [];
    if (mem.pets >= 50) c.push({ hat: 'bow' });
    if (mem.pokes >= 300) c.push({ glasses: 'shades' });
    if (mem.active >= 100) c.push({ hat: 'crown' });
    return c;
  }

  // ------------------------------------------------------------ 启动问候
  function greeting() {
    const h = new Date().getHours(), fest = today();
    const tod = h < 5 ? 'night' : h < 11 ? 'morning' : h < 14 ? 'noon' : h < 18 ? null : h < 23 ? 'evening' : 'night';
    if (visit.kind === 'first') return '初次见面!我是 Clawd,请多关照~';
    if (fest && fest.greet && chance(0.8)) return fest.greet;
    if (visit.kind === 'gap') return visit.gap >= 7 ? `好久不见…你有 ${visit.gap} 天没来了,我都想你了` : `你终于来啦~已经 ${visit.gap} 天没见了`;
    if (visit.kind === 'next' && mem.streak >= 3) return `连续第 ${mem.streak} 天见面啦!`;
    if (visit.kind === 'next') return h < 11 ? '早呀!昨天睡得好吗?' : '又见面啦~';
    if (tod && chance(0.7)) return line(tod);
    return pick(['你又回来啦~', '嗨!我在这儿~', '你好呀~', '我一直在等你~']);
  }

  // ------------------------------------------------------------ 事件 -> 记忆 / 情绪
  function bump(ev, arg) {
    if (!mem) return;
    const m = mood;
    switch (ev) {
      case 'pet': mem.pets++; m.joy = clamp(m.joy + 0.05, 0, 1); m.affection = clamp(m.affection + 0.012, 0, 1); m.boredom = clamp(m.boredom - 0.25, 0, 1); m.lonely = 0; break;
      case 'poke': mem.pokes++; m.boredom = clamp(m.boredom - 0.15, 0, 1); m.lonely = 0; m.affection = clamp(m.affection + 0.002, 0, 1); break;
      case 'tickle': mem.tickles++; m.joy = clamp(m.joy + 0.04, 0, 1); m.boredom = clamp(m.boredom - 0.2, 0, 1); break;
      case 'ouch': mem.ouches++; m.joy = clamp(m.joy - 0.15, 0, 1); m.affection = clamp(m.affection - 0.01, 0, 1); break;
      case 'throw': mem.throws++; m.joy = clamp(m.joy - 0.05, 0, 1); m.boredom = clamp(m.boredom - 0.3, 0, 1); break;
      case 'dizzy': mem.dizzy++; m.boredom = clamp(m.boredom - 0.2, 0, 1); break;
      case 'cookie': mem.cookies++; m.joy = clamp(m.joy + 0.1, 0, 1); break;
      case 'nap': mem.naps++; break;
      case 'play': m.boredom = clamp(m.boredom - 0.35, 0, 1); m.joy = clamp(m.joy + 0.05, 0, 1); break;
      case 'story': mem.stories = (mem.stories || 0) + 1; mem.lastStory = String(arg || '').slice(0, 16); m.boredom = clamp(m.boredom - 0.4, 0, 1); m.joy = clamp(m.joy + 0.08, 0, 1); break;
      case 'return': m.lonely = 0; m.joy = clamp(m.joy + 0.1, 0, 1); break;
    }
  }

  // ------------------------------------------------------------ 行为偏好
  function weights(list, env) {
    const m = mood, w = new Map(list);
    const mul = (n, x) => { if (w.has(n)) w.set(n, w.get(n) * x); };
    const add = (n, x) => w.set(n, (w.get(n) || 0) + x);
    if (m.energy < 0.3) { mul('sleep', 6); mul('sit', 2); mul('dance', 0.4); mul('run', 0.3); mul('flip', 0.4); add('doze', 6); }
    else if (m.energy < 0.55) add('doze', 2);
    if (m.boredom > 0.6) { mul('ball', 2.5); mul('dance', 2); mul('flip', 2); mul('jump', 1.6); mul('run', 2); mul('moonwalk', 2); add('critter', 5); }
    else add('critter', 1.4);
    if (m.joy > 0.8) { mul('dance', 1.5); mul('cheer', 1.4); }
    if (m.joy < 0.35) { mul('dance', 0.4); mul('cheer', 0.3); mul('sit', 1.8); }
    if (traits.includes('playful')) { mul('dance', 1.6); mul('ball', 1.6); mul('flip', 1.5); mul('cheer', 1.5); }
    if (traits.includes('sleepy')) { mul('sleep', 2.5); mul('sit', 1.6); mul('coffee', 1.5); add('doze', 2); }
    if (traits.includes('curious')) { mul('read', 1.8); mul('jump', 1.4); add('critter', 2.5); mul('laptop', 1.5); }
    if (traits.includes('clingy')) { mul('wave', 1.8); mul('bow', 1.5); }
    if (env.typing) {
      mul('laptop', 4); mul('read', 2.5); mul('coffee', 2.5); mul('sit', 2);
      for (const n of ['dance', 'flip', 'cheer', 'ball', 'run', 'moonwalk', 'spin']) mul(n, 0.2);
      mul('sneeze', 0.3); mul('hiccup', 0.3);
    }
    return [...w.entries()];
  }
  const followChance = () => 0.14 * (0.5 + mood.affection * 1.3) * (traits.includes('clingy') ? 1.5 : 1);

  // ------------------------------------------------------------ 应用感知(只看进程名,全部本地)
  const APPS = {
    editor: ['code', 'cursor', 'devenv', 'idea64', 'pycharm64', 'webstorm64', 'clion64', 'goland64', 'sublime_text', 'notepad++', 'notepad', 'zed', 'windsurf', 'trae', 'androidstudio64'],
    terminal: ['windowsterminal', 'wt', 'cmd', 'powershell', 'pwsh', 'conhost', 'mintty', 'alacritty', 'wezterm', 'termius'],
    music: ['spotify', 'cloudmusic', 'qqmusic', 'kugou', 'kuwo', 'foobar2000', 'itunes', 'musicbee', 'aimp', 'applemusic'],
    video: ['vlc', 'potplayermini64', 'potplayer', 'mpv', 'mpc-hc64', 'wmplayer', 'kmplayer', 'bilibili', 'iqiyi', 'youku', 'tencentvideo'],
    chat: ['wechat', 'weixin', 'qq', 'tim', 'telegram', 'discord', 'slack', 'dingtalk', 'feishu', 'lark', 'whatsapp', 'teams'],
    office: ['winword', 'excel', 'powerpnt', 'wps', 'et', 'wpp', 'onenote', 'acrobat', 'sumatrapdf', 'foxitreader', 'outlook'],
    claude: ['claude']
  };
  let lastCat = '', appCool = 0;
  function appReact(name) {
    name = String(name || '').toLowerCase();
    let cat = '';
    for (const k in APPS) if (APPS[k].includes(name)) { cat = k; break; }
    if (!cat && name.includes('claude')) cat = 'claude';
    if (!cat || cat === lastCat) { if (cat) lastCat = cat; return null; }
    lastCat = cat;
    if (appCool > 0 && cat !== 'claude') return null;
    if (cat !== 'claude' && !chance(0.45)) return null;
    appCool = cat === 'claude' ? 120 : 200;
    const modes = { editor: 'cheer', terminal: 'laptop', music: 'dance', video: 'sit', chat: 'poke', office: 'read', claude: 'cheer' };
    return { text: line('app_' + cat), mode: modes[cat], cat };
  }

  // ------------------------------------------------------------ 每帧(低频)推进
  let milestoneT = 0;
  const MILES = [
    ['pets10', m => m.pets >= 10, '摸了我 10 次啦…我有点喜欢你了'],
    ['pets50', m => m.pets >= 50, '摸了 50 次!送你一个蝴蝶结…我戴上了 🎀'],
    ['pets100', m => m.pets >= 100, '100 次摸摸!你是我最好的朋友'],
    ['pets500', m => m.pets >= 500, '500 次摸摸…你是不是特别爱我?(我也是)'],
    ['days3', m => m.active >= 3, '今天是我们见面的第 3 天~'],
    ['days7', m => m.active >= 7, '我们已经认识一周啦!'],
    ['days30', m => m.active >= 30, '一个月了!谢谢你一直带着我 ❤'],
    ['days100', m => m.active >= 100, '100 天!我给自己戴上了皇冠 👑'],
    ['pokes100', m => m.pokes >= 100, '你已经戳我 100 次了,我有点晕…'],
    ['pokes300', m => m.pokes >= 300, '戳了 300 次!我解锁了一副墨镜 😎'],
    ['throws10', m => m.throws >= 10, '你已经扔了我 10 次…是不是很好玩?'],
    ['hours10', m => m.minutes >= 600, '我们一起待了 10 个小时啦!'],
    ['hours50', m => m.minutes >= 3000, '50 小时!我们是老搭档了~']
  ];

  function tick(dt, env) {
    if (!mem) return null;
    const m = mood;
    sessionT += dt; mem.minutes += dt / 60; appCool = Math.max(0, appCool - dt);
    m.boredom = clamp(m.boredom + dt * 0.0035, 0, 1);
    if (env.mode === 'sleep') m.energy = clamp(m.energy + dt * 0.012, 0, 1);
    else m.energy = clamp(m.energy - dt * (env.typing ? 0.0002 : 0.00035), 0, 1);
    m.joy += (0.6 - m.joy) * dt * 0.004;
    m.lonely = env.userIdle > 600 ? clamp(m.lonely + dt * 0.0015, 0, 1) : clamp(m.lonely - dt * 0.01, 0, 1);
    mem.joy = m.joy; mem.aff = m.affection;
    saveT += dt; if (saveT > 30) { saveT = 0; save(); }

    milestoneT += dt;
    if (milestoneT > 6 && sessionT > 25 && env.calm) {
      milestoneT = 0;
      for (const [key, test, text] of MILES) if (!mem.done[key] && test(mem)) { mem.done[key] = 1; save(); return { text, kind: 'milestone', mode: 'cheer' }; }
    }
    nextMutter -= dt;
    if (nextMutter <= 0 && env.calm) {
      nextMutter = rnd(70, 170);
      const h = new Date().getHours();
      if (env.typing) return chance(0.35) ? { text: line('typing'), kind: 'mutter' } : null;
      let cat;
      if (m.lonely > 0.6) cat = 'lonely';
      else if (h >= 23 || h < 5) cat = chance(0.6) ? 'night' : 'sleepy';
      else if (m.energy < 0.3) cat = 'sleepy';
      else if (m.boredom > 0.65) cat = 'bored';
      else if (m.joy > 0.75) cat = 'happy';
      else cat = pick(['curious', 'happy', 'curious', 'bored']);
      return { text: line(cat), kind: 'mutter' };
    }
    return null;
  }

  function summary() {
    if (!mem) return '';
    const h = new Date().getHours(), tod = h < 5 ? '深夜' : h < 11 ? '早上' : h < 14 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜', m = mood;
    const feel = m.joy > 0.75 ? '很开心' : m.joy < 0.4 ? '有点低落' : '平静';
    const body = m.energy < 0.3 ? '很困' : m.boredom > 0.6 ? '有点无聊' : m.lonely > 0.6 ? '有点想你' : '精神不错';
    return `性格:${traits.map(t => TRAIT_ZH[t]).join('+')}|认识第${visit.n}天,被摸${mem.pets}次|心情${feel},${body}|现在${tod}${h}点` + (mem.lastStory ? `|上次演过《${mem.lastStory}》` : '');
  }

  return {
    init, save, bump, summary, tick, line, greeting, today, cosmetics, weights, followChance, appReact, stage, visit,
    mood, get mem() { return mem; }, get traits() { return traits; }, TRAIT_ZH
  };
})();
if (typeof module !== 'undefined') module.exports = Life;
