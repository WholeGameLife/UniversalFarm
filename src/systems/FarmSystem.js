/** Farming rules are data-driven; planet climate/modifiers are opt-in for a later phase. */
const ENERGY = { hoe: 2, water: 1, fertilize: 1, soil: 1, clear: 1 };
const fail = (reason) => ({ ok: false, reason });
const cycleDays = (def, crop) => crop.regrowing && def.regrowDays > 0 ? def.regrowDays : def.growDays;
const mature = (def, crop) => !crop.withered && crop.progress >= cycleDays(def, crop);
const fertilizerOf = (data, tile) => tile.fertilizer && data.fertilizers.has(tile.fertilizer) ? data.fertilizers.get(tile.fertilizer) : null;

function getTile(game, x, y) {
  const farm = game.query('universe/currentRuntime').farm;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= farm.w || y >= farm.h) return null;
  return farm.tiles[y * farm.w + x];
}

function environment(ctx, planetId) {
  const planet = ctx.game.query('universe/planet', planetId);
  return { biome: planet.biome, temperature: planet.climate?.temperature ?? 20, moisture: planet.climate?.moisture ?? 60 };
}

function climateFits(def, env) {
  return (!def.requirements.biomes.length || def.requirements.biomes.includes(env.biome))
    && env.temperature >= def.requirements.temperature[0] && env.temperature <= def.requirements.temperature[1]
    && env.moisture >= def.requirements.moisture[0] && env.moisture <= def.requirements.moisture[1];
}

function plantingReason(ctx, tile, def) {
  const { data, game } = ctx;
  if (tile.soil === 'wild') return '需要先用锄头开垦';
  if (tile.crop) return tile.crop.withered ? '需要先用锄头清除枯萎作物' : '这里已经种了东西';
  if (def.availability.requires && !game.state.tech.researched[def.availability.requires]) return '需要先研究对应科技';
  if (!def.requirements.soils.includes(tile.soilType ?? 'loam')) return `${def.name}需要${def.requirements.soils.map((s) => data.soils.get(s).name).join('或')}，请先使用土壤改良包`;
  if (data.config.farm.enforceClimate && !climateFits(def, environment(ctx, game.state.player.planetId))) return `${def.name}不适合当前气候或群系`;
  if (game.query('inventory/count', def.seed) < 1) return '种子不足，请去商店购买';
  return '';
}

export const FarmSystem = {
  id: 'farm',
  init(ctx) { ctx.bus.on('time:dayStarted', () => growAll(ctx)); },
  commands: {
    'farm/interact': (ctx, { x, y }) => {
      const { state, data, game } = ctx;
      const tile = getTile(game, x, y);
      if (!tile) return fail('超出农田');
      const tool = state.player.tool;
      if (tool === 'clear') return clearCrop(ctx, tile);
      if (tile.crop && mature(data.crops.get(tile.crop.id), tile.crop)) return harvest(ctx, tile);
      if (tile.crop?.withered) return tool === 'hoe' ? clearCrop(ctx, tile) : fail('作物已枯萎，请用锄头清除');
      switch (tool) {
        case 'hoe':
          if (tile.soil !== 'wild') return fail('这里已经开垦过了');
          if (!game.query('inventory/useEnergy', ENERGY.hoe)) return fail('体力不足');
          tile.soil = 'tilled';
          tile.soilType ??= 'loam';
          return { ok: true };
        case 'water':
          if (tile.soil === 'wild') return fail('需要先开垦');
          if (tile.watered) return fail('今天已经浇过水了');
          if (!game.query('inventory/useEnergy', ENERGY.water)) return fail('体力不足');
          tile.watered = true;
          if (tile.crop) tile.crop.moistureDays = data.crops.get(tile.crop.id).waterIntervalDays;
          return { ok: true };
        case 'seed': return plant(ctx, tile);
        case 'fertilizer': return fertilize(ctx, tile);
        case 'soil': return amendSoil(ctx, tile);
        default: return fail('当前工具不能用于农田');
      }
    },
  },
  queries: {
    tileView: (ctx, x, y) => {
      const { data, game } = ctx;
      const tile = getTile(game, x, y);
      if (!tile) return null;
      const fertilizer = fertilizerOf(data, tile);
      let crop = null, icon = '', isMature = false;
      const needsWater = !!tile.crop && !tile.crop.withered && !tile.watered && !(tile.crop.moistureDays > 0);
      let status = tile.soil === 'wild' ? '未开垦' : '等待播种';
      if (tile.crop) {
        const c = tile.crop, def = data.crops.get(c.id);
        const days = cycleDays(def, c), ratio = Math.min(c.progress / days, 1);
        isMature = mature(def, c);
        let stage = 0, elapsed = 0;
        if (c.regrowing) stage = Math.max(1, Math.min(def.stages.length - 2, Math.floor(ratio * (def.stages.length - 1))));
        else for (const duration of def.stageDays) { elapsed += duration; if (c.progress >= elapsed) stage++; else break; }
        if (isMature) stage = def.stages.length - 1;
        icon = c.withered ? '🥀' : def.stages[stage];
        const speed = growthSpeed(ctx, game.state.player.planetId, tile);
        const daysLeft = Math.ceil(Math.max(0, days - c.progress) / speed);
        status = c.withered ? '枯萎，需清除' : isMature ? '可收获' : needsWater ? '缺水，今天不会生长' : c.regrowing ? '再生中' : '生长中';
        if (data.config.farm.enforceClimate && !climateFits(def, environment(ctx, game.state.player.planetId)) && !c.withered && !isMature) status = '气候不适，停止生长';
        crop = { id: def.id, name: def.name, stage, stageCount: def.stages.length, ratio, progress: c.progress,
          growDays: days, daysLeft, regrowing: !!c.regrowing, harvests: c.harvests ?? 0, dryDays: c.dryDays ?? 0,
          maxDryDays: def.maxDryDays, withered: !!c.withered, status, regrowDays: def.regrowDays };
      }
      return { soil: tile.soil, soilType: tile.soilType ?? 'loam', soilName: data.soils.get(tile.soilType ?? 'loam').name,
        watered: tile.watered, moist: tile.watered || (tile.crop?.moistureDays ?? 0) > 0, needsWater,
        fertilizer: tile.fertilizer, fertilizerName: fertilizer?.name ?? '', icon, mature: isMature, crop, status };
    },
    size: ({ game }) => { const f = game.query('universe/currentRuntime').farm; return { w: f.w, h: f.h }; },
    summary: (ctx) => {
      const f = ctx.game.query('universe/currentRuntime').farm;
      const result = { planted: 0, mature: 0, needsWater: 0, withered: 0, tilled: 0 };
      f.tiles.forEach((t, i) => {
        const v = FarmSystem.queries.tileView(ctx, i % f.w, Math.floor(i / f.w));
        if (t.soil !== 'wild') result.tilled++;
        if (t.crop) result.planted++;
        if (v.mature) result.mature++;
        if (v.needsWater && !v.mature) result.needsWater++;
        if (t.crop?.withered) result.withered++;
      });
      return result;
    },
    catalog: ({ data, game }) => data.crops.all().map((c) => ({ ...c, unlocked: !c.availability.requires || !!game.state.tech.researched[c.availability.requires] })),
  },
};

function plant(ctx, tile) {
  const { data, game, state } = ctx;
  const def = data.crops.all().find((c) => c.seed === state.player.selectedSeed);
  if (!def) return fail('请选择种子');
  const reason = plantingReason(ctx, tile, def);
  if (reason) return fail(reason);
  if (!game.query('inventory/spend', { [def.seed]: 1 })) return fail('种子不足');
  tile.crop = { id: def.id, progress: 0, moistureDays: tile.watered ? def.waterIntervalDays : 0, dryDays: 0, regrowing: false, harvests: 0, withered: false };
  return { ok: true };
}

function fertilize({ state, data, game }, tile) {
  const id = state.player.selectedFertilizer;
  if (tile.soil === 'wild') return fail('需要先开垦');
  if (tile.crop) return fail('请在播种前施肥，一格只能使用一种肥料');
  if (tile.fertilizer) return fail('这块土地已经施过肥');
  if (!data.fertilizers.has(id)) return fail('请选择肥料');
  if (game.query('inventory/count', id) < 1) return fail('肥料不足');
  if (!game.query('inventory/useEnergy', ENERGY.fertilize)) return fail('体力不足');
  game.query('inventory/spend', { [id]: 1 });
  tile.fertilizer = id;
  return { ok: true };
}

function amendSoil({ state, data, game }, tile) {
  const id = state.player.selectedSoil;
  if (tile.soil === 'wild') return fail('需要先开垦');
  if (tile.crop) return fail('只能改良没有作物的土地');
  if (!data.items.has(id) || data.items.get(id).category !== 'soil') return fail('请选择土壤改良包');
  const target = data.items.get(id).soilType;
  if (target === tile.soilType) return fail('已经是这种土壤');
  if (game.query('inventory/count', id) < 1) return fail('土壤改良包不足');
  if (!game.query('inventory/useEnergy', ENERGY.soil)) return fail('体力不足');
  game.query('inventory/spend', { [id]: 1 });
  tile.soilType = target;
  return { ok: true };
}

function clearCrop({ game }, tile) {
  if (!tile.crop) return fail('这里没有需要清除的作物');
  if (!game.query('inventory/useEnergy', ENERGY.clear)) return fail('体力不足');
  tile.crop = null;
  tile.fertilizer = null;
  tile.watered = false;
  return { ok: true };
}

function harvest({ data, rng, game, bus }, tile) {
  const def = data.crops.get(tile.crop.id);
  const fertilizer = fertilizerOf(data, tile);
  const roll = rng.next(), bonus = fertilizer?.qualityBonus ?? 0;
  const quality = roll < 0.05 + bonus / 2 ? 'gold' : roll < 0.2 + bonus ? 'silver' : 'normal';
  const item = def.harvest.item + data.qualities.get(quality).suffix;
  const mult = data.config.farm.applyPlanetModifiers ? game.query('universe/modifier', game.state.player.planetId, 'cropYield') : 1;
  const n = Math.max(1, Math.round(rng.int(def.harvest.min, def.harvest.max) * mult));
  game.query('inventory/add', item, n);
  if (def.regrowDays) {
    tile.crop.regrowing = true;
    tile.crop.progress = 0;
    tile.crop.harvests = (tile.crop.harvests ?? 0) + 1;
    tile.crop.dryDays = 0;
  } else { tile.crop = null; tile.fertilizer = null; }
  bus.emit('farm:harvested', { item, baseItem: def.harvest.item, quality, n });
  bus.emit('ui:toast', { text: `收获 ${data.items.get(item).name} ×${n}${def.regrowDays ? `，${def.regrowDays} 个生长日后可再收获` : ''}`, kind: 'good' });
  return { ok: true, item, n, quality };
}

function growthSpeed({ data, game }, planetId, tile) {
  const modifier = data.config.farm.applyPlanetModifiers ? game.query('universe/modifier', planetId, 'farmGrowth') : 1;
  return modifier * (fertilizerOf(data, tile)?.growthMultiplier ?? 1);
}

function growAll(ctx) {
  const { state, data, game, rng, bus } = ctx;
  let newlyWithered = 0;
  for (const [planetId, rt] of Object.entries(state.planets)) {
    for (const tile of rt.farm.tiles) {
      const f = fertilizerOf(data, tile);
      if (tile.crop && !tile.crop.withered) {
        const c = tile.crop, def = data.crops.get(c.id);
        if (tile.watered) c.moistureDays = Math.max(c.moistureDays ?? 0, def.waterIntervalDays);
        if ((c.moistureDays ?? 0) > 0) {
          c.dryDays = 0;
          if (!mature(def, c) && (!data.config.farm.enforceClimate || climateFits(def, environment(ctx, planetId)))) c.progress = Math.min(cycleDays(def, c), c.progress + growthSpeed(ctx, planetId, tile));
          c.moistureDays--;
        } else if (!mature(def, c)) {
          c.dryDays = (c.dryDays ?? 0) + 1;
          if (c.dryDays > def.maxDryDays) { c.withered = true; if (planetId === state.player.planetId) newlyWithered++; }
        }
      }
      tile.watered = !!tile.watered && !!f && rng.next() < f.retentionChance;
      if (tile.watered && tile.crop) tile.crop.moistureDays = Math.max(tile.crop.moistureDays ?? 0, 1);
    }
  }
  if (newlyWithered) bus.emit('ui:toast', { text: `${newlyWithered} 株作物因连续缺水枯萎，请用锄头清除`, kind: 'warn' });
}
