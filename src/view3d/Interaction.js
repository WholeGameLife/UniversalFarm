import * as THREE from 'three';

const REACH = 9; // 交互距离

/**
 * 鼠标射线拾取 → 悬停高亮 + 提示 → 点击时 dispatch 命令。
 * 这是 3D 表现层到逻辑层的唯一出口。
 */
export class Interaction {
  constructor({ camera, dom, game, player, promptEl }) {
    this.camera = camera;
    this.dom = dom;
    this.game = game;
    this.player = player;
    this.promptEl = promptEl;
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-2, -2);
    this.hover = null;
    this.planet = null;

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.25, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, depthTest: false })
    );
    this.marker.renderOrder = 10;
    this.marker.visible = false;

    const setMouse = (e) => {
      const r = dom.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    dom.addEventListener('pointermove', setMouse);
    dom.addEventListener('pointerleave', () => this.mouse.set(-2, -2));
    // 点击时用点击坐标重新拾取：触屏 / 没有先移动鼠标的点击也能命中
    dom.addEventListener('click', (e) => {
      setMouse(e);
      this.update();
      this.activate();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF') this.activate();
    });
  }

  setPlanet(planetScene, scene) {
    this.planet = planetScene;
    scene.add(this.marker);
  }

  update() {
    if (!this.planet) return;
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObjects(this.planet.pickables(), true)[0];
    this.hover = hit ? this.describe(hit) : null;

    if (this.hover) {
      const far = this.hover.pos.distanceTo(this.player.pos) > REACH;
      this.marker.visible = true;
      this.marker.position.copy(this.hover.pos).add(new THREE.Vector3(0, 0.25, 0));
      this.marker.scale.setScalar(this.hover.size);
      this.marker.material.color.set(far ? 0x8899aa : 0xffd24a);
      this.setPrompt(far ? `${this.hover.label} · 太远了，走近一点` : `🖱 / F ${this.hover.action}`);
    } else {
      this.marker.visible = false;
      this.setPrompt('');
    }
  }

  /** 把命中物体翻译为 { label, action, pos, run } */
  describe(hit) {
    let o = hit.object;
    while (o && !o.userData.kind) o = o.parent;
    if (!o) return null;
    const { kind } = o.userData;
    const game = this.game;

    if (kind === 'tile') {
      const { x, y } = o.userData;
      const v = game.query('farm/tileView', x, y);
      const p = game.state.player;
      let action = '';
      if (p.tool === 'clear') action = '清除整株作物（不会返还种子）';
      else if (v.crop?.withered) action = '用锄头清除枯萎作物';
      else if (v.mature) action = '收获';
      else if (p.tool === 'hoe') action = v.soil === 'wild' ? '开垦' : '已开垦';
      else if (p.tool === 'water') action = v.watered ? '已浇水' : '浇水';
      else if (p.tool === 'seed') action = `播种 ${game.data.items.get(p.selectedSeed).name}`;
      else if (p.tool === 'fertilizer') action = `施用 ${game.data.items.get(p.selectedFertilizer).name}`;
      else if (p.tool === 'soil') action = `使用 ${game.data.items.get(p.selectedSoil).name}`;
      return {
        label: `${v.crop?.name ?? '农田'} · ${v.soilName}${v.fertilizerName ? ` · ${v.fertilizerName}` : ''}${v.crop ? ` · ${v.status}${!v.mature && !v.crop.withered ? `，还需 ${v.crop.daysLeft} 个生长日` : ''}` : ''}`,
        action,
        size: 1.1,
        pos: o.getWorldPosition(new THREE.Vector3()),
        run: () => game.dispatch('farm/interact', { x, y }),
      };
    }
    if (kind === 'ore') {
      const pos = new THREE.Vector3();
      let root = o;
      while (root.parent && root.parent.userData.kind === 'ore') root = root.parent;
      root.getWorldPosition(pos);
      return {
        label: '矿脉',
        action: '开采',
        size: 1.8,
        pos,
        root,
        run: () => game.dispatch('mine/hit', { index: o.userData.index }),
      };
    }
    if (kind === 'ship') {
      return {
        label: '飞船',
        action: '进入飞船（研究 / 睡觉）',
        size: 3,
        pos: this.planet.ship.position.clone(),
        run: () => {
          game.bus.emit('ui:openTab', { tab: 'tech' });
          return { ok: true };
        },
      };
    }
    return null;
  }

  activate() {
    const h = this.hover;
    if (!h) return;
    if (h.pos.distanceTo(this.player.pos) > REACH) {
      this.game.bus.emit('ui:toast', { text: '太远了，走近一点（WASD 移动）', kind: 'warn' });
      return;
    }
    this.player.swingAt(h.pos);
    const res = h.run();
    if (res?.ok && h.root) {
      // 敲击反馈：矿石抖动
      h.root.rotation.z = 0.25;
      setTimeout(() => (h.root.rotation.z = 0), 90);
    }
  }

  setPrompt(text) {
    if (this.promptEl.textContent !== text) {
      this.promptEl.textContent = text;
      this.promptEl.classList.toggle('show', !!text);
    }
  }
}
