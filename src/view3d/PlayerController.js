import * as THREE from 'three';
import { makeAstronaut } from './models.js';

/**
 * 第三人称控制：WASD 移动（相对镜头方向），鼠标右键/拖拽旋转镜头，滚轮缩放，
 * Shift 冲刺，空格喷射背包。角色位置是纯视觉状态，不进存档。
 */
export class PlayerController {
  constructor(scene, camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mesh = makeAstronaut();
    this.mesh.traverse((o) => {
      if (o.isMesh && o !== this.mesh.userData.flame) o.castShadow = true;
    });
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0.7; // 镜头水平角：从东南斜后方看向飞船
    this.pitch = 0.28; // 较低的俯角，能看到地平线和天空
    this.dist = 22;
    this.keys = new Set();
    this.walkPhase = 0;
    this.swingT = 0;
    this.terrain = null;

    this.bindInput();
  }

  setTerrain(terrain, spawn) {
    this.terrain = terrain;
    this.pos.copy(spawn);
    this.pos.y = terrain.heightAt(spawn.x, spawn.z);
    this.vel.set(0, 0, 0);
    terrain.update(this.pos);
  }

  bindInput() {
    const typing = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    window.addEventListener('keydown', (e) => {
      if (typing()) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    let dragging = false;
    let moved = 0;
    let last = [0, 0];
    this.dom.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = 0;
      last = [e.clientX, e.clientY];
    });
    window.addEventListener('pointerup', () => (dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - last[0];
      const dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.12, 1.25);
    });
    // 拖拽超过阈值则不算点击，避免旋转镜头时误操作
    this.dom.addEventListener('click', (e) => {
      if (moved > 6) e.stopImmediatePropagation();
    }, true);
    this.dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.1), 6, 60);
    }, { passive: false });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 朝某点做一个工具挥动动作 */
  swingAt(target) {
    const d = target.clone().sub(this.pos);
    this.mesh.rotation.y = Math.atan2(d.x, d.z);
    this.swingT = 1;
  }

  update(dt) {
    if (!this.terrain) return;
    const k = this.keys;
    const input = new THREE.Vector3(
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      0,
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
    );
    if (k.has('KeyQ')) this.yaw += dt * 2;
    if (k.has('KeyE')) this.yaw -= dt * 2;

    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 18 : 9;
    if (input.lengthSq() > 0) {
      input.normalize();
      // 镜头在角色 (sin yaw, cos yaw) 方向，因此前方 f = -(sin, cos)，右方 r = (cos, -sin)
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const mx = -fz * input.x + fx * -input.z;
      const mz = fx * input.x + fz * -input.z;
      input.set(mx, 0, mz);
      this.vel.x = THREE.MathUtils.damp(this.vel.x, input.x * speed, 10, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, input.z * speed, 10, dt);
      const targetRot = Math.atan2(this.vel.x, this.vel.z);
      this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, targetRot, 12, dt);
    } else {
      this.vel.x = THREE.MathUtils.damp(this.vel.x, 0, 12, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, 0, 12, dt);
    }

    // 重力 + 喷射背包
    const ground = this.terrain.heightAt(this.pos.x, this.pos.z);
    const floor = Math.max(ground, this.terrain.seaLevel - 0.6); // 水面上“漂浮”
    if (k.has('Space')) this.vel.y = Math.min(this.vel.y + 40 * dt, 9);
    else this.vel.y -= 30 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.terrain.update(this.pos);
    const newFloor = Math.max(this.terrain.heightAt(this.pos.x, this.pos.z), this.terrain.seaLevel - 0.6);
    if (this.pos.y <= newFloor) {
      this.pos.y = newFloor;
      this.vel.y = Math.max(this.vel.y, 0);
    }
    this.pos.y = Math.min(this.pos.y, floor + 30);

    // 走路摆腿 + 工具挥动 + 喷射火焰
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += moving * dt * 1.2;
    const { legs, tool, flame } = this.mesh.userData;
    legs[0].rotation.x = Math.sin(this.walkPhase) * 0.6 * Math.min(moving / 9, 1);
    legs[1].rotation.x = -legs[0].rotation.x;
    this.swingT = Math.max(0, this.swingT - dt * 4);
    tool.rotation.x = Math.sin(this.swingT * Math.PI) * 1.4;
    flame.visible = k.has('Space');
    if (flame.visible) flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);

    this.mesh.position.copy(this.pos);
    this.mesh.position.y += Math.abs(Math.sin(this.walkPhase)) * 0.08;

    // 镜头：环绕角色，避免钻进地面
    // 注视点抬高到角色头顶上方，画面上半部分留给天空和远景
    const focus = this.pos.clone().add(new THREE.Vector3(0, 4, 0));
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(this.dist);
    const camTarget = focus.clone().add(off);
    camTarget.y = Math.max(camTarget.y, this.terrain.heightAt(camTarget.x, camTarget.z) + 1.5);
    this.camera.position.lerp(camTarget, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(focus);
  }
}

function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
