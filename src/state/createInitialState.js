import { SAVE_VERSION } from '../core/SaveManager.js';

/** 新游戏初始状态（纯 JSON，不放函数 / 类实例） */
export function createInitialState(data, seed = Date.now() >>> 0) {
  const { config } = data;
  return {
    meta: { version: SAVE_VERSION, seed, createdAt: Date.now() },
    time: { day: 1, minute: config.time.dayStartMinute, acc: 0 },
    player: {
      credits: config.start.credits,
      energy: 100,
      maxEnergy: 100,
      planetId: config.start.planetId,
      tool: 'hoe',
      selectedSeed: 'seed_starwheat',
      selectedFertilizer: 'fertilizer_basic',
      selectedSoil: 'soil_sand',
    },
    inventory: { ...config.start.inventory },
    planets: {}, // planetId -> 星球运行态（农场、矿点），首次到达时创建
    universe: { systems: {}, planets: {}, discovered: [] }, // 由 UniverseSystem 生成
    tech: { researched: {} },
    unlocks: { farming: true },
    log: [],
  };
}

export function createFarmState(w, h) {
  return {
    w,
    h,
    tiles: Array.from({ length: w * h }, () => ({ soil: 'wild', soilType: 'loam', watered: false, fertilizer: null, crop: null })),
  };
}
