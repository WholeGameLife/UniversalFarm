import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PlanetScene } from './PlanetScene.js';
import { PlayerController } from './PlayerController.js';
import { Interaction } from './Interaction.js';
import { installAtmosphereFog, globalUniforms, GradeShader } from './shaders.js';
import { invalidateSharedMaterials } from './materials.js';
import { TIERS, loadTierPreference, saveTierPreference, detectTier, lowerTier } from './Quality.js';

// 必须在任何材质编译前替换雾的着色器代码块
installAtmosphereFog();

const BASE_EXPOSURE = 0.92;

/**
 * 3D 表现层根节点：渲染器 + 后期管线 + 当前星球场景 + 角色 + 交互。
 * 与 2D 面板（HUD、背包、科技）并存，两者都只通过 game 读写。
 *
 * 渲染管线：场景(HDR, MSAA) → 辉光 → 调色/暗角 → ACES 色调映射 + sRGB
 * 环境光：用当前天空颜色实时生成 IBL 贴图，物体会被天空色自然照亮
 *
 * 画质：自动检测默认档位；未手动选择时，帧率过低会自动降一档。
 * 总线事件（纯表现层）：gfx:cycle（切换画质）→ gfx:changed { id, label, auto }
 */
export class World3D {
  constructor({ container, promptEl, game }) {
    this.game = game;
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = BASE_EXPOSURE;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2400);
    this.clock = new THREE.Clock();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = null;
    this.envTimer = 0;
    this.envMinute = -1e9;

    this.manualTier = loadTierPreference();
    this.tier = TIERS[this.manualTier ?? detectTier(this.renderer)];
    this.applyRendererTier();

    this.player = new PlayerController(this.scene, this.camera, this.renderer.domElement);
    this.interaction = new Interaction({
      camera: this.camera,
      dom: this.renderer.domElement,
      game,
      player: this.player,
      promptEl,
    });

    this.buildPipeline();
    this.loadPlanet();

    game.bus.on('state:changed', () => (this.dirty = true));
    game.bus.on('travel:arrived', () => this.loadPlanet());
    game.bus.on('gfx:cycle', () => this.cycleTier());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) this.cycleTier();
    });

    // 帧率监测（自动模式下才降档）
    this.perf = { t: 0, frames: 0, warm: 3 };

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.emitTier();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------------
  // 画质 / 管线
  // ---------------------------------------------------------------------
  applyRendererTier() {
    const pr = Math.min(window.devicePixelRatio || 1, this.tier.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = this.tier.shadows;
    globalUniforms.uPixelRatio.value = pr;
  }

  buildPipeline() {
    this.composer?.dispose();
    this.bloom?.dispose();
    this.grade?.dispose();
    this.output?.dispose();

    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(1, size.x);
    const h = Math.max(1, size.y);
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: this.tier.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = null;
    if (this.tier.bloom) {
      // 阈值 > 1：只有太阳、发光作物、灯、矿晶等 HDR 高光才会泛光
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 1.05);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.applyGrade();
  }

  applyGrade() {
    const g = this.planetScene?.visuals.grade;
    if (!g || !this.grade) return;
    const u = this.grade.uniforms;
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uTint.value.set(...g.tint);
    u.uVignette.value = g.vignette;
  }

  setTier(id, { manual }) {
    if (!TIERS[id] || (id === this.tier.id && !manual)) return;
    if (manual) {
      this.manualTier = id;
      saveTierPreference(id);
    }
    this.tier = TIERS[id];
    this.applyRendererTier();
    invalidateSharedMaterials(); // 阴影开关会改变着色器
    this.buildPipeline();
    this.loadPlanet({ keepPlayer: true });
    this.resize();
    this.perf = { t: 0, frames: 0, warm: 3 };
    this.emitTier();
  }

  cycleTier() {
    const order = ['high', 'medium', 'low'];
    const next = order[(order.indexOf(this.tier.id) + 1) % order.length];
    this.setTier(next, { manual: true });
    this.game.bus.emit('ui:toast', { text: `画质：${TIERS[next].label}（G 键切换）`, kind: 'info' });
  }

  emitTier() {
    this.game.bus.emit('gfx:changed', { id: this.tier.id, label: this.tier.label, auto: !this.manualTier });
  }

  /** 自动模式：连续 3 秒平均帧率低于 38 就降一档 */
  watchPerf(dt) {
    if (this.manualTier) return;
    const p = this.perf;
    if (p.warm > 0) {
      p.warm -= dt;
      return;
    }
    p.t += dt;
    p.frames++;
    if (p.t < 3) return;
    const fps = p.frames / p.t;
    p.t = 0;
    p.frames = 0;
    const lower = lowerTier(this.tier.id);
    if (fps < 38 && lower) {
      this.setTier(lower, { manual: false });
      this.game.bus.emit('ui:toast', { text: `帧率较低，已自动切换到${TIERS[lower].label}画质（G 键可手动切换）`, kind: 'info' });
    }
  }

  // ---------------------------------------------------------------------
  // 星球
  // ---------------------------------------------------------------------
  loadPlanet({ keepPlayer = false } = {}) {
    const keep = keepPlayer && this.planetScene ? this.player.pos.clone() : null;
    this.planetScene?.dispose();
    const planet = this.game.query('universe/current');
    this.planetScene = new PlanetScene(this.scene, this.game, planet, this.tier, keep);
    const spawn = keep ?? this.planetScene.shipPos.clone().add(new THREE.Vector3(5, 0, 8));
    this.player.setTerrain(this.planetScene.terrain, spawn);
    if (!keep) this.camera.position.copy(spawn).add(new THREE.Vector3(14, 9, 16));
    this.interaction.setPlanet(this.planetScene, this.scene);
    this.applyGrade();
    this.envMinute = -1e9; // 立即刷新环境光
    this.dirty = true;
  }

  /** 天空颜色变化明显时重新生成环境光贴图（限频） */
  updateEnvironment(dt, minute) {
    this.envTimer -= dt;
    if (this.envTimer > 0 && Math.abs(minute - this.envMinute) < 240) return;
    if (Math.abs(minute - this.envMinute) < 5) return;
    this.envTimer = this.tier.envInterval;
    this.envMinute = minute;
    const rt = this.pmrem.fromScene(this.planetScene.sky.envScene, 0, 0.1, 100);
    this.scene.environment = rt.texture;
    this.envRT?.dispose();
    this.envRT = rt;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.dirty) {
      this.planetScene.sync();
      this.dirty = false;
    }
    this.player.update(dt);
    this.planetScene.animate(dt, t, this.player.pos, this.camera.position);
    this.interaction.update();

    const time = this.game.state.time;
    this.updateEnvironment(dt, time.minute);
    const sky = this.planetScene.sky;
    this.scene.environmentIntensity = 0.85 + sky.night * 0.4;
    this.renderer.toneMappingExposure = BASE_EXPOSURE * sky.exposure;

    this.composer.render(dt);
    this.watchPerf(dt);
  }
}
