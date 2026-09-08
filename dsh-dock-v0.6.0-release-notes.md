# dsh-dock v0.6.0 — 自适应候选发现:跨 Node 自动探测

> 基于 **v0.5.0**(含其全部能力:鲸湾菜单、共存改造、语言跟随、托盘、重启、
> 自启、设置页)。本版只改**候选扫描**这一面,且只做**自动发现(M1)**——
> 扫描不再假设 dsh 装在哪一处:它自动扫过本机各常见全局安装位,逐个去重
> Node 探测权威全局 prefix。纯 JS 改动(`candidates.mjs`),启动器 exe、host
> 路由、client 与设置页**均未改动**(与 v0.5.0 同一套)。

## 为什么改

不同用户把 dsh 装在**不同的 Node / 不同的全局 prefix** 下是常态。v0.5.0 及更早
的候选扫描只认运行 Node 的全局 prefix 与 roaming npm(外加两个固定源码检出
目录),用其它 Node / 其它 prefix 装的全局 dsh 看不到。v0.6 让扫描反过来适应
安装:本机能探测到的全局位都扫一遍。

> 自定义目录里的安装(非任何全局 prefix)本次**不做**——那需要"手动指路径"的
> 能力,留待后续版本;本版先交付可零配置覆盖主流全局安装场景的自动扫描。

## 改动(candidates.mjs)

- 新增 `discoveredNodeExecutables`:探测本机所有可能装着全局 dsh 的 Node——
  运行 Node + **WinGet** `OpenJS.NodeJS.*` 各版本 + **nvm-windows** 各版本
  (Windows),去重。
- 新增 `npmGlobalRootFor` / `npmCliFor`:对每个去重 Node 跑 `npm root -g` 取
  权威全局模块根(有界 8s 超时,失败则回退);配合既有 `globalRoots` 合并。
- 新增 `allGlobalRoots`:运行 Node 全局根 ∪ 每个发现 Node 的 `npm root -g` ∪
  其 `dirname(node)/node_modules` 兜底,去重。
- `scanCandidates` 改为遍历 `allGlobalRoots`(原 `globalRoots` 保留导出)。
- 新增一次 `child_process.spawnSync` 依赖(每发现 Node 各一次,`npm root -g`),
  模块仍是纯 node,无 host import。

## 验证(本机实测)

- M1 扫描返回该机器全局 Node 的 dsh(alpha.4)与源码检出(alpha.1),运行正常,
  含 `npm root -g` 探测路径。
- 不影响其它候选类型(npx 缓存 / 源码检出)与默认/切换逻辑;冷启动卡片呈现、
  选择、batch 落盘逻辑不变。

## 文件结构

- `candidates.mjs`(唯一改动的代码文件)
- `package.json` 0.6.0;`README.md` 增自适应扫描说明;新增本发布说明。
- `assets/dsh-dock-launcher.exe` 与 v0.5.0 完全同一二进制(未重编)。
