# 宇宙农场 · 架构设计

## 1. 核心原则：数据 / 逻辑 / 表现 三层分离

```
┌──────────────┐   只读    ┌──────────────┐   命令(dispatch)   ┌──────────────┐
│  data/ 定义  │ ───────▶ │ systems/ 逻辑 │ ◀──────────────── │  view/ 表现  │
│ (静态配置)    │          │ (改 state)    │ ──事件(EventBus)─▶ │ (读 state)   │
└──────────────┘          └──────┬───────┘                    └──────────────┘
                                 │ 读写
                          ┌──────▼───────┐
                          │ state/ 存档态 │  纯 JSON，可直接序列化
                          └──────────────┘
```

| 层 | 目录 | 内容 | 禁止 |
|---|---|---|---|
| 数据 | `src/data/` | 物品、作物、星球特质、科技、宇宙层级等**静态定义** | 写函数逻辑、引用 DOM |
| 状态 | `src/state/` | 运行时存档态（纯对象，可 JSON 化） | 存放 class 实例、函数 |
| 逻辑 | `src/systems/` | 各玩法系统：处理命令、按帧更新、发事件 | 访问 DOM / window |
| 核心 | `src/core/` | Game、EventBus、Registry、存档、随机数等基础设施 | 写具体玩法 |
| 表现 | `src/view/` | DOM 渲染、输入 → 命令 | 直接修改 state |
| 3D 表现 | `src/view3d/` | three.js 场景、角色、镜头、射线拾取 → 命令 | 直接修改 state、写玩法规则 |

### 3D 表现层（src/view3d）

画风：风格化写实（参考无人深空）。渲染管线：场景（HDR + MSAA）→ 辉光 → 调色 / 暗角 → ACES 色调映射；环境光由当前天空实时生成（IBL）。

| 文件 | 职责 |
|---|---|
| `World3D.js` | 渲染器、后期管线、环境光、画质档位切换（G 键 / HUD 按钮）、自动降档、按星球切换场景 |
| `Quality.js` | 高 / 中 / 低 三档画质参数与设备检测（设置存在 localStorage，不进游戏存档） |
| `PlanetScene.js` | 组装一个星球：地形 + 水 + 天空 + 草地 + 植被 + 粒子 + 农田 + 飞船营地 + 矿点；`sync()` 把逻辑状态映射到模型。农田材质会显示壤土 / 沙土 / 黏土 / 腐殖土、湿润和施肥状态 |
| `Terrain.js` / `TerrainGenerator.js` | 固定种子的世界坐标地形、64×64 区块流式加载、近细远粗 LOD、无缝边界、地表分层与 AO、跟随玩家的数据纹理，提供 `heightAt` / `slopeAt` / `layerAt` |
| `Water.js` | 按水深着色的水面（浅滩、岸边泡沫、菲涅尔反射、太阳高光），火山星球为熔岩 |
| `Sky.js` | 天穹渐变 + 日轮、云层、星空与星云、天上的巨行星 / 卫星、日月光照、指数高度雾、晨雾 |
| `Grass.js` | GPU 草地：围绕玩家平铺的草叶实例，随风摆动、被玩家踩开、开垦后消失 |
| `Flora.js` / `FloraGenerator.js` | 按星球种子和区块坐标生成植被与岩石，每种 3 个共享造型变体，合批为 InstancedMesh；远处卸载、返回复现 |
| `Particles.js` | 白天花粉 / 夜晚萤火虫 |
| `models.js` | 飞船、宇航员、作物、矿石、营地道具 |
| `geom.js` / `materials.js` / `shaders.js` / `noise.js` | 程序化建模工具、共享材质（风摆）、着色器片段（噪声 / 云 / 高度雾 / 调色）、噪声 |
| `PlayerController.js` | WASD 第三人称移动、喷射背包、环绕镜头（角色位置是纯视觉状态，不进存档） |
| `Interaction.js` | 鼠标射线拾取 → 高亮 / 提示 → `game.dispatch` |
| `palettes.js` | 每个群系的天空 / 地表 / 水 / 植被 / 调色配置，换美术只改这里 |

### 种田循环与作物数据

`src/data/crops.js` 是作物目录的默认快照，`src/data/cropSchema.js` 是运行时和独立编辑器共用的校验规则。每项作物包含：

- `growDays` / `stageDays` / `regrowDays`：首次成熟、阶段和重复采收周期；
- `waterIntervalDays` / `maxDryDays`：浇水间隔和缺水枯萎容忍；
- `requirements.soils` / `temperature` / `moisture` / `biomes`：土地与气候需求；土地已启用，气候和群系由 `config.farm.enforceClimate` 控制，默认关闭；
- `harvest`：物品、产量、基础售价；收获根据肥料产生普通 / 银星 / 金星品质；
- `uses`：食用体力、用途标签和未来加工配方（啤酒花 → 酒桶 → 淡色艾尔）；
- `availability`：商店、科技、初始来源和未来野外生成条件；目前只有商店和初始背包来源实际生效。

`FarmSystem` 的命令顺序是开垦 → 土壤改良 / 施肥（播种前）→ 播种 → 浇水 → `time:dayStarted` 生长 → 收割。作物状态保存在每颗星球的农田运行态，旅行不会丢失；成熟作物不会因之后不浇水枯萎，未成熟作物超过容忍天数会变为枯萎并需清除。基础肥料提高品质，速生肥料提高速度，保水肥料有概率保留水分。

游戏的“农场”页签包含作物图鉴和独立编辑器导入入口。编辑器目录位于工程内的 `UniversalFarmSeedEditor/`，不引用游戏运行时，支持离线编辑、校验、JSON / `crops.js` 导出、浏览器草稿、响应式布局。编辑器导出的 JSON 可在游戏内直接导入；导入前会拒绝删除存档正在使用的物品或作物 ID，并把自定义目录保存到本机存档旁。运行 `npm run editor:sync` 可刷新编辑器的独立规则和默认图鉴快照。

three.js 通过 `index.html` 里的 import map 直接从 `node_modules` 加载（`three` 与 `three/addons/`），不需要打包工具。开发者模式：URL 加 `?dev=1`（F6 资源 / F7 科技 / F8 +3 小时 / F9 下一天）。

**数据流**：玩家点击 → View 调用 `game.dispatch('farm/interact', {...})` → 对应 System 修改 state 并 `emit` 事件 → View 收到 `state:changed` 后重新渲染。

这样：
- 逻辑层可在 Node 中无界面测试（见 `tests/`）。
- 以后把 DOM 换成 Canvas / PixiJS / Three.js，只需重写 `view/`。
- 新增作物、星球、科技基本只改 `data/`。

## 2. 目录结构

```
UniversalFarm/
├─ index.html              入口页面
├─ start.bat               本地启动（静态服务器）
├─ docs/                   设计文档（架构、路线图）
├─ UniversalFarmSeedEditor/ 独立离线作物编辑器（随仓库分发）
├─ src/
│  ├─ main.js              启动：组装 Game + 系统 + 视图
│  ├─ core/                引擎基础设施
│  │  ├─ Game.js           系统注册、命令分发、主循环 tick
│  │  ├─ EventBus.js       事件总线
│  │  ├─ Registry.js       数据注册表（按 id 查定义 + 校验）
│  │  ├─ GameLoop.js       requestAnimationFrame 驱动（仅浏览器）
│  │  ├─ SaveManager.js    存档 / 读档 / 版本迁移
│  │  └─ rng.js            可复现随机数（星系生成用 seed）
│  ├─ data/                静态数据定义
│  │  ├─ config.js         全局数值（时间流速、初始资源…）
│  │  ├─ items.js          物品（种子、作物、矿石、材料）
│  │  ├─ crops.js          作物
│  │  ├─ planetTraits.js   星球特质（肥沃 / 富矿 / 古遗迹…）
│  │  ├─ universe.js       宇宙层级（星系 → 星团 → 银心 → 高维）
│  │  ├─ techs.js          科技树
│  │  └─ index.js          汇总导出
│  ├─ state/
│  │  └─ createInitialState.js  新游戏初始状态
│  ├─ systems/             玩法逻辑（每个系统一个文件）
│  │  ├─ TimeSystem.js     昼夜、日期推进
│  │  ├─ InventorySystem.js 背包与货币
│  │  ├─ FarmSystem.js     开垦、播种、浇水、生长、收获
│  │  ├─ EconomySystem.js  买卖
│  │  ├─ TechSystem.js     研究、解锁功能
│  │  ├─ MiningSystem.js   挖矿（初版）
│  │  ├─ UniverseSystem.js 星系 / 星球生成（骨架）
│  │  └─ TravelSystem.js   星际航行（骨架）
│  └─ view/                表现层
│     ├─ App.js            视图根：订阅事件、调度渲染
│     ├─ components/       各 UI 面板
│     └─ styles/main.css
└─ tests/                  逻辑层单元测试（node --test）
```

## 3. 系统接口约定

每个系统是一个普通对象：

```js
export const FarmSystem = {
  id: 'farm',
  init(ctx) {},                 // 可选：注册事件监听
  update(ctx, dtSeconds) {},    // 可选：每帧调用
  commands: {                   // 可选：对外命令
    'farm/interact': (ctx, payload) => ({ ok: true }),
  },
  queries: {                    // 可选：只读查询（给 View / 其他系统用）
    tileView: (ctx, x, y) => ({}),
  },
};
```

`ctx = { state, data, bus, rng, game }`

- **命令**返回 `{ ok: true }` 或 `{ ok: false, reason }`，失败原因交给 View 提示。
- **跨系统协作**优先用事件（如 `time:dayStarted` → 作物生长），或通过 `game.query('inventory/count', id)` 调用，避免系统互相 import。
- 功能解锁统一放在 `state.unlocks`，由 TechSystem 写入，其它系统用 `game.isUnlocked('mining')` 判断。

## 4. 系统规划（按游戏进程）

| 阶段 | 系统 | 说明 |
|---|---|---|
| P1 起源星球 | Time / Farm / Inventory / Economy | 星露谷式种田循环 |
| P2 地下资源 | Mining | 挖矿、矿石精炼 |
| P3 科技 | Tech | 消耗作物 + 矿石研究，解锁后续功能 |
| P4 出航 | Universe / Travel | 程序化星系、多星球，星球特质影响产出 |
| P5 殖民经营 | Colony / Automation | 多星球基地、自动化（参考群星） |
| P6 深空 | Exploration / Events | 遗迹、异常事件、外星生物 |
| P7 升维 | Dimension | 4D+ 空间，新规则与资源 |

## 5. 星球特质模型

星球 = 生物群系 + 若干特质，每个特质给出**修正系数**，各系统只读取系数，不关心特质来源：

```js
{ id: 'fertile', modifiers: { farmGrowth: 1.5 } }
{ id: 'mineral_rich', modifiers: { miningYield: 2 } }
{ id: 'ancient_ruins', modifiers: { research: 1.5 } }
```

通过 `game.query('universe/modifier', planetId, 'farmGrowth')` 获取叠乘结果。

## 6. 存档

- `state` 为纯 JSON，`SaveManager` 写入 `localStorage`。
- 存档带 `version`，结构变化时在 `SaveManager.migrations` 增加迁移函数。
- v2 给每颗星球保存完整 32 位 `terrainSeed`，由宇宙种子和星球 ID 稳定派生；v1 自动迁移，保留农田、矿点和科技进度。生成算法更新后，旧存档的野外地貌会改变，但营地平台不变。

## 7. 星球地形生成

- 地貌只依赖 `terrainSeed`、世界坐标和营地平台，不依赖加载顺序或画质。离开原来的 440×440 区域后仍可持续探索，不再用独立背景山冒充地形。
- 每个区块为 64×64；近处固定 2 单位采样，远处使用 4 / 8 单位采样。各档位只调整细节范围、视距和植被显示密度，脚下地面高度保持一致。
- 全部 LOD 边界共用同一条折线，法线和分层在世界坐标采样。角色碰撞和 GPU 地形纹理使用与近景网格相同的三角形插值，避免区块接缝、草叶悬浮或画质切换改变落脚点。
- 玩家移动时分帧生成新区块，优先完成脚下及相邻区块；移出视距的几何体立即释放。高度 / 地表缓存有数量上限，地形纹理使用重叠区域复用和分帧更新。
- 植被位置按 `星球种子 + 类型 + 区块坐标` 独立生成，造型随机流与天空、营地、草叶、矿点分离；低画质显示高画质植被的稳定子集。
- 当前仍是高度场地形，不是 Minecraft 的可挖掘体素；挖掘地形、洞穴和地形编辑持久化不在本次范围内。资源矿点仍由现有玩法系统管理。
