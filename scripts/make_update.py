#!/usr/bin/env python3
"""打"轻量更新包":只包含 app.asar(几百 KB),替换到已安装的 Clawd 里即可,不用重新下载 100MB。

用法(先 npm run dist 生成 dist/win-unpacked):
    python scripts/make_update.py
"""
import json, os, sys, zipfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ver = json.load(open(os.path.join(root, 'package.json'), encoding='utf8'))['version']
asar = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, 'dist', f'Clawd-update-v{ver}.zip')

readme = f"""Clawd 轻量更新包 v{ver}
====================================
只更新程序逻辑(app.asar),体积很小,不需要重新下载完整版。

怎么用:
1. 把这个压缩包里的文件解压到你的 Clawd 文件夹里(和 Clawd.exe 放在一起,覆盖提示选"是")。
2. 双击 update.bat。它会自动关闭 Clawd → 替换文件 → 重新启动。
   (手动也行:退出 Clawd,把 app.asar 复制到 resources 文件夹里覆盖同名文件,再双击 Clawd.exe)
3. 你的"记忆"(认识天数、摸摸次数)不会丢。
4. (可选)浏览器插件也更新了:update.bat 会把新版覆盖到 resources\\browser-extension。想让 Clawd 踩到网页元素的下沿,请在 chrome://extensions 里点插件的“重新加载”。
   如果你的插件是从别处加载的,把压缩包里的 browser-extension 文件夹覆盖过去即可。

如果更新后打不开:用完整包里的 resources\\app.asar 覆盖回去即可。
说明:只有 Electron 内核版本相同时才能用这种更新方式;如果以后发布说明里写"需要完整包",请下载完整版。
"""

os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(asar, 'app.asar')
    z.write(os.path.join(root, 'scripts', 'update.bat'), 'update.bat')
    extdir = os.path.join(root, 'browser-extension')
    for fn in sorted(os.listdir(extdir)):                      # 浏览器插件(网页元素下沿等功能需要新版插件)
        if fn.endswith(('.js', '.json', '.png', '.html')): z.write(os.path.join(extdir, fn), 'browser-extension/' + fn)
    z.writestr('更新说明.txt', readme)
print(out, os.path.getsize(out) // 1024, 'KB')
