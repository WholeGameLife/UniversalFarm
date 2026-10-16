import * as THREE from 'three';
import { mergeVertices, mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3 } from './noise.js';

/**
 * 程序化建模工具：把任意 three 几何体规整成统一格式，便于合并成一个网格（一次绘制）。
 * 统一格式 = 带索引 + position / normal / color / aSway 四个属性。
 */

const _c = new THREE.Color();
const _base = new THREE.Color();

/**
 * @param geo 原始几何（会被消耗并 dispose）
 * @param opts.displace (positionAttr) => void  在局部空间扰动顶点（matrix 之前）
 * @param opts.matrix   Matrix4 摆放
 * @param opts.color    统一颜色（hex / Color）
 * @param opts.colorFn  (x,y,z,nx,ny,nz,out:Color) => Color  按顶点上色（摆放后的坐标）
 * @param opts.sway / opts.swayFn(x,y,z)  风摆权重（米）
 * @param opts.flat     硬边（晶体等）
 * @param opts.crease   折痕角（弧度），机械件用：大角度的边锐利、曲面平滑
 * @param opts.sphereNormals { c: [x,y,z], k }  法线向球心外侧混合，让一团叶子明暗像一个整体
 */
export function part(geo, opts = {}) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4); // 焊接接缝，扰动后不会裂开
  geo.dispose();
  g.clearGroups();

  if (opts.displace) opts.displace(g.attributes.position);
  if (opts.matrix) g.applyMatrix4(opts.matrix);

  let out = g;
  if (opts.flat || opts.crease) {
    // 硬边：flat = 每个面独立法线；crease = 夹角大于阈值的边保持锐利（机械件）
    out = opts.flat ? g.toNonIndexed() : toCreasedNormals(g, opts.crease);
    if (out !== g) g.dispose();
    if (opts.flat) out.computeVertexNormals();
    out.setIndex(Array.from({ length: out.attributes.position.count }, (_, i) => i));
  } else {
    g.computeVertexNormals();
  }

  const pos = out.attributes.position;
  const nor = out.attributes.normal;

  if (opts.sphereNormals) {
    const [cx, cy, cz] = opts.sphereNormals.c;
    const k = opts.sphereNormals.k ?? 0.5;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - cx;
      const dy = pos.getY(i) - cy;
      const dz = pos.getZ(i) - cz;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const nx = nor.getX(i) * (1 - k) + (dx / dl) * k;
      const ny = nor.getY(i) * (1 - k) + (dy / dl) * k;
      const nz = nor.getZ(i) * (1 - k) + (dz / dl) * k;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(i, nx / nl, ny / nl, nz / nl);
    }
  }

  const col = new Float32Array(pos.count * 3);
  const sw = new Float32Array(pos.count);
  _base.set(opts.color ?? '#ffffff');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const c = opts.colorFn ? opts.colorFn(x, y, z, nor.getX(i), nor.getY(i), nor.getZ(i), _c.copy(_base)) : _base;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    sw[i] = opts.swayFn ? opts.swayFn(x, y, z) : opts.sway ?? 0;
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  return out;
}

/** 合并多个 part() 的结果；空数组返回 null */
export function merge(parts) {
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!g) throw new Error('合并几何体失败：属性不一致');
  g.computeBoundingSphere();
  return g;
}

/** 沿“离原点方向”做噪声凹凸：让球体变成石头 / 树冠（在 matrix 之前、以原点为中心使用） */
export function lumpy(amp, freq, seed = 0) {
  return (pos) => {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const len = Math.hypot(x, y, z);
      if (len < 1e-6) continue;
      const n = fbm3(x * freq + seed * 1.37, y * freq + seed * 0.71, z * freq, 3) - 0.5;
      const k = 1 + (n * 2 * amp) / len;
      pos.setXYZ(i, x * k, y * k, z * k);
    }
  };
}

/** 水平方向的噪声抖动（树干、圆锥），不改变高度 */
export function jitter(amp, freq, seed = 0) {
  return (pos) => {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const dx = (fbm3(x * freq + seed, y * freq, z * freq, 2) - 0.5) * 2 * amp;
      const dz = (fbm3(x * freq, y * freq + seed * 1.3, z * freq + 5.1, 2) - 0.5) * 2 * amp;
      pos.setXYZ(i, x + dx, y, z + dz);
    }
  };
}

/** 按高度弯曲（树干 / 茎秆）：x += bx * t²，z += bz * t² */
export function bend(bx, bz, height) {
  return (pos) => {
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(pos.getY(i), 0) / height;
      pos.setX(i, pos.getX(i) + bx * t * t);
      pos.setZ(i, pos.getZ(i) + bz * t * t);
    }
  };
}

/** 组合多个扰动 */
export function chain(...fns) {
  return (pos) => fns.forEach((f) => f && f(pos));
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** 平移 / 旋转(Euler XYZ) / 缩放 → Matrix4 */
export function trs(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/** 从 a 指向 b 的圆柱（树枝、支架） */
export function limb(a, b, r0, r1, opts = {}, radial = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, radial, 2).translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1));
  return part(g, { ...opts, matrix: opts.matrix ? opts.matrix.clone().multiply(m) : m });
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
