// 用法: node render.js <start> <end> <outDir> [meta]   (帧号区间 [start,end) )
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [s, e, out] = [parseInt(process.argv[2]), parseInt(process.argv[3]), process.argv[4]];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', x => errs.push(String(x))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + path.resolve(__dirname, 'promo.html'));
  await pg.evaluate(() => document.fonts.ready);
  const FPS = await pg.evaluate(() => window.FPS);
  for (let f = s; f < e; f++) {
    await pg.evaluate(t => window.render(t), f / FPS);
    await (await pg.$('#c')).screenshot({ path: path.join(out, String(f).padStart(5, '0') + '.png'), type: 'png' });
    if (errs.length) break;
  }
  if (process.argv[5] === 'meta') {
    const meta = await pg.evaluate(() => ({ total: window.TOTAL, audio: window.AUDIO, scn: window.SCN.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 })) }));
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta));
  }
  if (errs.length) { console.error('PAGE ERRORS:\n' + errs.slice(0, 8).join('\n')); process.exitCode = 2; }
  await b.close();
})();
