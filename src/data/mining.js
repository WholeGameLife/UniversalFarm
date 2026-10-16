/**
 * 矿脉定义：weight 为出现权重
 * requiresFlag: 需要星球特质带有该 flag 才会出现
 */
export const oreNodes = [
  { id: 'node_ferrite', ore: 'ore_ferrite', icon: '🪨', hits: 2, yield: [1, 3], weight: 60 },
  { id: 'node_cuprite', ore: 'ore_cuprite', icon: '🟤', hits: 3, yield: [1, 2], weight: 30 },
  { id: 'node_aetherite', ore: 'ore_aetherite', icon: '💠', hits: 5, yield: [1, 1], weight: 10, requiresFlag: 'rareOre' },
];

export const miningConfig = {
  nodesPerDay: 8, // 每天刷新的矿点数量
  energyPerHit: 2,
};
