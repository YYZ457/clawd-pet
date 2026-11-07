// 生成 build/icon.png(512x512 像素 Clawd),无需任何依赖
const zlib = require('zlib'), fs = require('fs'), path = require('path');
const N = 512, U = 24, ox = (N - 18 * U) / 2, oy = 150;
const px = Buffer.alloc(N * N * 4);
const fillBg = () => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const i = (y * N + x) * 4, cx = x - N / 2, cy = y - N / 2, r = Math.hypot(cx, cy);
  const inside = Math.abs(cx) < 230 && Math.abs(cy) < 230 && (Math.abs(cx) < 190 || Math.abs(cy) < 190 || Math.hypot(Math.abs(cx) - 190, Math.abs(cy) - 190) < 40);
  if (inside) { px[i] = 0xF4; px[i + 1] = 0xEE; px[i + 2] = 0xE4; px[i + 3] = 255; } } };
const R = (x, y, w, h, c) => { for (let yy = Math.round(oy + y * U); yy < Math.round(oy + (y + h) * U); yy++) for (let xx = Math.round(ox + (x + 9) * U); xx < Math.round(ox + (x + w + 9) * U); xx++) { const i = (yy * N + xx) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; } };
fillBg();
const body = [0xD9, 0x77, 0x57], dark = [0xB8, 0x5C, 0x3E], eye = [0x1f, 0x1a, 0x17], white = [255, 255, 255], pink = [0xFF, 0x7C, 0x96];
for (const x of [-6, -3, 1, 4]) { R(x, 8, 2, 3, body); R(x, 10, 2, 1, dark); }
R(-6, 0, 12, 1, body); R(-7, 1, 14, 6, body); R(-6, 7, 12, 1, dark);
R(-9, 3, 2, 3, body); R(7, 3, 2, 3, body);
R(-4, 2, 2, 3, eye); R(2, 2, 2, 3, eye); R(-3, 2, 1, 1, white); R(3, 2, 1, 1, white);
R(-6, 5, 2, 1, pink); R(4, 5, 2, 1, pink);
R(-2, 5, 1, 1, eye); R(-1, 6, 2, 1, eye); R(1, 5, 1, 1, eye);
// PNG 编码
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), png);
console.log('icon ok', png.length);
