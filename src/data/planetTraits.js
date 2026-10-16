/**
 * 星球特质：只提供修正系数，各系统按 key 读取
 * 已用修正 key: farmGrowth, cropYield, miningYield, research, travelCost
 */
export const planetTraits = [
  { id: 'fertile', name: '沃土', desc: '作物生长更快', modifiers: { farmGrowth: 1.5 } },
  { id: 'lush', name: '丰饶', desc: '作物产量提升', modifiers: { cropYield: 1.5 } },
  { id: 'barren', name: '贫瘠', desc: '难以耕种', modifiers: { farmGrowth: 0.5, cropYield: 0.7 } },
  { id: 'mineral_rich', name: '富矿', desc: '矿石产量翻倍', modifiers: { miningYield: 2 } },
  { id: 'deep_crust', name: '深层地壳', desc: '可开采稀有矿', modifiers: { miningYield: 1.2 }, flags: ['rareOre'] },
  { id: 'ancient_ruins', name: '古代遗迹', desc: '研究效率提升', modifiers: { research: 1.5 }, flags: ['ruins'] },
  { id: 'quantum_field', name: '量子场', desc: '研究效率大幅提升', modifiers: { research: 2 } },
  { id: 'storms', name: '风暴', desc: '降落消耗更高', modifiers: { travelCost: 1.5 } },
];

/** 生物群系：决定地表外观和可种植作物 */
export const biomes = [
  { id: 'temperate', name: '温和', color: '#7fb069' },
  { id: 'desert', name: '沙漠', color: '#d9a35b' },
  { id: 'frozen', name: '冰封', color: '#a8d5e2' },
  { id: 'volcanic', name: '火山', color: '#c4453a' },
  { id: 'void', name: '虚空', color: '#3d3b6e' },
];
