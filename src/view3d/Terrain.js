import * as THREE from 'three';
import { patchMaterial } from './shaders.js';
import { CHUNK_SIZE, TERRAIN_STEP, chunkAt, chunkKey, chunkVertexHeight, createTerrainGenerator } from './TerrainGenerator.js';

/** Bounded, player-centered chunk streaming over a deterministic world height field. */
export function createTerrain({ seed, visuals, tier, pad }) {
  const generator = createTerrainGenerator({ seed, pad });
  const mesh = new THREE.Group();
  mesh.name = 'terrain';
  const material = createTerrainMaterial(visuals.terrain);
  const chunks = new Map();
  const settings = tier.terrain;
  const size = settings.textureSize;
  const n = size / TERRAIN_STEP + 1;
  const dataTex = new THREE.DataTexture(new Float32Array(n * n * 4), n, n, THREE.RGBAFormat, THREE.FloatType);
  dataTex.minFilter = dataTex.magFilter = THREE.NearestFilter;
  const texInfo = new THREE.Vector4(size, n, 0, 0);
  let centerKey = null;
  let pending = [];
  let textureJob = null;
  let disposed = false;

  const buildChunk = (cx, cz, segments) => {
    const row = segments + 1;
    const count = row * row;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const splatA = new Float32Array(count * 4);
    const splatB = new Float32Array(count * 4);
    const indices = [];
    for (let iz = 0; iz <= segments; iz++) {
      for (let ix = 0; ix <= segments; ix++) {
        const i = iz * row + ix;
        const x = cx * CHUNK_SIZE + ix * CHUNK_SIZE / segments;
        const z = cz * CHUNK_SIZE + iz * CHUNK_SIZE / segments;
        const s = generator.sampleAt(x, z);
        pos.set([ix * CHUNK_SIZE / segments, chunkVertexHeight(generator, cx, cz, ix, iz, segments), iz * CHUNK_SIZE / segments], i * 3);
        nor.set(s.normal, i * 3);
        splatA.set(s.splatA, i * 4);
        splatB.set(s.splatB, i * 4);
        if (ix < segments && iz < segments) {
          const a = i, b = a + 1, c = a + row, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('aSplatA', new THREE.BufferAttribute(splatA, 4));
    geo.setAttribute('aSplatB', new THREE.BufferAttribute(splatB, 4));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    const object = new THREE.Mesh(geo, material);
    object.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    object.receiveShadow = true;
    object.castShadow = tier.shadows && segments === CHUNK_SIZE / TERRAIN_STEP;
    object.name = `terrain:${chunkKey(cx, cz)}`;
    return { x: cx, z: cz, segments, mesh: object };
  };

  const install = ({ x, z, segments }) => {
    const key = chunkKey(x, z);
    const previous = chunks.get(key);
    if (previous?.segments === segments) return;
    const chunk = buildChunk(x, z, segments);
    if (previous) {
      mesh.remove(previous.mesh);
      previous.mesh.geometry.dispose();
    }
    chunks.set(key, chunk);
    mesh.add(chunk.mesh);
  };

  const requestTexture = (cx, cz) => {
    const x0 = cx * CHUNK_SIZE - size / 2;
    const z0 = cz * CHUNK_SIZE - size / 2;
    if (texInfo.z === x0 && texInfo.w === z0 && dataTex.version > 0) {
      textureJob = null;
      return;
    }
    textureJob = { x0, z0, row: 0, data: new Float32Array(n * n * 4) };
  };

  const updateTexture = (focus, immediate) => {
    if (!textureJob) return;
    const job = textureJob;
    const margin = Math.max(tier.grass.extent / 2, 30) + 4;
    const urgent = immediate || dataTex.version === 0
      || focus.x - margin < texInfo.z || focus.x + margin > texInfo.z + size
      || focus.z - margin < texInfo.w || focus.z + margin > texInfo.w + size;
    const start = performance.now();
    while (job.row < n && (urgent || performance.now() - start < settings.budgetMs)) {
      const iz = job.row++;
      for (let ix = 0; ix < n; ix++) {
        const x = job.x0 + ix * TERRAIN_STEP, z = job.z0 + iz * TERRAIN_STEP;
        // Reuse overlap directly: do not resample most of the atlas on a boundary crossing.
        const ox = (x - texInfo.z) / TERRAIN_STEP, oz = (z - texInfo.w) / TERRAIN_STEP;
        const offset = (iz * n + ix) * 4;
        if (dataTex.version > 0 && ox >= 0 && ox < n && oz >= 0 && oz < n) {
          const source = (oz * n + ox) * 4;
          job.data.set(dataTex.image.data.subarray(source, source + 4), offset);
        } else {
          job.data.set(generator.sampleAt(x, z).data, offset);
        }
      }
    }
    if (job.row === n) {
      dataTex.image.data = job.data;
      texInfo.z = job.x0;
      texInfo.w = job.z0;
      dataTex.needsUpdate = true;
      textureJob = null;
    }
  };

  const update = (focus, { immediate = false } = {}) => {
    if (disposed) return;
    const center = chunkAt(focus.x, focus.z);
    const key = chunkKey(center.x, center.z);
    if (key !== centerKey) {
      centerKey = key;
      const wanted = new Set();
      pending = [];
      for (let dz = -settings.radius; dz <= settings.radius; dz++) {
        for (let dx = -settings.radius; dx <= settings.radius; dx++) {
          const x = center.x + dx, z = center.z + dz;
          const distance = Math.max(Math.abs(dx), Math.abs(dz));
          const segments = distance <= settings.detailRadius ? CHUNK_SIZE / TERRAIN_STEP
            : distance <= settings.detailRadius + 2 ? 16 : 8;
          const k = chunkKey(x, z);
          wanted.add(k);
          if (chunks.get(k)?.segments !== segments) pending.push({ x, z, segments, distance });
        }
      }
      for (const [k, chunk] of chunks) {
        if (!wanted.has(k)) {
          mesh.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
          chunks.delete(k);
        }
      }
      pending.sort((a, b) => a.distance - b.distance);
      requestTexture(center.x, center.z);
    }
    updateTexture(focus, immediate);
    const start = performance.now();
    // Always finish the player's collision neighborhood before rendering, even after a teleport.
    while (pending.length && (immediate || pending[0].distance <= 1 || performance.now() - start < settings.budgetMs)) {
      install(pending.shift());
    }
  };

  return {
    ...generator, mesh, chunks, dataTex, texInfo, size, half: size / 2, update,
    dispose() {
      disposed = true;
      pending = [];
      textureJob = null;
      for (const chunk of chunks.values()) chunk.mesh.geometry.dispose();
      chunks.clear();
      mesh.clear();
      material.dispose();
      dataTex.dispose();
      generator.clearCache();
    },
  };
}

function createTerrainMaterial(T) {
  const C = (hex) => ({ value: new THREE.Color(hex) });
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  return patchMaterial(m, {
    key: 'terrain',
    uniforms: {
      uCGrassA: C(T.grassA), uCGrassB: C(T.grassB), uCDry: C(T.dry), uCDirt: C(T.dirt),
      uCSand: C(T.sand), uCRock: C(T.rock), uCRock2: C(T.rock2), uCSnow: C(T.snow), uCSeabed: C(T.seabed),
    },
    vertexHead: /* glsl */ `
attribute vec4 aSplatA;
attribute vec4 aSplatB;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying vec3 vUfWp;
`,
    vertex: {
      '#include <project_vertex>': /* glsl */ `
#include <project_vertex>
vSplatA = aSplatA;
vSplatB = aSplatB;
vUfWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
`,
    },
    fragmentHead: /* glsl */ `
uniform vec3 uCGrassA; uniform vec3 uCGrassB; uniform vec3 uCDry; uniform vec3 uCDirt;
uniform vec3 uCSand; uniform vec3 uCRock; uniform vec3 uCRock2; uniform vec3 uCSnow; uniform vec3 uCSeabed;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying vec3 vUfWp;
`,
    fragment: {
      '#include <color_fragment>': /* glsl */ `
#include <color_fragment>
vec3 ufP = vUfWp;
float ufCamD = length(vViewPosition);
float ufDetail = 1.0 - smoothstep(55.0, 150.0, ufCamD);
float nMac = uf_fbm(ufP.xz * 0.018, 3);
float nMid = uf_fbm(ufP.xz * 0.11, 3);
float nFine = uf_noise(ufP.xz * 1.7);
float nRock = uf_fbm(ufP.xz * 0.25 + ufP.y * 0.12, 3);

// 高度混合：每层“高度” = 权重 + 噪声，只保留接近最高的几层
float hG = vSplatA.x + (nMid - 0.5) * 0.5;
float hD = vSplatA.y + (0.5 - nMid) * 0.5;
float hDi = vSplatA.z + (nFine - 0.5) * 0.45;
float hS = vSplatA.w + (nMid - 0.5) * 0.3;
float hR = vSplatB.x + (nRock - 0.5) * 0.65;
float hSn = vSplatB.y + (nMid - 0.5) * 0.4;
float hSb = vSplatB.z;
float hMax = max(max(max(hG, hD), max(hDi, hS)), max(max(hR, hSn), hSb));
const float BW = 0.2;
float wG = max(hG - hMax + BW, 0.0);
float wD = max(hD - hMax + BW, 0.0);
float wDi = max(hDi - hMax + BW, 0.0);
float wS = max(hS - hMax + BW, 0.0);
float wR = max(hR - hMax + BW, 0.0);
float wSn = max(hSn - hMax + BW, 0.0);
float wSb = max(hSb - hMax + BW, 0.0);
float wSum = wG + wD + wDi + wS + wR + wSn + wSb + 1e-4;

vec3 cG = mix(uCGrassA, uCGrassB, smoothstep(0.3, 0.72, nMac)) * (0.8 + 0.4 * nMid);
vec3 cD = uCDry * (0.85 + 0.3 * nFine);
vec3 cDi = uCDirt * (0.7 + 0.45 * mix(0.5, uf_noise(ufP.xz * 4.5), ufDetail));
vec3 cS = uCSand * (0.9 + 0.12 * sin(ufP.x * 1.4 + nMid * 7.0) * ufDetail);
float strata = uf_noise(vec2(ufP.y * 0.85, (ufP.x + ufP.z) * 0.03));
vec3 cR = mix(uCRock2, uCRock, smoothstep(0.2, 0.8, strata)) * (0.78 + 0.4 * nFine);
vec3 cSn = uCSnow * (0.94 + 0.06 * nFine);
vec3 alb = (cG * wG + cD * wD + cDi * wDi + cS * wS + cR * wR + cSn * wSn + uCSeabed * wSb) / wSum;

float ufWet = 1.0 - smoothstep(0.15, 1.3, ufP.y);
alb *= 1.0 - ufWet * 0.35;
alb *= mix(0.32, 1.0, vSplatB.w);
diffuseColor.rgb = alb;

float ufRockW = wR / wSum;
float ufSnowW = wSn / wSum;
float ufRough = (0.96 * (wG + wD) + 0.93 * wDi + 0.9 * wS + 0.8 * wR + 0.45 * wSn + 0.55 * wSb) / wSum;
ufRough = mix(ufRough, 0.32, ufWet * 0.75);
`,
      '#include <roughnessmap_fragment>': /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = ufRough;
`,
      '#include <normal_fragment_maps>': /* glsl */ `
#include <normal_fragment_maps>
{
  float bh = (uf_fbm(ufP.xz * 0.6 + ufP.y * 0.2, 3) * 0.6 + uf_noise(ufP.xz * 2.8) * 0.12) * ufRockW
           + uf_noise(ufP.xz * 3.6) * 0.04 * (1.0 - ufRockW - ufSnowW)
           + uf_noise(ufP.xz * 0.9) * 0.08 * ufSnowW;
  bh *= ufDetail;
  vec3 sp = -vViewPosition;
  vec3 sx = dFdx(sp);
  vec3 sy = dFdy(sp);
  float bhx = dFdx(bh);
  float bhy = dFdy(bh);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (bhx * r1 + bhy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`,
      '#include <lights_fragment_end>': /* glsl */ `
#include <lights_fragment_end>
float ufCs = uf_cloudShadowAt(vUfWp);
reflectedLight.directDiffuse *= 1.0 - ufCs;
reflectedLight.directSpecular *= 1.0 - ufCs;
`,
    },
  });
}
