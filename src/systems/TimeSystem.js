/** 时间：分钟推进、一天结束、睡觉 */
export const TimeSystem = {
  id: 'time',

  update(ctx, dt) {
    const { state, data, bus, game } = ctx;
    const t = state.time;
    t.acc += dt;
    const spm = data.config.time.secondsPerGameMinute;
    let advanced = false;
    while (t.acc >= spm) {
      t.acc -= spm;
      t.minute += 1;
      advanced = true;
      if (t.minute % 60 === 0) bus.emit('time:hour', { hour: t.minute / 60 });
    }
    if (t.minute >= data.config.time.dayEndMinute) {
      bus.emit('ui:toast', { text: '太晚了，你在飞船里昏睡过去……', kind: 'info' });
      nextDay(ctx);
      game.changed();
    } else if (advanced) {
      bus.emit('time:tick');
    }
  },

  commands: {
    'time/sleep': (ctx) => {
      nextDay(ctx);
      return { ok: true };
    },
  },

  queries: {
    clock: ({ state }) => {
      const m = state.time.minute;
      const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      return { day: state.time.day, text: `${hh}:${mm}`, minute: m };
    },
  },
};

function nextDay({ state, data, bus }) {
  state.time.day += 1;
  state.time.minute = data.config.time.dayStartMinute;
  state.time.acc = 0;
  bus.emit('time:dayStarted', { day: state.time.day });
}
