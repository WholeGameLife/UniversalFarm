import { Registry } from '../core/Registry.js';
import { config } from './config.js';
import { items } from './items.js';
import { crops } from './crops.js';
import { planetTraits, biomes } from './planetTraits.js';
import { universeTiers, fixedPlanets } from './universe.js';
import { techs } from './techs.js';
import { oreNodes, miningConfig } from './mining.js';
import { soilTypes, fertilizers, cropQualities } from './farming.js';
import { validateCropCatalog } from './cropSchema.js';

/** 汇总所有静态数据，构建注册表；同时做交叉引用校验 */
export function buildData({ cropCatalog = crops, farmConfig = {} } = {}) {
  const errors = validateCropCatalog(cropCatalog);
  if (errors.length) throw new Error('作物数据校验失败:\n' + errors.join('\n'));
  const cropItems = cropCatalog.flatMap((c) => [
    { id: c.seed, name: c.name + '种子', category: 'seed', icon: c.seedIcon, price: c.seedPrice, cropId: c.id, desc: c.description },
    ...cropQualities.map((q) => ({ id: c.harvest.item + q.suffix, name: c.name + (q.id === 'normal' ? '' : `（${q.name}）`),
      category: 'crop', icon: c.harvest.icon, cropId: c.id, quality: q.id, baseItem: c.harvest.item,
      sellPrice: Math.round(c.harvest.sellPrice * q.multiplier), foodEnergy: Math.round(c.uses.foodEnergy * q.multiplier), desc: c.description })),
  ]);
  const supplies = [
    ...fertilizers.map((f) => ({ ...f, category: 'fertilizer' })),
    ...soilTypes.map((s) => ({ id: s.item, name: s.name + '改良包', desc: s.desc + '空地使用，一次改良一格。', icon: '🪴', category: 'soil', soilType: s.id, price: 8 })),
  ];
  const data = {
    config: { ...config, farm: { ...config.farm, ...farmConfig } },
    miningConfig,
    items: new Registry('items', [...items, ...cropItems, ...supplies]),
    crops: new Registry('crops', cropCatalog),
    soils: new Registry('soils', soilTypes),
    fertilizers: new Registry('fertilizers', fertilizers),
    qualities: new Registry('qualities', cropQualities),
    traits: new Registry('traits', planetTraits),
    biomes: new Registry('biomes', biomes),
    tiers: new Registry('tiers', universeTiers),
    fixedPlanets: new Registry('fixedPlanets', fixedPlanets),
    techs: new Registry('techs', techs),
    oreNodes: new Registry('oreNodes', oreNodes),
  };
  validate(data);
  return data;
}

function validate(d) {
  const errs = [];
  const needItem = (id, where) => !d.items.has(id) && errs.push(`${where} 引用了不存在的物品 ${id}`);
  d.crops.all().forEach((c) => {
    needItem(c.seed, `crop ${c.id}`);
    needItem(c.harvest.item, `crop ${c.id}`);
    if (c.availability.requires && !d.techs.has(c.availability.requires)) errs.push(`crop ${c.id} 科技不存在 ${c.availability.requires}`);
  });
  d.oreNodes.all().forEach((n) => needItem(n.ore, `oreNode ${n.id}`));
  d.techs.all().forEach((t) => {
    Object.keys(t.cost).forEach((k) => k !== 'credits' && needItem(k, `tech ${t.id}`));
    t.prereq.forEach((p) => !d.techs.has(p) && errs.push(`tech ${t.id} 前置不存在 ${p}`));
  });
  d.fixedPlanets.all().forEach((p) => {
    if (!d.biomes.has(p.biome)) errs.push(`planet ${p.id} 群系不存在 ${p.biome}`);
    p.traits.forEach((t) => !d.traits.has(t) && errs.push(`planet ${p.id} 特质不存在 ${t}`));
  });
  if (errs.length) throw new Error('数据校验失败:\n' + errs.join('\n'));
}
