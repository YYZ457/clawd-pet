'use strict';
/* 内置互动剧场(完全离线、不需要 Key)。格式与大模型输出的剧本一致。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stories = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const S = {};

  S.cookie = {
    title: '寻找饼干', desc: '它的饼干不见了,你来指路',
    script: {
      kind: 'story', title: '寻找饼干', nodes: [
        { id: 'a', t: 'say', text: '我的饼干不见了…' },
        { id: 'b', t: 'anim', dur: 1.8, keys: [{ t: 0, eye: 'sad', mouth: 'frown' }, { t: 0.4, eye: 'open', ex: 1, ey: -1 }, { t: 0.8, eye: 'open', ex: -1, ey: 0 }, { t: 1, eye: 'sad', mouth: 'frown' }] },
        { id: 'c', t: 'ask', text: '你看到我的饼干了吗?', choices: [{ text: '在左边!', next: 'L1' }, { text: '在右边!', next: 'R1' }, { text: '被我吃啦😋', next: 'E1' }] },
        { id: 'L1', t: 'item', emoji: '🍪', at: 'left' },
        { id: 'L2', t: 'say', text: '真的?我去看看!', ms: 1400 },
        { id: 'L3', t: 'move', to: 'item', run: true, next: 'F1' },
        { id: 'R1', t: 'item', emoji: '🍪', at: 'right' },
        { id: 'R2', t: 'say', text: '右边?冲呀!', ms: 1400 },
        { id: 'R3', t: 'move', to: 'item', run: true, next: 'F1' },
        { id: 'E1', t: 'say', text: '啊?!你吃掉了?!', ms: 1600 },
        { id: 'E2', t: 'anim', dur: 1.6, keys: [{ t: 0, eye: 'wide', mouth: 'o', lift: 3 }, { t: 0.5, eye: 'angry', mouth: 'frown', sx: 1.1, sy: 0.9 }, { t: 1, eye: 'sad', mouth: 'frown', tears: true }] },
        { id: 'E3', t: 'wait_for', what: 'pet', sec: 10, next: 'E4', timeout: 'E5' },
        { id: 'E4', t: 'say', text: '…算了,原谅你了。', next: 'Z' },
        { id: 'E5', t: 'say', text: '哼,我再也不理你了!(才怪)', next: 'Z' },
        { id: 'F1', t: 'item', remove: true },
        { id: 'F2', t: 'act', name: 'cookie', max: 5 },
        { id: 'F3', t: 'fx', kind: 'heart', n: 5 },
        { id: 'F4', t: 'say', text: '谢谢你!分你一半~' },
        { id: 'F5', t: 'wait_for', what: 'pet', sec: 10, next: 'F6', timeout: 'F7' },
        { id: 'F6', t: 'say', text: '嘿嘿~被你摸,最幸福了', next: 'Z' },
        { id: 'F7', t: 'say', text: '(偷偷把另一半也吃了)', next: 'Z' },
        { id: 'Z', t: 'end', text: '《寻找饼干》完~' }
      ]
    }
  };

  S.hide = {
    title: '躲猫猫', desc: '你用鼠标藏起来,它来找你',
    script: {
      kind: 'story', title: '躲猫猫', nodes: [
        { id: 'a', t: 'say', text: '来玩躲猫猫吧!' },
        { id: 'b', t: 'ask', text: '你要躲起来吗?', choices: [{ text: '好呀!', next: 'c' }, { text: '不要~', next: 'no' }] },
        { id: 'c', t: 'say', text: '我闭眼数三下,你把鼠标藏远点~', ms: 2200 },
        { id: 'c2', t: 'anim', dur: 0.9, hold: true, keys: [{ t: 0, eye: 'closed', armL: [-2, -3, 3], armR: [-2, -3, 3] }] },
        { id: 'c3', t: 'fx', kind: 'text', n: 1, text: '1' },
        { id: 'c4', t: 'wait', sec: 1 },
        { id: 'c5', t: 'fx', kind: 'text', n: 1, text: '2' },
        { id: 'c6', t: 'wait', sec: 1 },
        { id: 'c7', t: 'fx', kind: 'text', n: 1, text: '3' },
        { id: 'c8', t: 'wait', sec: 1 },
        { id: 'c9', t: 'say', text: '我来找你啦!', ms: 1400 },
        { id: 'd1', t: 'move', to: 'cursor', run: true },
        { id: 'd2', t: 'anim', dur: 1.2, keys: [{ t: 0, eye: 'wide', mouth: 'big', lift: 4, armL: [1, -6, 3], armR: [1, -6, 3] }, { t: 1, eye: 'happy', mouth: 'big', blush: 1 }] },
        { id: 'd3', t: 'fx', kind: 'confetti', n: 8 },
        { id: 'd4', t: 'say', text: '抓到你啦!', ms: 1600 },
        { id: 'd5', t: 'ask', text: '再玩一次吗?', choices: [{ text: '再来!', next: 'c' }, { text: '不玩了', next: 'bye' }] },
        { id: 'bye', t: 'say', text: '好吧~下次再玩!', next: 'Z' },
        { id: 'no', t: 'say', text: '那我自己躲…', next: 'no2' },
        { id: 'no2', t: 'anim', dur: 1.5, keys: [{ t: 0, eye: 'closed' }, { t: 1, eye: 'closed', sy: 0.7, blush: 0.8 }] },
        { id: 'no3', t: 'wait_for', what: 'click', sec: 12, next: 'no4', timeout: 'no5' },
        { id: 'no4', t: 'say', text: '被你发现啦!', next: 'Z' },
        { id: 'no5', t: 'say', text: '…你找不到我吧?(嘿嘿)', next: 'Z' },
        { id: 'Z', t: 'end', text: '《躲猫猫》完~' }
      ]
    }
  };

  S.lullaby = {
    title: '晚安小剧场', desc: '陪你放松一小会儿',
    script: {
      kind: 'story', title: '晚安小剧场', nodes: [
        { id: 'a', t: 'say', text: '辛苦啦,今天累不累?' },
        { id: 'b', t: 'ask', text: '你今天累吗?', choices: [{ text: '有点累', next: 'c' }, { text: '还好', next: 'e' }] },
        { id: 'c', t: 'say', text: '那我给你唱摇篮曲~' },
        { id: 'c2', t: 'anim', dur: 4, keys: [{ t: 0, eye: 'closed', hat: 'nightcap', rot: -0.1, mouth: 'smile' }, { t: 0.5, eye: 'closed', hat: 'nightcap', rot: 0.1, mouth: 'o' }, { t: 1, eye: 'closed', hat: 'nightcap', rot: -0.1, mouth: 'smile' }] },
        { id: 'c3', t: 'fx', kind: 'note', n: 6 },
        { id: 'c4', t: 'say', text: '♪ 睡吧睡吧~' },
        { id: 'c5', t: 'wait', sec: 2 },
        { id: 'c6', t: 'say', text: '晚安,明天也要开心~', next: 'Z' },
        { id: 'e', t: 'say', text: '那我再陪你一会儿!' },
        { id: 'e2', t: 'act', name: 'dance', max: 4 },
        { id: 'e3', t: 'say', text: '要不要摸摸我再走?' },
        { id: 'e4', t: 'wait_for', what: 'pet', sec: 10, next: 'e5', timeout: 'Z' },
        { id: 'e5', t: 'say', text: '好舒服~谢谢你', next: 'Z' },
        { id: 'Z', t: 'end', text: '《晚安小剧场》完~' }
      ]
    }
  };

  const list = Object.keys(S).map(id => ({ id, title: S[id].title, desc: S[id].desc }));
  return { list, get: id => (S[id] ? JSON.parse(JSON.stringify(S[id].script)) : null) };
});
