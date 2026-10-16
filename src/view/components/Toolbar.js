import { esc, delegate, setHtml } from '../dom.js';

const TOOLS = [
  { id: 'hoe', icon: '⛏️', name: '锄头' },
  { id: 'water', icon: '💧', name: '水壶' },
  { id: 'clear', icon: '🪓', name: '清除作物' },
];

export class Toolbar {
  constructor(el, game) {
    this.el = el;
    this.game = game;
    delegate(el, '[data-tool]', (b) => game.dispatch('player/selectTool', { tool: b.dataset.tool }));
    delegate(el, '[data-seed]', (b) => game.dispatch('player/selectSeed', { seed: b.dataset.seed }));
    delegate(el, '[data-fertilizer]', (b) => game.dispatch('player/selectFertilizer', { id: b.dataset.fertilizer }));
    delegate(el, '[data-soil]', (b) => game.dispatch('player/selectSoil', { id: b.dataset.soil }));
    // 数字键 1-9 选择工具栏格子
    window.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (!n || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      el.querySelectorAll('.slot')[n - 1]?.click();
    });
  }

  render() {
    const { state, data } = this.game;
    const p = state.player;
    const tools = TOOLS.map(
      (t, i) => `<button class="slot ${p.tool === t.id ? 'on' : ''}" data-tool="${t.id}"><kbd>${i + 1}</kbd>${t.icon}<span>${t.name}</span></button>`
    ).join('');
    const seedItems = data.items
      .all()
      .filter((i) => i.category === 'seed' && state.inventory[i.id] > 0);
    const seeds = seedItems
      .map((i, k) => {
        const on = p.tool === 'seed' && p.selectedSeed === i.id;
        return `<button class="slot ${on ? 'on' : ''}" data-seed="${i.id}"><kbd>${TOOLS.length + k + 1}</kbd>${i.icon}<span>${esc(i.name.replace('种子', ''))}</span><em>${state.inventory[i.id]}</em></button>`;
      })
      .join('');
    const supplies = data.items.all().filter((it) => ['fertilizer', 'soil'].includes(it.category) && state.inventory[it.id] > 0).map((it) => {
      const isFertilizer = it.category === 'fertilizer';
      const on = isFertilizer ? p.tool === 'fertilizer' && p.selectedFertilizer === it.id : p.tool === 'soil' && p.selectedSoil === it.id;
      return `<button class="slot ${on ? 'on' : ''}" data-${isFertilizer ? 'fertilizer' : 'soil'}="${esc(it.id)}" title="${esc(it.desc)}">${it.icon}<span>${esc(it.name)}</span><em>${state.inventory[it.id]}</em></button>`;
    }).join('');
    setHtml(this.el, tools + '<i class="sep"></i>' + (seeds || '<span class="hint">没有种子，去商店购买</span>') + supplies);
    elNumberKeys(this.el);
  }
}

function elNumberKeys(el) {
  el.querySelectorAll('.slot').forEach((slot, index) => {
    if (!slot.querySelector('kbd')) slot.prepend(document.createElement('kbd'));
    const label = slot.querySelector('kbd');
    label.textContent = index < 9 ? index + 1 : '';
  });
}
