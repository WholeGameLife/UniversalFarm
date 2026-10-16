/** 科技：研究消耗资源，完成后写入 unlocks */
export const TechSystem = {
  id: 'tech',

  queries: {
    /** 每项科技状态：done | available | locked */
    list: ({ data, state, game }) =>
      data.techs.all().map((t) => {
        const done = !!state.tech.researched[t.id];
        const prereqOk = t.prereq.every((p) => state.tech.researched[p]);
        return {
          ...t,
          status: done ? 'done' : prereqOk ? 'available' : 'locked',
          affordable: game.query('inventory/has', t.cost),
        };
      }),
  },

  commands: {
    'tech/research': ({ data, state, game, bus }, { id }) => {
      const t = data.techs.get(id);
      if (state.tech.researched[id]) return { ok: false, reason: '已经研究过了' };
      if (!t.prereq.every((p) => state.tech.researched[p])) return { ok: false, reason: '前置科技未完成' };
      if (!game.query('inventory/spend', t.cost)) return { ok: false, reason: '资源不足' };
      state.tech.researched[id] = true;
      t.unlocks.forEach((k) => game.unlock(k));
      bus.emit('tech:researched', { id });
      bus.emit('ui:toast', { text: `研究完成：${t.name}`, kind: 'good' });
      return { ok: true };
    },
  },
};
