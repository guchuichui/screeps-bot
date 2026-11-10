# 紧急扩张与新基地运行指南

本分支基于 `11829902679d0003820818165eae3adbca9f8051`。母基地 `E22S36`，目标按 `E22S37`、`E22S38` 排序。没有合并到 main、没有上传游戏代码，也没有切换运行分支。新的 `Colony offline tests` 工作流只运行离线检查，不含游戏凭证或部署步骤；原部署工作流与 `upload.py` 均未修改。

## P0 根因与逐项排查

旧提交的实际执行链是 `main.js -> starter.colony.js -> expansion.manager.js -> expansion.claimer.js`。旧 role.*、mount.* 和生产队列均未接入，未进行修改。

1. `expansion.claimer.travel()` 在一次 `findClosestByPath()` 返回 null 后立即产生 `failed: true, code: EXIT_UNREACHABLE`。这不能证明出口永久不可达。
2. 旧 `expansion.manager.fail()` 无条件删除 `task.creepName`，但 `trySpawn()` 仍统计所有携带 expansionTask 的存活单位。结果是孤儿单位不再执行、又占用派遣名额。已用 `(34,21)`、TTL 450、先 null 后返回 `(24,49)` 的测试重现并验证修复。
3. 旧 GCL 检查位于 Claimer 执行前，导致 GCL 不足时连移动都停止。现在 GCL 约束新派遣和相邻 Controller 的 Claim 动作，现有单位仍可行进；API 返回 GCL 不足时等待，不攻击或自动 Reserve。
4. 旧 blocked/failed 分支在检查单位死亡前返回。现在可恢复旧错误会重新执行，耗尽路径恢复预算的活单位保留绑定；死亡后按派遣预算补充。敌方所有权等安全阻塞不会自动解除。
5. 旧 MISSION_TIMEOUT 按墙钟 tick 计时，混入出生、CPU 等待和暂停。现在不以这个时间直接终止活单位，依靠 TTL、实际位置变化和有限重寻路。真正连续执行且长期不动仍触发 NO_PROGRESS。
6. 出口先处理当前边界，再选择可达出口；忽略暂时的单位占位寻找出口，失败时重新搜索全部候选出口。进入目标房时先朝内走，避免入口边界来回切换。
7. CPU 等待、异常、阻塞原因会写入 Memory。Claimer 诊断含任务、房间、坐标、TTL、动作返回码和恢复次数；Pioneer/经济单位有 lastAction。异常保留堆栈并按间隔输出，避免仅静默捕获。

恢复绑定只选择任务 ID、home、targetRoom 和角色完全匹配，且仍有 CLAIM/MOVE 的存活 Claimer。多个候选时按 TTL、名称确定唯一执行者，其他单位不重复执行 Claim，也不触发额外生产。原派遣次数不会清零。修复代码启用时若原单位已死亡，则按原有预算补派；本分支未在游戏里恢复任何具体单位。

## 架构和持久化

`Memory.expansion.tasks['E22S36:E22S37']`、`['E22S36:E22S38']` 保存各任务的阶段、状态、Claim 次数、路径恢复次数、失败记录、Spawn 方案、施工预算、支援预算和最近诊断。

完整阶段：`SCOUT -> CLAIM -> CLAIMED -> SPAWN_PLANNING -> BUILD_SPAWN -> BOOTSTRAP -> STABLE`；永久错误或恢复预算耗尽进入 `BLOCKED`。阶段变化进入日志和最多16条的 stateHistory。CLAIMED 可以在同一 tick 继续规划，不要求停留一整 tick。

`Memory.colonies[roomName]` 独立保存本地人口目标、生产记录、施工节奏和健康观察窗口，不反复覆盖扩张任务。Global Reset 后从 Memory 和当前 Game 对象重建引用，没有把 Game 对象缓存在持久状态里。

第一目标尚未 STABLE 时，不启动第二目标的新 Claim 或母基地支援。已存在的其他目标单位仍按自己的任务执行，避免因排序变化被遗弃。第一基地失稳时会回到 BOOTSTRAP，并暂停第二目标的新资源投入。

STABLE 是程序的运行门槛，不是已完成游戏内验收的声明：需有 Spawn、RCL2、足够健康的采集者和升级者、无敌人、无在途 Pioneer、至少两次成功本地生产，以及连续300 tick 达到能量门槛。母基地资源、GCL、CPU 仍需满足条件才推进下一目标。

## 启停与预算

`code/expansion.config.js` 当前显式启用 enabled、autoClaim、autoBuildSpawn、autoBootstrap，emergencyStop 为 false。房间名仅由该配置指定。启用前检查 Memory 中是否已有覆盖值。

运行时可以用 `Memory.expansion` 上同名布尔字段覆盖配置，无需重新上传代码：

```javascript
Memory.expansion.emergencyStop = true;  // 全部扩张、Pioneer、新基地经济暂停
Memory.expansion.emergencyStop = false;
Memory.expansion.enabled = false;      // 同样暂停上述新功能
Memory.expansion.enabled = true;
Memory.expansion.autoClaim = false;    // 暂停 Claimer 移动/Claim和新增派遣；不取消已确认占领
Memory.expansion.autoBuildSpawn = false; // 保留选址方案，停止首个Spawn工地创建和Pioneer建Spawn
Memory.expansion.autoBootstrap = false; // 暂停Pioneer和本地经济/本地建设；已有标签不被旧逻辑接管
```

全局急停不停止原母基地 worker、既有防御代码或已经提交给游戏的上一 tick 指令。暂停新基地经济也会暂停其维护，因此仅用于短时检查。关闭 autoBuildSpawn 只控制首个 Spawn，已建成基地的普通建筑由 autoBootstrap 控制。

暂停/继续单个目标：

```javascript
Memory.expansion.tasks['E22S36:E22S37'].paused = true;
Memory.expansion.tasks['E22S36:E22S37'].paused = false;
```

默认限制：全局最多1名 Claimer；每目标最多2次成功 Claim 派遣。每个活单位最多5次连续无进展重寻路，递增冷却5至25 tick；真实位置变化才恢复这项连续失败预算。永久生产错误最多3次。

母基地保留300可生产能量，先满足原人口策略及健康 worker 要求。每目标最多2名有效 Pioneer，允许一名低TTL替补重叠；全局最多3名 Pioneer。每目标最多12次支援派遣、累计10000能量 Body 预算，间隔至少50 tick。母基地只有超过10000储备的 Storage/Container 才允许先锋出发前取能，不取 Spawn/Extension 能量；无安全储备时空载出发在目标采集。

Pioneer Body 根据可用预算和已知房间地形抽样调整 MOVE，替补预留250 TTL。抽样不等于精确路线地形验证。生产不足会写入 supportWait/supportResult，不保证任何能量容量的母基地都能立即支援。

本地经济人口上限12，按自身 colony/home 统计，不计其他基地工人。无有效采集者时优先生成 `[WORK,CARRY,MOVE]`（200能量）；不足200能量时等待或由母基地受控援助，不生产缺少基本部件的廉价单位。

## Spawn 与建筑

首 Spawn 使用确定性距离、地形和扩展空间评分。候选避开房间边缘、资源、Controller、现有结构、工地；要求足够相邻站位和周围空间，验证删除候选格后重要点与出口仍连通。扫描每次125格，保存扫描游标和最佳点，Global Reset 不丢进度。

选址保存到 task.spawnPlan，包含未来核心建筑和 Extension 的空间预留。这是启动布局，不是完整终局基地设计；没有优化 Link 网络。已有自有 Spawn 或 Spawn 工地优先复用。敌方残留结构作为障碍物，不自动接管、拆除或绕过所有权检查。

工地每次请求间隔100 tick、每目标最多5次；全局工地接近上限时不发请求。已有工地、同tick意图和冷却防止重复创建。非法位置会排除并有限重选；无合法位置、连通性失败等明确阻塞，等待人工检查。

本地规划每25 tick检查一次，保持最多2个本地工地，按RCL限制安排 Extension、首 Tower、采集 Container和必要道路；稳定且RCL4后才复用既有高等级 planner。Builder优先核心工程，没有工程时升级；Controller降级风险优先处理。Source站位按存活单位占用分配并在死亡后释放。

## 快照与诊断采集

仓库没有目标房间的真实 Terrain、建筑和 Controller 快照，未验证实际坐标。游戏有视野时，在 Console 执行：

```javascript
JSON.stringify(require('expansion.planner').snapshot('E22S37'))
JSON.stringify(Memory.expansion, null, 2)
JSON.stringify(Memory.colonies, null, 2)
Game.creeps['expansion-E22S36-E22S37-84189524'] &&
  JSON.stringify(Game.creeps['expansion-E22S36-E22S37-84189524'].memory)
```

snapshot 包含2500格地形（按 y*50+x，0平原/1墙/2沼泽）、资源、Controller、结构、工地及采集tick。无视野时返回 NO_VISION，不假设目标空置。Console 输出太长时，可先保存 `global.roomSnapshot = require('expansion.planner').snapshot('E22S37')`，分开输出 terrain 与其余字段。

## 已执行的离线检查

```text
node tests/expansion.test.js
54 tests passed

对 code/ 下每个 .js 执行 node --check
36 JavaScript modules: syntax OK
```

测试含移动/边界、EXIT_UNREACHABLE暂时失败和旧孤儿恢复、恢复上限、GCL等待、已有所有权、敌方占领、Spawn选址/去重/错误限额、Pioneer施工/防降级/转换角色、本地恢复生产、母基地保护、Global Reset、CPU等待、启停、多Spawn意图去重、多房间隔离和本地人口上限。

端到端简化模拟共1837 tick，第一目标经历占领、Spawn建设、BOOTSTRAP并达到STABLE判定；中途重载模块保留Memory。共生产8个单位（包含稳定后允许的下一目标Claim意图）、采集10520能量、运输3743能量、建设34545进度，母基地支援Body花费2000能量。

模拟地形为开放平原，支持能量余额、行动距离、出生时间、TTL、Source再生和RCL变化；母基地基础经济由外部供能模拟，真实防御、完整寻路/疲劳/拥堵、服务器意图竞争和真实CPU消耗不在模型内。不能据此宣称游戏中已经自给自足。

## 游戏验收顺序

1. 保持当前游戏分支，审阅此PR。不要为了测试合并 main；现有 main 工作流会自动上传 agent-test。
2. 人工将本分支上传到一个独立游戏代码分支。上传工具不会自动选择游戏运行分支。本任务没有执行这一步。
3. 切换前保存原代码分支及 Memory.expansion/Memory.colonies 快照；先急停或关闭自动施工、自动Bootstrap，检查配置和房间快照。
4. 人工切换运行分支，解除急停，先确认仍存活的原 Claimer 恢复绑定并继续移动；若已死亡，确认预算内最多补派一次，没有大量重复出生。
5. 验证出口、Controller实际可达性、目标所有权、GCL与CPU。观察诊断至少一个完整出口跨越；失败时检查具体返回码，而非直接删除整个Memory。
6. 核对 task.spawnPlan 与真实地形、关键通道、残留建筑。允许 autoBuildSpawn 后检查只有一个合法Spawn工地；观察至少一个Pioneer完成采集、防降级与建设循环。
7. 开启 autoBootstrap，观察Spawn完工、Pioneer转换、本地三种经济角色生产、母基地支援停止、本地至少一轮死亡替补。单独验证能量不足恢复及防御，不在World中无保护地故意杀光所有工人。
8. 记录实际CPU、能量收支、Source占用、Controller计时，确认稳定窗口和第二目标推进合理，再认定真实自给自足。遇到问题立即暂停目标或急停，提供快照与日志。

## 人工恢复与回滚

普通暂停/继续不会清空尝试次数。路径恢复耗尽后，先检查道路、敌情和单位TTL；只有问题已经解决且准备继续使用原单位时，显式清理路径恢复锁，保留派遣预算：

```javascript
var task = Memory.expansion.tasks['E22S36:E22S37'];
task.pathRetries = 0;
delete task.recoveryExhaustedFor;
delete task.nextPathRetryAt;
task.status = 'waiting';
task.state = Game.rooms[task.targetRoom] && Game.rooms[task.targetRoom].controller.my ? 'CLAIMED' : 'CLAIM';
task.lastProgressAt = Game.time;
```

该操作只适用于已排除原因的路径错误，不应用来绕过敌方所有权、非法施工或不足的GCL。施工与支援预算用尽时先急停、核查原因，再有意识地修改相应预算字段；代码不会自动无限清零重试。不要删除整个 Memory.expansion，以免丢失已消费预算。

回滚代码前先急停新功能。若回到1182990，其旧调度不认识新本地角色，不宜直接在已有新基地工人时长期运行；优先在本分支关闭相应功能，保留标签隔离并安排人工维护。需要代码回退时，将修复保留或使用能识别 colony 标签的停用版本。Git可以按提交逆序revert五个提交，但这不会退还能量、撤销Claim、移除工地或维持被停用基地的Controller。禁止自动unclaim和未经确认的拆除；代码中没有这些调用。

## 修改文件

- 修改：`code/expansion.manager.js`、`code/expansion.claimer.js`、`code/expansion.config.js`、`code/starter.colony.js`、`code/README-starter.md`、`tests/expansion.test.js`。
- 新增：`code/expansion.control.js`、`code/expansion.planner.js`、`code/expansion.travel.js`、`code/expansion.pioneer.js`、`code/colony.work.js`、`code/colony.worker.js`、`code/colony.planner.js`、`code/colony.manager.js`。
- 新增测试与文档：`tests/world.js`、`tests/scenario.js`、`tests/check-syntax.js`、`.github/workflows/colony-tests.yml`、本指南。
- `main.js`、`starter.worker.js`、`starter.defender.js`、`starter.planner.js`、旧版role模块、原部署工作流和上传目标均未修改。
