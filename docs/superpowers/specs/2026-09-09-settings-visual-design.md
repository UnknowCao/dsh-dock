# dsh-dock 设置页视觉精致化 — Design Spec

日期:2026-09-09 · 分支:`feat/v0.7-extra-roots` · 文件:`client.js`(仅设置页相关组件)
档位:A(精致化打磨,不动结构/信息层级)

## 目标

把「DSH Dock(启动器)」设置页从朴素纵向列表打磨为规范、有层次、可扫读的界面:
行卡片化的开关项、分组小标题、带状态徽章的额外路径列表、彩色反馈条。全部使用
harness 主题 token(`--dsw-alias-*`),亮/暗主题自动跟随;不引第三方样式库。

## 范围(改 / 不改)

改:仅 `client.js` 内 `DockSettingsPage` / `SettingsToggleRow` / `ExtraRootsEditor`
的视觉与必要文案。可在该文件注入一段最小 `<style>`(id-guarded,随 fiber dispose)
承载行卡片/徽章/反馈条等需要伪类与 keyframes 的样式;纯内联样式能表达的保持内联。

不改:host(`index.js`)、扫描逻辑(`candidates.mjs`)、任何目录选择器、设置项
行为与接口(`settings/{get,set}`、`extra-roots/{get,set}`)、其它语言/菜单。

## 设计细节

1. **分组骨架**:设置页分为两区块,各带小标题(小号、letter-spacing、secondary):
   - 「通用 / General」:托盘常驻、开机自启
   - 「候选扫描与发现 / Scan & Discovery」:额外 DSH 安装路径
   区块间以弱分隔;整页 flex column、最大宽 520px。

2. **开关行 → 行卡片**:整行可点(点击整行切换),圆角 ~10px、`bg-layer-1`、
   `border-l1` 细边、内边距 10px 12px;hover 抬色/描边加深,transition ~120ms。
   控件改胶囊 switch:轨道(宽 ~36 高 ~20、圆角满、开态 `brand-primary`、闭态
   `bg-layer-2`+细边)+ 圆形滑钮(白),开态滑到右。标题 14/primary,描述
   12/secondary;行高 44 保持可点面积。

3. **额外路径区块**:
   - 区块小标题 + 右侧弱化说明(保存后立即刷新候选)。
   - 路径行:文件夹 glyph + 等宽路径;右侧状态徽章:已解析=绿点+
     `state-success-primary`,未解析=黄点+`state-warn-primary`(title 提示装上即生效)。
   - 删除钮 hover 显 danger;整行 hover 底色;空态:secondary、居中、虚框占位。
   - 输入行:input 聚焦 accent 边框+光晕;添加钮沿用 elevated 填充,disabled 降透明度。

4. **反馈条**:保存/刷新结果彩色状态条(圆角、浅底+色边+小图标):成功绿 /
   警告黄(刷新未完成)/ 错误红;成功与警告 2.5s 自动淡出,错误常驻。

5. **文案**:zh/en 按新分组与说明微调;键值沿用现有 `setting.*` 命名,必要时新增。

## 验收

- 亮/暗两主题下观感正常(全部经 token)。
- 开关点击、整行点击、回车提交、删除、未解析徽章、三类反馈条行为与现有一致。
- `node --check client.js` 通过;现有 7 项冒烟测试不受影响。
- 不引入 picker/新网络调用/新依赖。
