import { hashSeed } from './rng.js';

export function planetTerrainSeed(universeSeed, planetId) {
  return hashSeed(`${universeSeed}:${planetId}`);
}
