import * as THREE from 'three';
import { globalUniforms, GLOBALS_GLSL, NOISE_GLSL, TERRAIN_TEX_GLSL } from './shaders.js';

/**
 * 水面（或熔岩）：
 *  - 用地形数据纹理算水深：浅滩透出青绿色，深处变暗蓝，岸边一圈泡沫
 *  - 法线由多层滚动噪声得到，按天空颜色做菲涅尔反射 + 太阳高光（交给辉光）
 *  - 熔岩：发光的流动裂纹，不透明
 */
const VERT = /* glsl */ `
${GLOBALS_GLSL}
#include <fog_pars_vertex>
varying vec3 vWp;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
${GLOBALS_GLSL}
${NOISE_GLSL}
${TERRAIN_TEX_GLSL}
#include <fog_pars_fragment>
uniform sampler2D uTerrain;
uniform vec4 uTerrainInfo;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uSeaLevel;
varying vec3 vWp;

vec2 waveGrad(vec2 p) {
  vec2 e = vec2(0.35, 0.0);
  vec2 d1 = uWind * uTime * 0.6;
  vec2 d2 = vec2(-uWind.y, uWind.x) * uTime * 0.45;
  #define WH(q) (uf_noise((q) * 0.28 + d1) * 0.6 + uf_noise((q) * 0.71 - d2) * 0.3 + uf_noise((q) * 1.9 + d1 * 1.7) * 0.12)
  float h0 = WH(p);
  float hx = WH(p + e.xy);
  float hz = WH(p + e.yx);
  #undef WH
  return vec2(hx - h0, hz - h0) / e.x;
}

void main() {
  vec3 V = cameraPosition - vWp;
  float dist = length(V);
  V /= dist;
  float detail = 1.0 - smoothstep(60.0, 260.0, dist);

  vec2 g = waveGrad(vWp.xz) * (0.12 + 0.3 * detail);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  // 水深（地形范围外视为深海）
  vec2 inside = step(uTerrainInfo.zw, vWp.xz) * step(vWp.xz, uTerrainInfo.zw + uTerrainInfo.x);
  float ground = mix(-60.0, uf_terrainTex(uTerrain, vWp.xz, uTerrainInfo).x, inside.x * inside.y);
  float depth = max(uSeaLevel - ground, 0.0);

#ifdef LAVA
  float flow = uf_fbm(vWp.xz * 0.06 + vec2(uTime * 0.02, -uTime * 0.013), 4);
  float cracks = 1.0 - smoothstep(0.0, 0.06, abs(uf_fbm(vWp.xz * 0.12 - uTime * 0.01, 4) - 0.5));
  vec3 col = mix(uDeep * 0.35, uShallow, smoothstep(0.35, 0.75, flow));
  vec3 crust = vec3(0.05, 0.035, 0.03) * (0.6 + 0.4 * uf_noise(vWp.xz * 0.8));
  float crustK = smoothstep(0.45, 0.6, uf_fbm(vWp.xz * 0.09 + 3.0, 3)) * (1.0 - cracks);
  col = mix(col * (2.6 + cracks * 3.0), crust, crustK * 0.85);
  col += uShallow * (1.0 - smoothstep(0.0, 1.5, depth)) * 1.5;
  gl_FragColor = vec4(col, 1.0);
#else
  float mu = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - mu, 5.0);

  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(R.y, 0.5));
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 380.0) * 26.0 + pow(max(dot(N, H), 0.0), 40.0) * 0.6;

  float shallowK = exp(-depth * 0.32);
  vec3 body = mix(uDeep, uShallow, shallowK) * (uSunColor * 0.55 + uAmbient * 0.9);
  float sss = pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 4.0) * 0.25;
  body += uShallow * sss * uSunColor;

  vec3 col = mix(body, sky, fres) + uSunColor * spec * (1.0 - uf_cloudShadowAt(vWp));

  // 岸边泡沫：沿岸线的波动条纹
  float shore = exp(-depth * 1.4);
  float bands = sin(depth * 6.0 - uTime * 1.6 + uf_noise(vWp.xz * 0.5) * 6.0) * 0.5 + 0.5;
  float foamN = uf_noise(vWp.xz * 2.4 + uWind * uTime * 0.4);
  float foam = clamp(shore * (0.55 + 0.45 * bands) * smoothstep(0.3, 0.7, foamN + shore * 0.4), 0.0, 1.0) * detail;
  col = mix(col, (uSunColor + uAmbient) * 0.95, foam);

  // 近处按水深透明（能看到浅滩的沙底），远处不透明
  float alpha = clamp(1.0 - exp(-depth * 0.9) + fres * 0.4 + foam, 0.0, 1.0);
  alpha = mix(1.0, alpha, detail);
  gl_FragColor = vec4(col, alpha);
#endif
  #include <fog_fragment>
}
`;

export function createWater({ visuals, terrain }) {
  const W = visuals.water;
  const lava = !!W.lava;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...globalUniforms,
      uTerrain: { value: terrain.dataTex },
      uTerrainInfo: { value: terrain.texInfo },
      uShallow: { value: new THREE.Color(W.shallow) },
      uDeep: { value: new THREE.Color(W.deep) },
      uSeaLevel: { value: terrain.seaLevel },
    },
    defines: lava ? { LAVA: '' } : {},
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: !lava,
    depthWrite: lava,
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1100, 96).rotateX(-Math.PI / 2), mat);
  mesh.position.y = terrain.seaLevel;
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return mesh;
}
