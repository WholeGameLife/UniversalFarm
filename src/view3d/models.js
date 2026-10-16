import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { part, merge, lumpy, trs, limb, smoothstep } from './geom.js';
import { stdMat, physMat, glowMat, swayMat } from './materials.js';
import { createRng, hashSeed } from '../core/rng.js';

/**
 * 模型工厂：飞船、宇航员、作物、矿石、营地道具。
 * 每个模型由若干“部件”合并成少量网格（按材质分组），绘制开销小。
 * 材质全部来自 materials.js 的共享缓存。
 */

const COL = (h) => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const M = {
  hull: () => stdMat('ship-hull', { vertexColors: true, metalness: 0.45, roughness: 0.3 }),
  dark: () => stdMat('metal-dark', { color: '#2b303a', metalness: 0.75, roughness: 0.4 }),
  glass: () => physMat('glass', { color: '#0b1626', metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03 }),
  visor: () => physMat('visor', { color: '#e0a94a', metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
  suit: () => stdMat('suit', { vertexColors: true, metalness: 0.05, roughness: 0.55 }),
  wood: () => stdMat('wood', { vertexColors: true, roughness: 0.85 }),
  stone: () => stdMat('stone', { vertexColors: true, roughness: 0.9 }),
  flora: () => swayMat('flora', { vertexColors: true, roughness: 0.82 }),
  floraGlow: () => swayMat('flora-glow', { vertexColors: true, roughness: 0.45 }, 1.0),
  engine: () => glowMat('engine', '#7ff0ff', 5),
  red: () => glowMat('beacon-red', '#ff3a2a', 8),
  green: () => glowMat('beacon-green', '#39ff8a', 8),
  lamp: () => glowMat('lamp', '#ffd59a', 6),
  pack: () => glowMat('pack', '#5ff2d0', 3),
};

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** 颜色按高度渐变 */
const gradY = (c0, c1, y0, y1) => (x, y, z, nx, ny, nz, o) => o.copy(c0).lerp(c1, smoothstep(y0, y1, y));

// =====================================================================
// 飞船：坠落后修好的小型探索舰，同时是玩家的基地
// =====================================================================
export function makeShip() {
  const g = new THREE.Group();
  const white = COL('#e9e7e1');
  const orange = COL('#ff7a3d');
  const under = COL('#5d636e');
  const hull = [];
  const dark = [];
  const glow = [];

  // 机身：旋转体，机头朝 +z，略压扁
  const prof = [[0, -5.3], [0.7, -5.15], [1.35, -4.6], [1.7, -3.2], [1.85, -1], [1.8, 1], [1.55, 2.6], [1.1, 3.9], [0.55, 4.8], [0.12, 5.3], [0, 5.35]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  hull.push(
    part(new THREE.LatheGeometry(prof, 32), {
      matrix: trs(0, 0, 0, Math.PI / 2, 0, 0, 1.15, 1, 0.8),
      colorFn: (x, y, z, nx, ny, nz, o) => {
        if (ny < -0.45) return o.copy(under);
        if (z > -1.7 && z < -1.0) return o.copy(orange);
        if (Math.abs(x) < 0.2 && y > 0.8 && z > 0.6) return o.copy(orange);
        return o.copy(white);
      },
    })
  );

  // 后掠机翼（左右各一块，形状镜像，ExtrudeGeometry 会自动修正绕序）
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, -2.2);
    sh.lineTo(5.0 * s, 0.9);
    sh.lineTo(5.4 * s, 2.3);
    sh.lineTo(0, 3.0);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 1 });
    hull.push(
      part(geo, {
        matrix: trs(s * 1.2, -0.38, 0, -Math.PI / 2, 0, 0),
        crease: 0.6,
        colorFn: (x, y, z, nx, ny, nz, o) => (Math.abs(x) > 5.6 ? o.copy(orange) : ny < -0.5 ? o.copy(under) : o.copy(white)),
      })
    );
  }

  // 垂直尾翼
  {
    const sh = new THREE.Shape();
    sh.moveTo(-1.8, 0);
    sh.lineTo(-4.9, 0);
    sh.lineTo(-5.4, 2.4);
    sh.lineTo(-4.6, 2.5);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 1 });
    hull.push(
      part(geo, {
        matrix: trs(0.08, 0.7, 0, 0, -Math.PI / 2, 0),
        crease: 0.6,
        colorFn: (x, y, z, nx, ny, nz, o) => (y > 2.4 ? o.copy(orange) : o.copy(white)),
      })
    );
  }

  // 引擎舱 + 尾焰
  for (const s of [-1, 1]) {
    dark.push(part(new THREE.CylinderGeometry(0.62, 0.5, 2.6, 24, 1), { matrix: trs(s * 1.55, -0.1, -3.9, Math.PI / 2, 0, 0), crease: 0.6 }));
    dark.push(part(new THREE.TorusGeometry(0.56, 0.07, 8, 24), { matrix: trs(s * 1.55, -0.1, -2.62) }));
    glow.push(part(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 24), { matrix: trs(s * 1.55, -0.1, -5.22, Math.PI / 2, 0, 0), crease: 0.6 }));
  }

  // 起落架
  for (const [sx, sz] of [[-1.3, 2.4], [1.3, 2.4], [-1.5, -3], [1.5, -3]]) {
    dark.push(limb(V(sx * 0.9, -0.9, sz), V(sx * 1.15, -2.3, sz), 0.12, 0.09, {}, 8));
    dark.push(part(new THREE.CylinderGeometry(0.32, 0.4, 0.12, 14), { matrix: trs(sx * 1.15, -2.36, sz), crease: 0.6 }));
  }

  g.add(mesh(merge(hull), M.hull()));
  g.add(mesh(merge(dark), M.dark()));
  g.add(mesh(merge(glow), M.engine(), { cast: false }));

  // 座舱玻璃
  const canopy = mesh(part(new THREE.SphereGeometry(1, 32, 20), { matrix: trs(0, 1.05, 2.0, -0.12, 0, 0, 0.9, 0.62, 1.65) }), M.glass());
  g.add(canopy);

  // 翼尖航行灯（红左绿右，闪烁）：几何体放在原点、用 position 摆放，缩放时才不会跑位
  const bl = mesh(part(new THREE.SphereGeometry(0.13, 12, 8)), M.red(), { cast: false });
  const br = mesh(part(new THREE.SphereGeometry(0.13, 12, 8)), M.green(), { cast: false });
  bl.position.set(-6.55, -0.2, -1.6);
  br.position.set(6.55, -0.2, -1.6);
  g.add(bl, br);
  g.userData.beacons = [bl, br];
  g.userData.groundOffset = 2.42; // 机身原点离地高度（脚垫底部到原点）
  return g;
}

// =====================================================================
// 宇航员
// =====================================================================
export function makeAstronaut() {
  const g = new THREE.Group();
  const white = COL('#f1efe9');
  const orange = COL('#ff7a3d');
  const grey = COL('#8d939d');
  const boot = COL('#3a3f48');
  const suit = [];

  suit.push(
    part(new THREE.CapsuleGeometry(0.3, 0.42, 6, 16), {
      matrix: trs(0, 1.17, 0, 0, 0, 0, 1, 1, 0.82),
      colorFn: (x, y, z, nx, ny, nz, o) => (y > 1.28 && y < 1.36 ? o.copy(orange) : y < 0.98 ? o.copy(grey) : o.copy(white)),
    })
  );
  suit.push(part(new THREE.SphereGeometry(0.34, 28, 18), { matrix: trs(0, 1.8, 0), color: white }));
  suit.push(part(new THREE.TorusGeometry(0.24, 0.05, 8, 24), { matrix: trs(0, 1.52, 0, Math.PI / 2, 0, 0), color: grey }));
  // 背包
  suit.push(part(new RoundedBoxGeometry(0.56, 0.66, 0.28, 2, 0.08), { matrix: trs(0, 1.22, -0.34), color: COL('#d7d4cc') }));
  // 手臂
  for (const s of [-1, 1]) {
    suit.push(part(new THREE.CapsuleGeometry(0.11, 0.42, 4, 10), { matrix: trs(s * 0.42, 1.17, 0.02, 0, 0, s * 0.18), color: white }));
    suit.push(part(new THREE.SphereGeometry(0.11, 10, 8), { matrix: trs(s * 0.48, 0.86, 0.04), color: grey }));
  }
  g.add(mesh(merge(suit), M.suit()));

  // 金色面罩（反射环境）
  const visorGeo = new THREE.SphereGeometry(0.35, 28, 16, Math.PI / 2 - 0.95, 1.9, 0.75, 1.0);
  g.add(mesh(part(visorGeo, { matrix: trs(0, 1.8, 0.012) }), M.visor()));
  // 背包发光条
  g.add(mesh(part(new THREE.BoxGeometry(0.06, 0.42, 0.04), { matrix: trs(0, 1.24, -0.49) }), M.pack(), { cast: false }));

  // 腿：以髋部为枢轴，PlayerController 旋转 rotation.x 做走路动作
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, 0.8, 0);
    const geo = merge([
      part(new THREE.CapsuleGeometry(0.13, 0.42, 4, 10), { matrix: trs(0, -0.34, 0), color: white }),
      part(new RoundedBoxGeometry(0.24, 0.16, 0.36, 2, 0.05), { matrix: trs(0, -0.72, 0.04), color: boot }),
    ]);
    leg.add(mesh(geo, M.suit()));
    g.add(leg);
    legs.push(leg);
  }

  // 手持工具
  const tool = new THREE.Group();
  tool.position.set(0.5, 0.92, 0.08);
  tool.add(mesh(merge([part(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), { matrix: trs(0, 0, 0.18, Math.PI / 2, 0, 0) })]), M.dark()));
  tool.add(mesh(part(new RoundedBoxGeometry(0.1, 0.22, 0.12, 1, 0.03), { matrix: trs(0, -0.06, 0.54) }), M.hull()));
  g.add(tool);

  // 喷射背包火焰（按住空格时显示）：几何体顶端在原点，缩放时火焰从喷口向下伸缩
  const flame = mesh(part(new THREE.ConeGeometry(0.12, 0.55, 12).translate(0, 0.275, 0), { matrix: trs(0, 0, 0, Math.PI, 0, 0) }), M.engine(), { cast: false });
  flame.position.set(0, 0.92, -0.36);
  flame.visible = false;
  g.add(flame);

  g.userData = { legs, tool, flame };
  return g;
}

// =====================================================================
// 作物：几何体按 作物:阶段:成熟 缓存，所有同阶段的格子共用
// 每块田按作物形态种 1~4 株，排成整齐的小方阵
// =====================================================================
const cropCache = new Map();
const CROP_LAYOUT = {
  wheat: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  bush: [[-0.45, -0.4], [0.45, 0.4]],
  melon: [[0, 0]],
  root: [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]],
  vine: [[0, 0]],
};

export function makeCrop(id, vis, stage, stageCount, mature) {
  const key = `${id}:${stage}:${mature}:${vis.shape}:${vis.leaf}:${vis.fruit}`;
  let e = cropCache.get(key);
  if (!e) {
    e = buildCrop(vis, (stage + 1) / stageCount, mature, createRng(hashSeed(key)));
    if (e.main) e.main.userData.shared = true;
    if (e.glow) e.glow.userData.shared = true;
    cropCache.set(key, e);
  }
  const g = new THREE.Group();
  for (const [ox, oz] of CROP_LAYOUT[vis.shape] ?? [[0, 0]]) {
    const ry = (ox * 7.3 + oz * 3.1) % (Math.PI * 2);
    if (e.main) {
      const m = mesh(e.main, M.flora());
      m.position.set(ox, 0, oz);
      m.rotation.y = ry;
      g.add(m);
    }
    if (e.glow) {
      const m = mesh(e.glow, M.floraGlow(), { cast: false });
      m.position.set(ox, 0, oz);
      m.rotation.y = ry;
      g.add(m);
    }
  }
  return g;
}

function buildCrop(vis, r, mature, rng) {
  const leaf = COL(vis.leaf);
  const leafDark = leaf.clone().multiplyScalar(0.45);
  const fruit = COL(vis.fruit);
  const main = [];
  const glow = [];

  // 幼苗：两片子叶
  if (r <= 0.34) {
    main.push(limb(V(0, 0, 0), V(0, 0.16, 0), 0.02, 0.015, { color: leaf }, 5));
    for (const s of [-1, 1]) {
      main.push(
        part(new THREE.SphereGeometry(1, 10, 6), {
          matrix: trs(s * 0.09, 0.17, 0, 0, 0, s * 0.5, 0.11, 0.025, 0.06),
          color: leaf,
          sway: 0.03,
        })
      );
    }
    return { main: merge(main), glow: null };
  }

  if (vis.shape === 'wheat') {
    const h = 0.3 + r * 1.0;
    const n = 9 + Math.round(r * 8);
    const sw = (x, y) => Math.pow(Math.max(y, 0) / h, 2) * 0.16;
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const rad = Math.sqrt(rng.next()) * 0.32;
      const bx = Math.cos(a) * rad;
      const bz = Math.sin(a) * rad;
      const th = h * (0.8 + rng.next() * 0.3);
      const top = V(bx * 1.4 + (rng.next() - 0.5) * 0.1, th, bz * 1.4 + (rng.next() - 0.5) * 0.1);
      main.push(limb(V(bx, 0, bz), top, 0.02, 0.012, { colorFn: gradY(leafDark, leaf, 0, h * 0.7), swayFn: sw }, 4));
      if (r > 0.6) {
        const earC = mature ? fruit : leaf.clone().lerp(fruit, 0.25);
        main.push(
          part(new THREE.SphereGeometry(1, 7, 6), {
            matrix: trs(top.x, top.y + 0.1, top.z, 0, 0, (top.x - bx) * 0.6, 0.045, 0.16, 0.045),
            color: earC,
            swayFn: sw,
          })
        );
      }
    }
    // 底部叶片
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng.next();
      main.push(
        part(new THREE.SphereGeometry(1, 6, 4), {
          matrix: trs(Math.cos(a) * 0.14, h * 0.22, Math.sin(a) * 0.14, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7, 0.03, h * 0.28, 0.012),
          colorFn: gradY(leafDark, leaf, 0, h * 0.4),
          swayFn: sw,
        })
      );
    }
  } else if (vis.shape === 'bush') {
    const clumps = 2 + Math.round(r * 3);
    const size = 0.18 + r * 0.24;
    for (let i = 0; i < clumps; i++) {
      const a = (i / clumps) * Math.PI * 2 + rng.next();
      const off = i === 0 ? 0 : size * 0.8;
      const c = [Math.cos(a) * off, size * 0.95 + (i === 0 ? size * 0.4 : 0), Math.sin(a) * off];
      main.push(
        part(new THREE.IcosahedronGeometry(size, 2), {
          displace: lumpy(size * 0.25, 4 / size, rng.next() * 9),
          matrix: trs(c[0], c[1], c[2]),
          sphereNormals: { c, k: 0.55 },
          colorFn: (x, y, z, nx, ny, nz, o) => o.copy(leafDark).lerp(leaf, smoothstep(-0.6, 0.8, ny) * 0.8 + 0.2),
          swayFn: (x, y) => y * 0.05,
        })
      );
      const berries = mature ? 5 : r > 0.6 ? 2 : 0;
      for (let k = 0; k < berries; k++) {
        const d = V(rng.next() - 0.5, rng.next() * 0.7 + 0.1, rng.next() - 0.5).normalize().multiplyScalar(size * 1.02);
        (mature ? glow : main).push(
          part(new THREE.SphereGeometry(mature ? 0.065 : 0.04, 10, 8), {
            matrix: trs(c[0] + d.x, c[1] + d.y, c[2] + d.z),
            color: mature ? fruit : leaf.clone().lerp(COL('#ffffff'), 0.3),
            swayFn: (x, y) => y * 0.05,
          })
        );
      }
    }
  } else if (vis.shape === 'vine') {
    const h = 1.9;
    const wood = COL('#866448');
    for (const x of [-0.5, 0.5]) main.push(limb(V(x, 0, 0), V(x, h, 0), 0.045, 0.04, { color: wood }, 5));
    for (const y of [0.6, 1.2, h]) main.push(limb(V(-0.6, y, 0), V(0.6, y, 0), 0.035, 0.035, { color: wood }, 5));
    const n = Math.max(3, Math.round(r * 12));
    for (let i = 0; i < n; i++) {
      const y = 0.2 + i / n * h * r;
      const x = Math.sin(i * 1.2) * 0.3;
      main.push(part(new THREE.SphereGeometry(1, 8, 5), { matrix: trs(x, y, 0.04, 0.2, i, 0.4, 0.19, 0.045, 0.11), color: leaf, swayFn: () => 0.03 }));
      if (mature && i % 2 === 0) main.push(part(new THREE.SphereGeometry(1, 8, 6), { matrix: trs(x, y - 0.14, 0.1, 0, 0, 0, 0.075, 0.15, 0.075), color: fruit, swayFn: () => 0.035 }));
    }
  } else if (vis.shape === 'root') {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      main.push(part(new THREE.SphereGeometry(1, 8, 5), { matrix: trs(Math.cos(angle) * 0.1, 0.12 + r * 0.15, Math.sin(angle) * 0.1, 0.4, angle, 0.2, 0.06, 0.18 + r * 0.1, 0.08), color: leaf, swayFn: () => 0.025 }));
    }
    if (r > 0.6) main.push(part(new THREE.SphereGeometry(0.12 + r * 0.06, 12, 8), { matrix: trs(0, 0.07, 0, 0, 0, 0, 1, 0.8, 1), color: mature ? fruit : leaf }));
  } else {
    // 瓜：贴地的大叶片 + 条纹瓜
    const leaves = 3 + Math.round(r * 3);
    const ls = 0.18 + r * 0.16;
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + rng.next() * 0.5;
      const d = 0.2 + r * 0.25;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      main.push(limb(V(0, 0.02, 0), V(x, 0.14, z), 0.02, 0.015, { color: leafDark }, 4));
      main.push(
        part(new THREE.SphereGeometry(1, 12, 6), {
          displace: lumpy(0.12, 3, i),
          matrix: trs(x, 0.16, z, Math.sin(a) * 0.35, -a, -Math.cos(a) * 0.35, ls * 1.2, ls * 0.18, ls),
          colorFn: (px, py, pz, nx, ny, nz, o) => o.copy(leafDark).lerp(leaf, smoothstep(-0.2, 0.9, ny)),
          sway: 0.03,
        })
      );
    }
    if (r > 0.5) {
      const R = mature ? 0.4 : 0.12 + (r - 0.5) * 0.4;
      const stripe = COL(vis.stripe ?? '#ffffff');
      const base = mature ? fruit : leaf.clone().lerp(fruit, 0.3);
      (mature ? glow : main).push(
        part(new THREE.SphereGeometry(1, 24, 16), {
          matrix: trs(0.05, R * 0.82, -0.05, 0.2, 0.4, 0, R, R * 0.86, R * 1.05),
          colorFn: (x, y, z, nx, ny, nz, o) => {
            const a = Math.atan2(z + 0.05, x - 0.05);
            return Math.sin(a * 9) > 0.55 ? o.copy(stripe).lerp(base, 0.35) : o.copy(base);
          },
        })
      );
    }
  }
  return { main: merge(main), glow: glow.length ? merge(glow) : null };
}

// =====================================================================
// 矿脉：母岩 + 六棱晶簇
// =====================================================================
export function makeOre(type, vis, rng) {
  const g = new THREE.Group();
  const rockC = COL(vis.rock);
  const sx = 1.45;
  const sy = 0.95;
  const sz = 1.25;
  const rock = part(new THREE.IcosahedronGeometry(1, 3), {
    displace: lumpy(0.26, 1.6, rng.next() * 10),
    matrix: trs(0, 0.3, 0, 0, rng.next() * 6, 0, sx, sy, sz),
    colorFn: (x, y, z, nx, ny, nz, o) => o.copy(rockC).multiplyScalar(0.7 + 0.45 * smoothstep(-0.6, 0.9, ny)),
  });
  g.add(mesh(rock, M.stone()));

  const crystals = [];
  const n = 5 + Math.floor(rng.next() * 4);
  const up = V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const dir = V(rng.next() - 0.5, rng.next() * 0.8 + 0.35, rng.next() - 0.5).normalize();
    const len = 0.5 + rng.next() * 0.8;
    const w = 0.12 + rng.next() * 0.12;
    const prof = [V(0, -0.2, 0), V(w, -0.15, 0), V(w * 0.9, len, 0), V(0, len + w * 1.6, 0)].map((p) => new THREE.Vector2(p.x, p.y));
    const base = V(dir.x * sx * 0.75, 0.3 + dir.y * sy * 0.75, dir.z * sz * 0.75);
    const tilt = dir.clone().lerp(up, 0.35).normalize();
    const m = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromUnitVectors(up, tilt), V(1, 1, 1));
    crystals.push(part(new THREE.LatheGeometry(prof, 6), { matrix: m, flat: true }));
  }
  const crystalMat = physMat(`ore-${type}`, {
    color: vis.crystal,
    metalness: vis.metal,
    roughness: vis.rough,
    emissive: vis.crystal,
    emissiveIntensity: vis.glow,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  });
  g.add(mesh(merge(crystals), crystalMat));
  return g;
}

// =====================================================================
// 营地道具
// =====================================================================
export function makeCrate(rng) {
  const s = 0.9 + rng.next() * 0.35;
  const body = COL('#d9d4c8');
  const band = COL('#ff7a3d');
  const geo = merge([
    part(new RoundedBoxGeometry(s, s * 0.8, s, 2, 0.06), {
      matrix: trs(0, s * 0.4, 0),
      colorFn: (x, y, z, nx, ny, nz, o) => (Math.abs(y - s * 0.4) < s * 0.07 ? o.copy(band) : o.copy(body)),
    }),
  ]);
  return mesh(geo, M.hull());
}

export function makeLamp() {
  const g = new THREE.Group();
  g.add(mesh(merge([
    limb(V(0, 0, 0), V(0, 2.8, 0), 0.07, 0.05, {}, 8),
    limb(V(0, 2.75, 0), V(0.55, 2.9, 0), 0.04, 0.04, {}, 6),
    part(new THREE.CylinderGeometry(0.28, 0.34, 0.12, 12), { matrix: trs(0, 0.06, 0) }),
    part(new THREE.CylinderGeometry(0.08, 0.2, 0.16, 12), { matrix: trs(0.6, 2.86, 0) }),
  ]), M.dark()));
  const bulb = mesh(part(new THREE.SphereGeometry(0.1, 12, 8), { matrix: trs(0.6, 2.76, 0) }), M.lamp(), { cast: false });
  g.add(bulb);
  g.userData.lightPos = V(0.6, 2.6, 0);
  return g;
}
