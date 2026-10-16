import { Game } from './core/Game.js';
import { startLoop } from './core/GameLoop.js';
import { createLocalSaver } from './core/SaveManager.js';
import { buildData } from './data/index.js';
import { createInitialState } from './state/createInitialState.js';
import { allSystems } from './systems/index.js';
import { App } from './view/App.js';
import { parseCropCatalog } from './data/cropSchema.js';

// 组装：数据 + 状态 + 逻辑系统 → Game；视图只拿到 game
let data;
try {
  const custom = localStorage.getItem('universal-farm-crop-catalog');
  data = custom ? buildData({ cropCatalog: parseCropCatalog(custom) }) : buildData();
} catch (e) {
  console.warn('自定义作物数据无效，使用默认图鉴', e);
  data = buildData();
}
const saver = createLocalSaver(localStorage);

let state;
try {
  state = saver.load();
} catch (e) {
  console.warn('存档损坏，开始新游戏', e);
}
state ??= createInitialState(data);

const game = new Game({ data, state, systems: allSystems });
const app = new App(game, {
  save: () => saver.save(game.state),
  reset: () => {
    saver.clear();
    location.reload();
  },
});

game.start();
startLoop(game, { onFrame: () => app.requestRender() });

// 自动存档：每天开始时 + 关闭页面时
game.bus.on('time:dayStarted', () => saver.save(game.state));
window.addEventListener('beforeunload', () => saver.save(game.state));

// 调试入口
window.__game = game;
if (new URLSearchParams(location.search).has('dev')) {
  import('./dev/DevTools.js').then((m) => m.installDevTools(game));
}

// 3D 世界：动态加载。即使 3D 部分出错，2D 界面照常可用，错误会显示在页面上。
// 生成星球是同步的重计算，先让“正在生成星球…”画出来再开始。
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
try {
  const { World3D } = await import('./view3d/World3D.js');
  window.__world = new World3D({ container: document.getElementById('world'), promptEl: document.getElementById('prompt'), game });
} catch (e) {
  console.error(e);
  const hint = /WebGL/i.test(String(e?.message))
    ? '\n\n浏览器无法创建 WebGL：请在浏览器设置里开启「使用图形加速 / 硬件加速」，或换用最新版 Chrome / Edge。'
    : '';
  window.__bootError?.('3D 场景创建失败', (e?.message ?? String(e)) + hint + '\n' + (e?.stack ?? ''));
}
window.__booted = true;
requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('boot-loading')?.remove()));
