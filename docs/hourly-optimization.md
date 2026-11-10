# 每小时观测与夜间优化

本改动只补足观测、确定性分析和离线测试，不改变采集、物流、人口预算、布局或 Link 调度算法。线上仍运行 `pioneer-support-observation-v1`；候选游戏内版本为 `telemetry-hourly-v2`，本 PR 不部署、不切换游戏分支、不修改线上 Memory。当前数据不足以支持经济优化收益结论。

## 运行与安全边界

Windows 任务 `Screeps-Hourly-ReadOnly` 每 60 分钟运行现有包装脚本：

```powershell
python C:\Users\ZISHAO\Documents\Codex\2026-11-10\du\work\screeps_monitor_once.py
```

包装脚本导入仓库外 `work/screeps_runtime` 的固定副本，独立于 Git checkout。配置 `config.json` 包含 tokenFile、shard、homeRoom、targetRoom、targetRooms、outputDir；只保存凭证文件路径，不保存凭证值。Token 只在 Python 进程内读取，使用最小只读权限 code/memory；客户端只 GET 代码、expansion Memory、公开 time，禁止跳转、Console、游戏写请求。若权限不够只报告错误，不升级到全权限。

手动安装或验证计划任务（按本机绝对路径替换参数）：

```powershell
& D:\Game\Screeps\screeps-upload\tools\register-screeps-hourly.ps1 -PythonPath D:\Python\anconda\install\python.exe -SamplerPath C:\Users\ZISHAO\Documents\Codex\2026-11-10\du\work\screeps_monitor_once.py
& D:\Game\Screeps\screeps-upload\tools\register-screeps-hourly.ps1 -VerifyOnly
```

脚本从实际任务 XML 检查 PT1H=60 分钟和 IgnoreNew，不依赖任务描述。任务限时 5 分钟，Python 再使用 OS 文件锁，崩溃后由 OS 释放。旧 Codex 五分钟调度已删除。运行要求 Windows 用户登录、电脑开机；未启用唤醒。每小时采样无需 Codex App 运行。禁用：`Disable-ScheduledTask -TaskName Screeps-Hourly-ReadOnly`。启用使用对应 Enable 命令。不会补采漏掉的小时。

输出保存在仓库外 `outputs/screeps-monitor`：时间戳 samples、latest.json、last-success.json、history.jsonl、analysis-latest.json、alerts-latest.json。失败或快照过期不覆盖最后成功记录。原有历史保留。地形按 SHA256 单独缓存；布局仅改变时产生新缓存。缓存、数据、配置和凭证不提交 Git。P0 只写本地 alerts 文件，不每小时唤醒 AI，也不发送外部消息。

离线重新分析，不发 API 请求：

```powershell
python D:\Game\Screeps\screeps-upload\tools\screeps_analyze.py --directory C:\Users\ZISHAO\Documents\Codex\2026-11-10\du\outputs\screeps-monitor
```

## 数据来源和含义

HTTP GET Memory 只能获得游戏代码已发布的字段，不直接提供 Game.rooms 对象。缺失字段标为 unavailable。部署候选代码前，旧版本的扩张、CPU、健康工人、支援预算等数据可继续读取，Source/Link 等详细数据不可用。

候选模块 `telemetry.detail` 采集可见房间的 Source、邻近候选工人/记忆分配/事件确认采集者、有效部件、TTL、能量负载、角色任务、建筑/工地、RCL 上限、Link 邻接关系和地形。无视野就缺失，不猜测。采集站位排除天然和不可通行建筑障碍。静态路径有搜索与 CPU 限制，不代表真实动态旅行时间；无 Spawn 无路径测量，Chebyshev 值只是距离下界。

`telemetry.metrics` 每 tick 累计观测覆盖、Source 满能量、相邻 WORK、单位空载/未移动、Spawn 忙碌、Controller 可观察进度及任务耗时。持久化 epoch、缺失 tick 数，Global Reset 不清空；删除计数器后的新 epoch 不跨段计算。空载或静止不等于卡住：采集/升级时也可能静止，规则只给候选证据。异常数量是去重的持久化错误记录数量，不能视作所有抛出次数。生产成功表示 spawnCreep 返回 OK 的意图，不声称已经出生。

使用官方 `Room.getEventLog()` 的前一 tick 事件累计实际采集 amount、Controller amount/energySpent、能量移动和 Link 发送事件。记录 eventTicksRead；采集速率只以覆盖事件 tick 为分母，不外推缺失时段。能量移动包含 withdraw/transfer/Link，属于总移动量，不是净运输收益；Link 接收损耗后数量不推算。API/字段不可用和 CPU 跳过均显式标记。harvestActors 只保留最近 100 ticks；少于 25 ticks 的事件才列作近期采集证据。

参考官方字段说明：[Room.getEventLog](https://docs.screeps.com/api/#Room.getEventLog)、[Source](https://docs.screeps.com/api/#Source)、[StructureLink](https://docs.screeps.com/api/#StructureLink)。HTTP 只读客户端沿用已验证接口，服务端拒绝权限会保留安全错误码，不输出认证信息。

CPU 防护：90% 时跳过累计扫描，85% 时跳过事件/详细快照，70% 时跳过静态路径。可通过 `telemetryEnabled=false` 关闭新增遥测，`observabilityEnabled=false` 关闭全部观测。首次扫描和 Memory 序列化实际成本需要部署后验证，离线测试不能证明线上 CPU 收益。

## 确定性规则与夜间处理

Python 分析同一代码指纹的新鲜成功样本，去除相距不足 30 分钟的重复点；至少 3 个样本且跨越 2 小时才生成长期候选。单个快照只用于即时风险，小时快照不能计算精确每 tick 效率。Source 满能量无人候选、WORK 潜在不足、物流长期空载、Spawn 空闲且有生产需求/能量等待、存储积压、Controller 进度异常、CPU、Pioneer 停工、Link 和路径规划分别给证据与缺失状态。

夜间集中 Codex 任务在 Asia/Shanghai 每天 04:30 读取本地报告，最多选择一个主要优化目标；20 分钟、约 20000 新 Token 是工作预算目标，并非平台强制限额。应用需保持运行。`nightly-state.json` 记录当晚 PR 配额，遥测基础 PR 也计入一晚一个限额。数据不足就报告等待，不改核心策略。严重异常优先在该轮处理；未配置额外 AI 即时唤醒。

允许修改仅限独立分支 `codex/optimize-<topic>-<date>`、离线测试、提交与 PR。禁止合并、部署、改游戏 Memory/参数、建拆建筑或切换游戏分支。优化前写基线证据，后写测试结果；模拟收益不得标为线上收益。早晨报告位于仓库外 `outputs/screeps-monitor/morning/`。

## 验证与回滚

```powershell
node tests/check-syntax.js
node tests/expansion.test.js
python -m unittest discover -s tests -p 'test_*.py' -v
git diff --check
```

测试覆盖纯读取快照、事件 amount/覆盖缺失/去重、CPU 与开关、Global Reset、单实例锁、失败隔离、凭证脱敏、缓存、不同版本/稀疏趋势。测试使用模拟世界，不是游戏验证。

人工审核部署后检查 activeCode.branch=agent-test、buildId=telemetry-hourly-v2、observationAgeTicks<=100、telemetry.available=true、eventLogStatus 与 coveredTicks 增长；然后积累至少两小时可比数据，检查 CPU/Memory 与原版本基线。不要自动更改线上开关。若有问题，人工回退游戏运行代码或关闭新增遥测，Git revert 本 PR；本机观测可独立禁用任务并恢复旧包装脚本备份，最后成功记录不删除。
