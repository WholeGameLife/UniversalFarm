/**
 * 3D 表现配置（纯视觉，不影响玩法）。逻辑层只知道 biome/crop/ore 的 id，
 * 这里把 id 映射成天空、地表、水、植被、调色等参数。换美术风格只改这个文件。
 *
 * 颜色写 sRGB 十六进制，加载时会转为线性空间。
 * sky.bodies：天空中的行星 / 卫星，dir 为方向，radius 为角半径（弧度）。
 */
export const biomeVisuals = {
  // ---------------- 温和：起源星球，青翠草甸 + 金色阳光 + 天上的环状巨行星 ----------------
  temperate: {
    sky: {
      day: { zenith: '#2a66c9', horizon: '#a9d2f0' },
      dusk: { zenith: '#34457f', horizon: '#ff9e66', glow: '#ff7a3c' },
      night: { zenith: '#020511', horizon: '#0c1a33' },
      sun: '#fff1dc',
      moonLight: '#8ea8ff',
      nebula: ['#5b3ed6', '#20b4c6'],
      cloudCover: 0.46,
      fogDensity: 0.0023,
      fogFalloff: 0.011,
      bodies: [
        { kind: 'giant', dir: [-0.55, 0.3, -0.78], radius: 0.17, colors: ['#ecc79b', '#b97d58'], ring: '#eadabf', ringNormal: [0.32, 1, 0.42], atmo: '#ffd9a8' },
        { kind: 'moon', dir: [0.66, 0.42, -0.62], radius: 0.034, colors: ['#d5dce8', '#8b94a6'], atmo: '#c4d4ff' },
      ],
    },
    terrain: {
      grassA: '#4a8a2c', grassB: '#86b846', dry: '#b9a75a', dirt: '#7b5b3b',
      sand: '#d9c58f', rock: '#7f7c78', rock2: '#5c5650', snow: '#f2f6fb', seabed: '#3e6b5c',
    },
    water: { shallow: '#37c6bb', deep: '#0a3c66' },
    grass: { height: 0.72, flowers: ['#ffd94f', '#ff86d8', '#ffffff'] },
    foliage: { leafA: '#3b7a28', leafB: '#93c650', bark: '#5b4333', glow: '#5ff2d0', accent: '#ff9ad5', rockTint: '#8a8780' },
    flora: [
      { type: 'broadleaf', weight: 4 },
      { type: 'spire', weight: 2 },
      { type: 'bush', weight: 5 },
      { type: 'boulder', weight: 3 },
      { type: 'glowbulb', weight: 2 },
    ],
    floraDensity: 1,
    particles: { day: '#fff4c2', night: '#b8ff7a' },
    grade: { saturation: 1.1, contrast: 1.05, tint: [1.0, 0.99, 0.965], vignette: 0.3 },
  },

  // ---------------- 沙漠：橙红天空、赭石台地、稀疏的柱状仙人掌 ----------------
  desert: {
    sky: {
      day: { zenith: '#3f78c4', horizon: '#f2d7ac' },
      dusk: { zenith: '#5a3a6e', horizon: '#ff8a4a', glow: '#ff6a2a' },
      night: { zenith: '#06040f', horizon: '#1d1426' },
      sun: '#fff0d0',
      moonLight: '#ffc9a0',
      nebula: ['#d6573e', '#e0b04a'],
      cloudCover: 0.22,
      fogDensity: 0.0026,
      fogFalloff: 0.009,
      bodies: [
        { kind: 'giant', dir: [0.5, 0.38, -0.78], radius: 0.13, colors: ['#9ad1ff', '#4e7fc0'], ring: '#cfe6ff', ringNormal: [-0.4, 1, 0.2], atmo: '#a8d8ff' },
        { kind: 'moon', dir: [-0.7, 0.55, -0.4], radius: 0.028, colors: ['#e8d2b8', '#9c8064'], atmo: '#ffe2c0' },
      ],
    },
    terrain: {
      grassA: '#c9a15c', grassB: '#b7894a', dry: '#d9bf86', dirt: '#9a6a42',
      sand: '#ecd29a', rock: '#b06a45', rock2: '#7d4a33', snow: '#f6e4c8', seabed: '#7aa39a',
    },
    water: { shallow: '#4fd3c4', deep: '#16607a' },
    grass: { height: 0.6, flowers: ['#ff6b4a', '#ffd34d', '#ffffff'] },
    foliage: { leafA: '#5f8f4a', leafB: '#a8b95a', bark: '#7a5a3a', glow: '#ffb84d', accent: '#ff6b8a', rockTint: '#b9765a' },
    flora: [
      { type: 'cactus', weight: 4 },
      { type: 'boulder', weight: 5 },
      { type: 'bush', weight: 2 },
    ],
    floraDensity: 0.45,
    particles: { day: '#ffe2b0', night: '#ffb070' },
    grade: { saturation: 1.08, contrast: 1.07, tint: [1.0, 0.97, 0.92], vignette: 0.32 },
  },

  // ---------------- 冰封：冷蓝天光、雪原与冰晶 ----------------
  frozen: {
    sky: {
      day: { zenith: '#3d6fc2', horizon: '#dceefc' },
      dusk: { zenith: '#4b4a8c', horizon: '#ffb5c8', glow: '#ff8fae' },
      night: { zenith: '#020614', horizon: '#0b1e3a' },
      sun: '#f2f6ff',
      moonLight: '#9fc4ff',
      nebula: ['#3fd6a8', '#5a6bff'],
      cloudCover: 0.58,
      fogDensity: 0.003,
      fogFalloff: 0.01,
      bodies: [
        { kind: 'giant', dir: [-0.4, 0.34, -0.85], radius: 0.15, colors: ['#ffd2e6', '#b07aa6'], ring: '#f4e3ff', ringNormal: [0.1, 1, 0.5], atmo: '#ffc8e8' },
      ],
    },
    terrain: {
      grassA: '#9fbcc4', grassB: '#c4d9de', dry: '#e4edf0', dirt: '#6f7c86',
      sand: '#d8e6ee', rock: '#6c7f92', rock2: '#4d5b6b', snow: '#ffffff', seabed: '#5f8fa8',
    },
    water: { shallow: '#7fd8e8', deep: '#164e78' },
    grass: { height: 0.55, flowers: ['#bff6ff', '#ffffff', '#d9c7ff'] },
    foliage: { leafA: '#2f5a4e', leafB: '#5d8a7a', bark: '#4a3c36', glow: '#7fe8ff', accent: '#c7b8ff', rockTint: '#7d90a2' },
    flora: [
      { type: 'conifer', weight: 5, snowy: true },
      { type: 'crystal', weight: 2 },
      { type: 'boulder', weight: 3 },
    ],
    floraDensity: 0.7,
    particles: { day: '#ffffff', night: '#9ff0ff' },
    grade: { saturation: 1.02, contrast: 1.05, tint: [0.96, 0.99, 1.04], vignette: 0.3 },
  },

  // ---------------- 火山：暗红天幕、熔岩海、发光晶簇 ----------------
  volcanic: {
    sky: {
      day: { zenith: '#3a1e33', horizon: '#c9643c' },
      dusk: { zenith: '#2a1022', horizon: '#ff5a24', glow: '#ff4a1a' },
      night: { zenith: '#07020a', horizon: '#2a0d10' },
      sun: '#ffd2a6',
      moonLight: '#ff9a7a',
      nebula: ['#ff4a3a', '#ffb04a'],
      cloudCover: 0.62,
      fogDensity: 0.0042,
      fogFalloff: 0.008,
      bodies: [
        { kind: 'giant', dir: [0.45, 0.3, -0.84], radius: 0.2, colors: ['#ffdf8a', '#c7742e'], atmo: '#ffcc66' },
      ],
    },
    terrain: {
      grassA: '#4a3530', grassB: '#5d4038', dry: '#6e4a3a', dirt: '#3b2a26',
      sand: '#2e2422', rock: '#2b2224', rock2: '#1c1618', snow: '#ffb066', seabed: '#7a2a10',
    },
    water: { shallow: '#ff7a24', deep: '#a62a08', lava: true },
    grass: { height: 0.4, flowers: ['#ff6a2a', '#ffb84d', '#ff3a3a'] },
    foliage: { leafA: '#3a2a2a', leafB: '#5a3a30', bark: '#1f1717', glow: '#ff6a2a', accent: '#ffb84d', rockTint: '#3a2e2e' },
    flora: [
      { type: 'crystal', weight: 3 },
      { type: 'boulder', weight: 5 },
      { type: 'deadtree', weight: 2 },
    ],
    floraDensity: 0.5,
    particles: { day: '#ff9a4a', night: '#ff6a2a' },
    grade: { saturation: 1.05, contrast: 1.1, tint: [1.04, 0.96, 0.92], vignette: 0.38 },
  },

  // ---------------- 虚空：紫色天空、青色海、巨型发光蘑菇 ----------------
  void: {
    sky: {
      day: { zenith: '#21145a', horizon: '#9a6ae0' },
      dusk: { zenith: '#180c40', horizon: '#ff6ad5', glow: '#d04aff' },
      night: { zenith: '#03020c', horizon: '#160e36' },
      sun: '#f0e6ff',
      moonLight: '#b49aff',
      nebula: ['#ff4ad5', '#3af0ff'],
      cloudCover: 0.4,
      fogDensity: 0.0032,
      fogFalloff: 0.01,
      bodies: [
        { kind: 'giant', dir: [-0.5, 0.36, -0.78], radius: 0.18, colors: ['#5ff2d0', '#2a6a8a'], ring: '#b8fff0', ringNormal: [0.5, 1, -0.2], atmo: '#7affe8' },
        { kind: 'moon', dir: [0.55, 0.6, -0.55], radius: 0.04, colors: ['#ffb8f0', '#8a4a9a'], atmo: '#ffc8f5' },
      ],
    },
    terrain: {
      grassA: '#4a3a96', grassB: '#6a4fb8', dry: '#8a6ac8', dirt: '#2e2552',
      sand: '#5a4a8a', rock: '#2c2552', rock2: '#1c173a', snow: '#d4c4ff', seabed: '#1a6a7a',
    },
    water: { shallow: '#2ff0d0', deep: '#0e3a6a' },
    grass: { height: 0.8, flowers: ['#3af0ff', '#ff6ad5', '#f0e6ff'] },
    foliage: { leafA: '#5a3aa8', leafB: '#9a6ae0', bark: '#d8d0ff', glow: '#3af0ff', accent: '#ff5fd2', rockTint: '#3a3070' },
    flora: [
      { type: 'mushroom', weight: 4 },
      { type: 'crystal', weight: 3 },
      { type: 'glowbulb', weight: 3 },
      { type: 'boulder', weight: 2 },
    ],
    floraDensity: 0.8,
    particles: { day: '#d8c8ff', night: '#3af0ff' },
    grade: { saturation: 1.12, contrast: 1.06, tint: [0.99, 0.97, 1.04], vignette: 0.36 },
  },
};

/** 作物外观 */
export const cropVisuals = {
  starwheat: { leaf: '#7fbf45', fruit: '#f2c94c', shape: 'wheat' },
  lumaberry: { leaf: '#2f8a52', fruit: '#4fb6ff', shape: 'bush', glow: 2.2 },
  voidmelon: { leaf: '#4f8a3a', fruit: '#7a4cff', stripe: '#c9a8ff', shape: 'melon', glow: 1.2 },
};

/** 矿脉外观：rock 母岩，crystal 晶体，metal 金属感(0-1)，glow 自发光强度 */
export const oreVisuals = {
  node_ferrite: { rock: '#5d5a60', crystal: '#a9b0bd', metal: 0.85, rough: 0.32, glow: 0 },
  node_cuprite: { rock: '#5a463c', crystal: '#e0793a', metal: 0.9, rough: 0.28, glow: 0.15 },
  node_aetherite: { rock: '#2d3756', crystal: '#4ff0ff', metal: 0.1, rough: 0.12, glow: 3.2 },
};

export const soilVisuals = {
  tilled: '#6a4730',
  wet: '#3a271b',
  highlight: '#ffd24a',
};
