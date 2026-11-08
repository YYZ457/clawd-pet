const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.goto('file://' + path.resolve(__dirname, 'promo.html')); await pg.evaluate(() => document.fonts.ready);
  const meta = await pg.evaluate(() => ({ total: TOTAL, fps: FPS, audio: AUDIO, scn: SCN.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 })) }));
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'meta.json'), JSON.stringify(meta)); console.log('total', meta.total, 'events', meta.audio.length); await b.close();
})();
