/**
 * 开发者工具：URL 带 ?dev=1 时启用。只通过 game 的公开接口操作，方便调试各阶段内容。
 *   F6 资源 +1000 星币、各类物品 +20
 *   F7 研究下一项可研究的科技（免费）
 *   F8 时间 +3 小时
 *   F9 直接进入下一天
 */
export function installDevTools(game) {
  const toast = (text) => game.bus.emit('ui:toast', { text: `[DEV] ${text}`, kind: 'info' });
  const actions = {
    F6: () => {
      game.query('inventory/add', 'credits', 1000);
      game.data.items.all().forEach((it) => game.query('inventory/add', it.id, 20));
      toast('资源 +1000 / +20');
    },
    F7: () => {
      const next = game.query('tech/list').find((t) => t.status === 'available');
      if (!next) return toast('没有可研究的科技');
      game.query('inventory/add', 'credits', 0);
      Object.entries(next.cost).forEach(([id, n]) => game.query('inventory/add', id, n));
      game.dispatch('tech/research', { id: next.id });
    },
    F8: () => {
      game.state.time.minute = Math.min(game.state.time.minute + 180, game.data.config.time.dayEndMinute - 1);
      toast('时间 +3h');
    },
    F9: () => game.dispatch('time/sleep'),
  };
  window.addEventListener('keydown', (e) => {
    const fn = actions[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
    game.changed();
  });
  toast('开发者模式：F6 资源 / F7 科技 / F8 +3h / F9 下一天');
}
