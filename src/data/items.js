/**
 * 物品定义
 * category: seed | crop | ore | material | artifact
 */
export const items = [
  // Seeds, crops, quality variants and farming supplies are derived from the crop catalog.
  // 矿石
  { id: 'ore_ferrite', name: '铁氧体', category: 'ore', icon: '🪨', sellPrice: 8 },
  { id: 'ore_cuprite', name: '赤铜矿', category: 'ore', icon: '🟠', sellPrice: 18 },
  { id: 'ore_aetherite', name: '以太晶', category: 'ore', icon: '💎', sellPrice: 80 },
  // 遗物
  { id: 'artifact_shard', name: '先驱者碎片', category: 'artifact', icon: '🔷', sellPrice: 200 },
];
