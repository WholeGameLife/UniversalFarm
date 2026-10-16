export class FarmView {
  constructor(el, game) {
    this.el = el;
    this.game = game;
    this.cells = [];
    this.sizeKey = '';
    el.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-x]');
      if (!cell) return;
      const res = game.dispatch('farm/interact', { x: +cell.dataset.x, y: +cell.dataset.y });
      if (res.ok) {
        cell.classList.remove('pop');
        void cell.offsetWidth; // 重启动画
        cell.classList.add('pop');
      }
    });
  }

  render() {
    const { w, h } = this.game.query('farm/size');
    // 尺寸变化（如换星球）时才重建格子，其余时间只局部更新，避免入场动画反复播放
    if (this.sizeKey !== `${w}x${h}`) this.build(w, h);
    for (const cell of this.cells) {
      const t = this.game.query('farm/tileView', +cell.dataset.x, +cell.dataset.y);
      cell.classList.toggle('wild', t.soil === 'wild');
      cell.classList.toggle('tilled', t.soil === 'tilled');
      cell.classList.toggle('wet', t.moist);
      cell.classList.toggle('fertilized', !!t.fertilizer);
      cell.classList.toggle('ripe', t.mature);
      if (cell.textContent !== t.icon) cell.textContent = t.icon;
      cell.title = `${t.soilName} · ${t.status}${t.crop ? ` · ${t.crop.name} · 还需 ${t.crop.daysLeft} 个生长日` : ''}${t.fertilizerName ? ` · ${t.fertilizerName}` : ''}`;
    }
  }

  build(w, h) {
    this.sizeKey = `${w}x${h}`;
    this.el.style.setProperty('--cols', w);
    this.el.replaceChildren();
    this.cells = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const b = document.createElement('button');
        b.className = 'tile enter';
        b.dataset.x = x;
        b.dataset.y = y;
        b.style.setProperty('--i', x + y);
        b.addEventListener('animationend', () => b.classList.remove('enter'), { once: true });
        this.el.appendChild(b);
        this.cells.push(b);
      }
    }
  }
}
