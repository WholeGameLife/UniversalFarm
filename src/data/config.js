/** 全局数值配置：调平衡只改这里 */
export const config = {
  time: {
    secondsPerGameMinute: 0.5, // 现实 0.5 秒 = 游戏 1 分钟 → 一天约 9 分钟
    dayStartMinute: 6 * 60,
    dayEndMinute: 24 * 60,
  },
  farm: {
    width: 10,
    height: 8,
    enforceClimate: false,
    applyPlanetModifiers: false,
  },
  start: {
    credits: 100,
    inventory: { seed_starwheat: 6, seed_lumaberry: 2, fertilizer_basic: 3 },
    planetId: 'origin',
  },
};
