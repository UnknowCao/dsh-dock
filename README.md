<sub>🌐 <b>中文</b> · <a href="README.en.md">English</a></sub>

<div align="center">

# DSH Dock(dsh-dock)

> *「双击桌面鲸鱼,秒开全屏 DSH——之后它是你托盘里的一只鲸鱼:状态一眼可见,重启一点就完,不用再开终端敲 `npx dsh web`,也不用去进程列表里找 3080。」*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue)
[![Runtime: DSH Web profile](https://img.shields.io/badge/Runtime-DSH%20Web%20profile-4c1)](https://github.com/deepseek-ai/deepseek-harness)
[![dsh-plugin](https://img.shields.io/badge/DSH%20plugin-%F0%9F%90%99-4c1)](https://github.com/topics/dsh-plugin)

**把「开终端 → 敲命令 → 粘 token → 手动全屏 → 翻进程列表杀进程」收成:双击鲸鱼开窗、托盘鲸鱼常驻报状态、一键重启服务器、两步完全退出。单文件原生 exe、免编译安装、零依赖、只与本机通信。**

[效果与实测](#效果与实测) · [快速开始](#快速开始) · [能做什么](#能做什么) · [安全边界](#安全边界) · [验证与测试](#验证与测试)

</div>

---

<p align="center">

<img src="docs/screenshots/tray-menu.png" width="360" alt="托盘鲸鱼右键菜单:打开 DSH · 重启服务器 · ☑开机自启 · 完全退出">

<sub>开窗后鲸鱼驻留系统托盘:悬停看服务器状态、左键秒开、右键一键重启/自启/退出——「重启服务器」这件一天好几次的事,从进程列表里收回到一次点击。</sub>

</p>

---

## 它解决什么问题

如果你是 DeepSeek Harness 的日常用户,下面这段大概每天重复:开终端 → `npx dsh web --no-open` → 记下那串 token URL → 粘进浏览器 → 手动按 F11。想重启?先 `Get-NetTCPConnection -LocalPort 3080` 找到 PID 再 `Stop-Process`,然后从头再来一遍。

问题不在哪一步特别难,而在**每一步都要你亲手做**——尤其"重启"这种一天好几次的高频动作,却藏在进程列表里。

DSH Dock 把整件事收进三个入口 + 一个常驻状态位:

- **桌面一个黑鲸鱼图标**:服务器在跑 → 直接全屏打开;没在跑 → 自动拉起,就绪后开窗;开窗后鲸鱼**落入系统托盘常驻**(可在设置页关闭)。
- **托盘鲸鱼(状态入口)**:悬停显示「运行中/启动中…/未运行」;左键秒开;右键菜单 = 打开 DSH · 重启服务器 · ☑开机自启 · 完全退出。
- **侧栏一个「鲸湾」菜单**:换气(重载界面,服务器不动)/ 洄游(重启服务器,去而必归)/ 归湾(完全退出,两步确认)——三个动作全部取自鲸类行为谱,悬停即见功能注解。设置不进菜单——回到侧栏底部原生「设置」入口,dsh-dock 的专属设置页(托盘常驻/开机自启)就在那个设置弹窗里。
- **退出自动收尾**:完全退出 → 页面自动关闭 → 服务器优雅停止(整树 dispose)→ 会话实时保存,下次双击鲸鱼直接续上。

---

## 效果与实测

> 本节图片与所有数字均为**真实运行产物**,重录方法全部入库:[docs/screenshots/CAPTURE.md](docs/screenshots/CAPTURE.md)。

### 桌面程序(双击即启动)

<p align="center"><img src="docs/screenshots/desktop-shortcut.png" width="112" alt="桌面「DSH Harness」程序图标(黑鲸鱼)"></p>

安装后桌面出现「DSH Harness.exe」桌面程序,**双击它本身就是入口**(不是快捷方式):服务器在跑 → 静默全屏开窗;没在跑 → 鲸鱼卡片拉起。图标为黑鲸鱼(编译进 exe,上图取 `assets/dsh-dock.ico` 内嵌的 512×512 帧,透明底)。

### 侧栏「鲸湾」菜单(点击后向上弹出)

v0.5 起,侧栏底部多一枚三道波浪图标的按钮「**鲸湾**」(Whale Bay)——鲸鱼的休整湾。点开三个动作,全部取自鲸类行为谱:**换气**(重载界面,等效 Ctrl+Shift+R,服务器不动)、**洄游**(重启服务器,去而必归)、**归湾**(完全退出;两步防误触,4 秒不点自动解除)。菜单里只留隐喻,功能注解走悬停 tooltip 与 aria-label;图标取 风 / 洄游环 / 月 三枚 Feather 线条,与波纹触发器合成一幅小海景。菜单以普通插件条目身份渲染在侧栏脚注槽位里,不挪动、不隐藏任何原生 DOM——与其他侧栏插件(包括动态 Cordis 插件)稳定共存;文案跟随 DSH 界面语言即时切换(英文为 Surface / Migrate / To the Bay)。

| 菜单弹出形态 | 「归湾」两步确认 |
|---|---|
| ![侧栏菜单](docs/screenshots/menu.png) | ![归湾二次确认](docs/screenshots/menu-exit-armed.png) |

> 两图均为 v0.5 真实界面实拍:左侧鲸湾菜单弹出(换气 / 洄游 / 归湾),右侧点过一次「归湾」后的武装态(确认归湾?)。英文界面(Surface / Migrate / To the Bay)见 `menu-en.png`。一键重录:`node scripts/capture-whale-menu.mjs --en`。

### 托盘鲸鱼(常驻状态入口,v0.4.0)

开窗后鲸鱼驻留系统托盘:悬停 tooltip 显示服务器状态;左键秒开;**重启服务器 / 开机自启勾选**都在托盘右键;托盘「完全退出」为单击直执行(右键本身即是明确意图,侧栏仍保留两步防误触)。命名互斥锁保证任何时刻至多一个图标——双击、开机自启、托盘自身,谁先到谁留下。

![托盘右键菜单](docs/screenshots/tray-menu.png)

托盘右键菜单(自上而下):打开 DSH · 重启服务器 · ☑开机自启 · 完全退出(单击直执行)。

### 设置页(系统设置弹窗内的「DSH Dock(启动器)」分区,v0.4.0)

![设置页](docs/screenshots/settings-section.png)

所有插件设置归一处:侧栏底部原生「设置」→ 左侧分区列表点「DSH Dock(启动器)」→ 右侧两个开关(**托盘常驻** / **开机自启**,各带说明)。开关状态与托盘右键菜单的勾选实时同步。

### 冷启动卡片(服务器没在跑时双击鲸鱼)

![冷启动卡片](docs/screenshots/cold-card.png)

深色半透明圆角玻璃卡,居中的黑鲸鱼即呼吸灯(亮度 35%↔100% 余弦起伏,无进度条、无字标);失败时鲸鱼停呼吸、文字转红并给出日志路径与关闭按钮。

> 截图实录:冷卡为**预编译启动器**(`assets/dsh-dock-launcher.exe`)在演示配置下(临时 `launcher.ini` 指向 3080 真服务器 + 失效 token 行,只读探测、不写真实日志)的真实渲染,上方为「正在连接」态。可重录:`pwsh -File scripts/capture-demo-card.ps1`。

### 多份 DSH?冷卡上直接选(自 v0.3.3)

![多 DSH 候选选择](docs/screenshots/cold-card-multidsh.png)

机器上装了多份 dsh(全局安装 / npx 缓存 / 源码检出)时,冷启动卡片自绘候选清单(版本 · 来源 · 路径),选一个再启动;10 秒不点自动用上次成功的选择(或最高版本);切换只改"跑哪份",零文件重写;一个候选都没有时,提示可一键 npx 拉取。可重录:`pwsh -File scripts/capture-multidsh.ps1`。

**候选发现是自适应的(自 v0.6.0):** 不再假设 dsh 装在哪一处——它会自动扫过本机各常见全局安装位:当前运行 Node、roaming npm、WinGet Node 各版本、nvm-windows 各版本,对每个去重 Node 探测其权威 `npm root -g`(node 旁 `node_modules` 兜底)。这样用不同 Node / 不同全局 prefix 装的 dsh 都能被列为可选,无需写死位置。

**自定义目录也不怕(自 v0.7.0):** 装在任意文件夹(非任何全局 prefix)的 dsh,到设置页「DSH Dock(启动器)」→「额外 DSH 安装路径」加一条目录即可被发现(填 `node_modules` 根或 `@deepseek-ai/dsh` 包目录皆可,保存即刷新候选),全程无需搬移安装。

### 实测数字(本机)

> 本机 = Windows 11 + 360 安全软件环境;方法见 [验证与测试](#验证与测试)。换机器后**引擎相关耗时**会变,插件自身耗时 ~0.75s 稳定。

| 场景 | 实测 | 说明 |
|---|---|---|
| 服务器在跑,双击桌面程序 | **Edge 新进程 ~0.6–1.5s** | 原生 exe 直连(启动 ~100ms + 本机 HTTP 验证 ~10ms),无 wscript 层 |
| 服务器没跑,双击桌面程序 | **品牌卡片 ~0.3s 出现**,服务器就绪后自动开窗 | 卡片与启动器同一原生 exe(预编译入库,安装免编译),无 PowerShell 引擎等待 |
| 服务器冷启动至端口就绪 | ~10–13s | dsh 自身启动耗时(实测 10.6s / 13.2s) |
| 点「完全退出」到进程真正退出 | **~1–7s** | v0.3.7+ 走优雅路径(`ctx.appExit` 整树 dispose 后自然退出;7s 为 watchdog 兜底上限,实测多落在 ~2s 内);无 `appExit` 的旧宿主才回退为硬杀 |

---

## 快速开始

前置条件:Windows 10/11 + DSH `web` profile + Edge(缺失时回落默认浏览器)。无需 Node 配置——安装时自动探测可用 Node(≥ 22.19)。

```bash
dsh plugin --profile web add github:UnknowCao/dsh-dock#v0.7.0
```

重启服务器后**无需任何操作**:插件激活时自动从环境提取参数(自身监听端口、Node 路径、启动命令),~2 秒内桌面出现「DSH Harness.exe」(黑鲸鱼图标)+ 侧栏「鲸湾」菜单。日常两步:**双击鲸鱼开,菜单里退**。「完全退出」走优雅退出(整树 dispose 后自然收尾);仅在没有 `ctx.appExit` 的旧宿主上回退为硬杀。

**从 v0.4 升级?** v0.5 只动侧栏菜单:更名「鲸湾」,收窄为 换气(刷新界面)/ 洄游(重启服务器)/ 归湾(完全退出) 三项,悬停显示功能注解,设置回到侧栏底部原生入口(设置页本身不变);修复了其他插件(如 Cordis 面板徽标)同时占用侧栏脚注槽位时的页面冻结问题;菜单文案改为跟随界面语言即时切换。托盘、重启、开机自启、设置页均不变。

想自定义(改名/换端口)再对 Agent 说:

```text
帮我把 DSH 桌面程序改名为 XX / 装到 3081 端口
```

卸载:删桌面 `DSH Harness.exe` 与 `~\.dsh\launcher\`;profile 里移除依赖与 bundle 条目。卸载不会自动删除任何文件。


## 能做什么

| 能力 | 交付 | 触发 |
|---|---|---|
| 一键启动 · 快路径 | 服务器在跑:静默**全屏**打开(独立 Edge 应用窗口,无卡片闪现) | 双击桌面程序 |
| 一键启动 · 冷路径 | 品牌卡片(鲸鱼呼吸灯)→ 静默拉起 → 就绪开窗 | 双击桌面程序 |
| 独立应用窗口 | 专属 Edge 配置:不并入主浏览器标签页,自带 30 天登录态 | 自动 |
| 侧栏「鲸湾」菜单(v0.5 改版) | 换气(重载界面)/ 洄游(重启服务器)/ 归湾(完全退出,两步确认)收进侧栏脚注一枚波纹按钮,悬停显示功能注解;弹层为 React Portal | 侧栏底部「鲸湾」 |
| 与其他侧栏插件共存(v0.5) | 以普通邻居条目渲染,零 DOM 迁移、不隐藏原生触发器;脚注槽纵向堆叠,Cordis 徽标等全宽条目与鲸湾各行其道,页面不再冻结 | 自动 |
| 界面语言跟随(v0.5) | 菜单 / 设置页 / 退出遮罩文案注册进宿主 locale,切换界面语言即时生效(≤ v0.4 不跟随) | 跟随 DSH 语言设置 |
| 退出自动关窗 | 页面短促停留后关闭,服务器随后静默停止,会话实时保存 | 菜单「归湾」×2 |
| 抗误触/抗竞态 | 完全退出两步确认;退出后立刻双击会等待旧进程死透再冷启动;冷启动单实例锁;端口被占却未就绪时明确报错而非干等 | 自动 |
| 单文件 · 免编译 · 零依赖 | 桌面是**原生 exe 本体**(非快捷方式);预编译入库,安装不需要 csc;运行只与本机回环通信 | 自动 |
| 激活即自动安装 | 插件激活后 ~2s 自动落盘全套产物,参数(端口/Node/启动命令)全部环境自探测;内容比对幂等,升级插件自动刷新 | `dsh plugin add` + 重启 |
| 多 DSH 可选启动 | 多份 dsh(全局/npx 缓存/源码)时,冷启动卡片自绘候选列表,10 秒不点自动用上次成功版本(或最高版本);切换零文件重写;0 候选时可一键 npx 拉取 | 双击鲸鱼(多候选时) |
| 托盘常驻 · 状态入口(v0.4.0) | 开窗后鲸鱼驻留系统托盘:悬停显示「运行中/启动中…/未运行」状态,左键秒开;关窗不停服;命名互斥锁保证任何时刻至多一个图标 | 自动(默认开,设置页可关) |
| 一键重启服务器(v0.4.0) | 杀监听进程 → 等端口死透 → 重新拉起 → 就绪自动开窗(把此前 ~15s 的「退出再双击」收成一次点击) | 托盘右键或鲸湾菜单「洄游」 |
| 开机自启(v0.4.0,默认关) | 勾选写 HKCU Run:登录后静默驻留托盘 + 后台预热服务器、**不开窗**;点托盘秒开 | 托盘右键「☑开机自启」或设置页 |
| 插件设置页(v0.4.0) | 注册进**系统设置弹窗**的正式分区(与其他插件设置页同构):托盘常驻 / 开机自启 | 设置弹窗 →「DSH Dock(启动器)」 |
| 额外安装路径(设置页,v0.7.0) | 设置页新增「额外 DSH 安装路径」:手动添加/移除任意目录(填 `node_modules` 根或 `@deepseek-ai/dsh` 包目录皆可),保存即静默刷新候选;未解析条目标黄提示但保留,装上即生效;任意文件夹里的 dsh 无需搬移即可被选 | 设置弹窗 →「DSH Dock(启动器)」→ 额外路径 |

---

## 与手动操作相比

| 场景 | 手动做法 | dsh-dock |
|---|---|---|
| 打开 | 终端 `npx dsh web` + 手抓 token + 粘浏览器 | 双击图标,自动抓 token、全屏开窗 |
| 窗口形态 | 混进浏览器标签页 | 独立应用窗口,直接全屏(专属配置) |
| 重载界面 | ——(只能整个重启服务器) | 鲸湾菜单「换气」一键重载,服务器不动 |
| 重启服务器 | 完全退出 → 等端口死 → 双击冷启动(~15s 手动流程) | 托盘右键或鲸湾菜单「洄游」一键完成,先关旧窗、就绪后开新窗 |
| 退出 | 翻进程列表找 PID 再杀 | 侧栏两步「归湾」(优雅停服+关窗)或托盘单击「完全退出」 |
| 重复双击 | 可能重复起服务 | 幂等:已在跑就直接开窗 |

## 它和其他启动器方案有什么不同

dsh-plugin 生态里已有多个桌面客户端与启动器(见文末生态索引)。dsh-dock 的取舍是**不做另一个程序,做你现有 dsh 里的插件**:

| 维度 | dsh-dock 的做法 |
|---|---|
| 形态 | DSH 插件:`dsh plugin add` 一条命令即装,跟着现有 dsh 走,不引入第二套运行时 |
| 升级 | 插件升级即升级;启动套件在每次激活时自动刷新(内容比对,幂等) |
| 退出/重启 | 走宿主 Web 路由:优雅退出整树 dispose,重启由托盘独立进程执行,会话实时保存 |
| 界面内控制 | 侧栏「鲸湾」菜单 + 系统设置弹窗内设置页,与 Web UI 同体、与其他插件共存 |
| 多版本 dsh | 冷启动卡片上直接选(全局安装 / npx 缓存 / 源码检出) |
| 信任面 | 零安装钩子、单文件预编译 exe、只与本机回环通信(见安全边界) |

一句话:如果你已经在用 dsh 的 Web UI,想要的是"桌面双击即开 + 托盘常驻 + 干净退出",而不是再装一个客户端——选它。


更多插件见生态索引:[dsh-plugin 话题](https://github.com/topics/dsh-plugin) · [Oh-My-DSH](https://github.com/NoWint/Oh-My-DSH) · [awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)。

---

## 安全边界

- **只监听回环**:退出接口 `/launcher/api/stop` 只接受本机/可信来源 + 同源请求,跨站直接 403,不对外暴露
- **不碰会话数据**:退出依赖 DSH 实时持久化,插件不读写 `$DSH_HOME` 里的会话
- **不读不传凭据**:token 只在本地日志与本地 Edge 启动参数间流转
- **防误杀**:退出用"自身 PID 直杀 + netstat 兜底"双保险;manifest 指向其他进程时绝不动手
- **安装零生命周期脚本**:`package.json` 无 preinstall/install 等钩子,安装过程不执行任意代码;桌面已有同名但**非本插件**的文件时,拒绝覆盖并明确报错
- **完全退出有二次确认**;启动失败会亮出原因与日志路径
- **无常驻后台服务**(v0.4.0 起):双击链路仍是单一原生 exe;新增的**托盘常驻**是用户可见、可关闭的鲸鱼驻留进程(默认开),除本机回环外零网络、不读不传凭据。关闭「托盘常驻」即完全回到 v0.3.x 的短命进程模型
- **自启只写当前用户注册表**:开机自启 = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下一个 `dsh-dock` 值(指向 suite exe `--boot`),不需要管理员权限,取消即删除
- **设置路由同一围栏**:`/launcher/api/settings/{get,set}` 与退出/重启接口走同一套回环/同源信任检查,跨站 403

### 已知限制(先声明,非缺陷)

- 仅 Windows(macOS/Linux 计划中)
- 手动启动的服务器 + 全新 Edge 配置:日志无 token 可抓,首次需用带 token 的地址登录一次(登录态 30 天)
- 普通浏览器标签页内点「完全退出」,浏览器可能拦截自动关窗 → 弹出提示遮罩,手动关一次即可;桌面程序打开的应用窗口可自动关闭
- 侧栏「洄游」(重启服务器)需要托盘驻留来执行(宿主无法重启自己的死亡);托盘未驻留时会提示先双击鲸鱼
- 托盘「重启服务器」会先关闭所有 dsh-dock 窗口再拉起——旧窗口持有的 token 已随旧进程作废,刷新也无法找回;这是有意行为
- 托盘右键菜单是原生控件,暂只有中文文案(侧栏菜单与设置页已跟随界面语言)

---

## 文件结构

```
dsh-dock/
├── index.js                 # Host:launcher_install 工具 + 退出/设置/重启路由 + 烤 launcher.ini/start-server.cmd + 放置桌面 exe
├── client.js                # Client:侧栏「鲸湾」菜单(普通邻居条目 + React Portal)+ 设置弹窗内「DSH Dock(启动器)」设置页 + 退出自动关窗
├── cordis.patch.yml         # bundle 补丁:编排插入插件行
├── package.json             # 包清单(name: dsh-dock)
├── regen-launcher.mjs       # 维护:脱离 harness 重新生成启动套件
├── candidates.mjs           # 共享:多 DSH 候选探测 + 套件落盘(host 激活与 T2 复核共用)
├── dsh-dock-refresh.mjs     # 冷启动前复核脚本(T2,exe 调 node 执行,随插件部署到 launcher 目录)
├── dsh-dock-v0.5.0-release-notes.md  # v0.5.0 发布说明(鲸湾改版/共存改造/语言跟随)
├── dsh-dock-v0.6.0-release-notes.md  # v0.6.0 发布说明(自适应候选发现:跨 Node 自动探测)
├── dsh-dock-v0.7.0-release-notes.md  # v0.7.0 发布说明(自定义额外路径:设置页手动指路径)
├── dsh-dock-v0.4.0-release-notes.md  # v0.4.0 发布说明(托盘/重启/自启/设置页的变更叙事)
├── src/
│   └── DshDockLauncher.cs   # 启动器唯一实现:快路径静默开窗 + 冷卡 + 健康闸 + 退出竞态 + 单实例锁 + 托盘
├── assets/
│   ├── dsh-dock-launcher.exe # 预编译启动器(scripts/build-launcher.ps1 产出,随仓库提交,安装免编译)
│   ├── dsh-dock.ico         # 桌面程序鲸鱼图标(编译进 exe)
│   └── whale.png            # 卡片鲸鱼源位图(白化重映射)
├── docs/
│   └── screenshots/
│       ├── desktop-shortcut.png    # 桌面程序图标特写(黑鲸鱼 512×512 透明底)
│       ├── menu.png / menu-en.png  # 鲸湾菜单实拍(v0.5,脚本重录)
│       ├── menu-exit-armed.png     # 「完全退出」二次确认态
│       ├── tray-menu.png           # 托盘右键菜单实拍
│       ├── settings-section.png    # 设置弹窗内「DSH Dock(启动器)」分区实拍
│       ├── cold-card.png           # 冷启动卡片实拍(演示配置重录)
│       ├── cold-card-multidsh.png  # 多 DSH 候选选择实拍
│       └── CAPTURE.md              # 素材重录说明(菜单人工截图 + 脚本重跑)
├── scripts/
│   ├── build-launcher.ps1        # 编译 src/DshDockLauncher.cs → assets/dsh-dock-launcher.exe(开发时)
│   ├── capture-demo-card.ps1     # 冷卡截图重录:演示 ini + 失效 token → 连拍取鲸鱼最亮相位
│   ├── capture-multidsh.ps1      # 多 DSH 候选选择截图重录
│   ├── capture-whale-menu.mjs    # 鲸湾菜单三图 + 设置页一键重录(CDP 驱动 Edge,含中英切换与还原)
│   └── verify-health-gate.ps1    # 回归:失效 token(401)绝不误开窗
├── LICENSE
├── README.md                # 中文主文档
└── README.en.md             # English README
```

安装后生成于 `~\.dsh\launcher\`(运行时产物,不入仓库):

`dsh-dock-launcher.exe`(启动器本体)、`launcher.ini`(exe 读的运行时配置,值 base64 编码)、`start-server.cmd`(默认候选的隐藏拉起脚本,等端口空闲才启动防日志截断)、`start-server.<id>.cmd`(其余每个候选各一份)、`candidates.json`(候选清单:版本/来源/路径/对应批处理)、`candidates.mjs` 与 `dsh-dock-refresh.mjs`(随插件部署的复核脚本副本,冷启动前 exe 调 node 执行)、`launcher-state.json`(exe 记录的上次选择等状态)、`launcher.json`(host/port/桌面目录/**trayPid** 缓存,供退出路由与幂等检查)、`settings.json`(用户设置:托盘常驻)、`dsh-dock.ico`、`whale.png`、`.stopping`(退出中标记)、`.starting.lock`(冷启动单实例锁)、`.restart.request`(侧栏「重启服务器」→ 托盘执行器)、`stop.log`(退出生命周期诊断,追加式)、`dsh-server.log(.err)`、`edge-app-profile\`(全屏窗口专属 Edge 配置);桌面放置 `DSH Harness.exe`(同一二进制副本)。以上在插件激活时**自动生成/刷新**。

---

## 验证与测试

装完花 5 分钟自验(每步期望都写明了):

1. **一键开**:双击桌面「DSH Harness.exe」→ 服务器在跑时 1~2s 内弹全屏窗口(无卡片),随后**托盘出现鲸鱼**。
2. **托盘**:悬停鲸鱼 → tooltip「DSH 运行中 · 端口 3080」;左键秒开;右键见四项菜单(打开 / 重启服务器 / ☑开机自启 / 完全退出)。
3. **侧栏菜单**:点侧栏底部「鲸湾」→ 三项(换气 / 洄游 / 归湾),悬停各出功能注解;点一次「归湾」变红显示「确认归湾?」,再点才执行。侧栏底部原生「设置」→ 弹窗左侧「DSH Dock(启动器)」→ 托盘常驻/开机自启两开关与托盘勾选状态一致(改一处另一处跟着变)。
4. **重启服务器**:鲸湾菜单「洄游」或托盘右键「重启服务器」→ 所有 dsh-dock 窗口先关闭 → 约 10~15s 后只弹出一个新全屏窗口。
5. **冷启动**:鲸湾菜单「归湾」×2(或托盘单击)→ 等 `Get-NetTCPConnection -LocalPort 3080 -State Listen` 无输出 → 双击桌面程序 → 鲸鱼呼吸灯卡片 → 服务器就绪 → 全屏窗口 → 卡片淡出。
6. **抗竞态**:第 5 步服务器启动途中(约 10s 内)再双击一次 → 应只有一个服务器、一个托盘、最终窗口可用。

---

## 实现要点(给想了解深度的读者)

- **v0.5 共存改造**:菜单注册为 `sidebar.footer.action` 的普通邻居条目,渲染在槽位挂载处——零 DOM 迁移、不隐藏原生触发器。v0.4 曾把按钮 DOM 物理搬进侧栏脚注容器并隐藏原生设置触发器,导致其他插件(如 Cordis 面板徽标)再插入条目时 React 调和死锁、页面冻结;v0.5 弹层与退出遮罩全部改为 React Portal,另加一条针对槽位结构属性 `[data-slot]` 的纵向堆叠 CSS,让全宽条目与鲸湾各行其道
- **文案语言即时跟随(v0.5)**:`locale` 为硬依赖(注入即等待服务就绪,词典注册后才首渲染);切换界面语言时订阅 locale 变更触发重渲染(≤ v0.4 曾忽略语言切换)
- **鲸类行为谱命名(v0.5)**:三个动作以鲸的生态行为命名——换气(刷新页面)、洄游(重启服务器,去而必归)、归湾(完全退出休息);菜单保持隐喻纯净,功能注解走原生 title 悬停与 aria-label(零视觉成本);图标为 Feather/Lucide 的 风 / 洄游环 / 月,与三道波浪的触发器合成一幅海景
- **单 exe 单实现**:快路径、冷卡、健康闸、退出竞态、单实例锁全部编译进 `src/DshDockLauncher.cs` 一个文件——之前 .lnk→wscript→VBS→HTA 四层链(同一逻辑三份实现,正是历史 bug 温床)已退役
- **预编译 + 运行时配置**:exe 随仓库提交(`assets/dsh-dock-launcher.exe`),安装免 csc;所有机器相关路径(日志/批处理/Edge 配置/标记/鲸鱼图)烤进 `launcher.ini`(base64 值,中文用户名安全)
- **HTTP 200 健康闸(含 cookie 语义)**:DSH 对有效 token URL 回 **303 + Set-Cookie → /**,浏览器跟随落 200;闸带 CookieContainer 复刻这一链路,旧 token(裸 401)绝不误开窗
- **退出/启动竞态吸收**:`.stopping` 新鲜时先等端口死透再冷启动;`.starting.lock` 单实例锁防双启,60s 崩溃接管
- **动画零阻塞**:TCP 探针(死端口最长阻塞 700ms)、日志抓取、健康闸 HTTP 全部在后台线程轮询,UI 线程只负责绘制——冷启动全程呼吸灯流畅,卡顿与机器性能无关
- **多 DSH 选择(每个候选一份烤好的 .cmd)**:候选清单 = 全局前缀 + npx 缓存(`_npx`)+ 源码检出,按 版本→来源→路径 排序;每候选一个批处理,切换只换"跑哪个",**永不重写任何 .cmd**;冷启动前 exe 先跑 T2 复核脚本(~0.2s)保证刚装的 DSH 立即可选,复核失败用旧清单并标"可能已过期"
- **明确失败而非干等**:端口被占但页面始终不 200 时,~24s 内报出"上一次会话可能未完全退出"+ 日志路径
- **托盘常驻(v0.4.0)**:`DshTray` 与启动器同一 exe——开窗后驻留(`--boot` 则静默预热服务器不开窗);托盘把 PID 盖进 `launcher.json`(`trayPid`),侧栏退出在响应前**同步清托盘**(进程名校验防 PID 复用);托盘已在时再次双击走快路径开窗即退,**零进程间通信**;`Local\dsh-dock-tray-<port>` 命名互斥锁保证任何时刻至多一个图标(跨 suite/桌面两个副本名)
- **重启服务器 = 托盘执行器(v0.4.0)**:侧栏「重启服务器」写 `.restart.request`,驻留托盘检测后执行完整序列——宿主无法重启自己的死亡,托盘(独立进程)是执行者;重启先按 `--user-data-dir` 身份关掉所有旧 dock 窗口(它们的 token 已随旧进程作废),就绪后只开一个新窗
- **关闭窗口按身份不按记账(v0.4.0)**:WMI 枚举 msedge 命令行,凡带专属 Edge profile 的一律优雅关闭+超时强杀——托盘实例中途更换也不会把旧窗口留成孤儿
- **退出走优雅路径(v0.3.7+)**:`/launcher/api/stop` 优先 `ctx.appExit` 整树 dispose 后自然退出(7s watchdog 兜底),只有无 `appExit` 的旧宿主回退硬杀;退出分支全部记入追加式 `stop.log`(冷启动截断不了它)
- **激活即自动安装**:`apply()` 后 ~2s 落盘全套产物——端口取自**自身 PID 的 LISTENING 套接字**(netstat,~100ms),Node 与启动命令走探测链;已就绪时内容比对直接跳过(仅几次文件读,零 PowerShell、零写入)
- **诊断钩子**:设置环境变量 `DSH_DOCK_DIAG=1` 后,启动器把决策/崩溃轨迹追加到 `%TEMP%\dsh-dock-diag.log`(平时零开销)
- 改了 `index.js` 配方或重编 exe 后,用 `node regen-launcher.mjs` 重新生成整套启动文件

---

## 致谢与声明

- 本插件依赖 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 本体,鲸鱼品牌素材归其所有。

## License

[MIT](LICENSE)

---

<div align="center">

*双击鲸鱼开,换气 · 洄游 · 归湾 🐋*

</div>
