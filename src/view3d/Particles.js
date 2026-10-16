import * as THREE from 'three';
import { globalUniforms, GLOBALS_GLSL, NOISE_GLSL, TERRAIN_TEX_GLSL } from './shaders.js';

/**
 * 环境粒子：白天是随风飘的花粉 / 尘埃，夜晚变成一闪一闪的萤火虫。
 * 和草地一样围绕玩家平铺，全部在 GPU 上计算。
 */
const VERT = /* glsl */ `
${GLOBALS_GLSL}
${NOISE_GLSL}
${TERRAIN_TEX_GLSL}
uniform sampler2D uTerrain;
uniform vec4 uTerrainInfo;
uniform float uExtent;
uniform vec3 uColDay;
uniform vec3 uColNight;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 r = position; // 三个 0..1 随机数
  vec2 drift = vec2(sin(uTime * 0.31 + r.y * 20.0), cos(uTime * 0.27 + r.x * 17.0)) * 1.8;
  vec2 off = r.xz * uExtent + drift + uWind * uTime * 0.7 * (1.0 - uNight);
  vec2 xz = uPlayer.xz + mod(off - uPlayer.xz, uExtent) - 0.5 * uExtent;
  float ground = uf_terrainTex(uTerrain, xz, uTerrainInfo).x;
  float y = ground + 0.4 + r.y * mix(5.0, 2.2, uNight) + sin(uTime * 0.8 + r.x * 30.0) * 0.35;
  vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
  gl_Position = projectionMatrix * mv;

  float d = length(xz - uPlayer.xz) / (0.5 * uExtent);
  float edge = 1.0 - smoothstep(0.65, 1.0, d);
  float blink = smoothstep(0.2, 1.0, sin(uTime * (1.2 + r.z * 2.2) + r.x * 40.0));
  vA = edge * mix(0.45, blink, uNight) * step(0.4, ground);
  vCol = mix(uColDay * (0.6 + uSunColor * 0.5), uColNight * 5.0, uNight);
  gl_PointSize = clamp(mix(1.6, 4.5, uNight) * uPixelRatio * 18.0 / max(-mv.z, 0.1), 1.0, 14.0 * uPixelRatio);
}
`;

const FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}
`;

export function createParticles({ terrain, visuals, tier, rng }) {
  const count = tier.particles;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = rng.next();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const P = visuals.particles;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...globalUniforms,
      uTerrain: { value: terrain.dataTex },
      uTerrainInfo: { value: terrain.texInfo },
      uExtent: { value: 56 },
      uColDay: { value: new THREE.Color(P.day) },
      uColNight: { value: new THREE.Color(P.night) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.name = 'particles';
  return points;
}
