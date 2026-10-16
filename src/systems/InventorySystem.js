/** 背包 + 货币 + 体力。其他系统通过 query 调用，避免直接改 inventory */
export const InventorySystem = {
  id: 'inventory',

  init({ bus, state }) {
    bus.on('time:dayStarted', () => {
      state.player.energy = state.player.maxEnergy;
    });
  },

  queries: {
    count: ({ state, data }, id) => {
      if (id === 'credits') return state.player.credits;
      if (data.items.has(id) && data.items.get(id).category === 'crop' && data.items.get(id).quality === 'normal') {
        return data.qualities.all().reduce((n, q) => n + (state.inventory[id + q.suffix] ?? 0), 0);
      }
      return state.inventory[id] ?? 0;
    },

    add: ({ state, bus }, id, n = 1) => {
      if (id === 'credits') state.player.credits += n;
      else state.inventory[id] = (state.inventory[id] ?? 0) + n;
      if (n > 0) bus.emit('inventory:added', { id, n });
    },

    /** 检查是否拥有一组资源 { credits: 10, ore_ferrite: 3 } */
    has: (ctx, cost) => !!spendingPlan(ctx, cost),

    /** 扣除一组资源，不足返回 false 且不扣 */
    spend: (ctx, cost) => {
      const plan = spendingPlan(ctx, cost);
      if (!plan) return false;
      ctx.state.player.credits = plan.credits;
      for (const [id, n] of plan.remaining) {
        if (n > 0) ctx.state.inventory[id] = n;
        else delete ctx.state.inventory[id];
      }
      return true;
    },

    useEnergy: ({ state }, n) => {
      if (state.player.energy < n) return false;
      state.player.energy -= n;
      return true;
    },

    list: ({ state, data }) =>
      Object.entries(state.inventory)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => ({ ...data.items.get(id), count: n })),
  },

  commands: {
    'player/selectTool': ({ state }, { tool }) => {
      if (!['hoe', 'water', 'clear'].includes(tool)) return { ok: false, reason: '未知工具' };
      state.player.tool = tool;
      return { ok: true };
    },
    'player/selectSeed': ({ state, data }, { seed }) => {
      if (!data.items.has(seed) || data.items.get(seed).category !== 'seed') return { ok: false, reason: '无效种子' };
      state.player.selectedSeed = seed;
      state.player.tool = 'seed';
      return { ok: true };
    },
    'player/selectFertilizer': ({ state, data }, { id }) => {
      if (!data.fertilizers.has(id)) return { ok: false, reason: '无效肥料' };
      state.player.selectedFertilizer = id;
      state.player.tool = 'fertilizer';
      return { ok: true };
    },
    'player/selectSoil': ({ state, data }, { id }) => {
      if (!data.items.has(id) || data.items.get(id).category !== 'soil') return { ok: false, reason: '无效土壤改良包' };
      state.player.selectedSoil = id;
      state.player.tool = 'soil';
      return { ok: true };
    },
    'inventory/eat': ({ state, data, game, bus }, { id }) => {
      if (!data.items.has(id) || !(data.items.get(id).foodEnergy > 0)) return { ok: false, reason: '这种物品不能食用' };
      if (state.player.energy >= state.player.maxEnergy) return { ok: false, reason: '体力已满，无需食用' };
      if ((state.inventory[id] ?? 0) < 1) return { ok: false, reason: '该品质物品不足' };
      if (!game.query('inventory/spend', { [id]: 1 })) return { ok: false, reason: '物品不足' };
      const recovered = Math.min(data.items.get(id).foodEnergy, state.player.maxEnergy - state.player.energy);
      state.player.energy += recovered;
      bus.emit('ui:toast', { text: `食用 ${data.items.get(id).name}，体力 +${recovered}`, kind: 'good' });
      return { ok: true };
    },
  },
};

// Reserve explicit quality items first; then base crop costs may consume any quality.
// Planning before mutation keeps mixed costs atomic and avoids counting a gold crop twice.
function spendingPlan({ state, data }, cost) {
  const remaining = new Map(Object.entries(state.inventory));
  let credits = state.player.credits;
  const isBaseCrop = (id) => data.items.has(id) && data.items.get(id).category === 'crop' && data.items.get(id).quality === 'normal';
  const entries = Object.entries(cost).sort(([a], [b]) => Number(isBaseCrop(a)) - Number(isBaseCrop(b)));
  for (const [id, n] of entries) {
    if (!Number.isSafeInteger(n) || n < 0 || (id !== 'credits' && !data.items.has(id))) return null;
    if (id === 'credits') { if (credits < n) return null; credits -= n; continue; }
    let need = n;
    const candidates = isBaseCrop(id) ? data.qualities.all().map((q) => id + q.suffix) : [id];
    for (const item of candidates) {
      const count = remaining.get(item) ?? 0;
      const take = Math.min(need, count);
      if (take) remaining.set(item, count - take);
      need -= take;
      if (!need) break;
    }
    if (need) return null;
  }
  return { remaining, credits };
}
