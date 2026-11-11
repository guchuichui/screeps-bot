# E22S36 经济模型与只读布局规划

## 已保存的线上基线

2026-11-11 北京时间。三份成功样本的分支均为 agent-test，代码与运行时标记均为 pioneer-support-observation-v1，代码指纹为 34fe7f3a5d49f2e9b0099e9d01977f7271895817144739a479638a78cc0b2535。窗口 5 小时 7 分钟，最新快照采集时落后 11 tick。

| 样本 | Game.time | 母基地能量 | 健康 Worker / WORK | Spawn 瞬时状态 |
| --- | ---: | ---: | ---: | --- |
| 06:00 | 84194726 | 1800 / 1800 | 9 / 28 | 空闲 |
| 07:00 | 84195526 | 1150 / 1800 | 9 / 26 | 空闲 |
| 11:07 | 84198876 | 1300 / 1800 | 9 / 26 | 空闲 |

逐 Source 产量、满能量 tick、实际采集者、Worker 动作分布、Spawn 忙碌率、补能来源、建筑和工地坐标、路线拥堵及逐 Link 数据均不可用。三次空闲快照无法计算忙碌率，能量波动不足以确定补能瓶颈。实际房间的 Extension 或 Link 坐标方案需等待匹配的几何快照。

## 使用

在仓库根目录运行，输入是现有的脱敏小时监控目录。

    python tools/screeps_home_economy.py --directory <monitor-output-directory> --room E22S36 --add 10 --output home-plan.json

工具读取本地样本和内容寻址地形缓存。窗口要求同分支、指纹、运行标记和 shard，至少三点跨两小时。最新成功采样距分析时刻超过两小时、更新的采样失败、代码标记不匹配或缓存布局键不匹配时，报告仍显示可读证据，实时几何方案不可用。地形缓存必须位于监控 static 目录内并通过 SHA-256 校验。输出 JSON 的 simulation.extensions.layout 包含 50 行、每行 50 格，原点在左上。changes.add 列出候选坐标，move 和 remove 为空。工具只读输入并生成本地文件。

| 字符 | 含义 |
| --- | --- |
| # / . / ~ | 墙 / 平原 / 沼泽 |
| P / E / T / L / B / O | Spawn / Extension / Storage / Link / Container / 其他建筑 |
| S / C / M | Source / Controller / Miner 站位 |
| + / e / F | 现有工地 / 候选 Extension / 预留未来建筑位 |
| = / : | 现有道路 / 预留路径与工作区 |

## 建模与边界

- 采运。枚举每个 Source 的相邻站位，选取不重叠的 Miner 与 Hauler 交接格，以到目标建筑的负载路径成本优先、现有 Container 次优。可指定被占用站位模拟改派。优先用可接近的自有 Storage，缺失时以自有 Spawn 为补能目标，Spawn 容量与消耗可能限制实际卸货速率。以 Source 容量除以再生周期估计稳态供给上限，按未强化 WORK 计算 Miner 配置。Hauler 取 ceil(供给上限 × 往返 tick / 50) 个 CARRY，等量 MOVE；负载途经沼泽加权，空载回程另算，再加两次交接动作。超过单体能量预算或 50 部件时拆分搬运身体，Miner 不能负担或通道不可达时保留 Worker。模型返回两条路径，未来运行接入应按布局键与站位复用路径，遇阻再限次重算。
- 迁移。离线决策模型用防御、最低健康 Worker、恢复能量、Spawn 忙碌和扩张已获生产机会作为闸门。先确保运输端可用，再考虑 Miner，原 Worker 继续工作。应按新单位生产时间加抵达站位时间预留替换窗口，专职单位死亡、站位失效或接力未就绪时继续使用 Worker。当前只验证这些决策，不接入生产循环。
- Extension。保留现有建筑与工地，排除墙、天然障碍与已占用格。预留 Source 站位、Controller 范围三工作区、Storage/Link 邻接格、现有道路、到现有建筑和可达边界的静态路线。对新候选按补能成本、可达交互面和空地排序，按坐标确定平局。每次将新增格视作障碍并保留交互路线。保留既有 Extension 与工地的逐个前后成本，并单列新增建筑成本。0 表示补能者可以站在一个格子同时接触补给点和 Extension。分数是单程静态加权成本，不计实际补能队列；工地按完成后的障碍保守模拟。
- Link。按 Miner 站位、Storage 交互格、Controller 升级区识别实际拥有且激活的 Link，角色重叠时跳过。建议先补 Controller，再由 Source 向 Storage 发送；检查冷却、发送阈值与接收方容量，按发送总量保留接收空间。可用位置按当前 RCL、已建数量和已有 Link 工地计数。无候选链路时输出搬运方案。比较同一目的地的纯搬运、直连和经 Storage Link 中继。估算采用 500 能量搬运批次、50 能量 Miner 注入批次、满载 Link 流水线。中继吞吐是理想上限，受共享节点、装卸与需求限制。单跳损耗向上取整为发送量的 3%，发送冷却按两端 Chebyshev 距离计算。[Screeps Link API](https://docs.screeps.com/api/#StructureLink) · [游戏引擎 Link 处理](https://github.com/screeps/engine/blob/master/src/processor/intents/links/transfer.js) · [游戏常量](https://docs.screeps.com/api/#Constants)
- 遥测。候选 buildId telemetry-home-economy-v3 增加矿物坐标、按角色分类的已完成采集、送达、建造与升级事件，以及 Link 冷却就绪观察。只对可解析的自有行动者归因，角色取观察时状态；分布是事件量，不是完整工作时间占比。Creep 向 Spawn/Extension/Storage 的已处理转账计入送达，结构向 Creep 的 withdraw 不计为 Link 发送。按覆盖 tick 和同 epoch 的累计量计算速率，保留覆盖缺口。冷却就绪比例不代表有接收需求的可用率；路线拥堵、无法解析的行动者和全周期未覆盖数据仍有限制。[游戏事件文档](https://docs.screeps.com/api/#Room.getEventLog) · [游戏引擎 withdraw 处理](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/withdraw.js)

## 模拟结果与验收

双 Source 回归场景中，稳态上限各为 10 能量/tick，往返分别为 26、20 tick，模型给出 6、4 个 CARRY。测试场景在其容量上限内增加 4 个 Extension 候选，已建与在建两个位置的静态补能成本均保持 2。S1 到 Controller 的纯搬运、直连、中继成本约为 104、24.6、25.3 Creep 行动和移动 tick / 1000 送达能量，直连和中继的模型损耗约为 30.9、63.8 能量 / 1000 送达能量。该测试场景的坐标及估计成本仅用于验证模型。

人工部署遥测后，先确认代码与运行标记匹配并检查 CPU、Memory 大小和采集覆盖。收集至少三份同版本新鲜样本跨两小时，检查各 Source 采集量及分母、Spawn 补能量、Link 实际发送是否和游戏事件相符，再复核 50×50 方案上的 Source、Miner 站位和工作区。评估 Miner/Hauler 前应补测真实往返、拥堵及回退触发；任何将来单 Source 试点均保留 Worker，观察换代和扩张支援期间的产量与恢复能力，再决定是否扩大。Extension 迁移或 Link 建造应分别审核，当前未接入游戏指令。
