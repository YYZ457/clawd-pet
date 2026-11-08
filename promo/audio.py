"""原创配乐 + 音效,全部用 numpy 合成。读取 out/meta.json 里的事件表,和画面严格同步。"""
import json, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
meta = json.load(open(sys.argv[1]))
TOTAL = meta['total'] + 0.4
N = int(TOTAL * SR)
rng = np.random.default_rng(7)
mus = np.zeros(N); sfx = np.zeros(N)

def mid2f(m): return 440.0 * 2 ** ((m - 69) / 12)
def add(buf, t, x, gain=1.0):
    i = int(t * SR)
    if i >= N or i < 0: return
    x = x[: N - i]; buf[i:i + len(x)] += x * gain
def env(n, a=0.004, d=0.3, curve=4.0):
    t = np.arange(n) / SR; e = np.exp(-t / d * curve * 0.25); a_n = max(1, int(a * SR)); e[:a_n] *= np.linspace(0, 1, a_n); return e
def bell(f, dur=0.7, d=0.35):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / .12) + .15 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / .08)
    return y * env(n, .003, d)
def pluck(f, dur=0.35, d=0.12):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / .06) + .2 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / .03)
    return y * env(n, .002, d)
def tri(f, dur=0.45, d=0.2):
    n = int(dur * SR); t = np.arange(n) / SR
    y = 2 * np.abs(2 * ((f * t) % 1) - 1) - 1
    return y * env(n, .004, d)
def kick():
    n = int(.22 * SR); t = np.arange(n) / SR; f = 50 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
def shaker():
    n = int(.06 * SR); x = rng.standard_normal(n); sos = butter(2, 6000, 'hp', fs=SR, output='sos'); x = sosfilt(sos, x)
    return x * np.exp(-np.arange(n) / SR * 70)
def clap():
    n = int(.12 * SR); x = rng.standard_normal(n); sos = butter(2, [1200, 5000], 'bp', fs=SR, output='sos'); x = sosfilt(sos, x)
    return x * np.exp(-np.arange(n) / SR * 34)

# ---------------- 音乐 ----------------
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT; E8 = BEAT / 2
CH = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [53, 57, 60]), (43, [55, 59, 62])]  # C Am F G
A = [[(0, 76), (2, 79), (4, 76), (5, 79), (6, 84)], [(0, 81), (2, 79), (3, 76), (5, 74), (6, 76)], [(0, 77), (2, 81), (4, 84), (5, 81), (6, 77)], [(0, 79), (2, 83), (3, 86), (5, 83), (6, 79)]]
Bm = [[(0, 84), (2, 83), (3, 84), (4, 88), (6, 86), (7, 84)], [(0, 81), (2, 84), (4, 88), (6, 86)], [(0, 84), (1, 81), (2, 77), (3, 81), (4, 84)], [(0, 86), (2, 83), (3, 79), (4, 83), (5, 86), (6, 91)]]
nbars = int(TOTAL / BAR) + 1
for b in range(nbars):
    t0 = b * BAR; ci = b % 4; root, ch = CH[ci]
    sec = 0 if b < 2 else 1 if b < 6 else 2
    # 琶音(一直有)
    arp = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[1]]
    for k in range(8):
        add(mus, t0 + k * E8, pluck(mid2f(arp[k]), .3, .1), .22 if b >= 1 else .15)
    if b >= 2:
        add(mus, t0, tri(mid2f(root), .5, .25), .5); add(mus, t0 + 2 * BEAT, tri(mid2f(root), .5, .25), .42); add(mus, t0 + 3.5 * BEAT, tri(mid2f(root + 7), .25, .12), .22)
        add(mus, t0, kick(), .5); add(mus, t0 + 2 * BEAT, kick(), .42)
    if b >= 3:
        for k in range(8): add(mus, t0 + k * E8, shaker(), .13 if k % 2 else .08)
    if b >= 5:
        add(mus, t0 + BEAT, clap(), .2); add(mus, t0 + 3 * BEAT, clap(), .2)
    mel = None
    if b >= 2: mel = (A if b < 6 else Bm if b < 10 else A if b < 14 else Bm)[ci]
    if b >= 14 and b % 4 == 0: pass
    if mel:
        for (p, m) in mel: add(mus, t0 + p * E8, bell(mid2f(m), .8, .4), .30)
# 结尾:最后一小节收在 C 和弦
end_t = (meta['scn'][-1]['t0'] + 0.9)
mus[int(end_t * SR):] *= np.linspace(1, 0.0, N - int(end_t * SR)) ** 1.5
for m in (72, 76, 79, 84): add(mus, end_t + .2 + (m - 72) * .0, bell(mid2f(m), 1.8, .9), .22)
add(mus, end_t + .2, tri(mid2f(48), 1.2, .6), .35)
# 彩蛋前压低(制造悬念)
egg = [s for s in meta['scn'] if s['id'] == 'egg'][0]
i0, i1 = int(egg['t0'] * SR), int((egg['t0'] + .8) * SR)
mus[i0:i1] *= np.linspace(.35, .25, i1 - i0)
# 淡入
fi = int(.4 * SR); mus[:fi] *= np.linspace(0, 1, fi)

# ---------------- 音效 ----------------
def sweep(f0, f1, dur, shape='sin', decay=14):
    n = int(dur * SR); t = np.arange(n) / SR; f = np.linspace(f0, f1, n); ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph); return y * np.exp(-t * decay / (dur * 4)) * np.minimum(1, t / .005)
def whoosh(dur=.24):
    n = int(dur * SR); x = rng.standard_normal(n); out = np.zeros(n); segs = 6
    for i in range(segs):
        a, b = i * n // segs, (i + 1) * n // segs; fc = 500 + 2600 * np.sin(np.pi * (i + .5) / segs)
        sos = butter(2, [fc * .6, fc * 1.4], 'bp', fs=SR, output='sos'); out[a:b] = sosfilt(sos, x[a:b])
    t = np.arange(n) / SR; return out * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6 * 1.6
def fx(name):
    if name == 'pop': return sweep(380, 980, .09, decay=20) * .9
    if name == 'boing':
        n = int(.2 * SR); t = np.arange(n) / SR; f = 260 + 520 * np.sin(np.pi * np.clip(t / .2, 0, 1)) ** .8; ph = 2 * np.pi * np.cumsum(f) / SR
        return (np.sin(ph) + .3 * np.sin(2 * ph)) * np.exp(-t * 7) * .55
    if name == 'land':
        n = int(.12 * SR); t = np.arange(n) / SR; return (np.sin(2 * np.pi * np.cumsum(150 * np.exp(-t * 18) + 55) / SR) * np.exp(-t * 28)) * .9
    if name == 'thud':
        n = int(.09 * SR); x = rng.standard_normal(n); sos = butter(2, 500, 'lp', fs=SR, output='sos'); return sosfilt(sos, x) * np.exp(-np.arange(n) / SR * 40) * 2.2
    if name == 'click':
        n = int(.05 * SR); t = np.arange(n) / SR; return (np.sin(2 * np.pi * 1500 * t) * np.exp(-t * 90) + .5 * rng.standard_normal(n) * np.exp(-t * 200)) * .8
    if name == 'tick':
        n = int(.03 * SR); t = np.arange(n) / SR; return np.sign(np.sin(2 * np.pi * 1700 * t)) * np.exp(-t * 110) * .22
    if name == 'whoosh': return whoosh()
    if name == 'sparkle':
        y = np.zeros(int(.6 * SR))
        for i, m in enumerate((88, 91, 95, 100)): b = bell(mid2f(m), .35, .18); y[int(i * .045 * SR): int(i * .045 * SR) + len(b)] += b[:len(y) - int(i * .045 * SR)] * .55
        return y
    if name == 'hello':
        y = np.zeros(int(.7 * SR))
        for i, m in enumerate((79, 84)): b = bell(mid2f(m), .45, .25); y[int(i * .11 * SR): int(i * .11 * SR) + len(b)] += b[:len(y) - int(i * .11 * SR)] * .7
        return y
    if name == 'heart':
        y = np.zeros(int(.5 * SR))
        for i, m in enumerate((88, 93)): b = bell(mid2f(m), .3, .2); y[int(i * .07 * SR): int(i * .07 * SR) + len(b)] += b[:len(y) - int(i * .07 * SR)] * .5
        return y
    if name == 'flash':
        r = sweep(250, 2600, .3, decay=6) * .7; y = np.zeros(int(1.0 * SR)); y[:len(r)] += r
        for i, m in enumerate((84, 88, 91, 96)): b = bell(mid2f(m), .7, .4); j = int((.1 + i * .06) * SR); y[j:j + len(b)] += b[:len(y) - j] * .5
        return y
    return np.zeros(10)
GAIN = {'pop': .8, 'boing': .7, 'land': .8, 'thud': .8, 'click': .8, 'tick': .6, 'whoosh': .55, 'sparkle': .5, 'hello': .6, 'heart': .5, 'flash': .8}
cache = {}
for e in meta['audio']:
    n = e['name']
    if n not in cache: cache[n] = fx(n)
    add(sfx, e['t'], cache[n], GAIN.get(n, .6))
mix = mus * .55 + sfx * .75
mix = np.tanh(mix * 1.15) * .9
mix = mix / max(1e-6, np.max(np.abs(mix))) * .89
# 简单立体声拓宽(极短延迟)
d = int(.012 * SR); L = mix.copy(); R = np.concatenate([np.zeros(d), mix[:-d]]) * .97
pcm = (np.stack([L, R], 1) * 32767).astype('<i2')
with wave.open(sys.argv[2], 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('audio ok', round(len(mix) / SR, 2), 's, events', len(meta['audio']))
