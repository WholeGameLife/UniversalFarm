export const soilTypes = [
  { id: 'loam', name: '壤土', desc: '通用、排水适中，适合大多数作物。', item: 'soil_loam' },
  { id: 'sand', name: '沙土', desc: '排水快，适合耐旱作物。', item: 'soil_sand' },
  { id: 'clay', name: '黏土', desc: '保水强，适合喜湿作物。', item: 'soil_clay' },
  { id: 'peat', name: '腐殖土', desc: '有机质丰富，适合浆果与藤本。', item: 'soil_peat' },
];

export const fertilizers = [
  { id: 'fertilizer_basic', name: '基础肥料', icon: '🧺', price: 10, desc: '提高银星、金星品质概率；一株作物的整个生命周期有效。', growthMultiplier: 1, qualityBonus: 0.3, retentionChance: 0 },
  { id: 'fertilizer_speed', name: '速生肥料', icon: '⚡', price: 20, desc: '生长速度 +25%，也作用于再生周期。', growthMultiplier: 1.25, qualityBonus: 0, retentionChance: 0 },
  { id: 'fertilizer_retaining', name: '保水肥料', icon: '💦', price: 15, desc: '每天有 50% 概率保留一天水分，仍需检查农田。', growthMultiplier: 1, qualityBonus: 0, retentionChance: 0.5 },
];

export const cropQualities = [
  { id: 'normal', name: '普通', multiplier: 1, suffix: '' },
  { id: 'silver', name: '银星', multiplier: 1.25, suffix: '_silver' },
  { id: 'gold', name: '金星', multiplier: 1.5, suffix: '_gold' },
];
