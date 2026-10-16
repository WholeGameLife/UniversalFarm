/** 航行：在已解锁层级的星球间移动（骨架，后续加入燃料、航行时间、事件） */
export const TravelSystem = {
  id: 'travel',

  queries: {
    /** 可前往的星球列表 */
    destinations: ({ state, data, game }) => {
      if (!game.isUnlocked('travel_system')) return [];
      return Object.values(state.universe.planets)
        .filter((p) => p.id !== state.player.planetId)
        .filter((p) => {
          const tier = data.tiers.get(p.tier);
          return !tier.requires || state.tech.researched[tier.requires];
        })
        .map((p) => ({ ...p, cost: travelCost({ data, game }, p) }));
    },
  },

  commands: {
    'travel/go': (ctx, { planetId }) => {
      const { state, game, bus } = ctx;
      const dest = game.query('travel/destinations').find((p) => p.id === planetId);
      if (!dest) return { ok: false, reason: '无法前往该星球' };
      if (!game.query('inventory/spend', { credits: dest.cost })) return { ok: false, reason: '燃料费不足' };
      state.player.planetId = planetId;
      game.query('universe/runtime', planetId);
      if (!state.universe.discovered.includes(planetId)) state.universe.discovered.push(planetId);
      bus.emit('travel:arrived', { planetId });
      bus.emit('ui:toast', { text: `抵达 ${dest.name}`, kind: 'info' });
      return { ok: true };
    },
  },
};

function travelCost({ data, game }, planet) {
  const depth = data.tiers.get(planet.tier).depth;
  const base = 50 * Math.pow(4, depth);
  return Math.round(base * game.query('universe/modifier', planet.id, 'travelCost'));
}
