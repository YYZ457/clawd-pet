// 用法: node preview.js out.png t1 t2 ...   生成接触表(每行 4 张)
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const cp = require('child_process');
(async () => {
  const out = process.argv[2], ts = process.argv.slice(3).map(Number);
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; pg.on('pageerror', x => errs.push(String(x))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('file://' + path.resolve(__dirname, 'promo.html')); await pg.evaluate(() => document.fonts.ready);
  const dir = path.join(path.dirname(out), 'pvtmp'); fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const t of ts) { await pg.evaluate(t => render(t), t); const f = path.join(dir, 'p_' + t + '.png'); await (await pg.$('#c')).screenshot({ path: f }); files.push(f); }
  await b.close();
  cp.execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
files=sys.argv[2:]; out=sys.argv[1]; cols=4; w,h=400,711
rows=(len(files)+cols-1)//cols
sheet=Image.new('RGB',(cols*(w+8),rows*(h+8)),'white'); d=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
    im=Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS); x=(i%cols)*(w+8); y=(i//cols)*(h+8); sheet.paste(im,(x,y)); d.rectangle([x,y,x+120,y+22],fill='black'); d.text((x+4,y+5),f.split('p_')[1][:-4]+'s',fill='white')
sheet.save(out)`, out, ...files]);
  console.log(errs.join('\n') || 'no errors');
})();
