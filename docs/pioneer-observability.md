# PR #1：首 Spawn 无建造者的诊断与修复

## 已确认的证据

PR #1 合并提交为 `f1e63481f91126e7e099c9861da04e0adc917a55`。GitHub [部署运行42855157497](https://github.com/guchuichui/screeps-bot/actions/runs/42855157497) 成功，上传步骤日志含目标 agent-test 和“上传成功”。这确认当时上传成功，不证明当前仍激活该分支或后续没有被覆盖。

用户在 shard3 提供了两个只读 Console 快照。仓库测试保留了明确标记为 subset 的相关字段：

| 时间 | 已确认事实 |
| --- | --- |
| 84190457 | E22S37 owned=true、Spawn=0、Spawn工地0/15000、Pioneer=[]、任务BUILD_SPAWN；CPU bucket=10000、used约2.88/limit20；母基地494/1800能量；最近支援等待是84190386的HOME_WORKFORCE_WAIT。 |
| 84190469 | E22S36 RCL6，无敌人、无工地，能量104；initial正在生产worker，剩11 tick；7名worker含1名出生中，5名存活worker的TTL分别为5/20/53/65/82；只有1名非出生中的worker达到150 TTL门槛，具有12 WORK。 |

这不是“看不见工地”或“Pioneer已到达但不工作”：快照明确有工地且没有Pioneer。该时间点没有展示CPU瓶颈；但单次CPU读数不能排除其他tick超预算。没有支援预算耗尽或Pioneer移动错误的证据。当前激活分支仍未知，因为Console快照不含HTTP分支元数据。

## 经代码和回归确认的阻塞链

1. `starter.colony` 只有在所有本地worker/defender目标已满足后，才调用 `expansion.manager.trySpawn()`；人口达到cap时也会先返回。
2. RCL6、无本地工地时，原worker目标为9；快照只有7，且1名正在生产。此时本地调度选择继续生产worker，不进入扩张生产入口。
3. 即使进入扩张入口，旧逻辑仍要求健康worker数量达到完整目标9；快照仅有1名达到150 TTL，因此记录过HOME_WORKFORCE_WAIT。
4. 494能量也不足最小Pioneer的250 Body+300保留。两tick后生产了worker，之后快照显示能量104和Spawn忙碌。现有信息不能保证修复一启用就能立即生产先锋；母基地必须先恢复关键人口和能量。
5. 旧入口前的等待没有每tick记录，所以supportWait早于第一个快照71 tick，不能当作当前唯一等待原因。

原代码确实存在这些门槛，用户快照验证了相关门槛在当时成立。无法根据这两个时间点宣称此后所有tick都受到同一个门槛阻塞。

## 最小修复范围

没有重新设计经济系统、改动选址算法或拆除/重建现有工地。

- 必要Pioneer走独立 `trySupport`，位于非关键满编目标与人口cap之前。Claimer仍保持原完整人口门槛。
- 至少2名非出生、TTL>=150、拥有WORK/CARRY/MOVE的母基地worker，合计至少6 WORK，且无敌人，才允许支援；绝不抽走现有工人。快照中的1名健康工人仍会优先补员。
- Body预算最多500，保留300生产能量，避免先锋长期占用出生时间。原支援累计能量、次数、人口、冷却预算均保留。
- 若仅缺少能量，可暂缓非关键生产最多50 tick，为支援积累能量；窗口结束后至少100 tick不继续占用这一机会。每tick重查敌情和关键人口，不满足立即让位母基地。
- 已确认占领、上次无Spawn的房间失去视野时，可发送一名Pioneer恢复视野；已有同任务Pioneer时不叠加，最多2次、间隔500 tick，并计入原支援总预算。到达后重新验证所有权，绝不根据旧Memory直接建设敌方房间。
- 每次支援检查保存 supportCheck（tick、原因、所需/可用能量等），不再仅在部分失败分支留下旧字符串。

## 观测和版本

新增游戏模块 `expansion.observe`。`snapshot()` 只读取Game/Memory，不发移动、生产、建设等意图，也不写Memory。主循环每25 tick调用其 `run()`，仅保存一份覆盖式Telemetry到 `Memory.expansion.observation`。异常摘要、支援判定、房间/工地、单位/角色、TTL、CPU和Spawn忙碌情况可被外部GET读取。Telemetry独立于扩张开关，方便急停时诊断；可通过配置observabilityEnabled关闭。

运行标识为 `pioneer-support-observation-v1`。它不是Git SHA，也不证明已经上传。外部工具同时获取当前active代码、模块SHA256、运行标识和观测tick；活跃代码与Telemetry版本不一致或Telemetry过旧会报告。主循环异常仍然重新抛出给Screeps，同时在finally采集可用诊断；不把异常静默吞掉。

人工Console即时读取（此修复代码启用后）：

```javascript
JSON.stringify(require('expansion.observe').snapshot())
Memory.expansion.observation && Memory.expansion.observation.buildId
```

PR #1 原代码不包含此新模块，当前线上不能执行上述require。可以继续使用本次对话中已执行的原生Game/Memory快照命令。

## 独立只读工具

工具位于 `tools/screeps_diagnose.py`，Python3.10+，仅标准库，不放入 `code/`，因此上传脚本不会将它上传到游戏。

Screeps官方说明HTTP端点没有稳定的公共Web API文档，但允许使用服务器客户端接口和受限Token。参考：[官方Token说明](https://docs.screeps.com/auth-tokens.html)、[官方后端user路由](https://github.com/screeps/backend-local/blob/master/lib/game/api/user.js)、[官方后端game路由](https://github.com/screeps/backend-local/blob/master/lib/game/api/game.js)。后端开源实现用于确定请求格式，不保证World所有端点行为永远相同；接口拒绝时工具明确输出未知/错误，不推测数据。

最小权限：Token只允许 `GET /api/user/code`、`GET /api/user/memory`。额外读取公开的 `GET /api/game/time` 不发送Token。无需写代码、写Memory、Console执行、切换分支、市场或WebSocket权限。主Memory端点的授权本身并非只限expansion路径；本工具只请求该路径。

Token在Screeps账号设置中生成后，通过安全的本地环境配置提供：

- `SCREEPS_TOKEN`：只读Token，必需；不得写入仓库、命令行参数、聊天或日志。
- `SCREEPS_SHARD=shard3`：本次故障所在shard，必需；也可传`--shard shard3`。

从仓库根目录运行：

```powershell
$env:SCREEPS_SHARD = 'shard3'
# SCREEPS_TOKEN由你在本地安全配置；这里不包含任何Token值。
python tools/screeps_diagnose.py --shard shard3 --expected-branch agent-test
python tools/screeps_diagnose.py --shard shard3 --code-dir code --fail-on-alert
```

三种GET分别获取当前 `$activeWorld` 代码及实际branch名称、expansion Memory（支持gz:压缩）、服务器tick。工具不列举或创建分支，不请求POST，不执行Console代码，不下载Token，也不自动重试。拒绝HTTP重定向，避免将X-Token发送到其他主机；HTTP错误不输出响应体、认证头或原始异常URL。

**运行版本验证**：`activeCode.branch` 应为预期分支；`activeCode.sha256` 是当前模块内容指纹；指定`--code-dir code`可比较与本地代码是否一致；`activeCode.buildId`应与`facts.runtimeBuildId`一致，观测tick也应接近serverTick。仅GitHub上传成功、Memory有旧状态或网页标签显示某分支都不足以证明新代码正在执行。

本次执行环境没有SCREEPS_TOKEN，未读取实时账号API。通过用户Console快照完成故障确认。你可将Console输出保存为JSON后完全离线处理：

```powershell
python tools/screeps_diagnose.py --snapshot snapshot.json
# 可多次传入--snapshot合并带时间标记的快照。
python tools/screeps_diagnose.py --snapshot tests/fixtures/pioneer-console-84190457.json --snapshot tests/fixtures/pioneer-console-84190469.json
```

没有Token时直接运行工具仍输出JSON错误MISSING_SCREEPS_TOKEN，不虚构活跃分支或单位数。退出码：0=报告已生成；1=启用--fail-on-alert后存在告警；2=配置/API/读取错误。status=partial表示仍有未知信息，不能当作健康证明。

最新日志指的是Memory内的lastAction、lastError、supportCheck、lastResult，并非完整历史Console日志。工具不会冒用Console写权限来读取信息；既往未持久化的Console输出需要用户提供或额外只读WebSocket订阅方案，目前未实现。

## 验证与后续操作

```text
node tests/expansion.test.js
62 tests passed
python -m unittest discover -s tests -p "test_*.py" -v
13 tests passed
node tests/check-syntax.js
38 JavaScript modules: syntax OK
```

回归覆盖真实Console数据、关键工人不足仍保护母基地、恢复关键工人后不再等待RCL6满编、无敌情的非关键defender缺额、能量保留窗口上限、遇敌立即释放、视野恢复上限与Global Reset、只读观察无游戏意图，以及HTTP方法/权限错误、gzip、凭证脱敏、旧观测/版本不一致和缺少实时字段不伪造。

端到端简化模拟仍可完成建Spawn和独立经济：本次较小先锋Body使其耗时2265个模拟tick、支援Body总花费1000能量。此结果不验证真实地图、疲劳、拥堵、CPU或线上部署后的表现。

建议由Agent或本地任务调度器每5分钟执行一次工具。默认Token主Memory限额1440次/日、代码60次/小时，三GET一次的此频率低于所列限额；还需考虑同账号其他工具的使用。不要高频轮询或自动解除限流。报告仅发给当前用户；本任务没有创建后台定时任务或向其他人发送消息。

Agent每次应检查：当前branch/指纹、Telemetry新鲜度、目标有无Spawn/工地、Pioneer是否出生/到达、施工进度是否增长、母基地关键工人数和能量、supportCheck、预算以及lastAction/lastError。比较连续两次报告；只在持续无进度、错误、恢复或版本变化时汇报，不把正常短暂生产等待当作已确认故障。用--fail-on-alert接入监控时也必须审阅unknown和status，未知不是正常。

本次只提交独立修复分支，不切游戏分支、不修改main、不自动部署、不重置旧预算或Memory。之后由用户决定如何上传和激活。启用后先确认只有1名健康工人的阶段仍补员，待至少2名健康工人和6WORK、至少550平原派遣能量且Spawn空闲时，观察必要Pioneer得到机会；确认已有Spawn工地进度增长，不创建重复工地。异常时使用既有emergencyStop或暂停任务，并保存新snapshot。
