/**
 * 宇宙层级：从起源星系一路到高维空间
 * requires: 进入该层级所需科技
 */
export const universeTiers = [
  { id: 'tier_local', name: '起源星系', depth: 0, systemCount: 1, requires: null },
  { id: 'tier_cluster', name: '近邻星团', depth: 1, systemCount: 6, requires: 'tech_warp' },
  { id: 'tier_galaxy', name: '银河旋臂', depth: 2, systemCount: 20, requires: 'tech_hyperlane' },
  { id: 'tier_core', name: '银心', depth: 3, systemCount: 8, requires: 'tech_gravity_lens' },
  { id: 'tier_dimension', name: '高维空间', depth: 4, systemCount: 3, requires: 'tech_dimension_gate' },
];

/** 手工定义的固定星球（起源星球等），其余由程序生成 */
export const fixedPlanets = [
  {
    id: 'origin',
    name: '伊甸-0',
    systemId: 'sys_origin',
    biome: 'temperate',
    traits: ['fertile'],
    desc: '你坠落的无人星球，土壤意外肥沃。',
  },
];
