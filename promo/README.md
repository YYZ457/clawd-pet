# 宣传片生成器

用桌宠自己的 `renderer/rig.js` 逐帧渲染竖屏宣传片(1080×1920,30fps),配乐和音效全部用代码合成。

```bash
node promo/meta.js                                   # 导出音效事件表 -> promo/out/meta.json
python3 promo/audio.py promo/out/meta.json promo/out/audio.wav
node promo/render.js 0 1443 promo/out/frames         # 渲染帧(可分段并行)
ffmpeg -framerate 30 -i promo/out/frames/%05d.png -i promo/out/audio.wav \
  -c:v libx264 -crf 15 -pix_fmt yuv420p -c:a aac -movflags +faststart promo/out/Clawd-promo-9x16.mp4
node promo/preview.js promo/out/sheet.png 1.5 5.9 12 20   # 抽帧生成预览接触表
```

依赖:Node + playwright、Python + numpy/scipy、ffmpeg。分镜在 `scenes.js`,引擎在 `engine.js`。
