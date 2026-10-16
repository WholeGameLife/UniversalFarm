/** 存档管理：state 必须是纯 JSON */
import { planetTerrainSeed } from './planetSeed.js';

export const SAVE_VERSION = 3;

/** 版本迁移：key = 旧版本号，函数把它升到下一版本 */
const migrations = {
  1: (s) => {
    for (const p of Object.values(s.universe?.planets ?? {})) {
      p.terrainSeed ??= planetTerrainSeed(s.meta.seed, p.id);
    }
    s.meta.version = 2;
    return s;
  },
  2: (s) => {
    s.player.selectedFertilizer ??= 'fertilizer_basic';
    s.player.selectedSoil ??= 'soil_sand';
    for (const rt of Object.values(s.planets ?? {})) {
      for (const tile of rt.farm?.tiles ?? []) {
        tile.soilType ??= 'loam';
        tile.fertilizer ??= null;
        if (tile.crop) {
          tile.crop.dryDays ??= 0;
          tile.crop.moistureDays ??= tile.watered ? 1 : 0;
          tile.crop.harvests ??= 0;
          tile.crop.regrowing ??= false;
          tile.crop.withered ??= false;
        }
      }
    }
    s.meta.version = 3;
    return s;
  },
};

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(json) {
  let s = JSON.parse(json);
  while ((s.meta?.version ?? 0) < SAVE_VERSION) {
    const v = s.meta?.version ?? 0;
    const m = migrations[v];
    if (!m) throw new Error(`缺少存档迁移 v${v}`);
    s = m(s);
  }
  return s;
}

export function createLocalSaver(storage, key = 'universal-farm-save') {
  return {
    save: (state) => storage.setItem(key, serialize(state)),
    load: () => {
      const raw = storage.getItem(key);
      return raw ? deserialize(raw) : null;
    },
    clear: () => storage.removeItem(key),
  };
}
