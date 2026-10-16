import { esc, delegate, setHtml } from '../dom.js';
import { parseCropCatalog } from '../../data/cropSchema.js';
import { buildData } from '../../data/index.js';
import { serialize } from '../../core/SaveManager.js';
import { crops as defaultCrops } from '../../data/crops.js';

/**
 * 侧边多页签面板。每个页签 = { id, name, visible(game), render(game) }
 * 新增玩法面板只需在 TABS 里加一项
 */
const TABS = [
  { id: 'bag', name: '🎒 背包', visible: () => true, render: renderBag },
  { id: 'shop', name: '🛒 商店', visible: () => true, render: renderShop },
  { id: 'farm', name: '🌱 农场', visible: () => true, render: renderFarm },
  { id: 'tech', name: '🔬 科技', visible: () => true, render: renderTech },
  { id: 'mine', name: '⛏️ 矿场', visible: (g) => g.isUnlocked('mining'), render: renderMine },
  { id: 'map', name: '🌌 星图', visible: (g) => g.isUnlocked('travel_system'), render: renderMap },
];

export class SidePanel {
  constructor(tabsEl, panelEl, game) {
    this.tabsEl = tabsEl;
    this.panelEl = panelEl;
    this.game = game;
    this.active = 'bag'; // 纯 UI 状态，留在视图层，不进存档

    delegate(tabsEl, '[data-tab]', (b) => {
      this.active = b.dataset.tab;
      this.render();
    });
    delegate(panelEl, '[data-cmd]', (b) => {
      game.dispatch(b.dataset.cmd, JSON.parse(b.dataset.payload || '{}'));
    });
    panelEl.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-crop-import]') || !e.target.files[0]) return;
      try {
        const catalog = parseCropCatalog(await e.target.files[0].text());
        const next = buildData({ cropCatalog: catalog });
        assertCatalogCompatible(game, next);
        if (!confirm('导入作物数据将保存当前进度并刷新游戏；气候与加工功能仍保持关闭。继续？')) return;
        localStorage.setItem('universal-farm-save', serialize(game.state));
        localStorage.setItem('universal-farm-crop-catalog', JSON.stringify({ schemaVersion: 1, crops: catalog }));
        location.reload();
      } catch (error) { game.bus.emit('ui:toast', { text: `导入失败：${error.message}`, kind: 'warn' }); }
    });
    delegate(panelEl, '[data-restore-catalog]', () => {
      try {
        assertCatalogCompatible(game, buildData({ cropCatalog: defaultCrops }));
        if (!confirm('保存当前进度并恢复项目默认作物图鉴？')) return;
        localStorage.setItem('universal-farm-save', serialize(game.state));
        localStorage.removeItem('universal-farm-crop-catalog');
        location.reload();
      } catch (error) { game.bus.emit('ui:toast', { text: error.message, kind: 'warn' }); }
    });

    // 3D 场景中点击飞船等会请求打开某个页签
    const side = panelEl.closest('.side');
    game.bus.on('ui:openTab', ({ tab }) => {
      this.active = tab;
      side?.classList.remove('collapsed');
      this.render();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      side?.classList.toggle('collapsed');
    });
  }

  render() {
    const tabs = TABS.filter((t) => t.visible(this.game));
    if (!tabs.some((t) => t.id === this.active)) this.active = 'bag';
    setHtml(
      this.tabsEl,
      tabs.map((t) => `<button data-tab="${t.id}" class="${t.id === this.active ? 'on' : ''}">${t.name}</button>`).join('')
    );
    setHtml(this.panelEl, tabs.find((t) => t.id === this.active).render(this.game));
  }
}

const btn = (cmd, payload, label, disabled = false) =>
  `<button data-cmd="${cmd}" data-payload='${esc(JSON.stringify(payload))}' ${disabled ? 'disabled' : ''}>${label}</button>`;

function assertCatalogCompatible(game, next) {
  const missingItem = Object.keys(game.state.inventory).find((id) => !next.items.has(id));
  const missingCrop = Object.values(game.state.planets).flatMap((rt) => rt.farm.tiles).find((t) => t.crop && !next.crops.has(t.crop.id));
  const incompatibleCrop = Object.values(game.state.planets).flatMap((rt) => rt.farm.tiles).find((t) => t.crop?.regrowing && next.crops.has(t.crop.id) && !next.crops.get(t.crop.id).regrowDays);
  if (missingItem || missingCrop) throw new Error(`新数据删除了存档正在使用的 ${missingItem ?? missingCrop.crop.id}，请保留该 ID 后重试`);
  if (incompatibleCrop) throw new Error(`${incompatibleCrop.crop.id}正在再生，不能将再生周期改为 0；请先清除该作物`);
}

const costText = (game, cost) =>
  Object.entries(cost)
    .map(([id, n]) => {
      const name = id === 'credits' ? '星币' : game.data.items.get(id).name;
      const ok = game.query('inventory/count', id) >= n;
      return `<span class="${ok ? '' : 'lack'}">${esc(name)}×${n}</span>`;
    })
    .join(' ');

function renderBag(game) {
  const list = game.query('inventory/list');
  if (!list.length) return '<p class="empty">背包空空如也</p>';
  return `<ul class="rows">${list
    .map((it) => {
      const price = game.query('economy/sellPrice', it.id);
      const use = it.category === 'seed' ? btn('player/selectSeed', { seed: it.id }, '播种')
        : it.category === 'fertilizer' ? btn('player/selectFertilizer', { id: it.id }, '使用')
        : it.category === 'soil' ? btn('player/selectSoil', { id: it.id }, '使用') : '';
      return `<li class="bag-item"><span class="ic">${it.icon}</span><span class="nm">${esc(it.name)}<small>${it.foodEnergy ? `食用 +${it.foodEnergy} 体力` : esc(it.desc ?? '')}</small></span><b class="mono">×${it.count}</b>
        <div class="item-actions">${use}${it.foodEnergy ? btn('inventory/eat', { id: it.id }, '吃', game.state.player.energy >= game.state.player.maxEnergy) : ''}
        ${price ? btn('shop/sell', { id: it.id, n: 1 }, `卖 ${price}`) + btn('shop/sell', { id: it.id, n: it.count }, '全卖') : ''}</div></li>`;
    })
    .join('')}</ul>`;
}

function renderShop(game) {
  const list = game.query('economy/shopList');
  return `<p class="note">轨道补给站 · 当天投送 · 星币 ${game.state.player.credits}</p>
    <p class="note">开垦 → 播种前施肥 → 播种 → 浇水 → 睡觉进入次日 → 成熟后点击收割</p>
    ${['seed', 'fertilizer', 'soil'].map((category) => `<h3>${{ seed: '种子', fertilizer: '肥料', soil: '土壤改良包' }[category]}</h3><ul class="rows">${list.filter((it) => it.category === category).map((it) => {
      const c = it.cropId ? game.data.crops.get(it.cropId) : null;
      return `<li class="shop-item"><span class="ic">${it.icon}</span><span class="nm">${esc(it.name)}<small>${c ? `${c.growDays} 天成熟${c.regrowDays ? ` · 每 ${c.regrowDays} 天再生` : ' · 一次采收'} · ${c.harvest.min}–${c.harvest.max} 个 · 基价 ${c.harvest.sellPrice}<br>需${c.requirements.soils.map((s) => game.data.soils.get(s).name).join('/')} · ${c.waterIntervalDays === 1 ? '每日浇水' : `每 ${c.waterIntervalDays} 天浇水`}<br>${esc(c.uses.processing.map((r) => r.name + '（后续）').join(' / ') || c.description)}` : esc(it.desc)}</small></span>
        <div class="item-actions"><b class="mono">${it.price} 星币</b>${btn('shop/buy', { id: it.id, n: 1 }, '买 1', game.state.player.credits < it.price)}${btn('shop/buy', { id: it.id, n: 5 }, '买 5', game.state.player.credits < it.price * 5)}</div></li>`;
    }).join('')}</ul>`).join('')}`;
}

function renderFarm(game) {
  const s = game.query('farm/summary');
  const { w, h } = game.query('farm/size');
  return `<div class="farm-summary"><b>今日农场</b><span>在田 ${s.planted} · 可收 ${s.mature} · 缺水 ${s.needsWater} · 枯萎 ${s.withered}</span></div>
    <p class="note">营地默认壤土。每次施肥消耗 1 份，必须在播种前使用；单次作物收割后肥效结束，连收作物保持肥效。连续缺水超过容忍天数会枯萎。</p>
    <p class="note">气候/星球修正暂不启用；图鉴保留土地与气候需求。加工用途与野外种子生成是后续功能。</p>
    <div class="farm-overview" style="--farm-cols:${w}">${Array.from({ length: w * h }, (_, i) => {
      const x = i % w, y = Math.floor(i / w), v = game.query('farm/tileView', x, y);
      const title = `${x + 1},${y + 1} · ${v.soilName} · ${v.crop?.name ?? '空地'} · ${v.status}${v.crop && !v.mature ? ` · 还需 ${v.crop.daysLeft} 个生长日` : ''}${v.fertilizerName ? ` · ${v.fertilizerName}` : ''}`;
      return `<span class="farm-cell ${v.mature ? 'ready' : v.crop?.withered ? 'withered' : v.needsWater ? 'dry' : v.moist ? 'wet' : ''}" title="${esc(title)}">${v.icon || (v.soil === 'wild' ? '·' : v.fertilizer ? '✦' : '▫')}</span>`;
    }).join('')}</div><p class="note">农田总览只查看状态；走近地块后在 3D 场景中操作。</p>
    <h3>作物图鉴</h3><label class="catalog-import">导入独立编辑器数据 <input type="file" data-crop-import accept=".json,.js" /></label><p class="note">${localStorage.getItem('universal-farm-crop-catalog') ? '当前使用本机导入图鉴；项目 crops.js 修改不会覆盖它。<button data-restore-catalog>恢复项目默认图鉴</button>' : '当前使用项目默认图鉴。'}</p>
    ${game.query('farm/catalog').map((c) => `<details class="crop-card"><summary>${c.harvest.icon} ${esc(c.name)} · ${c.growDays} 天 ${c.unlocked ? '' : '🔒'}</summary>
      <p>${esc(c.description)}</p><p>阶段：${c.stageDays.join(' + ')} 天；${c.regrowDays ? `再生 ${c.regrowDays} 天` : '单次收获'}<br>浇水：每 ${c.waterIntervalDays} 天；连续缺水容忍 ${c.maxDryDays} 天<br>土地：${c.requirements.soils.map((id) => game.data.soils.get(id).name).join(' / ')}<br>气候预留：${c.requirements.temperature.join('～')}°C，湿度 ${c.requirements.moisture.join('～')}%<br>种价 ${c.seedPrice}；售价 ${c.harvest.sellPrice}；产量 ${c.harvest.min}–${c.harvest.max}<br>食用恢复 ${c.uses.foodEnergy} 体力</p>
      <p>用途：${esc(c.uses.tags.join(' / '))}${c.uses.processing.length ? `<br>后续加工：${c.uses.processing.map((r) => `${esc(r.name)} · ${esc(r.machine)} · ${r.hours} 小时`).join('<br>')}` : ''}</p>
      <p>获取：${esc(c.availability.sources.join(' / '))}${c.availability.requires ? ` · 需${esc(game.data.techs.get(c.availability.requires).name)}` : ''}<br>野外生成预留：${esc(c.availability.wild.biomes.join(' / '))} · 概率 ${Math.round(c.availability.wild.chance * 100)}%</p></details>`).join('')}`;
}

function renderTech(game) {
  return `<ul class="techs">${game
    .query('tech/list')
    .map(
      (t) => `<li class="tech ${t.status}">
        <div class="tt"><b>${esc(t.name)}</b>${t.status === 'done' ? '<span class="chip">已完成</span>' : ''}</div>
        <p>${esc(t.desc)}</p>
        ${t.status === 'available' ? `<div class="cost">${costText(game, t.cost)}</div>${btn('tech/research', { id: t.id }, '研究', !t.affordable)}` : ''}
        ${t.status === 'locked' ? '<p class="note">🔒 需要前置科技</p>' : ''}
      </li>`
    )
    .join('')}</ul>`;
}

function renderMine(game) {
  const nodes = game.query('mining/nodes');
  if (!nodes.length) return '<p class="empty">今天的矿点已挖完，明天再来</p>';
  return `<p class="note">每次敲击消耗 ${game.data.miningConfig.energyPerHit} 体力</p><div class="ores">${nodes
    .map(
      (n) => `<button class="ore" data-cmd="mine/hit" data-payload='{"index":${n.index}}' title="${esc(n.name)}">
        <span>${n.icon}</span><small>${esc(n.name)}</small><i style="width:${(n.hp / n.maxHp) * 100}%"></i></button>`
    )
    .join('')}</div>`;
}

function renderMap(game) {
  const { data, state } = game;
  const dests = game.query('travel/destinations');
  const bySys = {};
  dests.forEach((p) => (bySys[p.systemId] ??= []).push(p));
  return Object.entries(bySys)
    .map(([sysId, planets]) => {
      const sys = state.universe.systems[sysId];
      return `<h3>${esc(sys.name)} <small>${esc(data.tiers.get(sys.tier).name)}</small></h3><ul class="rows">${planets
        .map(
          (p) => `<li><span class="ic dot" style="--c:${data.biomes.get(p.biome).color}"></span>
          <span class="nm">${esc(p.name)}<small>${p.traits.map((t) => esc(data.traits.get(t).name)).join(' · ')}</small></span>
          ${btn('travel/go', { planetId: p.id }, `🚀 ${p.cost}`)}</li>`
        )
        .join('')}</ul>`;
    })
    .join('');
}
