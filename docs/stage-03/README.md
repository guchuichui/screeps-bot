# 阶段 03｜E22S36 母基地布局与 Link 网络

## 运行快照

shard3，2026-11-11 13:00:01（北京时间），tick 84200411，采集时落后 12 tick。活跃代码和运行时均为 telemetry-hourly-v2，agent-test。详细遥测 tick 与运行快照一致。静态布局键 70f4d3f4，布局及地形 SHA-256 校验通过。

共 128 条结构坐标（含 Controller），0 工地，2 个 Source，50×50 地形。地形有 1581 墙、647 平原、272 沼泽。v2 未发布矿物坐标，13:47 使用官方域名的无凭证 GET 补充 K 矿 (41,3)，并核对该响应与遥测的建筑、工地和 Source 坐标集合一致。数据仍是历史快照，施工前应重新核对房间占用与建筑限额。

| 对象 | 实际坐标或数量 |
| --- | --- |
| Spawn / Storage | (35,19) / (36,16) |
| S1 / 采集站 | (30,22) / 唯一可用站 (29,23) |
| S2 / 采集站 | (38,28) / (37,27)、(37,28)、(37,29)、(38,27)。模型采用 (37,27) |
| Controller / 矿物 | (17,37) / K (41,3) |
| Link | (31,18)、(39,19)，均激活、0 能量、0 冷却，样本无发送记录 |
| 其他结构 | 30 Extension、48 Road、39 Constructed Wall、4 Rampart、2 Tower |

[snapshot.json](snapshot.json) 列出全部观测坐标、道路、工地及地形。三张 50×50 图以左上为 (0,0)，x 向右、y 向下。路线是几何模型，图上的主干线不代表实测交通。白框表示模型选定的 Miner 站位。

- [现状图](layout-current.png)
- [A｜保守改造](layout-A.png)
- [B｜RCL8 物流核心](layout-B.png)
- [完整坐标及成本](coordinates-and-costs.json)

## A｜RCL6 保守改造

保留全部现有建筑，沿 S1/S2 至 Storage、Storage 至原 Spawn 和 Controller 的走廊补 22 格道路。先修经过频率最高的路段，按采样验证交通，再决定是否使用第三个 Link 名额。道路方案中有 9 格沼泽，建造成本 17,400。候选 Link (29,24) 贴近 S1 唯一站位，建造成本 5,000。施工前复核 (29,23) 的进出和交接空间。

| Link 坐标 | A 角色 | 流向 |
| --- | --- | --- |
| (29,24) | 新 S1 注入 | → (31,18) |
| (31,18) | 现有接收中继 | Creep 搬至 Storage (36,16) |
| (39,19) | 现有备用 | 暂停调度 |

RCL6 允许 3 个 Link，已有 2 个，全部建成正好到上限。S2 和 Controller 继续走人工运输。注入 → 中继的理论冷却为 6 tick，满批发送 800 到达 776。中继到 Storage 的静态搬运成本为 13，S1 直接搬运是 14。只节省 1 个加权单位，还要承担 3% 传输损耗与装卸，因此优先道路，暂把 A 的 Link 当作需要现场验证的备选。

## B｜RCL8 长期布局

保留原 Spawn (35,19) 和 12 个原 Extension 作为北部补能区，保留原道路与防御。把 Storage 从 (36,16) 迁至 (30,33)，在 (30,34) 和 (31,35) 新增两个 Spawn。新增 48 个 Extension，逐批退出 18 个旧位，终态 60 个。南部核心沿现有南向主干路设置补能通道，新增 3 格平原路。两套方案均从当前快照计算；如果先做 A，现有规划中 A 新增道路与 B 新增实体建筑无坐标冲突，继续保留已修的道路。

| Link 坐标 | B 角色 | 流向 |
| --- | --- | --- |
| (29,24) | S1 注入 | → Storage hub，或直供 Controller |
| (38,26) | S2 注入 | → Storage hub，或直供 Controller |
| (31,33) | Storage hub | 同一交接格 (30,32) 可取 Link 并存 Storage，必要时 → Controller |
| (16,39) | Controller 接收 | 供升级工作区提取 |
| (39,19)、(31,18) | 备用 | 暂停调度，保留原位 |

按实际限额分期。RCL6 只可采用 A。RCL7 可增加第二个 Spawn，并在四个 Link 名额内加入 Controller Link，用 S1 直送验证。RCL8 才能完成三个 Spawn、60 个 Extension 和六个 Link。先使新增 Spawn 独立可补能，保留北部生产后再迁 Storage。Storage 限额为 1，迁移需要先转移库存并安排短时无 Storage 回退。Extension 先用未占用名额新增，再小批退旧位。当前塔和防御保留，实验范围是采运、补能和升级主干，未预估 Labs、Terminal 等设施的扩建。

Link 建议顺序：Controller 存在降级风险时优先直送 Controller；平时补 Storage hub 支持 Spawn，余量直送 Controller，Source 冷却或不足时才由 hub 补给。发送方冷却为 0、收端留足毛发送容量、每发送方每 tick 一次。建议最低 200，Controller 目标 400；同一接收方累加预留，备用和未激活 Link 不参加。两路 Source→hub 冷却 9/7 tick，S1/S2→Controller 冷却 15/22 tick，hub→Controller 冷却 15 tick。单跳满批 800→776，两跳 800→752。冷却上限按距离计算，实际吞吐还受 Source 供给、共享接收端和装卸限制。此处为规划规则，未接入任何游戏调度。[官方 Link 机制](https://docs.screeps.com/api/#StructureLink) · [引擎传输实现](https://github.com/screeps/engine/blob/master/src/processor/intents/links/transfer.js)

## 比较与验收

| 指标 | 现状 | A | B |
| --- | ---: | ---: | ---: |
| S1 交接格→Storage | 43 | 14 | 8 |
| S2 交接格→Storage | 58 | 24 | 10 |
| Storage→Controller 工作区 | 67 | 32 | 9 |
| Storage→原 Spawn | 59 | 26 | 12 |
| 共同保留的 12 个 Extension 平均补能成本 | 61.67 | 27.67 | 13.58 |
| 各方案所有 Extension 平均成本（数量不同） | 37.93 | 17.77 | 5.93 |
| 新建总成本（未强化建造能量估算） | 0 | 22,400 | 224,900 |
| 退役/迁移 | 0 | 0 | 18 Extension、1 Storage |

路径分数来自同一地形与站位，允许八向移动，进入道路、平原、沼泽分别计 1/2/5，Storage/Spawn/Extension 用交互范围 1，Controller 用 3。B 中 Storage→新增 Spawn 为 0，表示共享一个交互格。模型验证了现有出口可达、采集站位和各 Extension 可补能。B 新建成本含 48×3,000 Extension、2×15,000 Spawn、1×30,000 Storage、4×5,000 Link 和 3×300 Road。估算不含搬库存、补员、维修或交通损失。[建造成本与 RCL 限额](https://docs.screeps.com/api/#Constants)

- **线上实测**只涵盖版本、坐标、结构状态和站位可用性。
- **模拟**比较静态路径成本与几何可行性。紧凑核心、S1 单站位和共用干道可能出现拥堵；B 的 60 个 Extension 位置是可复现候选，未证明为全局最优。
- **理论**能量预算、3% 损耗与冷却；两套方案均无部署后实测收益。先用 A 的重点路段做小批验证，比较同一时期每 Source 已采集量、存入量、Spawn 补能与阻塞。若 A 的 Link 无法抵消搬运和损耗，就继续人工搬运。B 需单独确认迁移与施工窗口。

## 复现

阶段 03 基于 PR #4 的离线路径模型。已有脱敏快照，可在仓库根目录复算；渲染工具需要 Pillow 10.1 或更新版本。

    python tools/screeps_stage03_layout.py --snapshot docs/stage-03/snapshot.json --output-dir docs/stage-03
    python tools/render_stage03_layout.py docs/stage-03/coordinates-and-costs.json --output-dir docs/stage-03
    python -m unittest discover -s tests -p 'test_stage03_layout.py'

可改用 --monitor 读取新的本地监控目录。v2 缺矿物时，以 --public-geometry 输入来自上述官方 GET 的筛选快照，顶层字段为 endpoint、at 和 objects；objects 仅保留建筑、工地、Source、Controller、矿物及其坐标，工地保留 structureType，矿物保留 mineralType。提取器会拒绝过期、错版本或不一致的布局。工具只读本地输入，不发起游戏请求或写操作。
