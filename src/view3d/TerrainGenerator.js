import { fbm } from './noise.js';

export const CHUNK_SIZE = 64;
export const TERRAIN_STEP = 2;
export const FAR_STEP = 8;

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export const chunkKey = (x, z) => `${x},${z}`;
export const chunkAt = (x, z) => ({ x: Math.floor(x / CHUNK_SIZE), z: Math.floor(z / CHUNK_SIZE) });

// Terrain is a function of seed + world coordinates, never of load order or quality.
export function createTerrainGenerator({ seed, pad, cacheLimit = 100000 }) {
  const heights = new Map();
  const samples = new Map();
  const remember = (map, key, value) => {
    if (map.size >= cacheLimit) {
      // Batched eviction avoids scanning an ever-growing prefix of Map tombstones per sample.
      let count = Math.max(1, Math.floor(cacheLimit / 4));
      for (const oldKey of map.keys()) {
        map.delete(oldKey);
        if (--count === 0) break;
      }
    }
    map.set(key, value);
    return value;
  };
  const padDist = (x, z) => Math.hypot(
    Math.max(pad.x0 - x, 0, x - pad.x1),
    Math.max(pad.z0 - z, 0, z - pad.z1)
  );
  const rawHeight = (x, z) => {
    const dist = padDist(x, z);
    if (dist <= 1) return pad.y;
    const wx = x + (fbm(x / 150, z / 150, seed + 3, 3) - 0.5) * 90;
    const wz = z + (fbm(x / 150 + 9.1, z / 150 - 4.3, seed + 5, 3) - 0.5) * 90;
    const continent = fbm(wx / 600, wz / 600, seed, 4);
    const mountains = smoothstep(0.48, 0.72, fbm(wx / 420 + 19, wz / 420 - 7, seed + 101, 3));
    const ridge = 1 - Math.abs(fbm(wx / 72 + 40, wz / 72 - 13, seed + 107, 4) * 2 - 1);
    let h = (continent - 0.43) * 70 + 8;
    h += (fbm(wx / 115, wz / 115, seed + 11, 4) - 0.5) * 28;
    h += ridge ** 2.4 * 62 * mountains;
    h += (fbm(x / 22, z / 22, seed + 33, 2) - 0.5) * 2.2;
    return pad.y + (h - pad.y) * smoothstep(1, 30, dist);
  };
  const rawVertex = (ix, iz) => {
    const key = chunkKey(ix, iz);
    return heights.has(key) ? heights.get(key) : remember(heights, key,
      Math.fround(rawHeight(ix * TERRAIN_STEP, iz * TERRAIN_STEP)));
  };
  const vertexHeight = (ix, iz) => {
    const chunkStride = CHUNK_SIZE / TERRAIN_STEP;
    if (ix % chunkStride !== 0 && iz % chunkStride !== 0) return rawVertex(ix, iz);
    const alongX = iz % chunkStride === 0;
    const v = alongX ? ix : iz;
    const stride = FAR_STEP / TERRAIN_STEP;
    const lo = Math.floor(v / stride) * stride;
    const t = (v - lo) / stride;
    const a = rawVertex(alongX ? lo : ix, alongX ? iz : lo);
    const b = rawVertex(alongX ? lo + stride : ix, alongX ? iz : lo + stride);
    return Math.fround(a + (b - a) * t);
  };
  // Same diagonal as the mesh, including negative coordinates and chunk borders.
  const heightAt = (x, z) => {
    const fx = x / TERRAIN_STEP;
    const fz = z / TERRAIN_STEP;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = vertexHeight(ix, iz);
    const b = vertexHeight(ix + 1, iz);
    const c = vertexHeight(ix, iz + 1);
    const d = vertexHeight(ix + 1, iz + 1);
    return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz
      : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  };
  const gradientAt = (x, z) => [
    (heightAt(x + TERRAIN_STEP, z) - heightAt(x - TERRAIN_STEP, z)) / (2 * TERRAIN_STEP),
    (heightAt(x, z + TERRAIN_STEP) - heightAt(x, z - TERRAIN_STEP)) / (2 * TERRAIN_STEP),
  ];
  const slopeAt = (x, z) => Math.hypot(...gradientAt(x, z));
  const sampleAt = (x, z) => {
    const key = chunkKey(x, z);
    if (samples.has(key)) return samples.get(key);
    const h = heightAt(x, z);
    const [gx, gz] = gradientAt(x, z);
    const nl = Math.hypot(gx, 1, gz);
    const ny = 1 / nl;
    const slope = 1 - ny;
    const nh = fbm(x / 34, z / 34, seed + 7, 3);
    const rock = smoothstep(0.17, 0.3, slope + (nh - 0.5) * 0.12);
    const snow = smoothstep(52, 66, h + (nh - 0.5) * 14) * (1 - smoothstep(0.35, 0.6, slope));
    const sand = 1 - smoothstep(0.7, 2.4, h + (nh - 0.5) * 1.4);
    const sea = 1 - smoothstep(-3.5, -0.6, h);
    const shipDist = Math.hypot(x - pad.shipX, z - pad.shipZ);
    const pathStart = pad.shipZ + 4;
    const pathT = Math.min(Math.max((z - pathStart) / (pad.pathZ - pathStart || 1), 0), 1);
    const pathDist = Math.hypot(x - pad.shipX, z - (pathStart + (pad.pathZ - pathStart) * pathT));
    const dirt = Math.max(
      1 - smoothstep(6.5, 10.5, shipDist + (nh - 0.5) * 5),
      1 - smoothstep(1.1, 2.4, pathDist + (nh - 0.5) * 1.6),
      smoothstep(0.68, 0.76, fbm(x / 26 + 7, z / 26, seed + 41, 3)) * smoothstep(4, 12, padDist(x, z)) * 0.8
    );
    const dry = Math.min(1, smoothstep(0.56, 0.7, fbm(x / 62 + 11, z / 62, seed + 21, 3)) + smoothstep(16, 34, h) * 0.7);
    let rem = 1 - snow;
    const wRock = rock * rem; rem -= wRock;
    const wSea = sea * rem; rem -= wSea;
    const wSand = sand * rem; rem -= wSand;
    const wDirt = dirt * rem; rem -= wDirt;
    const wDry = dry * rem; rem -= wDry;
    const wGrass = Math.max(rem, 0);
    const ao = Math.max(0.45, 1 - Math.max(0,
      heightAt(x + 8, z) + heightAt(x - 8, z) + heightAt(x, z + 8) + heightAt(x, z - 8) - 4 * h) / 32);
    const density = Math.min(1, (wGrass + wDry * 0.85) * smoothstep(0.5, 1.3, h) * smoothstep(5.5, 8.5, shipDist));
    return remember(samples, key, {
      h, normal: [-gx / nl, ny, -gz / nl],
      splatA: [wGrass, wDry, wDirt, wSand], splatB: [wRock, snow, wSea, ao],
      data: [h, density, wGrass + wDry > 1e-3 ? wDry / (wGrass + wDry) : 0, ao],
      grass: wGrass + wDry, rock: wRock, sand: wSand + wSea, snow,
    });
  };
  return { seed, seaLevel: 0, farmY: pad.y, heightAt, slopeAt, sampleAt, layerAt: sampleAt,
    clearCache() { heights.clear(); samples.clear(); } };
}

// All LODs use the same coarse border, so changing detail cannot open cracks.
export function chunkVertexHeight(generator, cx, cz, ix, iz, segments) {
  const step = CHUNK_SIZE / segments;
  const x = cx * CHUNK_SIZE + ix * step;
  const z = cz * CHUNK_SIZE + iz * step;
  if (ix !== 0 && iz !== 0 && ix !== segments && iz !== segments) return generator.heightAt(x, z);
  const alongX = iz === 0 || iz === segments;
  const v = alongX ? x : z;
  const lo = Math.floor(v / FAR_STEP) * FAR_STEP;
  const t = (v - lo) / FAR_STEP;
  const a = generator.heightAt(alongX ? lo : x, alongX ? z : lo);
  const b = generator.heightAt(alongX ? lo + FAR_STEP : x, alongX ? z : lo + FAR_STEP);
  return a + (b - a) * t;
}
