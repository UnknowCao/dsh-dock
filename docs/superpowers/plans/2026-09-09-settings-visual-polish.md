# dsh-dock 设置页视觉精致化 Implementation Plan

> **For agentic workers:** 本计划按任务逐个执行;任务为 UI 视觉改动,验证方式为 `node --check` + 既有冒烟测试 + 人工目视(亮/暗主题)。

**Goal:** 按 spec `docs/superpowers/specs/2026-09-09-settings-visual-design.md`(A 档)打磨 dsh-dock 设置页观感。

**Architecture:** 仅改 `client.js` 内三个设置页组件(`DockSettingsPage` / `SettingsToggleRow` / `ExtraRootsEditor`),注入一段 id-guarded 最小 `<style>` 承载行卡片/switch/徽章/反馈条/空态样式;内联能表达的保持内联。行为与接口零改动。

**Tech Stack:** React(仅 `React.createElement`,无 JSX)、harness 主题 token `--dsw-alias-*`、零新依赖。

## Global Constraints

- 只动 `client.js`(设置页相关);不动 `index.js` / `candidates.mjs` / exe / 任何目录选择器。
- 颜色一律用主题 token,亮/暗自动跟随;不引第三方样式库。
- 行为/接口不变:`settings/{get,set}`、`extra-roots/{get,set}`、回车添加、逐条删除、未解析保留。
- 不新增网络调用、不新增 pickDirectory。
- 文案键沿用 `setting.*`;zh/en 同步。
- 每次改动后 `node --check client.js` 必须通过;`node --test test/candidates.smoke.mjs` 保持 7/7。

---

### Task 1: 分组骨架 + 行卡片与胶囊 switch

**Files:**
- Modify: `client.js` — `DockSettingsPage` 返回结构、`SettingsToggleRow`、`ensureStyles` 注入的样式文本。

**Interfaces:**
- Produces: 复用的组件与样式类:
  - `SettingsSection({ title, desc?, children })` — 区块容器(小标题+内容)
  - `SettingsToggleRow({ title, description, value, onToggle })` — 行卡片 + 胶囊 switch,整行可点
  - 样式类 `dsh-dock-set-row`(行卡片)、`dsh-dock-set-switch`(轨道)、`dsh-dock-set-switch__knob`(滑钮)、`dsh-dock-set-section-title`(分组标题)

- [ ] **Step 1**: 在 `ensureStyles()` 的样式文本追加分组/行卡片/switch 样式(类名+伪类+transition),保持 id 守卫与 dispose 逻辑不变。
- [ ] **Step 2**: 重写 `SettingsToggleRow`:外容器改 `div.dsh-dock-set-row`(整行 `role=switch`/`aria-checked`,点击整行触发),内部为描述区 + 胶囊 switch(两个 span 或 button 结构);`onChange` 逻辑与 props 签名保持 `{ title, description, value, onToggle }` 不变。
- [ ] **Step 3**: 新增 `SettingsSection`(小标题 + 描述 + children),并重构 `DockSettingsPage`:两个分组(「通用」含两个 `SettingsToggleRow`;「候选扫描与发现」含 `ExtraRootsEditor`),分隔线改由区块间距承载。
- [ ] **Step 4**: `node --check client.js` 通过;提交(带 zh/en 新键见 Task 4,若键未就位则先以现有键编译通过)。

### Task 2: ExtraRootsEditor 视觉刷新(徽章/空态/输入聚焦/删除态)

**Files:**
- Modify: `client.js` — `ExtraRootsEditor` 渲染与新增样式类。

**Interfaces:**
- Consumes: 既有 `roots:[{path,matched}]`、`save(next)`、`onAdd/onRemove`、`note:{kind,text}`。
- Produces: 样式类 `dsh-dock-set-path-row`、`dsh-dock-set-badge`(及其 `--ok/--warn`)、`dsh-dock-set-empty`、输入框聚焦类 `dsh-dock-set-input`(样式表)+ 状态徽章文案。

- [ ] **Step 1**: 路径行改为「文件夹 glyph + 等宽路径 + 右侧状态徽章(已解析=绿点/未解析=黄点)」,行 hover 底色;删除钮 hover 显 danger;仍用 `title` 承载未解析提示。
- [ ] **Step 2**: 空态改为 secondary 居中 + 虚框占位;输入框样式类化并加 focus(accent 边框+光晕)。
- [ ] **Step 3**: `node --check client.js`;提交。

### Task 3: 反馈条 + 文案对齐

**Files:**
- Modify: `client.js` — 反馈渲染与字典(zh/en)。

**Interfaces:**
- Consumes: `note.kind ∈ {'ok'|'warn'|'err'}`。
- Produces: 样式类 `dsh-dock-set-toast`(含 `--ok/--warn/--err` 色变体)+ 淡出逻辑。

- [ ] **Step 1**: 反馈区改为彩色状态条(浅底+色边+小图标):成功/警告 2.5s 自动淡出(新增一次 `setTimeout` 清 note;组件 dispose 时清理),错误常驻。新增 zh/en 键(如 `setting.extraRootsBadgeOk/BadgeWarn`、分组标题键),同步注册。
- [ ] **Step 2**: `node --check client.js`;提交。

### Task 4: 验证与提交

- [ ] **Step 1**: `node --check client.js`;`node --test test/candidates.smoke.mjs`(期望 7/7)。
- [ ] **Step 2**: 人工目视:亮/暗主题下开关、整行点击、回车添加、删除、未解析徽章、三类反馈条。
- [ ] **Step 3**: 提交最终变更;更新 spec/README 相关视觉备注(如无必要可跳过 README)。

---
Self-review 结论:spec 5 节均由 Task 1–3 覆盖;无占位;类名在任务间一致(`dsh-dock-set-*` 前缀)。
