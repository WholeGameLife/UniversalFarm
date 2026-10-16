/**
 * 科技树
 * cost: 研究消耗的物品/货币
 * unlocks: 研究完成后写入 state.unlocks 的功能 key
 * prereq: 前置科技
 */
export const techs = [
  {
    id: 'tech_drill',
    name: '简易钻头',
    desc: '修复飞船上的钻头，开启挖矿。',
    cost: { credits: 150, starwheat: 5 },
    prereq: [],
    unlocks: ['mining'],
  },
  {
    id: 'tech_refinery',
    name: '精炼厂',
    desc: '矿石出售价提高。',
    cost: { credits: 300, ore_ferrite: 15 },
    prereq: ['tech_drill'],
    unlocks: ['refinery'],
  },
  {
    id: 'tech_genetics',
    name: '基因改良',
    desc: '解锁虚空瓜种子。',
    cost: { credits: 400, lumaberry: 5 },
    prereq: ['tech_drill'],
    unlocks: ['crop_voidmelon'],
  },
  {
    id: 'tech_ship_repair',
    name: '修复飞船',
    desc: '飞船重新起飞，可前往同星系其他星球。',
    cost: { credits: 800, ore_ferrite: 30, ore_cuprite: 10 },
    prereq: ['tech_drill'],
    unlocks: ['travel_system'],
  },
  {
    id: 'tech_warp',
    name: '曲速引擎',
    desc: '前往近邻星团。',
    cost: { credits: 3000, ore_aetherite: 10 },
    prereq: ['tech_ship_repair'],
    unlocks: ['tier_cluster'],
  },
  {
    id: 'tech_hyperlane',
    name: '超空间航道',
    desc: '前往银河旋臂。',
    cost: { credits: 10000, ore_aetherite: 40 },
    prereq: ['tech_warp'],
    unlocks: ['tier_galaxy'],
  },
  {
    id: 'tech_gravity_lens',
    name: '引力透镜',
    desc: '穿越银心的引力井。',
    cost: { credits: 40000, artifact_shard: 5 },
    prereq: ['tech_hyperlane'],
    unlocks: ['tier_core'],
  },
  {
    id: 'tech_dimension_gate',
    name: '维度之门',
    desc: '打开通往高维空间的门。',
    cost: { credits: 200000, artifact_shard: 20 },
    prereq: ['tech_gravity_lens'],
    unlocks: ['tier_dimension'],
  },
];
