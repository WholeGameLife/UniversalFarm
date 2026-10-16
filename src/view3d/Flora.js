import * as THREE from 'three';
import { part, merge, lumpy, jitter, bend, trs, limb, smoothstep } from './geom.js';
import { M } from './models.js';
import { physMat } from './materials.js';
import { createRng, hashSeed } from '../core/rng.js';
import { chunkAt, chunkKey } from './TerrainGenerator.js';
import { generateFloraPlacements, FLORA_SPEC } from './FloraGenerator.js';

/**
 * 野外植被与岩石：每种类型预生成几个造型变体，再用 InstancedMesh 大量摆放。
 * 一个变体 = 若干 { geo, mat }，同一变体的所有子网格共用一组实例矩阵。
 */

const COL = (h) => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const VARIANTS = 3;

/** 每种类型的生成器：返回 [{ geo, mat, cast }] */
const BUILDERS = {
  broadleaf(rng, F) {
    const leafA = COL(F.leafA);
    const leafB = COL(F.leafB);
    const bark = COL(F.bark);
    const h = 3.6 + rng.next() * 1.6;
    const lean = [(rng.next() - 0.5) * 0.8, (rng.next() - 0.5) * 0.8];
    const wood = [
      part(new THREE.CylinderGeometry(0.2, 0.36, h, 8, 6).translate(0, h / 2, 0), {
        displace: (p) => { jitter(0.06, 1.2, rng.next() * 9)(p); bend(lean[0], lean[1], h)(p); },
        colorFn: (x, y, z, nx, ny, nz, o) => o.copy(bark).multiplyScalar(0.7 + 0.3 * smoothstep(0, h, y)),
      }),
    ];
    const top = V(lean[0], h, lean[1]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng.next();
      const from = V(lean[0] * 0.5, h * (0.55 + i * 0.1), lean[1] * 0.5);
      const to = V(Math.cos(a) * 1.4 + lean[0], h * (0.85 + rng.next() * 0.2), Math.sin(a) * 1.4 + lean[1]);
      wood.push(limb(from, to, 0.11, 0.05, { color: bark }, 5));
    }
    const leaves = [];
    const cc = [top.x, top.y + 0.6, top.z];
    const blobs = 5 + Math.floor(rng.next() * 3);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + rng.next() * 0.6;
      const d = i === 0 ? 0 : 1.1 + rng.next() * 0.5;
      const r = i === 0 ? 1.55 : 1.0 + rng.next() * 0.45;
      const c = [cc[0] + Math.cos(a) * d, cc[1] + (i === 0 ? 0.5 : (rng.next() - 0.3) * 0.9), cc[2] + Math.sin(a) * d];
      leaves.push(
        part(new THREE.IcosahedronGeometry(r, 2), {
          displace: lumpy(r * 0.22, 1.6 / r, rng.next() * 20),
          matrix: trs(c[0], c[1], c[2], 0, rng.next() * 6, 0, 1, 0.82, 1),
          sphereNormals: { c: cc, k: 0.65 },
          colorFn: (x, y, z, nx, ny, nz, o) => o.copy(leafA).lerp(leafB, smoothstep(-0.5, 0.9, ny) * 0.75 + smoothstep(cc[1] - 1, cc[1] + 1.5, y) * 0.25),
          swayFn: (x, y) => Math.max(y - h * 0.6, 0) * 0.07,
        })
      );
    }
    return [
      { geo: merge(wood), mat: M.wood() },
      { geo: merge(leaves), mat: M.flora() },
    ];
  },

  spire(rng, F) {
    const leafA = COL(F.leafA);
    const leafB = COL(F.leafB);
    const bark = COL(F.bark);
    const h = 5 + rng.next() * 2.5;
    const wood = [part(new THREE.CylinderGeometry(0.12, 0.26, h * 0.5, 7, 3).translate(0, h * 0.25, 0), { color: bark })];
    const crown = part(new THREE.IcosahedronGeometry(1, 3), {
      displace: lumpy(0.18, 2.4, rng.next() * 30),
      matrix: trs(0, h * 0.62, 0, 0, rng.next() * 6, 0, 1.05, h * 0.36, 1.05),
      sphereNormals: { c: [0, h * 0.62, 0], k: 0.55 },
      colorFn: (x, y, z, nx, ny, nz, o) => o.copy(leafA).lerp(leafB, smoothstep(h * 0.3, h, y) * 0.8),
      swayFn: (x, y) => Math.max(y - h * 0.3, 0) * 0.06,
    });
    return [
      { geo: merge(wood), mat: M.wood() },
      { geo: merge([crown]), mat: M.flora() },
    ];
  },

  conifer(rng, F, opts) {
    const leafA = COL(F.leafA);
    const leafB = COL(F.leafB);
    const snow = COL('#f4f8ff');
    const h = 4.5 + rng.next() * 3;
    const wood = [part(new THREE.CylinderGeometry(0.14, 0.3, h * 0.35, 7).translate(0, h * 0.17, 0), { color: COL(F.bark) })];
    const tiers = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const r = 1.9 * (1 - t * 0.72);
      const ch = h * 0.42;
      const y0 = h * 0.22 + t * h * 0.55;
      tiers.push(
        part(new THREE.ConeGeometry(r, ch, 9, 3).translate(0, ch / 2, 0), {
          displace: jitter(0.18, 1.5, rng.next() * 10 + i),
          matrix: trs(0, y0, 0, 0, rng.next() * 6, 0),
          colorFn: (x, y, z, nx, ny, nz, o) => {
            o.copy(leafA).lerp(leafB, smoothstep(y0, y0 + ch, y) * 0.6);
            if (opts.snowy && ny > 0.35) o.lerp(snow, smoothstep(0.35, 0.6, ny));
            return o;
          },
          swayFn: (x, y) => Math.max(y - h * 0.25, 0) * 0.05,
        })
      );
    }
    return [
      { geo: merge(wood), mat: M.wood() },
      { geo: merge(tiers), mat: M.flora() },
    ];
  },

  bush(rng, F) {
    const leafA = COL(F.leafA);
    const leafB = COL(F.leafB);
    const accent = COL(F.accent);
    const parts = [];
    const n = 2 + Math.floor(rng.next() * 3);
    const cc = [0, 0.55, 0];
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 0.55 + rng.next() * 0.35;
      const c = [Math.cos(a) * 0.55 * (i > 0), r * 0.75, Math.sin(a) * 0.55 * (i > 0)];
      parts.push(
        part(new THREE.IcosahedronGeometry(r, 2), {
          displace: lumpy(r * 0.25, 2.2 / r, rng.next() * 40),
          matrix: trs(c[0], c[1], c[2], 0, 0, 0, 1, 0.8, 1),
          sphereNormals: { c: cc, k: 0.6 },
          colorFn: (x, y, z, nx, ny, nz, o) => o.copy(leafA).multiplyScalar(0.8).lerp(leafB, smoothstep(-0.4, 0.9, ny) * 0.7),
          swayFn: (x, y) => y * 0.06,
        })
      );
    }
    // 少量小花点缀
    if (rng.next() < 0.5) {
      for (let k = 0; k < 6; k++) {
        const d = V(rng.next() - 0.5, rng.next() * 0.6 + 0.4, rng.next() - 0.5).normalize().multiplyScalar(0.85);
        parts.push(part(new THREE.SphereGeometry(0.07, 6, 4), { matrix: trs(d.x, d.y + 0.35, d.z), color: accent, swayFn: (x, y) => y * 0.06 }));
      }
    }
    return [{ geo: merge(parts), mat: M.flora() }];
  },

  boulder(rng, F) {
    const rock = COL(F.rockTint);
    const moss = COL(F.leafA);
    const s = [1.3 + rng.next() * 0.9, 0.7 + rng.next() * 0.6, 1.1 + rng.next() * 0.8];
    const parts = [
      part(new THREE.IcosahedronGeometry(1, 3), {
        displace: lumpy(0.3, 1.4, rng.next() * 50),
        matrix: trs(0, s[1] * 0.45, 0, rng.next() * 0.3, rng.next() * 6, 0, s[0], s[1], s[2]),
        colorFn: (x, y, z, nx, ny, nz, o) => {
          o.copy(rock).multiplyScalar(0.62 + 0.4 * smoothstep(-0.6, 0.8, ny));
          return o.lerp(moss, smoothstep(0.55, 0.85, ny) * 0.7);
        },
      }),
    ];
    if (rng.next() < 0.6) {
      parts.push(
        part(new THREE.IcosahedronGeometry(0.5, 2), {
          displace: lumpy(0.15, 3, rng.next() * 50),
          matrix: trs(s[0] * 0.9, 0.2, s[2] * 0.4),
          colorFn: (x, y, z, nx, ny, nz, o) => o.copy(rock).multiplyScalar(0.6 + 0.4 * smoothstep(-0.6, 0.8, ny)),
        })
      );
    }
    return [{ geo: merge(parts), mat: M.stone() }];
  },

  glowbulb(rng, F) {
    const stem = COL(F.leafA);
    const glow = COL(F.glow);
    const stems = [];
    const bulbs = [];
    const n = 3 + Math.floor(rng.next() * 4);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const h = 0.7 + rng.next() * 1.1;
      const tip = V(Math.cos(a) * 0.35, h, Math.sin(a) * 0.35);
      stems.push(limb(V(0, 0, 0), tip, 0.04, 0.025, { color: stem, swayFn: (x, y) => y * 0.12 }, 5));
      bulbs.push(
        part(new THREE.SphereGeometry(0.13 + rng.next() * 0.08, 12, 8), {
          matrix: trs(tip.x, tip.y + 0.08, tip.z, 0, 0, 0, 1, 1.25, 1),
          color: glow,
          swayFn: (x, y) => y * 0.12,
        })
      );
    }
    return [
      { geo: merge(stems), mat: M.flora() },
      { geo: merge(bulbs), mat: M.floraGlow(), cast: false },
    ];
  },

  cactus(rng, F) {
    const green = COL('#4f8a45');
    const dark = COL('#2f5a2c');
    const h = 2.2 + rng.next() * 1.8;
    const ribs = (x, y, z, nx, ny, nz, o) => o.copy(dark).lerp(green, 0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 8));
    const parts = [part(new THREE.CapsuleGeometry(0.34, h, 6, 16).translate(0, h / 2 + 0.2, 0), { colorFn: ribs })];
    const arms = 1 + Math.floor(rng.next() * 2);
    for (let i = 0; i < arms; i++) {
      const s = i === 0 ? 1 : -1;
      const y0 = h * (0.4 + rng.next() * 0.25);
      parts.push(part(new THREE.CapsuleGeometry(0.2, 0.5, 4, 12), { matrix: trs(s * 0.45, y0, 0, 0, 0, Math.PI / 2), colorFn: ribs }));
      parts.push(part(new THREE.CapsuleGeometry(0.2, 0.7, 4, 12), { matrix: trs(s * 0.72, y0 + 0.45, 0), colorFn: ribs }));
    }
    if (rng.next() < 0.5) parts.push(part(new THREE.SphereGeometry(0.14, 8, 6), { matrix: trs(0, h + 0.55, 0), color: COL(F.accent) }));
    return [{ geo: merge(parts), mat: M.flora() }];
  },

  crystal(rng, F) {
    const parts = [];
    const n = 4 + Math.floor(rng.next() * 4);
    const up = V(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const dir = V(rng.next() - 0.5, 1.3, rng.next() - 0.5).normalize();
      const len = 0.8 + rng.next() * (i === 0 ? 2.2 : 1.3);
      const w = 0.16 + rng.next() * 0.14;
      const prof = [[0, -0.3], [w, -0.25], [w * 0.9, len], [0, len + w * 1.8]].map(([x, y]) => new THREE.Vector2(x, y));
      const m = new THREE.Matrix4().compose(V((rng.next() - 0.5) * 0.6, 0, (rng.next() - 0.5) * 0.6), new THREE.Quaternion().setFromUnitVectors(up, dir), V(1, 1, 1));
      parts.push(part(new THREE.LatheGeometry(prof, 6), { matrix: m, flat: true }));
    }
    const mat = physMat(`crystal-${F.glow}`, {
      color: F.glow,
      emissive: F.glow,
      emissiveIntensity: 0.8,
      metalness: 0,
      roughness: 0.08,
      transmission: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    return [{ geo: merge(parts), mat }];
  },

  mushroom(rng, F) {
    const stemC = COL(F.bark);
    const cap = COL(F.accent);
    const h = 2.2 + rng.next() * 2.5;
    const r = 1.1 + rng.next() * 0.9;
    const prof = [[0.32, 0], [0.24, h * 0.4], [0.2, h * 0.85], [0.26, h]].map(([x, y]) => new THREE.Vector2(x, y));
    const stem = part(new THREE.LatheGeometry(prof, 12), {
      displace: bend((rng.next() - 0.5) * 0.8, (rng.next() - 0.5) * 0.8, h),
      color: stemC,
      swayFn: (x, y) => (y / h) * 0.08,
    });
    const capG = part(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), {
      displace: lumpy(r * 0.08, 2 / r, rng.next() * 9),
      matrix: trs(0, h - 0.05, 0, 0, 0, 0, 1, 0.55, 1),
      colorFn: (x, y, z, nx, ny, nz, o) => o.copy(cap).multiplyScalar(0.55 + 0.45 * smoothstep(0, 1, ny)),
      swayFn: () => 0.08,
    });
    const gills = part(new THREE.CircleGeometry(r * 0.96, 24).rotateX(Math.PI / 2), {
      matrix: trs(0, h - 0.04, 0),
      color: COL(F.glow).multiplyScalar(0.6),
      swayFn: () => 0.08,
    });
    return [
      { geo: merge([stem]), mat: M.flora() },
      { geo: merge([capG, gills]), mat: M.floraGlow() },
    ];
  },

  deadtree(rng, F) {
    const bark = COL('#2b2120');
    const h = 3 + rng.next() * 2.5;
    const parts = [
      part(new THREE.CylinderGeometry(0.12, 0.3, h, 7, 5).translate(0, h / 2, 0), {
        displace: chainBend(rng, h),
        color: bark,
      }),
    ];
    for (let i = 0; i < 4; i++) {
      const a = rng.next() * Math.PI * 2;
      const y = h * (0.45 + rng.next() * 0.45);
      parts.push(limb(V(0, y, 0), V(Math.cos(a) * 1.3, y + 0.8 + rng.next(), Math.sin(a) * 1.3), 0.08, 0.02, { color: bark }, 5));
    }
    return [{ geo: merge(parts), mat: M.wood() }];
  },
};

function chainBend(rng, h) {
  const j = jitter(0.12, 1, rng.next() * 9);
  const b = bend((rng.next() - 0.5) * 1.2, (rng.next() - 0.5) * 1.2, h);
  return (p) => { j(p); b(p); };
}

/** Stream deterministic placements; reuse model variants and one instance batch per variant. */
export function createFlora({ seed, visuals, terrain, tier, avoid }) {
  const group = new THREE.Group();
  group.name = 'flora';
  const prototypes = new Map();
  const chunks = new Map();
  const batches = new Map();
  let pending = [];
  let centerKey = null;
  let disposed = false;
  for (const f of visuals.flora) {
    if (!BUILDERS[f.type] || !FLORA_SPEC[f.type]) continue;
    const rng = createRng(hashSeed(`${seed}:models:${f.type}`));
    prototypes.set(f.type, Array.from({ length: VARIANTS }, () => BUILDERS[f.type](rng, visuals.foliage, f)));
  }

  const rebuild = () => {
    const buckets = new Map();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = V(0, 1, 0);
    for (const placements of chunks.values()) {
      for (const p of placements) {
        const key = `${p.type}:${p.variant}`;
        if (!buckets.has(key)) buckets.set(key, []);
        matrix.compose(V(p.x, p.y, p.z), quaternion.setFromAxisAngle(up, p.rotation), V(p.scale, p.scale, p.scale));
        buckets.get(key).push(matrix.clone());
      }
    }
    for (const [type, variants] of prototypes) {
      variants.forEach((subs, variant) => {
        const key = `${type}:${variant}`;
        const matrices = buckets.get(key) ?? [];
        let batch = batches.get(key);
        if (!batch || batch.capacity < matrices.length) {
          if (batch) batch.meshes.forEach((im) => { group.remove(im); im.dispose(); });
          const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(matrices.length || 1)));
          batch = { capacity, meshes: subs.map(({ geo, mat, cast = true }) => {
            const im = new THREE.InstancedMesh(geo, mat, capacity);
            im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            im.castShadow = cast && tier.shadows;
            im.receiveShadow = true;
            group.add(im);
            return im;
          }) };
          batches.set(key, batch);
        }
        for (const im of batch.meshes) {
          im.count = matrices.length;
          im.visible = matrices.length > 0;
          matrices.forEach((m, i) => im.setMatrixAt(i, m));
          im.instanceMatrix.needsUpdate = true;
          if (matrices.length) im.computeBoundingSphere();
        }
      });
    }
  };

  const update = (focus, { immediate = false } = {}) => {
    if (disposed) return;
    const center = chunkAt(focus.x, focus.z);
    const key = chunkKey(center.x, center.z);
    let dirty = false;
    if (key !== centerKey) {
      centerKey = key;
      const wanted = new Set();
      pending = [];
      for (let dz = -tier.floraRadius; dz <= tier.floraRadius; dz++) {
        for (let dx = -tier.floraRadius; dx <= tier.floraRadius; dx++) {
          const x = center.x + dx, z = center.z + dz;
          const k = chunkKey(x, z);
          wanted.add(k);
          if (!chunks.has(k)) pending.push({ x, z, distance: Math.max(Math.abs(dx), Math.abs(dz)) });
        }
      }
      for (const k of chunks.keys()) {
        if (!wanted.has(k)) { chunks.delete(k); dirty = true; }
      }
      pending.sort((a, b) => a.distance - b.distance);
    }
    const start = performance.now();
    while (pending.length && (immediate || performance.now() - start < 2)) {
      const { x: cx, z: cz } = pending.shift();
      chunks.set(chunkKey(cx, cz), generateFloraPlacements({ seed, cx, cz, visuals, terrain, avoid, density: tier.floraDensity }));
      dirty = true;
    }
    if (dirty) rebuild();
  };

  return {
    group, chunks, update,
    dispose() {
      disposed = true;
      pending = [];
      for (const variants of prototypes.values()) variants.forEach((subs) => subs.forEach(({ geo }) => geo.dispose()));
      for (const batch of batches.values()) batch.meshes.forEach((im) => im.dispose());
      group.clear();
      batches.clear();
      chunks.clear();
      prototypes.clear();
    },
  };
}
