import { esc, setHtml } from '../dom.js';

export class PlanetBanner {
  constructor(el, game) {
    this.el = el;
    this.game = game;
    const hud = document.getElementById('hud');
    if (hud) {
      // HUD wraps on narrow screens; keep the seed and planet name below it.
      this.hudObserver = new ResizeObserver(() => {
        this.el.style.setProperty('--planet-banner-top', `${hud.offsetTop + hud.offsetHeight + 12}px`);
      });
      this.hudObserver.observe(hud);
    }
  }

  render() {
    const { data } = this.game;
    const p = this.game.query('universe/current');
    const biome = data.biomes.get(p.biome);
    const sys = this.game.state.universe.systems[p.systemId];
    const traits = p.traits
      .map((t) => data.traits.get(t))
      .map((t) => `<span class="chip" title="${esc(t.desc)}">${esc(t.name)}</span>`)
      .join('');
    this.el.style.setProperty('--biome', biome.color);
    setHtml(
      this.el,
      `<div class="orb"></div>
       <div><h1>${esc(p.name)}</h1>
       <p>${esc(sys?.name ?? '')} · ${esc(biome.name)}群系 ${traits}</p>
       <p title="同一种子生成相同的星球地形">地形种子：${esc(p.terrainSeed)}</p></div>`
    );
  }
}
