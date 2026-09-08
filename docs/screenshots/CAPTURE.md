# 素材重录说明(Showcase 可复现)

README 效果区的图片全部来自**真实运行产物**,不摆拍。任何人想重新录制,按下面步骤即可。产物与录制方法一起入库,改完 UI 后随时可重录。

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

## 3. 侧栏「鲸湾」菜单(menu.png / menu-en.png / menu-exit-armed.png)— 脚本一键重录

v0.5 起菜单截图脚本化(v0.4 时代的人工 Win+Shift+S 已退役)。脚本用一次性 headless Edge 沿 CDP 驱动**真实 DSH 页面**,点开真菜单、按弹层+触发器联合矩形裁剪,零手抖、完全可复现:

```powershell
node scripts/capture-whale-menu.mjs        # 中文两图:menu.png + menu-exit-armed.png
node scripts/capture-whale-menu.mjs --en   # 追加英文图 menu-en.png(截完自动切回中文)
```

脚本做的:

- 从 `~\.dsh\launcher\dsh-server.log` 读 token URL——**只在进程内流转**,不打印、不落盘——用临时一次性 Edge 配置(完事即删,不动你的 Edge)打开真实 GUI;
- 等侧栏「鲸湾」触发器出现 → 点击弹出菜单 → 验证菜单项(换气 / 洄游 / 归湾)→ 裁剪存 `menu.png`;
- 「归湾」只点**第一下**(两步确认的武装态,确认归湾?)截 `menu-exit-armed.png`,**绝不点第二下**——不会真的退出服务器;
- `--en` 走真实设置弹窗切换界面语言(通用设置 → 语言 → English),等鲸湾菜单重渲染为 Surface / Migrate / To the Bay 后截 `menu-en.png`,**finally 强制切回中文**(语言是服务端用户偏好,不还原会留在英文)。

前置:DSH 服务器正由 dsh-dock 启动运行(启动日志里有 token URL);Edge 已安装;Node ≥ 22。

## 3b. 托盘右键菜单(tray-menu.png)— 人工截图

托盘是原生 Windows UI,只能人工:

1. 确认托盘有鲸鱼(双击桌面「DSH Harness.exe」或等常驻);
2. **右键**鲸鱼 → 菜单弹出(四项:打开 DSH / 重启服务器 / ☑开机自启 / 完全退出)→ **Win+Shift+S** 框住菜单截图 → 存为 `docs/screenshots/tray-menu.png`;
3. (可选)把鼠标悬停在鲸鱼上不点,tooltip 出现「DSH 运行中 · 端口 3080」→ 截 `tray-tooltip.png`。

## 3c. 系统设置弹窗的「DSH Dock(启动器)」页(settings-section.png)— 脚本一键重录

```powershell
node scripts/capture-whale-menu.mjs --settings
```

脚本打开真实设置弹窗 → 点左侧「DSH Dock(启动器)」分区 → 等托盘常驻 / 开机自启两开关渲染 → 截整个弹窗。无干扰、不最小化任何窗口。

## 4. 多 DSH 候选选择(cold-card-multidsh.png)— 脚本一键重录

```powershell
pwsh -NoProfile -File scripts/capture-multidsh.ps1
```

## 5. 回归验证(不产图,产 PASS)

```powershell
pwsh -NoProfile -File scripts/verify-health-gate.ps1
# 期望:PASS — launcher stayed alive ... health gate held, no fake window.
```

失效 token(401)绝不允许开出窗口——每次改健康闸相关代码后跑一遍。

## 复现纪律

- 截图必须来自当前版本的 `client.js` / `DshDockLauncher.cs`,改过 UI 就重录,不要复用旧图(鲸湾菜单三项化后,menu*.png 已全部脚本重录);
- 冷卡、鲸湾菜单与设置页用脚本、托盘用人工,来源如实标注在 README 图注里;
- `~\.dsh\launcher\dsh-server.log` 含有真实 token,**绝不可放入 README 或素材目录**(capture-whale-menu.mjs 在进程内读取、永不落盘);
- 演示配置的 ini 在脚本结束后自动恢复,不要手动改 `launcher.ini`。
