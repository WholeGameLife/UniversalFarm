/** 经济：商店买种子、出售物品 */
export const EconomySystem = {
  id: 'economy',

  queries: {
    /** 商店可购买列表（根据解锁过滤） */
    shopList: ({ data, game }) =>
      data.items
        .all()
        .filter((it) => ['seed', 'fertilizer', 'soil'].includes(it.category))
        .filter((it) => {
          const crop = data.crops.all().find((c) => c.seed === it.id);
          return !crop || crop.availability.shop && (!crop.availability.requires || game.state.tech.researched[crop.availability.requires]);
        }),

    sellPrice: ({ data, game }, id) => {
      const it = data.items.get(id);
      let p = it.sellPrice ?? 0;
      if (it.category === 'ore' && game.isUnlocked('refinery')) p = Math.round(p * 1.5);
      return p;
    },
  },

  commands: {
    'shop/buy': ({ data, game }, { id, n = 1 }) => {
      if (!Number.isSafeInteger(n) || n <= 0 || n > 999) return { ok: false, reason: '购买数量必须为 1–999 的整数' };
      if (!data.items.has(id)) return { ok: false, reason: '未知物品' };
      if (!game.query('economy/shopList').some((it) => it.id === id)) return { ok: false, reason: '此物品未解锁或不在商店出售' };
      const it = data.items.get(id);
      if (!it.price) return { ok: false, reason: '该物品不出售' };
      if (!game.query('inventory/spend', { credits: it.price * n })) return { ok: false, reason: '星币不足' };
      game.query('inventory/add', id, n);
      return { ok: true };
    },

    'shop/sell': ({ data, game, bus }, { id, n = 1 }) => {
      if (!Number.isSafeInteger(n) || n <= 0) return { ok: false, reason: '出售数量必须为正整数' };
      if (!data.items.has(id)) return { ok: false, reason: '未知物品' };
      const price = game.query('economy/sellPrice', id);
      if (!price) return { ok: false, reason: '无法出售' };
      if ((game.state.inventory[id] ?? 0) < n) return { ok: false, reason: '该品质物品数量不足' };
      if (!game.query('inventory/spend', { [id]: n })) return { ok: false, reason: '数量不足' };
      game.query('inventory/add', 'credits', price * n);
      bus.emit('ui:toast', { text: `出售 ${data.items.get(id).name} ×${n}，+${price * n} 星币`, kind: 'good' });
      return { ok: true };
    },
  },
};
