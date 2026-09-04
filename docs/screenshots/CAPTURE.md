# 素材重录说明(Showcase 可复现)

README 效果区的四张图全部来自**真实运行产物**,不摆拍。任何人想重新录制,按下面步骤即可。产物与录制方法一起入库,改完 UI 后随时可重录。

## 1. 冷启动卡片(cold-card.png)— 脚本一键重录

```powershell
pwsh -NoProfile -File scripts/capture-demo-card.ps1
# 自定义输出:
# pwsh -NoProfile -File scripts/capture-demo-card.ps1 -OutPath C:\tmp\card.png
```

脚本做的(全部真实、零副作用):

- 临时把 `~\.dsh\launcher\launcher.ini` 换成演示配置(完事自动恢复):URL 指向**运行中的真实 DSH**(只读探测),LOG 指向一次性 demo 日志,锁/标记走 demo 专用路径;
- 往 demo 日志写一行**失效 token**——真实服务器对它回 401,启动器耗尽快路径重试后进入「正在连接」呼吸卡,正是截图所示状态;
- 最小化所有窗口(卡片背后干净)→ 起预编译启动器 → 连拍 4 张 → 取鲸鱼呼吸灯**最亮相位** → 裁切圆角区域存 PNG,随后恢复窗口。

前置:先 `scripts/build-launcher.ps1` 编译最新 `assets/dsh-dock-launcher.exe`。

## 2. 桌面程序图标(desktop-shortcut.png)— 从 ico 提取

`assets/dsh-dock.ico` 内嵌了一张 512×512 PNG 帧。提取:

```powershell
Add-Type -AssemblyName System.Drawing
$bytes=[System.IO.File]::ReadAllBytes('assets\dsh-dock.ico')
$size=[BitConverter]::ToInt32($bytes,14); $off=[BitConverter]::ToInt32($bytes,18)
$seg=New-Object byte[] $size; [Array]::Copy($bytes,$off,$seg,0,$size)
$ms=New-Object System.IO.MemoryStream(,$seg); $b=New-Object System.Drawing.Bitmap($ms)
$b.Save('docs\screenshots\desktop-shortcut.png',[System.Drawing.Imaging.ImageFormat]::Png)
```

(ico 目录偏移:第 6 字节起第一个条目,size 在条目 8–11 字节、offset 在 12–15 字节。)

## 3. 侧栏「更多」菜单(menu.png 与 menu-exit-armed.png)— 人工截图

菜单在浏览器里,无法脚本抓取,需手动。两步:

1. 点侧栏底部「☰ 更多」→ 菜单弹出 → **Win+Shift+S** 区域截图,框住菜单(尽量含底部触发按钮)→ 存为 `docs/screenshots/menu.png`;
2. 再点一次「**完全退出**」(只点第一下!)→ 按钮变「确认完全退出?」→ 截第二张 `docs/screenshots/menu-exit-armed.png` → 按 **Esc** 关闭。

> ⚠️ 第二步千万别点第二下,那会真的退出当前 DSH 服务器。

## 4. 回归验证(不产图,产 PASS)

```powershell
pwsh -NoProfile -File scripts/verify-health-gate.ps1
# 期望:PASS — launcher stayed alive ... health gate held, no fake window.
```

失效 token(401)绝不允许开出窗口——每次改健康闸相关代码后跑一遍。

## 复现纪律

- 截图必须来自当前版本的 `client.js` / `DshDockLauncher.cs`,改过 UI 就重录,不要复用旧图;
- 冷卡用脚本、菜单用人工,两种来源都如实标注在 README 图注里;
- `~\.dsh\launcher\dsh-server.log` 含有真实 token,**绝不可放入 README 或素材目录**;
- 演示配置的 ini 在脚本结束后自动恢复,不要手动改 `launcher.ini`。
