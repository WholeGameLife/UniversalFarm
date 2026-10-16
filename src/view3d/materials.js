import * as THREE from 'three';
import { patchMaterial } from './shaders.js';

/**
 * 材质工厂：
 *  - stdMat / physMat / glowMat：按 key 缓存的共享材质（userData.shared = true，场景销毁时不释放）
 *  - makeSway：带风摆的材质（植被 / 作物），需要几何体带 aSway 属性
 */

const cache = new Map();

function cached(key, make) {
  if (!cache.has(key)) {
    const m = make();
    m.userData.shared = true;
    cache.set(key, m);
  }
  return cache.get(key);
}

export const stdMat = (key, params) => cached(key, () => new THREE.MeshStandardMaterial(params));
export const physMat = (key, params) => cached(key, () => new THREE.MeshPhysicalMaterial(params));
/** 纯发光材质（灯、引擎、矿晶），配合辉光后期 */
export const glowMat = (key, color, intensity) =>
  cached(key, () => new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, roughness: 0.6 }));
export const swayMat = (key, params, glow = 0) => cached(key, () => makeSway(params, glow));

/** 画质切换（阴影开关等）后让共享材质重新编译 */
export function invalidateSharedMaterials() {
  cache.forEach((m) => (m.needsUpdate = true));
}

/**
 * 风摆：权重 aSway（米，局部尺度）× 阵风噪声。偏移在视图空间叠加，
 * 因此与实例的旋转无关：整片植物顺着同一个风向摆。相位来自位置，避免整齐划一。
 */
const SWAY_VERTEX = {
  '#include <project_vertex>': /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  vec3 swIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float swScale = length(instanceMatrix[1].xyz);
#else
  vec3 swIp = vec3(0.0);
  float swScale = 1.0;
#endif
swIp = (modelMatrix * vec4(swIp, 1.0)).xyz;
swScale *= length(modelMatrix[1].xyz);
float swPh = swIp.x * 0.21 + swIp.z * 0.17;
float swGust = uf_noise(swIp.xz * 0.045 - uWind * uTime * 0.18);
vec2 swW = normalize(uWind + vec2(1e-4)) * (sin(uTime * 1.3 + swPh) * 0.3 + swGust * 0.9)
         + vec2(sin(uTime * 2.3 + swPh * 1.7), cos(uTime * 1.9 + swPh)) * 0.12;
mvPosition = modelViewMatrix * mvPosition;
mvPosition.xyz += mat3(viewMatrix) * vec3(swW.x, 0.0, swW.y) * aSway * swScale;
gl_Position = projectionMatrix * mvPosition;
`,
};

export function makeSway(params, glow = 0) {
  const m = new THREE.MeshStandardMaterial(params);
  if (glow > 0) {
    patchMaterial(m, {
      key: 'flora-glow',
      uniforms: { uEmis: { value: glow } },
      vertexHead: 'attribute float aSway;',
      vertex: SWAY_VERTEX,
      fragmentHead: 'uniform float uEmis;',
      fragment: {
        '#include <emissivemap_fragment>': /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uEmis * uGlowBoost;
`,
      },
    });
  } else {
    patchMaterial(m, { key: 'flora', vertexHead: 'attribute float aSway;', vertex: SWAY_VERTEX });
  }
  return m;
}
