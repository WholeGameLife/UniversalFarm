import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainGenerator, CHUNK_SIZE, chunkAt, chunkVertexHeight } from '../src/view3d/TerrainGenerator.js';
import { createTerrain } from '../src/view3d/Terrain.js';
import { generateFloraPlacements } from '../src/view3d/FloraGenerator.js';
import { createFlora } from '../src/view3d/Flora.js';
import { biomeVisuals } from '../src/view3d/palettes.js';
import { TIERS } from '../src/view3d/Quality.js';
import { planetTerrainSeed } from '../src/core/planetSeed.js';
import { valueNoise } from '../src/view3d/noise.js';

const pad = { x0: -14, x1: 14, z0: -24, z1: 24, y: 4, shipX: 0, shipZ: -13, pathZ: 1 };
const makeGenerator = (seed = 0xfedcba98) => createTerrainGenerator({ seed, pad });
const visuals = biomeVisuals.temperate;
const tier = { ...TIERS.low, terrain: { radius: 2, detailRadius: 1, textureSize: 192, budgetMs: 2 }, floraRadius: 1 };
const makeTerrain = () => createTerrain({ seed: 0xfedcba98, pad, visuals, tier });
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('planet seeds use all 32 bits and stable world + planet identities', () => {
  assert.equal(planetTerrainSeed(42, 'origin'), planetTerrainSeed(42, 'origin'));
  assert.notEqual(planetTerrainSeed(42, 'origin'), planetTerrainSeed(42, 'another'));
  assert.notEqual(planetTerrainSeed(42, 'origin'), planetTerrainSeed(43, 'origin'));
  assert.notEqual(valueNoise(12.3, -8.4, 0xffffffff), valueNoise(12.3, -8.4, 0xfffffffe));
});

test('terrain is deterministic after cache eviction, different load orders, and far from origin', () => {
  const a = makeGenerator();
  const b = makeGenerator();
  const points = [[-65.3, 8.8], [1004.2, -2001.5], [1e6 + 0.3, -1e6 - 4.1]];
  const expected = points.map(([x, z]) => a.sampleAt(x, z));
  points.toReversed().forEach(([x, z]) => b.sampleAt(x, z));
  a.clearCache();
  points.forEach(([x, z], i) => {
    assert.deepEqual(a.sampleAt(x, z), expected[i]);
    assert.deepEqual(b.sampleAt(x, z), expected[i]);
    assert.ok(Number.isFinite(a.heightAt(x, z)));
  });
  assert.ok(points.some(([x, z]) => a.heightAt(x, z) !== makeGenerator(99).heightAt(x, z)));
  const tiny = createTerrainGenerator({ seed: a.seed, pad, cacheLimit: 12 });
  for (const [x, z] of points) assert.deepEqual(tiny.sampleAt(x, z), a.sampleAt(x, z));
  assert.deepEqual(tiny.sampleAt(...points[0]), a.sampleAt(...points[0]));
});

test('farm and landing pad stay flat and negative chunk coordinates floor correctly', () => {
  const g = makeGenerator();
  for (const [x, z] of [[0, 0], [5, -13], [-12, 20], [12, -20]]) assert.equal(g.heightAt(x, z), 4);
  assert.deepEqual(chunkAt(-0.01, -64.01), { x: -1, z: -2 });
  assert.deepEqual(chunkAt(64, 0), { x: 1, z: 0 });
});

test('detailed, medium and distant chunk edges agree, including negative coordinates', () => {
  const g = makeGenerator();
  for (const cx of [-4, -1, 0, 4]) {
    for (const cz of [-3, 0, 5]) {
      for (const segments of [8, 16, 32]) {
        for (let i = 0; i <= segments; i++) {
          const x = cx * CHUNK_SIZE;
          const z = cz * CHUNK_SIZE + i * CHUNK_SIZE / segments;
          const a = chunkVertexHeight(g, cx, cz, 0, i, segments);
          const b = chunkVertexHeight(g, cx - 1, cz, segments, i, segments);
          close(a, b);
          close(a, g.heightAt(x, z));
          const lo = Math.floor(i * 8 / segments);
          const t = i * 8 / segments - lo;
          const v0 = chunkVertexHeight(g, cx, cz, 0, lo, 8);
          const v1 = chunkVertexHeight(g, cx, cz, 0, Math.min(lo + 1, 8), 8);
          close(a, v0 + (v1 - v0) * t);
          close(chunkVertexHeight(g, cx, cz, i, 0, segments), chunkVertexHeight(g, cx, cz - 1, i, segments, segments));
        }
      }
    }
  }
});

test('moving atlas keeps old data until new rows finish, then publishes coherent world coordinates', () => {
  const terrain = makeTerrain();
  terrain.update({ x: 5, z: 5 }, { immediate: true });
  const focus = { x: 5, z: 65 };
  for (let i = 0; i < 300; i++) terrain.update(focus);
  assert.equal(terrain.texInfo.z, -96);
  assert.equal(terrain.texInfo.w, -32);
  const n = terrain.dataTex.image.width;
  for (const [ix, iz] of [[0, 0], [30, 40], [96, 96]]) {
    const h = terrain.dataTex.image.data[(iz * n + ix) * 4];
    close(h, terrain.heightAt(terrain.texInfo.z + ix * 2, terrain.texInfo.w + iz * 2));
  }
  assert.equal(terrain.chunks.size, 25);
  terrain.dispose();
});

test('reversing direction cancels an unpublished atlas rather than committing stale coordinates', () => {
  const slowTier = { ...tier, terrain: { ...tier.terrain, budgetMs: 0 } };
  const terrain = createTerrain({ seed: 99, pad, visuals, tier: slowTier });
  terrain.update({ x: 5, z: 5 }, { immediate: true });
  // This crossing stays inside the old atlas, allowing the replacement to remain unfinished.
  terrain.update({ x: -0.1, z: 5 });
  terrain.update({ x: 5, z: 5 });
  terrain.update({ x: 5, z: 5 }, { immediate: true });
  assert.deepEqual(terrain.texInfo.toArray(), [192, 97, -96, -96]);
  terrain.dispose();
});

test('changing quality does not change collision heights or detailed chunk geometry', () => {
  const low = makeTerrain();
  const high = createTerrain({ seed: low.seed, pad, visuals, tier: { ...tier, id: 'high', terrain: { ...tier.terrain, detailRadius: 2 } } });
  const focus = { x: -130, z: 260 };
  low.update(focus, { immediate: true });
  high.update(focus, { immediate: true });
  close(low.heightAt(focus.x, focus.z), high.heightAt(focus.x, focus.z));
  const c = chunkAt(focus.x, focus.z);
  const key = `${c.x},${c.z}`;
  assert.deepEqual(low.chunks.get(key).mesh.geometry.getAttribute('position').array, high.chunks.get(key).mesh.geometry.getAttribute('position').array);
  low.dispose();
  high.dispose();
});

test('collision heights match the detailed rendered triangles, not bilinear interpolation', () => {
  const terrain = makeTerrain();
  terrain.update({ x: 70, z: 70 }, { immediate: true });
  const chunk = terrain.chunks.get('1,1');
  const pos = chunk.mesh.geometry.getAttribute('position');
  const row = chunk.segments + 1;
  for (const [ix, iz] of [[0, 0], [5, 7], [31, 29]]) {
    for (const [tx, tz] of [[0.2, 0.3], [0.7, 0.8]]) {
      const i = iz * row + ix;
      const a = pos.getY(i), b = pos.getY(i + 1), c = pos.getY(i + row), d = pos.getY(i + row + 1);
      const h = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz
        : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
      close(h, terrain.heightAt(64 + (ix + tx) * 2, 64 + (iz + tz) * 2));
    }
  }
  terrain.dispose();
});

test('streaming releases distant chunks and returns to exactly the same terrain', () => {
  const terrain = makeTerrain();
  terrain.update({ x: 2, z: 2 }, { immediate: true });
  assert.equal(terrain.chunks.size, 25);
  const original = terrain.chunks.get('0,0').mesh.geometry;
  const originalPositions = Array.from(original.getAttribute('position').array);
  let released = false;
  original.addEventListener('dispose', () => { released = true; });
  terrain.update({ x: 4098, z: -4094 }, { immediate: true });
  assert.ok(released);
  assert.equal(terrain.chunks.size, 25);
  assert.ok(!terrain.chunks.has('0,0'));
  assert.ok(terrain.chunks.has('64,-64'));
  const { x: x0, y: n, z: originX, w: originZ } = terrain.texInfo;
  assert.ok(4098 >= originX && 4098 < originX + x0);
  assert.ok(-4094 >= originZ && -4094 < originZ + x0);
  close(terrain.dataTex.image.data[0], terrain.heightAt(originX, originZ));
  assert.equal(n, terrain.dataTex.image.width);
  terrain.update({ x: 2, z: 2 }, { immediate: true });
  assert.deepEqual(Array.from(terrain.chunks.get('0,0').mesh.geometry.getAttribute('position').array), originalPositions);
  terrain.dispose();
  assert.equal(terrain.chunks.size, 0);
  terrain.update({ x: 500, z: 500 });
  assert.equal(terrain.chunks.size, 0);
});

test('flora positions reproduce by seed and chunk; lower quality is a stable subset', () => {
  const terrain = makeGenerator();
  const args = { seed: terrain.seed, cx: 0, cz: 0, terrain, visuals };
  const full = generateFloraPlacements(args);
  assert.ok(full.length > 0);
  generateFloraPlacements({ ...args, cx: -30, cz: 90 });
  assert.deepEqual(generateFloraPlacements(args), full);
  const low = generateFloraPlacements({ ...args, density: 0.5 });
  assert.ok(low.every((p) => full.some((q) => JSON.stringify(q) === JSON.stringify(p))));
  assert.ok(full.every((p) => p.x >= 0 && p.x < 64 && p.z >= 0 && p.z < 64));
  assert.deepEqual(generateFloraPlacements({ ...args, avoid: () => true }), []);
});

test('flora streaming keeps bounded chunks and disposes batches', () => {
  const terrain = makeGenerator();
  const flora = createFlora({ seed: terrain.seed, terrain, visuals, tier, avoid: () => false });
  flora.update({ x: 2, z: 2 }, { immediate: true });
  const original = flora.chunks.get('0,0');
  assert.equal(flora.chunks.size, 9);
  flora.update({ x: 2002, z: -3002 }, { immediate: true });
  assert.equal(flora.chunks.size, 9);
  assert.ok(!flora.chunks.has('0,0'));
  flora.update({ x: 2, z: 2 }, { immediate: true });
  assert.deepEqual(flora.chunks.get('0,0'), original);
  flora.dispose();
  assert.equal(flora.group.children.length, 0);
  assert.equal(flora.chunks.size, 0);
});
