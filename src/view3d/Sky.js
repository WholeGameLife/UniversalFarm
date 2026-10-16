import * as THREE from 'three';
import { globalUniforms, GLOBALS_GLSL, NOISE_GLSL } from './shaders.js';
import { smoothstep } from './geom.js';

/**
 * 天空与大气：
 *  - 天穹：天顶→地平线渐变、太阳光晕与日轮、夜晚星空 + 星云银河带
 *  - 云层：独立的半球，带自阴影与银边，和地面云影共用同一套噪声
 *  - 天体：天空中的巨行星（带光环）/ 卫星，按真实太阳方向受光，有大气边缘光
 *  - 光照：太阳 / 月光方向光（投影）、夜间补光、指数高度雾、晨雾
 *  - envScene：简化天空，供 World3D 生成环境光贴图（IBL）
 */

const BODY_DIST = 1300; // 天体放在云层（1000）之外，云会从行星前飘过
const SKY_GAIN = 1.2;

const C = (hex) => new THREE.Color(hex);
const _c = new THREE.Color();

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */ `
${GLOBALS_GLSL}
${NOISE_GLSL}
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunDisc;
uniform vec3 uNebA;
uniform vec3 uNebB;
uniform vec3 uBandN;
uniform float uDusk;
uniform float uSunVis;
uniform float uStarRot;
varying vec3 vDir;

float starLayer(vec3 d, float scale, float thresh) {
  vec3 p = d * scale;
  vec3 c = floor(p);
  vec3 h = uf_hash33(c);
  vec3 f = fract(p) - 0.5 - (h - 0.5) * 0.55;
  float on = step(thresh, h.x);
  float s = (1.0 - smoothstep(0.0, 0.2, length(f))) * on;
  float tw = 0.6 + 0.4 * sin(uTime * (1.2 + h.y * 3.0) + h.z * 40.0);
  return s * tw * (0.35 + h.y * 1.4);
}

void main() {
  vec3 dir = normalize(vDir);
  float y = dir.y;

  vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.48));
  col = mix(col, uHorizon * 0.72, smoothstep(0.0, 0.3, -y));

  // 太阳：宽光晕 + 窄光晕 + 日轮（HDR，交给辉光）
  float mu = dot(dir, uSunDir);
  float m = max(mu, 0.0);
  col += uGlow * (pow(m, 5.0) * 0.55 + pow(m, 48.0) * 1.2) * (0.3 + uDusk) * uSunVis;
  col += uGlow * uDusk * pow(mu * 0.5 + 0.5, 3.0) * exp(-abs(y) * 7.0) * 0.7;
  col += uSunDisc * smoothstep(0.99935, 0.99972, mu) * 40.0 * uSunVis;

  // 夜空
  if (uNight > 0.01) {
    float cr = cos(uStarRot);
    float sr = sin(uStarRot);
    vec3 sd = vec3(dir.x * cr - dir.z * sr, dir.y, dir.x * sr + dir.z * cr);
    float hf = smoothstep(-0.02, 0.22, y);
    float stars = starLayer(sd, 160.0, 0.988) + starLayer(sd, 380.0, 0.993) * 0.55;
    float bd = dot(sd, uBandN) * 3.4;
    float band = exp(-bd * bd);
    float neb = uf_fbm3(sd * 2.6 + 3.0, 5);
    float neb2 = uf_fbm3(sd * 6.5 - 7.0, 4);
    vec3 nebCol = mix(uNebA, uNebB, smoothstep(0.35, 0.65, neb2)) * pow(neb, 2.4) * band * 1.4;
    float dust = smoothstep(0.42, 0.62, uf_fbm3(sd * 8.0, 3)) * band;
    nebCol *= 1.0 - dust * 0.75;
    stars *= 1.0 + band * 1.5;
    vec3 night = stars * vec3(1.0, 0.96, 0.9) * 2.4 + nebCol * 0.55 + uNebB * band * 0.012;
    col += night * uNight * hf;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
${GLOBALS_GLSL}
${NOISE_GLSL}
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  if (dir.y <= 0.0) discard;
  vec2 uv = uf_cloudUv(dir);
  float d = uf_cloudField(uv, OCT);
  if (d < 0.004) discard;
  vec2 so = normalize(uSunDir.xz + vec2(1e-4)) * 0.16;
  float d2 = uf_cloudField(uv + so, OCT2);
  float lit = clamp(1.0 - d2 * 0.9 + d * 0.3, 0.12, 1.0);
  float mu = max(dot(dir, uSunDir), 0.0);
  float silver = pow(mu, 10.0) * (1.0 - d) * 2.6;
  vec3 amb = mix(uSkyHorizon, uSkyZenith, 0.45) * 0.85 + uAmbient * 0.25;
  vec3 col = amb * (0.75 + 0.25 * (1.0 - d)) + uSunColor * (lit * 0.95 + silver);
  float hz = smoothstep(0.0, 0.2, dir.y);
  col = mix(uSkyHorizon, col, 0.3 + 0.7 * hz);
  gl_FragColor = vec4(col, d * hz * 0.96);
}
`;

const BODY_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vL;
varying vec3 vW;
void main() {
  vL = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const BODY_FRAG = /* glsl */ `
${GLOBALS_GLSL}
${NOISE_GLSL}
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uAtmo;
uniform float uKind;
uniform float uSeed;
varying vec3 vN;
varying vec3 vL;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  vec3 l = normalize(vL);
  float pat;
  if (uKind < 0.5) {
    // 气态巨行星：纬向条带 + 湍流
    float turb = uf_fbm3(l * vec3(2.2, 7.0, 2.2) + uSeed, 4);
    pat = uf_fbm(vec2(l.y * 7.5 + turb * 1.7, uSeed * 3.1), 4);
    pat += smoothstep(0.6, 0.75, uf_fbm3(l * 5.0 - uSeed, 3)) * 0.2;
  } else {
    // 岩质卫星：斑块 + 环形山
    pat = uf_fbm3(l * 3.2 + uSeed, 5);
    float cr = uf_noise3(l * 11.0 + uSeed);
    pat -= smoothstep(0.62, 0.7, cr) * 0.18 - smoothstep(0.7, 0.74, cr) * 0.12;
  }
  vec3 base = mix(uColB, uColA, smoothstep(0.28, 0.72, pat));
  float ndl = dot(n, uSunDir);
  float lit = smoothstep(-0.1, 0.35, ndl);
  vec3 v = normalize(cameraPosition - vW);
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);
  vec3 col = base * (lit * 1.3 + 0.012) + uAtmo * rim * (0.1 + 0.9 * smoothstep(-0.35, 0.4, ndl));
  // 白天：暗面几乎透明（前方大气散射盖住了它），亮面清晰；夜晚完全不透明
  float aDay = clamp(0.1 + lit * 0.8 + rim * 0.3, 0.0, 0.92);
  gl_FragColor = vec4(col, mix(aDay, 1.0, uNight));
}
`;

const RING_FRAG = /* glsl */ `
${GLOBALS_GLSL}
${NOISE_GLSL}
uniform vec3 uRingCol;
uniform float uSeed;
uniform float uR;
uniform vec3 uCenter;
varying vec3 vN;
varying vec3 vL;
varying vec3 vW;
void main() {
  float r = length(vL.xy);
  float t = (r - 1.35) / 0.95;
  float bands = uf_fbm(vec2(r * 22.0, uSeed), 4);
  float a = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.86, 1.0, t)) * (0.2 + 0.8 * bands);
  a *= 1.0 - (1.0 - smoothstep(0.0, 0.03, abs(t - 0.63))) * 0.9;
  vec3 p = vW - uCenter;
  float d = dot(p, uSunDir);
  float perp = length(p - d * uSunDir);
  float shadow = step(d, 0.0) * (1.0 - smoothstep(uR * 0.96, uR * 1.03, perp));
  vec3 col = uRingCol * (0.12 + 1.15 * (1.0 - shadow)) * (0.75 + 0.5 * bands);
  gl_FragColor = vec4(col, a * mix(0.5, 0.88, uNight));
}
`;

const ENV_FRAG = /* glsl */ `
${GLOBALS_GLSL}
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uGround;
uniform float uDusk;
uniform float uSunVis;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float y = dir.y;
  vec3 col = y > 0.0 ? mix(uHorizon, uZenith, pow(y, 0.48)) : mix(uHorizon * 0.8, uGround, smoothstep(0.0, 0.35, -y));
  col += uGlow * pow(max(dot(dir, uSunDir), 0.0), 4.0) * (0.25 + uDusk) * uSunVis;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene, visuals, rng, tier) {
    this.scene = scene;
    this.tier = tier;
    const sky = visuals.sky;
    this.cfg = sky;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.cols = {
      dayZ: C(sky.day.zenith), dayH: C(sky.day.horizon),
      duskZ: C(sky.dusk.zenith), duskH: C(sky.dusk.horizon), glow: C(sky.dusk.glow),
      nightZ: C(sky.night.zenith), nightH: C(sky.night.horizon),
      sun: C(sky.sun), duskSun: C('#ffae6a'), moon: C(sky.moonLight),
      ground: C(visuals.terrain.grassA),
    };

    const bandN = new THREE.Vector3(rng.next() - 0.5, rng.next() * 0.6 + 0.6, rng.next() - 0.5).normalize();
    this.u = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uSunDisc: { value: C(sky.sun) },
      uGround: { value: new THREE.Color() },
      uNebA: { value: C(sky.nebula[0]) },
      uNebB: { value: C(sky.nebula[1]) },
      uBandN: { value: bandN },
      uDusk: { value: 0 },
      uSunVis: { value: 1 },
      uStarRot: { value: 0 },
    };
    const U = { ...globalUniforms, ...this.u };

    // 天穹
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 64, 32),
      new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // 云层（上半球）
    const oct = tier.cloudOctaves;
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: U,
        defines: { OCT: oct, OCT2: Math.max(2, oct - 1) },
        vertexShader: SKY_VERT,
        fragmentShader: CLOUD_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        fog: false,
      })
    );
    this.clouds.renderOrder = -8;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);

    // 天体
    this.bodies = [];
    (sky.bodies ?? []).forEach((b, i) => this.addBody(b, i, rng));

    // 环境光贴图用的简化天空
    this.envScene = new THREE.Scene();
    this.envScene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(50, 32, 16),
        new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: ENV_FRAG, side: THREE.BackSide, depthWrite: false, fog: false })
      )
    );

    // 光照
    this.light = new THREE.DirectionalLight(0xffffff, 3);
    this.light.castShadow = tier.shadows;
    this.light.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    const sc = this.light.shadow.camera;
    sc.left = sc.bottom = -58;
    sc.right = sc.top = 58;
    sc.near = 5;
    sc.far = 420;
    sc.updateProjectionMatrix();
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.06;
    scene.add(this.light, this.light.target);

    this.nightFill = new THREE.HemisphereLight(this.cols.moon, C('#10141c'), 0);
    scene.add(this.nightFill);

    this.fogDensity = sky.fogDensity;
    scene.fog = new THREE.Fog(new THREE.Color(), sky.fogDensity, sky.fogFalloff);

    globalUniforms.uCloudCover.value = sky.cloudCover;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3(-0.35, 0.75, -0.55).normalize();
    this.exposure = 1;
    this.night = 0;
    this.day = 1;
  }

  addBody(b, i, rng) {
    const dir = new THREE.Vector3(...b.dir).normalize();
    const R = Math.tan(b.radius) * BODY_DIST;
    const g = new THREE.Group();
    g.position.copy(dir).multiplyScalar(BODY_DIST);
    g.scale.setScalar(R);
    g.rotation.set(rng.next() * 0.6, rng.next() * 6, rng.next() * 0.5 - 0.25);
    const seed = rng.next() * 50;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          ...globalUniforms,
          uColA: { value: C(b.colors[0]) },
          uColB: { value: C(b.colors[1]) },
          uAtmo: { value: C(b.atmo ?? b.colors[0]) },
          uKind: { value: b.kind === 'giant' ? 0 : 1 },
          uSeed: { value: seed },
        },
        vertexShader: BODY_VERT,
        fragmentShader: BODY_FRAG,
        transparent: true,
        depthWrite: true,
        fog: false,
      })
    );
    sphere.renderOrder = -9;
    sphere.frustumCulled = false;
    g.add(sphere);

    let ring = null;
    if (b.ring) {
      const ringN = new THREE.Vector3(...(b.ringNormal ?? [0, 1, 0])).normalize();
      ring = new THREE.Mesh(
        new THREE.RingGeometry(1.35, 2.3, 160, 1),
        new THREE.ShaderMaterial({
          uniforms: {
            ...globalUniforms,
            uRingCol: { value: C(b.ring) },
            uSeed: { value: seed },
            uR: { value: R },
            uCenter: { value: new THREE.Vector3() },
          },
          vertexShader: BODY_VERT,
          fragmentShader: RING_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        })
      );
      // 光环所在平面的法线 = ringNormal（世界方向），抵消父节点的随机旋转
      const parentQ = new THREE.Quaternion().setFromEuler(g.rotation);
      const worldQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringN);
      ring.quaternion.copy(parentQ.invert().multiply(worldQ));
      ring.renderOrder = -8.5;
      ring.frustumCulled = false;
      g.add(ring);
    }
    this.group.add(g);
    this.bodies.push({ group: g, ring, offset: g.position.clone() });
  }

  /**
   * minute：当天分钟数；focus：阴影中心（玩家）；camPos：相机位置（天空跟随相机，保持在无穷远）
   */
  update(minute, focus, camPos) {
    const { cols, u } = this;
    // 5:00 日出，19:00 日落，之后为夜晚
    const t = (minute - 300) / 840;
    const a = Math.PI * t;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.42).normalize();
    const elev = this.sunDir.y;

    const day = smoothstep(-0.08, 0.28, elev);
    const dusk = 1 - smoothstep(0.0, 0.32, Math.abs(elev - 0.03));
    const night = 1 - smoothstep(-0.22, -0.02, elev);
    this.day = day;
    this.night = night;

    u.uZenith.value.copy(cols.nightZ).lerp(cols.dayZ, day).lerp(cols.duskZ, dusk * 0.5).multiplyScalar(SKY_GAIN);
    u.uHorizon.value.copy(cols.nightH).lerp(cols.dayH, day).lerp(cols.duskH, dusk * 0.85).multiplyScalar(SKY_GAIN);
    u.uGlow.value.copy(cols.glow).lerp(cols.sun, day * (1 - dusk) * 0.6);
    u.uDusk.value = dusk;
    u.uSunVis.value = smoothstep(-0.05, 0.02, elev);
    u.uStarRot.value = (minute / 1440) * Math.PI * 0.6;
    u.uGround.value.copy(cols.ground).multiplyScalar(0.1 * day + 0.012);

    // 光源：白天太阳，夜晚月光，交替时强度都接近 0
    const sunI = smoothstep(-0.03, 0.16, elev);
    const useSun = elev > -0.06;
    const dir = useSun ? this.sunDir : this.moonDir;
    _c.copy(cols.sun).lerp(cols.duskSun, dusk * 0.85);
    this.light.color.copy(useSun ? _c : cols.moon);
    this.light.intensity = useSun ? 4.2 * sunI : 0.65 * night;
    this.light.position.copy(focus).addScaledVector(dir, 200);
    this.light.target.position.copy(focus);
    this.nightFill.intensity = 0.35 * night;

    // 全局着色器参数
    const g = globalUniforms;
    g.uSunDir.value.copy(this.sunDir);
    g.uSunColor.value.copy(_c).multiplyScalar(sunI);
    g.uSkyZenith.value.copy(u.uZenith.value);
    g.uSkyHorizon.value.copy(u.uHorizon.value);
    g.uAmbient.value.copy(u.uZenith.value).lerp(u.uHorizon.value, 0.5).multiplyScalar(0.8);
    g.uNight.value = night;
    g.uGlowBoost.value = 1 + night * 1.6;
    g.uCloudShadow.value = 0.42 * day;

    // 雾：颜色 = 地平线，远山溶进天际；清晨有薄雾
    const mist = smoothstep(290, 360, minute) * (1 - smoothstep(420, 560, minute));
    this.scene.fog.color.copy(u.uHorizon.value);
    this.scene.fog.near = this.fogDensity * (1 + mist * 1.4 + night * 0.3);

    // 天空整体跟随相机（天体相当于在无穷远）
    this.group.position.copy(camPos);
    for (const b of this.bodies) {
      if (b.ring) b.ring.material.uniforms.uCenter.value.copy(camPos).add(b.offset);
    }

    this.exposure = 1 + night * 0.55;
  }

  dispose() {
    this.scene.remove(this.group, this.light, this.light.target, this.nightFill);
    this.light.dispose();
    this.nightFill.dispose();
    const free = (root) =>
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    free(this.group);
    free(this.envScene);
  }
}
