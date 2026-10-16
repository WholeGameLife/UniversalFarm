import { esc, delegate, setHtml } from '../dom.js';

export class Hud {
  constructor(el, game, actions) {
    this.el = el;
    this.game = game;
    this.gfx = null; // 画质档位：纯表现层状态，由 World3D 通过 gfx:changed 告知
    game.bus.on('gfx:changed', (g) => (this.gfx = g));
    delegate(el, '[data-act]', (b) => {
      const act = b.dataset.act;
      if (act === 'sleep') game.dispatch('time/sleep');
      if (act === 'gfx') game.bus.emit('gfx:cycle');
      if (act === 'save') {
        actions.save();
        game.bus.emit('ui:toast', { text: '已保存', kind: 'info' });
      }
      if (act === 'reset' && confirm('确定删除存档并重新开始？')) actions.reset();
    });
  }

  render() {
    const { state } = this.game;
    const clock = this.game.query('time/clock');
    const p = state.player;
    const pct = Math.round((p.energy / p.maxEnergy) * 100);
    const gfx = this.gfx
      ? `<button data-act="gfx" title="切换画质（G）">画质 ${esc(this.gfx.label)}${this.gfx.auto ? '<small>自动</small>' : ''}</button>`
      : '';
    setHtml(
      this.el,
      `<div class="brand">宇宙农场<small>UNIVERSAL FARM</small></div>
       <div class="stat"><span class="k">第</span><b>${clock.day}</b><span class="k">天</span><b class="mono">${clock.text}</b></div>
       <div class="stat"><span class="k">星币</span><b class="mono">${esc(p.credits)}</b></div>
       <div class="stat energy"><span class="k">体力</span><div class="bar"><i style="width:${pct}%"></i></div><b class="mono">${p.energy}</b></div>
       <div class="hud-actions">
         ${gfx}
         <button data-act="sleep">💤 睡觉</button>
         <button data-act="save">💾</button>
         <button data-act="reset" title="重开">↺</button>
       </div>`
    );
  }
}
