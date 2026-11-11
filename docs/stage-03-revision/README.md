# 阶段 03 修订｜E22S36 施工清单

本版替代方案 A 中有冲突的布局和 Link 决策。[原方案 A 与 B](../stage-03/README.md)保留为历史对照。此清单是人工施工审查输入。

线上依据为 shard3 北京时间 2026-11-11 14:00，tick 84201211。agent-test 的代码与运行时均为 telemetry-hourly-v2，采集时快照落后 25 tick。E22S36 布局键仍为 70f4d3f4，与已校验的 13:00 几何、地形和 13:47 公共矿物查询一致。RCL6 的 Extension 限额为 40，已建 30，工地 0，剩余 10。E22S37 为 RCL2，有 Spawn、Container 和两个 Extension 工地，任务显示 STABLE；保留母基地支援与本地生产失效时的恢复入口。14:33 的 E22S37 无凭证只读查询在 (13,23) 发现一个有 283,011 能量的废墟与一个空废墟。该库存会随使用和衰减变化。

## Extension 与道路

| 顺序 | 动作 | 坐标 |
| --- | --- | --- |
| 1 | 人工复核 RCL、站位和工地，先完工全部 10 个新 Extension | (34,15)、(34,13)、(38,13)、(35,13)、(37,13)、(34,12)、(33,12)、(32,11)、(33,11)、(30,11) |
| 2 | 确认 40 个 Extension 已完工、可用、可补能后，逐批审批退役 | X39 (39,18)；X38 (38,17)、(38,21)；X32 (32,17)、(32,18)、(32,19) |
| 3 | 逐段补路并核对 Spawn、两处 Source 站与 Storage 的通行 | 全部 43 个 Road 坐标见 coordinates.json；其中 (39,19) 要等旧 Link 退役 |

X39 通道为 y=13–26，y=12/27 为天然墙。X38 在 Tower (38,20) 两侧预留 (38,14)、(38,17)、(38,21)、(38,24) 会车位，Tower 与其 Rampart 均保留。X32 的 y=17–19 是西侧接入段，y=16/20 天然墙截断纵向贯通。S1 唯一站 (29,23)、S2 选定站 (37,27)、原 Spawn (35,19) 与 Storage (36,16) 保留。

每批拆除均需人工批准。10 个新增全完工后理论房间产能容量由 1800 变为 2300，三批完成分别为 2250、2150、2000。六个旧位由前十个新增位补足，完工阶段保有 34 个 Extension 与 6 个空名额。未强化建造估算为 Extension 30,000 能量，Road 24,900 能量。E22S36 的半径式自动选址在候选代码中停用，避免先占这 10 个名额。已存在的工地仍可由 Worker 正常建造。

| 静态路径 | 现状 | 全部 10 个 Extension 完工 | 分批退役并铺路，尚保留旧 Link |
| --- | ---: | ---: | ---: |
| S1 交接位 → Storage | 43 | 43 | 14 |
| S2 交接位 → Storage | 58 | 58 | 24 |
| Storage → Controller | 67 | 67 | 32 |
| Storage → Spawn | 59 | 59 | 26 |

路径是地形与结构约束下的同口径静态模拟，进入道路/平原/沼泽计 1/2/5，动态会车与实测吞吐仍需验证。施工进度、可补能容量和费用是模拟或理论值。复核每批完成后的 Spawn 进能、Source 站位和通道占用后再继续。

    python tools/screeps_stage03_revision.py docs/stage-03/coordinates-and-costs.json --output docs/stage-03-revision/coordinates.json

## Link 退役与后续布局

审计范围为代码仓库全部 Link 引用。主循环使用 starter.worker 与 colony.worker，采集和 Spawn 补能不依赖 Link。移除了无人调用的 role.link.js（包含旧房间硬编码 ID 和未保护的查找结果），移除历史 role.base.js 的优先 Link 补能分支，并从通用规划器移除 Link 自建。现在线上仍是旧版本，旧规划器具备自动补 Link 的逻辑。等待人工审批并确认规划保护已生效后再退役。零 Link、单 Link、双 Link 与 Link 工地模拟均完成 Worker 采集和 Spawn 补能。

| 时点 | 角色 | 坐标 |
| --- | --- | --- |
| 全部 10 个 Extension 完工，人工审批后 | 退役两处旧 Link，可同批 | (31,18)、(39,19) |
| 旧 Link 退役后 | 完成 X39 通道铺路 | (39,19) |
| RCL6，另行审批 | Storage 接收 Link | (37,14)，共用交接格 (37,15) |
| RCL6，另行审批 | S1、S2 发送 Link | (29,24)、(38,26) |
| RCL7，可选另行审批 | Controller 接收 Link | (16,39) |

RCL6 终态占满 3 个 Link 名额，Controller 保持人工运输。今后经审批实现调度时，以 Storage 为默认接收端，预留接收空间、检查发送冷却。S1/S2 距离和理论冷却分别为 10/12 tick，满批 800 到达 776。只有新 Link 建成后才开发和启用自动调度。此次仅给坐标与理论预算。

旧 Link 退役并补齐道路后，零 Link 和三新 Link 的四项路径模拟同为 14、14、30、10，顺序同上表。三新 Link 增加预计建造能量 15,000，RCL6 全部施工理论预算 69,900，不含维修与后续 RCL7 Link。详见 [links.json](links.json)。

    python tools/screeps_stage03_link_plan.py docs/stage-03/coordinates-and-costs.json --output docs/stage-03-revision/links.json

## Pioneer 与基础防御

E22S37 Pioneer 在 (13,23) 的两格范围内重查掉落能量、废墟和墓碑。掉落使用 pickup，废墟和墓碑使用限量 withdraw。同行者按待取量保留资源，路径须到达交互范围。目标消失、没有能量或不可达时回到容器/Storage/Source 的既有取能流程；空目标进入短冷却。成功带回部分能量也可直接建造，找不到可建工地时升级。原 E22S36 派遣、预算、能量和人口保护保留；有 Spawn 但本地生产失效时，携能 Pioneer 仍能转本地采集角色进行恢复。现有健康人口或可用生产能量足以恢复时，不因遗留资源额外派遣。

母基地和自治房均取消常态 Defender 名额。有活跃攻击、远程、WORK、治疗或 CLAIM 部件的敌方 Creep 时才请求，房间内已有 Defender 或正在生产时不重复请求。Tower 有能量时先攻击最近可攻击敌方，随后治疗受伤己方，再走现有维修规则。Safe Mode 由操作者管理。

人工部署候选版本后，先核对 stage03-support-layout-defense-v1 已运行，验证 E22S37 的 SALVAGE_WITHDRAW/SALVAGE_PICKUP 与工地进度，并确认 E22S36 未自动生成工地。开工和退役均另行审批。分别比对施工前后 Source 采量、Spawn 实际补能、通道阻塞和 CPU，当前报告不含改造后线上实测。
