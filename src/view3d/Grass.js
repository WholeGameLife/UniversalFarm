import * as THREE from 'three';
import { patchMaterial, TERRAIN_TEX_GLSL } from './shaders.js';

/**
 * GPU 草地：固定数量的草叶实例围绕玩家“无限平铺”，位置在顶点着色器里算。
 *  - 用地形数据纹理贴地、读草密度 / 枯黄度 / AO
 *  - 开垦过的农田格通过 uFarmMask 把草清掉
 *  - 风：阵风噪声 + 随机倾斜；玩家走过时草向两侧分开
 *  - 逆光透射 + 云影；少量草叶顶端是小花
 * CPU 每帧零开销，数量由画质档位决定。
 */
export function createGrass({ terrain, visuals, tier, rng, farm }) {
  const { count, extent } = tier.grass;
  const G = visuals.grass;
  const T = visuals.terrain;

  // 草叶几何：一片向上收窄的叶子，position.y ∈ [0,1]，x 为宽度方向
  const levels = [0, 0.2, 0.42, 0.62, 0.8, 0.92, 1];
  const widths = [1, 0.95, 0.85, 0.7, 0.5, 0.3, 0];
  const pos = [];
  const idx = [];
  levels.forEach((y, i) => {
    if (i === levels.length - 1) pos.push(0, y, 0);
    else pos.push(-0.5 * widths[i], y, 0, 0.5 * widths[i], y, 0);
  });
  for (let i = 0; i < levels.length - 2; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const tipBase = (levels.length - 2) * 2;
  idx.push(tipBase, tipBase + 1, tipBase + 2);

  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));

  // 分层抖动采样：分布均匀又不规则
  const side = Math.ceil(Math.sqrt(count));
  const offs = new Float32Array(count * 2);
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    offs[i * 2] = ((i % side) + rng.next()) / side;
    offs[i * 2 + 1] = (Math.floor(i / side) + rng.next()) / side;
    rnd.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const C = (h) => ({ value: new THREE.Color(h) });
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
  patchMaterial(mat, {
    key: 'grass',
    uniforms: {
      uTerrain: { value: terrain.dataTex },
      uTerrainInfo: { value: terrain.texInfo },
      uExtent: { value: extent },
      uHeight: { value: G.height },
      uWidth: { value: 0.16 },
      uFarmRect: { value: farm.rect },
      uFarmMask: { value: farm.mask },
      uGrassA: C(T.grassA),
      uGrassB: C(T.grassB),
      uDry: C(T.dry),
      uFlowerA: C(G.flowers[0]),
      uFlowerB: C(G.flowers[1]),
      uFlowerC: C(G.flowers[2]),
    },
    vertexHead: /* glsl */ `
${TERRAIN_TEX_GLSL}
attribute vec2 aOffset;
attribute vec4 aRand;
uniform sampler2D uTerrain;
uniform vec4 uTerrainInfo;
uniform float uExtent;
uniform float uHeight;
uniform float uWidth;
uniform vec4 uFarmRect;
uniform sampler2D uFarmMask;
varying float vGT;
varying float vGDry;
varying float vGAo;
varying float vGRand;
varying float vGFlower;
varying vec3 vGWp;
`,
    vertex: {
      '#include <beginnormal_vertex>': /* glsl */ `
vec2 gOff = aOffset * uExtent;
vec2 gXZ = uPlayer.xz + mod(gOff - uPlayer.xz, uExtent) - 0.5 * uExtent;
vec4 gTd = uf_terrainTex(uTerrain, gXZ, uTerrainInfo);
float gDist = length(gXZ - uPlayer.xz) / (0.5 * uExtent);
float gDens = gTd.y;
vec2 gFuv = (gXZ - uFarmRect.xy) / (uFarmRect.zw - uFarmRect.xy);
if (gFuv.x > 0.0 && gFuv.y > 0.0 && gFuv.x < 1.0 && gFuv.y < 1.0) {
  gDens *= 1.0 - texture(uFarmMask, gFuv).r;
}
float gLive = smoothstep(aRand.x - 0.1, aRand.x, gDens) * (1.0 - smoothstep(0.72, 1.0, gDist));
float gH = uHeight * (0.45 + aRand.y * 0.9) * gLive * (0.7 + 0.6 * uf_noise(gXZ * 0.07));
float gFlower = step(0.972, fract(aRand.y * 37.17)) * step(0.5, gLive);
float gT = position.y;
float gAng = aRand.z * 6.2831853;
vec3 gSide = vec3(cos(gAng), 0.0, sin(gAng));
vec3 gFace = vec3(-sin(gAng), 0.0, cos(gAng));
float gW = uWidth * (0.7 + 0.6 * aRand.w) * (1.0 + gFlower * 5.0 * smoothstep(0.6, 0.86, gT));
float gGust = uf_noise(gXZ * 0.05 - uWind * uTime * 0.25);
vec2 gWind = normalize(uWind + vec2(1e-4)) * (0.2 + gGust * 0.95)
           + vec2(sin(uTime * 2.1 + gXZ.x * 0.7), cos(uTime * 1.7 + gXZ.y * 0.6)) * 0.1;
vec2 gLean = (vec2(aRand.w, fract(aRand.z * 7.31)) - 0.5) * 0.7 + gWind * 0.9;
vec2 gPd = gXZ - uPlayer.xz;
float gPl = length(gPd);
gLean += gPd / max(gPl, 1e-3) * (1.0 - smoothstep(0.4, 1.8, gPl)) * 1.6 * step(uPlayer.y - gTd.x, 1.5);
vec2 gBend = gLean * gT * gT * gH * 0.6;
float gY = gT * gH * (1.0 - 0.22 * min(dot(gLean, gLean), 1.5) * gT);
vec3 gPos = vec3(gXZ.x, gTd.x - 0.04, gXZ.y) + gSide * position.x * gW + vec3(gBend.x, gY, gBend.y);
vec3 objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), gFace, 0.3));
vGT = gT;
vGDry = gTd.z;
vGAo = gTd.w;
vGRand = aRand.y;
vGFlower = gFlower;
vGWp = gPos;
`,
      '#include <begin_vertex>': 'vec3 transformed = gPos;',
    },
    fragmentHead: /* glsl */ `
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uDry;
uniform vec3 uFlowerA;
uniform vec3 uFlowerB;
uniform vec3 uFlowerC;
varying float vGT;
varying float vGDry;
varying float vGAo;
varying float vGRand;
varying float vGFlower;
varying vec3 vGWp;
`,
    fragment: {
      '#include <color_fragment>': /* glsl */ `
#include <color_fragment>
{
  vec3 base = uGrassA * 0.42;
  vec3 tip = mix(uGrassB, uDry, vGDry) * (0.8 + 0.4 * vGRand);
  vec3 gc = mix(base, tip, smoothstep(0.0, 0.95, vGT));
  gc *= mix(0.4, 1.0, vGAo) * mix(0.5, 1.0, smoothstep(0.0, 0.45, vGT));
  if (vGFlower > 0.5 && vGT > 0.6) {
    float k = fract(vGRand * 13.7);
    gc = k < 0.4 ? uFlowerA : (k < 0.75 ? uFlowerB : uFlowerC);
  }
  diffuseColor.rgb = gc;
}
`,
      '#include <normal_fragment_begin>': /* glsl */ `
#include <normal_fragment_begin>
normal = normalize(vNormal);
`,
      '#include <lights_fragment_end>': /* glsl */ `
#include <lights_fragment_end>
{
  float cs = uf_cloudShadowAt(vGWp);
  reflectedLight.directDiffuse *= 1.0 - cs;
  reflectedLight.directSpecular *= 1.0 - cs;
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float back = pow(max(dot(-geometryViewDir, sunV), 0.0), 4.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * back * 0.9 * vGT * (1.0 - cs);
}
`,
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = tier.shadows;
  mesh.name = 'grass';
  return mesh;
}
