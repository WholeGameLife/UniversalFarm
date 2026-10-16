/** 挖矿：每天在当前星球刷新矿点，敲击若干次后获得矿石 */
export const MiningSystem = {
  id: 'mining',

  init(ctx) {
    ctx.bus.on('time:dayStarted', () => refresh(ctx, ctx.state.player.planetId, true));
    ctx.bus.on('unlock:gained', ({ key }) => key === 'mining' && refresh(ctx, ctx.state.player.planetId, true));
    ctx.bus.on('travel:arrived', ({ planetId }) => refresh(ctx, planetId, false));
  },

  queries: {
    nodes: ({ game, data }) => {
      const mine = game.query('universe/currentRuntime').mine;
      return mine.nodes.map((n, i) => {
        const def = data.oreNodes.get(n.id);
        return { index: i, uid: n.uid, type: n.id, icon: def.icon, name: data.items.get(def.ore).name, hp: n.hp, maxHp: def.hits };
      });
    },
  },

  commands: {
    'mine/hit': ({ game, data, rng, bus }, { index }) => {
      if (!game.isUnlocked('mining')) return { ok: false, reason: '尚未解锁挖矿' };
      const mine = game.query('universe/currentRuntime').mine;
      const node = mine.nodes[index];
      if (!node) return { ok: false, reason: '矿点不存在' };
      if (!game.query('inventory/useEnergy', data.miningConfig.energyPerHit)) return { ok: false, reason: '体力不足' };
      node.hp -= 1;
      if (node.hp > 0) return { ok: true };

      const def = data.oreNodes.get(node.id);
      const mult = game.query('universe/modifier', game.state.player.planetId, 'miningYield');
      const n = Math.max(1, Math.round(rng.int(def.yield[0], def.yield[1]) * mult));
      game.query('inventory/add', def.ore, n);
      mine.nodes.splice(index, 1);
      bus.emit('ui:toast', { text: `获得 ${data.items.get(def.ore).name} ×${n}`, kind: 'good' });
      return { ok: true };
    },
  },
};

function refresh({ game, data, rng, state }, planetId, force) {
  if (!game.isUnlocked('mining')) return;
  const mine = game.query('universe/runtime', planetId).mine;
  if (!force && mine.lastRefreshDay === state.time.day) return;
  const pool = data.oreNodes
    .all()
    .filter((n) => !n.requiresFlag || game.query('universe/hasFlag', planetId, n.requiresFlag));
  const total = pool.reduce((s, n) => s + n.weight, 0);
  mine.nodes = [];
  for (let i = 0; i < data.miningConfig.nodesPerDay; i++) {
    let r = rng.next() * total;
    const def = pool.find((n) => (r -= n.weight) < 0) ?? pool[0];
    // uid 稳定标识一个矿点（删除其他矿点后 index 会变，uid 不变），表现层用它决定摆放位置
    mine.nodes.push({ id: def.id, hp: def.hits, uid: `${state.time.day}_${i}` });
  }
  mine.lastRefreshDay = state.time.day;
}
