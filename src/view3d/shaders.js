import * as THREE from 'three';

/**
 * 3D 表现层共享的着色器工具：
 *  - globalUniforms：全局时间 / 风 / 玩家位置 / 云层等，所有自定义材质共用同一份引用
 *  - GLSL 片段：噪声、云、地形数据采样
 *  - patchMaterial：给 three 内置材质注入代码（必须带 key，避免不同补丁误共用同一个 shader 程序）
 *  - installAtmosphereFog：把 three 的雾替换为「指数高度雾」
 */

export const globalUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.85, 0.45) },
  uPlayer: { value: new THREE.Vector3() },
  uCloudCover: { value: 0.5 },
  uCloudShadow: { value: 0 },
  uGlowBoost: { value: 1 }, // 夜晚发光植物 / 作物更亮
  uNight: { value: 0 },
  uPixelRatio: { value: 1 },
  // 由 Sky 每帧写入，水面等自定义着色器使用
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSkyZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
  uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uAmbient: { value: new THREE.Color(0.3, 0.35, 0.4) },
};

export const GLOBALS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uPlayer;
uniform float uCloudCover;
uniform float uCloudShadow;
uniform float uGlowBoost;
uniform float uNight;
uniform float uPixelRatio;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uAmbient;
`;

export const NOISE_GLSL = /* glsl */ `
float uf_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float uf_hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 uf_hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float uf_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = uf_hash12(i);
  float b = uf_hash12(i + vec2(1.0, 0.0));
  float c = uf_hash12(i + vec2(0.0, 1.0));
  float d = uf_hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float uf_noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = uf_hash13(i);
  float n100 = uf_hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = uf_hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = uf_hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = uf_hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = uf_hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = uf_hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = uf_hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}
float uf_fbm(vec2 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * uf_noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
float uf_fbm3(vec3 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * uf_noise3(p);
    p = p * 2.07 + vec3(13.7, 5.3, 9.1);
    a *= 0.5;
  }
  return s;
}

// ---- 云：天穹、天体、地面云影共用同一套参数，保证地上的云影和天上的云对得上 ----
// 云层是高度 CLOUD_H 的一张平面，天穹按视线与它的交点取样
const float UF_CLOUD_K = 2.2;
const float UF_CLOUD_H = 220.0;
float uf_cloudField(vec2 p, int oct) {
  float n = uf_fbm(p, oct);
  n = (n - 0.47) * 2.3 + 0.5;
  return smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.32, n);
}
vec2 uf_cloudDrift() {
  return uWind * uTime * 0.03;
}
vec2 uf_cloudUv(vec3 dir) {
  return dir.xz / (max(dir.y, 0.0) + 0.08) * UF_CLOUD_K + cameraPosition.xz * (UF_CLOUD_K / UF_CLOUD_H) + uf_cloudDrift();
}
float uf_cloudShadowAt(vec3 wp) {
  if (uCloudShadow <= 0.001) return 0.0;
  vec2 hit = wp.xz + uSunDir.xz / max(uSunDir.y, 0.2) * (UF_CLOUD_H - wp.y);
  return uf_cloudField(hit * (UF_CLOUD_K / UF_CLOUD_H) + uf_cloudDrift(), 3) * uCloudShadow;
}
`;

/** Moving terrain atlas: info = (size, vertex count, world origin x, world origin z). */
export const TERRAIN_TEX_GLSL = /* glsl */ `
vec4 uf_terrainTex(sampler2D tex, vec2 xz, vec4 info) {
  float n = info.y;
  float stp = info.x / (n - 1.0);
  vec2 f = clamp((xz - info.zw) / stp, vec2(0.0), vec2(n - 1.001));
  vec2 i = floor(f);
  vec2 t = f - i;
  float d = 1.0 / n;
  vec2 uv = (i + 0.5) * d;
  vec4 a = texture(tex, uv);
  vec4 b = texture(tex, uv + vec2(d, 0.0));
  vec4 c = texture(tex, uv + vec2(0.0, d));
  vec4 e = texture(tex, uv + vec2(d, d));
  return t.x + t.y <= 1.0 ? a + (b - a) * t.x + (c - a) * t.y
    : e + (c - e) * (1.0 - t.x) + (b - e) * (1.0 - t.y);
}
`;

/**
 * 给内置材质打补丁。vertex / fragment 是 { 原文: 替换文 }，head 会插在 <common> 之后。
 * key 必须唯一对应一种补丁：three 用它区分 shader 程序。
 */
export function patchMaterial(material, { key, uniforms = {}, vertexHead = '', fragmentHead = '', vertex = {}, fragment = {} }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globalUniforms, uniforms);
    shader.vertexShader = inject(shader.vertexShader, vertexHead, vertex, key);
    shader.fragmentShader = inject(shader.fragmentShader, fragmentHead, fragment, key);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

function inject(src, head, replaces, key) {
  let out = src.replace('#include <common>', () => `#include <common>\n${GLOBALS_GLSL}\n${NOISE_GLSL}\n${head}\n`);
  for (const [from, to] of Object.entries(replaces)) {
    if (!out.includes(from)) console.warn(`[shader:${key}] 找不到注入点 ${from}`);
    out = out.replace(from, () => to);
  }
  return out;
}

/**
 * 指数高度雾：替换 three 的雾代码块（全局生效，需在任何材质编译前调用）。
 * 使用 THREE.Fog 承载参数：fog.near = 浓度，fog.far = 高度衰减系数。
 * 越低越浓、越远越浓，远山自然溶进地平线。
 */
let fogInstalled = false;
export function installAtmosphereFog() {
  if (fogInstalled) return;
  fogInstalled = true;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  vec3 fogRay = vFogWorldPos - cameraPosition;
  float fogDist = length(fogRay);
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist);
  #else
    float fogK = fogRay.y * fogFar;
    float fogOpt = abs(fogK) > 0.001 ? (1.0 - exp(-fogK)) / fogK : 1.0 - 0.5 * fogK;
    float fogFactor = 1.0 - exp(-fogNear * exp(-cameraPosition.y * fogFar) * fogDist * fogOpt);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
#endif
`;
}

/** 后期调色：饱和度、对比度、色调、暗角（在线性 HDR 空间，色调映射之前） */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.05 },
    uTint: { value: new THREE.Vector3(1.0, 0.99, 0.97) },
    uVignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uTint;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, uSaturation), vec3(0.0));
      c.rgb = pow(c.rgb / 0.18, vec3(uContrast)) * 0.18;
      c.rgb *= uTint;
      vec2 d = vUv - 0.5;
      c.rgb *= clamp(1.0 - dot(d, d) * uVignette * 2.2, 0.0, 1.0);
      gl_FragColor = c;
    }
  `,
};
