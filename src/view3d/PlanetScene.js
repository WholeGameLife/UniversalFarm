import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createRng, hashSeed } from '../core/rng.js';
import { planetTerrainSeed } from '../core/planetSeed.js';
import { createTerrain } from './Terrain.js';
import { createWater } from './Water.js';
import { createGrass } from './Grass.js';
import { createFlora } from './Flora.js';
import { createParticles } from './Particles.js';
import { Sky } from './Sky.js';
import { globalUniforms } from './shaders.js';
import { part, merge, trs, limb } from './geom.js';
import { makeShip, makeCrop, makeOre, makeCrate, makeLamp, M } from './models.js';
import { biomeVisuals, cropVisuals, oreVisuals, soilVisuals } from './palettes.js';

export const TILE = 2.4; // 一块农田的世界尺寸

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * 一个星球的 3D 场景。只读 game.query，产生的交互目标交给 Interaction 处理。
 * 换星球 / 换画质时整个销毁重建。
 *
 * 布局（俯视，+z 朝南）：飞船停在北边的着陆点，一条土路通向南边的农田，
 * 农田四周是低矮木栅栏和两盏营地灯；矿点散落在平台外一圈。
 */
export class PlanetScene {
  constructor(scene, game, planet, tier, initialFocus = null) {
    this.scene = scene;
    this.game = game;
    this.planet = planet;
    this.tier = tier;
    this.root = new THREE.Group();
    scene.add(this.root);

    const seed = planet.terrainSeed ?? planetTerrainSeed(game.state.meta.seed, planet.id);
    const rngFor = (name) => createRng(hashSeed(`${seed}:${name}`));
    this.visuals = biomeVisuals[planet.biome] ?? biomeVisuals.temperate;

    // ---------- 布局 ----------
    const { w, h } = game.query('farm/size');
    this.farmW = w;
    this.farmH = h;
    const FY = 4;
    this.farmOrigin = V((-w * TILE) / 2, FY, 2);
    this.shipPos = V(0, FY, -13);
    const fx1 = this.farmOrigin.x + w * TILE;
    const fz1 = this.farmOrigin.z + h * TILE;
    const pad = { x0: this.farmOrigin.x - 4, x1: fx1 + 4, z0: -24, z1: fz1 + 4, y: FY, shipX: 0, shipZ: -13, pathZ: this.farmOrigin.z - 1 };
    this.pad = pad;

    // ---------- 地表 ----------
    this.terrain = createTerrain({ seed, visuals: this.visuals, tier, pad });
    this.terrain.update(initialFocus ?? this.shipPos, { immediate: true });
    this.root.add(this.terrain.mesh);
    this.water = createWater({ visuals: this.visuals, terrain: this.terrain });
    this.root.add(this.water);

    this.sky = new Sky(scene, this.visuals, rngFor('sky'), tier);

    // 农田遮罩：开垦过的格子不长草
    this.farmMaskData = new Uint8Array(w * h);
    this.farmMask = new THREE.DataTexture(this.farmMaskData, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.farmMask.unpackAlignment = 1;
    this.farmMask.minFilter = this.farmMask.magFilter = THREE.NearestFilter;
    this.farmMask.needsUpdate = true;
    const farmRect = new THREE.Vector4(this.farmOrigin.x, this.farmOrigin.z, fx1, fz1);

    this.grass = createGrass({ terrain: this.terrain, visuals: this.visuals, tier, rng: rngFor('grass'), farm: { rect: farmRect, mask: this.farmMask } });
    this.root.add(this.grass);

    this.buildFarm();
    this.buildShip();
    this.buildCamp(rngFor('camp'));
    this.mineSites = this.pickMineSites(rngFor('mines'));

    // 植被避开平台、小路和矿点
    const avoid = (x, z) => {
      if (x > pad.x0 - 7 && x < pad.x1 + 7 && z > pad.z0 - 7 && z < pad.z1 + 7) return true;
      return this.mineSites.some((s) => Math.hypot(s.x - x, s.z - z) < 4.5);
    };
    this.flora = createFlora({ seed, visuals: this.visuals, terrain: this.terrain, tier, avoid });
    this.flora.update(initialFocus ?? this.shipPos, { immediate: true });
    this.root.add(this.flora.group);

    if (tier.particles > 0) {
      this.particles = createParticles({ terrain: this.terrain, visuals: this.visuals, tier, rng: rngFor('particles') });
      this.root.add(this.particles);
    }

    this.oreMeshes = new Map(); // uid -> group
  }

  // =====================================================================
  // 农田
  // =====================================================================
  buildFarm() {
    this.tiles = [];
    // 田垄：四周倒角的土床，顶面有三道沟
    const bedGeo = merge([
      part(new RoundedBoxGeometry(TILE * 0.9, 0.36, TILE * 0.9, 3, 0.1), {
        displace: (pos) => {
          for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            if (y > 0.12) pos.setY(i, y - Math.pow(Math.cos(pos.getX(i) * Math.PI * 1.25), 2) * 0.07);
          }
        },
      }),
    ]);
    bedGeo.userData.shared = true;
    this.bedGeo = bedGeo;
    this.soilDry = new THREE.MeshStandardMaterial({ color: soilVisuals.tilled, roughness: 0.95 });
    this.soilWet = new THREE.MeshStandardMaterial({ color: soilVisuals.wet, roughness: 0.38, metalness: 0 });
    this.soilMaterials = new Map();
    const soilColors = { loam: soilVisuals.tilled, sand: '#b99860', clay: '#a96646', peat: '#514034' };
    for (const [type, color] of Object.entries(soilColors)) {
      for (const wet of [false, true]) for (const fertilized of [false, true]) {
        const tint = new THREE.Color(color);
        if (wet) tint.multiplyScalar(0.65);
        if (fertilized) tint.lerp(new THREE.Color('#aa9754'), 0.2);
        this.soilMaterials.set(`${type}:${wet}:${fertilized}`, new THREE.MeshStandardMaterial({ color: tint, roughness: wet ? 0.38 : 0.95 }));
      }
    }
    const pickGeo = new THREE.BoxGeometry(TILE, 0.8, TILE);
    this.pickGeo = pickGeo;

    for (let y = 0; y < this.farmH; y++) {
      for (let x = 0; x < this.farmW; x++) {
        const c = this.tileCenter(x, y);
        // 拾取体：不可见，覆盖整格
        const pick = new THREE.Mesh(pickGeo);
        pick.visible = false;
        pick.position.copy(c);
        pick.userData = { kind: 'tile', x, y };
        this.root.add(pick);

        const bed = new THREE.Mesh(bedGeo, this.soilDry);
        bed.position.copy(c).add(V(0, -0.08, 0));
        bed.receiveShadow = true;
        bed.castShadow = this.tier.shadows;
        bed.visible = false;
        this.root.add(bed);

        const anchor = new THREE.Group();
        anchor.position.copy(c).add(V(0, 0.1, 0));
        this.root.add(anchor);
        this.tiles.push({ mesh: pick, bed, anchor, key: '', soil: '' });
      }
    }

    // 木栅栏：立柱 + 两道横栏，北面（朝飞船）中间留出入口
    const o = this.farmOrigin;
    const W = this.farmW * TILE;
    const H = this.farmH * TILE;
    const m = 0.6;
    const corners = [V(o.x - m, 0, o.z - m), V(o.x + W + m, 0, o.z - m), V(o.x + W + m, 0, o.z + H + m), V(o.x - m, 0, o.z + H + m)];
    const wood = new THREE.Color('#8a6446');
    const parts = [];
    const gate = (p) => Math.abs(p.x) < TILE && p.z < o.z;
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 4];
      const len = a.distanceTo(b);
      const n = Math.round(len / 2.4);
      for (let k = 0; k <= n; k++) {
        const p = a.clone().lerp(b, k / n);
        if (gate(p) && !(k === 0 || k === n)) continue;
        const gy = this.terrain.heightAt(p.x, p.z);
        parts.push(part(new RoundedBoxGeometry(0.22, 1.05, 0.22, 1, 0.04), { matrix: trs(p.x, gy + 0.45, p.z, 0, (k * 0.37) % 0.2, 0), color: wood }));
        if (k < n) {
          const q = a.clone().lerp(b, (k + 1) / n);
          const mid = p.clone().lerp(q, 0.5);
          if (gate(mid)) continue;
          const qy = this.terrain.heightAt(q.x, q.z);
          for (const hh of [0.35, 0.75]) parts.push(limb(V(p.x, gy + hh, p.z), V(q.x, qy + hh, q.z), 0.05, 0.05, { color: wood }, 5));
        }
      }
    });
    const fence = new THREE.Mesh(merge(parts), M.wood());
    fence.castShadow = this.tier.shadows;
    fence.receiveShadow = true;
    this.root.add(fence);
  }

  tileCenter(x, y) {
    const cx = this.farmOrigin.x + (x + 0.5) * TILE;
    const cz = this.farmOrigin.z + (y + 0.5) * TILE;
    return V(cx, this.terrain.heightAt(cx, cz) + 0.1, cz);
  }

  // =====================================================================
  // 飞船与营地
  // =====================================================================
  buildShip() {
    const ship = makeShip();
    const gy = this.terrain.heightAt(this.shipPos.x, this.shipPos.z);
    ship.position.set(this.shipPos.x, gy + ship.userData.groundOffset - 0.05, this.shipPos.z);
    ship.rotation.y = 0.35;
    ship.traverse((o) => {
      o.userData.kind = 'ship';
      if (o.isMesh) o.castShadow = o.castShadow && this.tier.shadows;
    });
    this.root.add(ship);
    this.ship = ship;
  }

  buildCamp(rng) {
    const sp = this.shipPos;
    const place = (obj, x, z, ry = 0) => {
      obj.position.set(x, this.terrain.heightAt(x, z), z);
      obj.rotation.y = ry;
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = this.tier.shadows && o.castShadow;
          o.receiveShadow = true;
        }
      });
      this.root.add(obj);
      return obj;
    };
    // 补给箱：堆在飞船旁边
    const crates = [[5.6, -9.5, 0.3], [6.8, -10.4, -0.2], [6.1, -10.0, 0.6]];
    crates.forEach(([x, z, r], i) => {
      const c = place(makeCrate(rng), sp.x + x - 0.4, z, r);
      if (i === 2) c.position.y += 0.75;
    });
    // 营地灯：小路两侧 + 农田入口
    this.lamps = [];
    const lampPos = [[-2.2, this.farmOrigin.z - 2.2, Math.PI], [2.2, this.farmOrigin.z - 2.2, 0], [-3.5, -6.5, Math.PI]];
    lampPos.forEach(([x, z, r]) => {
      const lamp = place(makeLamp(), x, z, r);
      this.lamps.push(lamp);
    });
    // 灯光：只给入口两盏（数量固定，开关只改强度，不会触发重编译）
    this.lampLights = [];
    if (this.tier.shipLight) {
      this.lamps.slice(0, 2).forEach((lamp) => {
        const l = new THREE.PointLight('#ffc98a', 0, 16, 1.6);
        l.position.copy(lamp.userData.lightPos).applyEuler(lamp.rotation).add(lamp.position);
        this.root.add(l);
        this.lampLights.push(l);
      });
    }
  }

  /** 矿点候选位置：平台外一圈，按稳定顺序分配给 uid */
  pickMineSites(rng) {
    const sites = [];
    let guard = 0;
    while (sites.length < 24 && guard++ < 800) {
      const a = rng.next() * Math.PI * 2;
      const r = 40 + rng.next() * 42;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.terrain.heightAt(x, z);
      if (y < 1.8 || this.terrain.slopeAt(x, z) > 0.55) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < 7)) continue;
      sites.push(V(x, y, z));
    }
    // Some seeds have no suitable nearby hillside. Keep every ore slot usable.
    while (sites.length < 24) {
      const i = sites.length;
      const x = this.pad.x1 - 1;
      const z = this.pad.z0 + 2 + i * (this.pad.z1 - this.pad.z0 - 4) / 24;
      sites.push(V(x, this.terrain.heightAt(x, z), z));
    }
    return sites;
  }

  // =====================================================================
  // 逻辑状态 → 3D（只在 state:changed 时调用）
  // =====================================================================
  sync() {
    this.syncFarm();
    this.syncOres();
  }

  syncFarm() {
    let maskDirty = false;
    this.tiles.forEach((t, i) => {
      const { x, y } = t.mesh.userData;
      const v = this.game.query('farm/tileView', x, y);
      const soil = v.soil === 'wild' ? 'wild' : v.moist ? 'wet' : 'dry';
      const appearance = `${v.soilType}:${!!v.moist}:${!!v.fertilizer}`;
      if (t.appearance !== appearance) {
        t.appearance = appearance;
        t.bed.material = this.soilMaterials.get(appearance);
      }
      if (soil !== t.soil) {
        t.soil = soil;
        t.bed.visible = soil !== 'wild';
        const mv = soil === 'wild' ? 0 : 255;
        if (this.farmMaskData[i] !== mv) {
          this.farmMaskData[i] = mv;
          maskDirty = true;
        }
      }

      const key = v.crop ? `${v.crop.id}:${v.crop.stage}:${v.mature}:${v.crop.withered}` : '';
      if (key === t.key) return;
      t.key = key;
      t.anchor.clear();
      t.ripe = v.mature;
      if (v.crop) {
        const vis = v.crop.withered ? { ...this.game.data.crops.get(v.crop.id).visual, leaf: '#6d503a', fruit: '#594435' }
          : this.game.data.crops.get(v.crop.id).visual ?? cropVisuals[v.crop.id];
        const crop = makeCrop(v.crop.id, vis, v.crop.stage, v.crop.stageCount, v.mature);
        crop.traverse((o) => {
          if (o.isMesh) o.castShadow = o.castShadow && this.tier.shadows;
        });
        t.anchor.add(crop);
        t.anchor.scale.setScalar(0.01); // 生长弹出动画
        t.pop = 0;
      }
    });
    if (maskDirty) this.farmMask.needsUpdate = true;
  }

  syncOres() {
    const nodes = this.game.isUnlocked('mining') ? this.game.query('mining/nodes') : [];
    const alive = new Set(nodes.map((n) => n.uid));
    for (const [uid, m] of this.oreMeshes) {
      if (!alive.has(uid)) {
        this.root.remove(m);
        freeObject(m);
        this.oreMeshes.delete(uid);
      }
    }
    nodes.forEach((n) => {
      let m = this.oreMeshes.get(n.uid);
      if (!m) {
        const slot = hashSeed(n.uid) % this.mineSites.length;
        const site = this.findFreeSite(slot);
        m = makeOre(n.type, oreVisuals[n.type], createRng(hashSeed(n.uid)));
        m.position.copy(site).add(V(0, -0.2, 0));
        m.rotation.y = (hashSeed(n.uid) % 628) / 100;
        m.userData.site = site;
        m.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = this.tier.shadows;
            o.receiveShadow = true;
          }
        });
        this.root.add(m);
        this.oreMeshes.set(n.uid, m);
      }
      m.traverse((o) => Object.assign(o.userData, { kind: 'ore', index: n.index, uid: n.uid }));
      m.scale.setScalar(0.65 + (n.hp / n.maxHp) * 0.45);
    });
  }

  findFreeSite(start) {
    const used = new Set([...this.oreMeshes.values()].map((m) => m.userData.site));
    for (let i = 0; i < this.mineSites.length; i++) {
      const s = this.mineSites[(start + i) % this.mineSites.length];
      if (!used.has(s)) return s;
    }
    return this.mineSites[start];
  }

  // =====================================================================
  // 每帧：时间、天空、作物动画、灯光
  // =====================================================================
  animate(dt, time, focus, camPos) {
    this.flora.update(focus);
    this.water.position.x = focus.x;
    this.water.position.z = focus.z;
    const t = this.game.state.time;
    const minute = t.minute + Math.min(t.acc / this.game.data.config.time.secondsPerGameMinute, 1);
    globalUniforms.uTime.value = time;
    globalUniforms.uPlayer.value.copy(focus);
    this.sky.update(minute, focus, camPos);

    for (const tile of this.tiles) {
      if (tile.pop !== undefined && tile.pop < 1) {
        tile.pop = Math.min(1, tile.pop + dt * 3);
        const s = 1 + Math.sin(tile.pop * Math.PI) * 0.25;
        tile.anchor.scale.setScalar(Math.max(tile.pop * s, 0.01));
      }
      if (tile.ripe) tile.anchor.rotation.z = Math.sin(time * 2.2 + tile.mesh.userData.x) * 0.04;
      else if (tile.anchor.rotation.z) tile.anchor.rotation.z = 0;
    }

    // 营地灯：天黑自动亮
    const dark = 1 - this.sky.day;
    for (const l of this.lampLights) l.intensity = dark * 18;
    // 飞船航行灯闪烁
    const blink = Math.sin(time * 3.2) > 0.6 ? 1 : 0.15;
    for (const b of this.ship.userData.beacons) b.scale.setScalar(blink);
  }

  /** 可射线拾取的物体 */
  pickables() {
    return [...this.tiles.map((t) => t.mesh), ...this.oreMeshes.values(), this.ship];
  }

  dispose() {
    this.sky.dispose();
    this.flora.dispose();
    this.root.remove(this.terrain.mesh);
    this.terrain.dispose();
    this.scene.remove(this.root);
    freeObject(this.root);
    this.farmMask.dispose();
    this.bedGeo.dispose();
    this.pickGeo.dispose();
    this.soilDry.dispose();
    this.soilWet.dispose();
    for (const material of this.soilMaterials.values()) material.dispose();
  }
}

/** 释放一棵对象树里非共享的几何体和材质 */
function freeObject(root) {
  root.traverse((o) => {
    if (o.isInstancedMesh) return; // 植被由 Flora 自己管理
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => !m.userData.shared && m.dispose());
  });
}
