import { TimeSystem } from './TimeSystem.js';
import { InventorySystem } from './InventorySystem.js';
import { UniverseSystem } from './UniverseSystem.js';
import { FarmSystem } from './FarmSystem.js';
import { EconomySystem } from './EconomySystem.js';
import { TechSystem } from './TechSystem.js';
import { MiningSystem } from './MiningSystem.js';
import { TravelSystem } from './TravelSystem.js';

/** 系统注册顺序 = init / update 顺序。Universe 需要在依赖星球数据的系统之前 */
export const allSystems = [
  TimeSystem,
  InventorySystem,
  UniverseSystem,
  FarmSystem,
  EconomySystem,
  TechSystem,
  MiningSystem,
  TravelSystem,
];
