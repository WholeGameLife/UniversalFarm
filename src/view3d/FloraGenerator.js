import { createRng, hashSeed } from '../core/rng.js';
import { CHUNK_SIZE } from './TerrainGenerator.js';

export const FLORA_SPEC = {
  broadleaf: { base: 60, scale: [0.85, 1.35], minGrass: 0.4 },
  spire: { base: 50, scale: [0.8, 1.3], minGrass: 0.4 },
  conifer: { base: 70, scale: [0.8, 1.4], minGrass: 0.1 },
  bush: { base: 60, scale: [0.6, 1.3], minGrass: 0.3 },
  boulder: { base: 50, scale: [0.5, 1.6], minGrass: 0 },
  glowbulb: { base: 45, scale: [0.7, 1.3], minGrass: 0.4 },
  cactus: { base: 50, scale: [0.8, 1.3], minGrass: 0 },
  crystal: { base: 50, scale: [0.6, 1.5], minGrass: 0 },
  mushroom: { base: 45, scale: [0.7, 1.5], minGrass: 0 },
  deadtree: { base: 40, scale: [0.8, 1.2], minGrass: 0 },
};

export function generateFloraPlacements({ seed, cx, cz, visuals, terrain, avoid = () => false, density = 1 }) {
  const placements = [];
  for (const f of visuals.flora) {
    const spec = FLORA_SPEC[f.type];
    if (!spec) continue;
    const rng = createRng(hashSeed(`${seed}:flora:${f.type}:${cx}:${cz}`));
    const candidates = Math.ceil(spec.base * f.weight * visuals.floraDensity * CHUNK_SIZE ** 2 / 160000 * 2);
    for (let i = 0; i < candidates; i++) {
      const x = (cx + rng.next()) * CHUNK_SIZE;
      const z = (cz + rng.next()) * CHUNK_SIZE;
      const scale = spec.scale[0] + rng.next() * (spec.scale[1] - spec.scale[0]);
      const rotation = rng.next() * Math.PI * 2;
      const variant = Math.floor(rng.next() * 3);
      const visibility = rng.next();
      if (visibility >= density || avoid(x, z)) continue;
      const s = terrain.layerAt(x, z);
      if (s.h < terrain.seaLevel + 1 || s.h > 70) continue;
      if (terrain.slopeAt(x, z) > (f.type === 'boulder' ? 1.2 : 0.65)) continue;
      if (s.grass < spec.minGrass && f.type !== 'boulder' && f.type !== 'crystal') continue;
      placements.push({ type: f.type, x, z, y: s.h - 0.12 * scale, scale, rotation, variant });
    }
  }
  return placements;
}
