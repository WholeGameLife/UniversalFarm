import { createRng, hashSeed } from '../core/rng.js';
import { planetTerrainSeed } from '../core/planetSeed.js';
import { createFarmState } from '../state/createInitialState.js';

const NAME_A = ['卡', '诺', '维', '塔', '索', '艾', '泽', '露', '欧', '赛'];
const NAME_B = ['伦', '斯', '拉', '恩', '多', '米', '克', '娅', '图', '尔'];

/**
 * 宇宙：星系/星球程序化生成 + 星球修正系数查询 + 星球运行态管理
 * 生成结果存进 state.universe，保证读档后宇宙不变
 */
export const UniverseSystem = {
  id: 'universe',

  init(ctx) {
    const { state, data, bus } = ctx;
    if (!state.universe.systems.sys_origin) {
      generateTier(ctx, data.tiers.get('tier_local'));
    }
    for (const p of Object.values(state.universe.planets)) {
      p.terrainSeed ??= planetTerrainSeed(state.meta.seed, p.id);
    }
    ensurePlanetState(ctx, state.player.planetId);
    // 解锁新的宇宙层级时生成对应星系
    bus.on('unlock:gained', ({ key }) => {
      if (data.tiers.has(key)) generateTier(ctx, data.tiers.get(key));
    });
  },

  queries: {
    planet: ({ state }, id) => state.universe.planets[id],
    current: ({ state }) => state.universe.planets[state.player.planetId],
    currentRuntime: (ctx) => ensurePlanetState(ctx, ctx.state.player.planetId),
    runtime: (ctx, id) => ensurePlanetState(ctx, id),
    systems: ({ state }) => Object.values(state.universe.systems),

    /** 星球所有特质对某修正 key 的叠乘结果 */
    modifier: ({ state, data }, planetId, key) => {
      const p = state.universe.planets[planetId];
      if (!p) return 1;
      return p.traits.reduce((m, t) => m * (data.traits.get(t).modifiers[key] ?? 1), 1);
    },

    hasFlag: ({ state, data }, planetId, flag) => {
      const p = state.universe.planets[planetId];
      return !!p?.traits.some((t) => data.traits.get(t).flags?.includes(flag));
    },
  },
};

/** 星球运行态（农田、矿点）按需创建 */
export function ensurePlanetState({ state, data }, planetId) {
  if (!state.planets[planetId]) {
    const { width, height } = data.config.farm;
    state.planets[planetId] = {
      farm: createFarmState(width, height),
      mine: { nodes: [], lastRefreshDay: 0 },
    };
  }
  return state.planets[planetId];
}

function generateTier(ctx, tier) {
  const { state, data } = ctx;
  const u = state.universe;
  for (let i = 0; i < tier.systemCount; i++) {
    const sysId = tier.depth === 0 ? 'sys_origin' : `sys_${tier.depth}_${i}`;
    if (u.systems[sysId]) continue;
    const rng = createRng(hashSeed(`${state.meta.seed}:${sysId}`));
    const name = tier.depth === 0 ? '摇篮星系' : randomName(rng) + '星系';
    const planetIds = [];

    // 起源星系先放入固定星球
    if (tier.depth === 0) {
      data.fixedPlanets.all().forEach((fp) => {
        u.planets[fp.id] = { ...fp, traits: [...fp.traits], tier: tier.id, orbit: planetIds.length,
          terrainSeed: planetTerrainSeed(state.meta.seed, fp.id) };
        planetIds.push(fp.id);
      });
    }

    const count = rng.int(2, 5);
    for (let k = 0; k < count; k++) {
      const pid = `${sysId}_p${k}`;
      u.planets[pid] = generatePlanet(rng, data, pid, sysId, tier, planetIds.length);
      u.planets[pid].terrainSeed = planetTerrainSeed(state.meta.seed, pid);
      planetIds.push(pid);
    }

    u.systems[sysId] = {
      id: sysId,
      name,
      tier: tier.id,
      planetIds,
      x: tier.depth === 0 ? 0 : Math.round((rng.next() - 0.5) * 200 * tier.depth),
      y: tier.depth === 0 ? 0 : Math.round((rng.next() - 0.5) * 200 * tier.depth),
    };
  }
}

function generatePlanet(rng, data, id, systemId, tier, orbit) {
  const biome = rng.pick(data.biomes.all()).id;
  const traitPool = data.traits.all().map((t) => t.id);
  const traits = [];
  const n = rng.int(1, Math.min(3, 1 + tier.depth));
  while (traits.length < n) {
    const t = rng.pick(traitPool);
    if (!traits.includes(t)) traits.push(t);
  }
  return { id, name: randomName(rng), systemId, biome, traits, tier: tier.id, orbit };
}

function randomName(rng) {
  return rng.pick(NAME_A) + rng.pick(NAME_B) + (rng.chance(0.4) ? '-' + rng.int(2, 99) : '');
}
