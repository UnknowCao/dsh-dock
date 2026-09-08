# dsh-dock v0.5.0 — 鲸湾:共存改造 + 语言即时跟随 + 鲸类行为谱命名

> 基于 **v0.4.0**(含其全部能力:托盘常驻、一键重启、开机自启、设置页)。本版只动
> 侧栏菜单这一面:菜单改版为「**鲸湾**」(Whale Bay),三个动作全部取自鲸类行为谱;
> 底层重写为 React Portal + 普通邻居条目,与所有侧栏脚注插件稳定共存;界面语言
> 切换即时生效。托盘、重启、自启、host 路由与启动器 exe **全部不变**(与 v0.4.0
> 同一二进制)。

## 新增 / 改动

| 能力 | 行为 | 入口 |
|---|---|---|
| 鲸湾菜单(v0.5 改版) | 三个动作以鲸类行为谱命名:**换气**(重载界面,服务器不动)、**洄游**(重启服务器,去而必归)、**归湾**(完全退出;两步确认,4 秒不点自动解除,确认文案「确认归湾?」)。触发器为三道波浪图标;菜单只留隐喻,功能注解走悬停 tooltip 与 aria-label | 侧栏底部「鲸湾」 |
| 与其他侧栏插件共存 | 注册为 `sidebar.footer.action` 的**普通邻居条目**,渲染在槽位挂载处——零 DOM 迁移、不隐藏原生触发器;脚注槽纵向堆叠,Cordis 面板徽标等全宽条目与鲸湾各行其道 | 自动 |
| 语言即时跟随(v0.5) | `locale` 改为硬依赖(词典注册后才首渲染);切换界面语言即时重渲染(≤ v0.4 曾忽略语言切换) | 跟随 DSH 语言设置 |
| 设置回归原生入口 | 菜单收窄为纯 dock 动作;设置回到侧栏底部原生「设置」,dsh-dock 设置页仍在系统设置弹窗(分区不变) | 侧栏底部「设置」 |

## 行为变更(相对 v0.4.x)

- **修复:其他插件占用侧栏脚注槽位时页面冻结。** v0.4 曾把按钮 DOM 物理搬进侧栏
  脚注容器并用内联样式隐藏原生设置触发器——其他插件(如 Cordis 面板徽标)再插入
  条目时,React 对该子树的视图与真实 DOM 不再一致,后续任何脚注重排都会令调和
  死锁、整页冻结。v0.5 弹层与退出遮罩全部改为 React Portal(react-dom 为内核
  提供模块),React 端到端持有生命周期;另加一条仅作用于槽位结构属性
  `[data-slot]` 的纵向堆叠 CSS,不改任何内联样式。
- **菜单项命名**:刷新 → **换气**、重启服务器 → **洄游**、完全退出 → **归湾**
  (英文 Surface / Migrate / To the Bay);「确认完全退出?」→「确认归湾?」。
  图标取 Feather/Lucide 的 风 / 洄游环 / 月,与三道波浪触发器合成一幅海景。
- 托盘常驻、一键重启、开机自启、设置页、`/launcher/api/*` 路由:**行为全部不变**。

## 实现落点

- `client.js`(本版唯一改动的代码文件):`MenuCell` 重写为纯邻居条目;新增
  `BayIcon`(waves 触发器)与风/洄游环/月项图标;`MenuPortal` /
  `ExitOverlayPortal` 走 `ReactDOM.createPortal`;`ensureStyles` 增脚注槽纵向
  堆叠;`inject: ['slots', 'locale']`(locale 硬依赖)。
- 其余文件未动;`assets/dsh-dock-launcher.exe` 与 v0.4.0 完全同一二进制
  (sha256 `23ccf2d8…`,未重编)。

## 文档与素材

- `README.md` / `README.en.md` 与 v0.5.0 代码逐项对齐:菜单描述、安装命令、
  能力表(新增共存/语言跟随两行)、v0.4 升级说明、与同类启动器对比表、文件树
  补全、`~\.dsh\launcher\` 生成物清单补全(candidates.json /
  launcher-state.json / 每候选批处理)。
- 截图全部真实界面重录:`menu.png` / `menu-en.png` / `menu-exit-armed.png` /
  `settings-section.png` / `desktop-shortcut.png`;`CAPTURE.md` §3/§3c 由人工
  截图改写为脚本一键重录。

  ![鲸湾菜单](https://raw.githubusercontent.com/UnknowCao/dsh-dock/v0.5.0/docs/screenshots/menu.png)

- 新增 `scripts/capture-whale-menu.mjs`:纯 Node(≥22)CDP 驱动 headless Edge 的
  截图脚本——`--en` 经真实设置弹窗切换语言拍英文图并**强制还原**,
  `--settings` 拍设置页;token 只在进程内流转,永不打印、永不落盘。

## 升级须知

```bash
dsh plugin --profile web add github:UnknowCao/dsh-dock#v0.5.0
```

- 菜单项已改名,第一次可能要找一下:刷新 → 换气、重启服务器 → 洄游、完全退出 →
  归湾(悬停即出功能注解;触发器悬停可见三项全称)。
- 桌面 exe 与启动套件在插件激活时自动刷新(内容比对;运行中的镜像走 rename-aside
  替换);托盘与开机自启设置原样保留。
- 本版未动 exe,冷启动卡片、托盘、多 DSH 选择行为与 v0.4.0 完全一致。
