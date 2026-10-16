import { Hud } from './components/Hud.js';
import { Toolbar } from './components/Toolbar.js';
import { FarmView } from './components/FarmView.js';
import { PlanetBanner } from './components/PlanetBanner.js';
import { SidePanel } from './components/SidePanel.js';
import { Toasts } from './components/Toasts.js';

/**
 * 视图根：创建组件、订阅事件、合并渲染请求。
 * 组件约定：{ mount(el), render() }，只读 game.query / game.state，写操作一律 game.dispatch
 */
export class App {
  constructor(game, actions) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.components = [
      new Hud($('hud'), game, actions),
      new PlanetBanner($('planet-banner'), game),
      new Toolbar($('toolbar'), game),
      new SidePanel($('tabs'), $('panel'), game),
    ];
    // 2D 农田视图可选：页面有 #farm 时才挂载（3D 模式下由 view3d 负责）
    if ($('farm')) this.components.push(new FarmView($('farm'), game));
    new Toasts($('toasts'), game.bus);

    this.pending = false;
    game.bus.on('state:changed', () => this.requestRender());
  }

  /** 同一帧内多次请求只渲染一次 */
  requestRender() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.components.forEach((c) => c.render());
    });
  }
}
