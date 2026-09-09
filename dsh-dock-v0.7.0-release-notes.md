# dsh-dock v0.7.0 — 自定义额外路径:设置页手动指路径(M2)

> 基于 **v0.6.0**(含其全部能力:自适应自动扫描 M1 + B1–B3 加固、鲸湾菜单、托盘、
> 重启、自启、设置页)。本版在候选扫描上补上 **M2**——自动扫描覆盖不到的
> **任意自定义目录**安装,现在可以在设置页手动指给扫描器,全程无需搬移安装。
> 纯 JS 改动(`candidates.mjs` / `index.js` / `client.js`),启动器 exe 不变。

## 为什么改

v0.6 的 M1 自动发现覆盖"装在某个 Node 全局 prefix 下"的场景。但用户完全可能把
dsh 复制/装进**任何文件夹**(非任何全局 prefix)——这类安装任何自动探测都无法
凭空知道。M2 给扫描一个"用户指路"的口子:设置页添加一条目录,扫描即把它当作
一个模块根去检查 `@deepseek-ai/dsh`。

> 教训:上一版曾用 harness 的客户端 `pickDirectory()` 做"浏览文件夹"按钮,在
> 设置页这种非会话上下文调用会**崩掉整个 Edge 应用窗口**。本版回归**纯手动输入**
> (已验证可用、零崩溃风险);安全的文件夹选择留待后续用 host 侧原生对话框实现。

## 新增 / 改动

| 能力 | 行为 | 入口 |
|---|---|---|
| 额外路径编辑器(设置页,v0.7) | 「额外 DSH 安装路径」区块:输入框 + 添加 + 逐条移除;每条显示是否解析到 dsh(未解析标黄、保留,装上即生效) | 设置弹窗 → DSH Dock → 额外路径 |
| 持久化 + 即时生效 | 路径存 `~/.dsh/launcher/extra-roots.json`(`{ "roots": [...] }`,容忍 BOM);保存即写文件并**静默重跑候选扫描**,picker 立刻可见(刷新失败仅提示、不阻塞保存,冷启动兜底) | 自动 |
| 扫描并入 | `scanCandidates` 在 M1 全局根后,把每条可解析的额外根也当 `global` 候选扫入,与既有去重/排序/默认逻辑一致 | 自动 |

## 实现落点

- `candidates.mjs`:新增 M2 —— `EXTRA_ROOTS_FILE`、`readExtraRoots`(BOM 容忍、
  数组/`{roots}` 双形态)、`moduleRootForUserPath`(导出,归一化 `node_modules`
  根 / 任意目录 / `@deepseek-ai` 作用域 / `@deepseek-ai/dsh` 包目录 四种粒度)、
  `extraRootModuleDirs`;`scanCandidates` 增加 M2 扫描循环。复用 M1 的
  `normalizeRoot` 做路径归一。
- `index.js`:新增 `readExtraRootsFile` / `writeExtraRootsFile` / `refreshCandidates`
  helper 与 `/launcher/api/extra-roots/{get,set}`(沿用 loopback 信任栅栏;`set`
  写文件后即时重扫;响应带逐条 `matched`)。
- `client.js`:新增 `ExtraRootsEditor`(纯手动多行列表:输入+添加、回车提交、
  逐条移除、未解析标黄、保存/刷新状态提示),挂进设置页分区;补 zh/en 文案。
  不含任何目录选择器。
- `package.json` 0.7.0;`README.md` 与新增发布说明更新。
- `assets/dsh-dock-launcher.exe`:与 v0.6.0 完全同一二进制(未重编)。

## 验证

- 冒烟测试 `test/candidates.smoke.mjs` 新增 M2 用例(离线、throwaway 目录):
  extra-roots.json 的数组/对象形态与 BOM 容忍读取、`moduleRootForUserPath` 各粒度
  归一化、以及"fake dsh 包 + extra-root 指向 → 该版本进入候选列表"的端到端断言。
- 服务器冷启动/激活路径与 v0.6 相同(M1 同步探测已被 memo 化,本版不再新增任何
  每启动的额外系统调用;M2 只在候选扫描时多读一个小 JSON)。
