// 无界面跑通核心循环：种田 → 卖钱 → 研究 → 挖矿 → 修飞船 → 出航
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/Game.js';
import { buildData } from '../src/data/index.js';
import { createInitialState } from '../src/state/createInitialState.js';
import { allSystems } from '../src/systems/index.js';
import { serialize, deserialize, SAVE_VERSION } from '../src/core/SaveManager.js';
import { planetTerrainSeed } from '../src/core/planetSeed.js';

function newGame(seed = 42) {
  const data = buildData();
  const game = new Game({ data, state: createInitialState(data, seed), systems: allSystems });
  game.start();
  return game;
}

test('数据校验通过，初始星系已生成', () => {
  const g = newGame();
  assert.equal(g.query('universe/current').id, 'origin');
  assert.ok(g.query('universe/systems').length >= 1);
});

test('开垦-播种-浇水-生长-收获', () => {
  const g = newGame();
  g.dispatch('player/selectTool', { tool: 'hoe' });
  assert.ok(g.dispatch('farm/interact', { x: 0, y: 0 }).ok);
  g.dispatch('player/selectSeed', { seed: 'seed_starwheat' });
  assert.ok(g.dispatch('farm/interact', { x: 0, y: 0 }).ok);
  g.dispatch('player/selectTool', { tool: 'water' });
  // 起源星球 fertile：每天 +1.5，星麦需要 2 天
  for (let d = 0; d < 2; d++) {
    assert.ok(g.dispatch('farm/interact', { x: 0, y: 0 }).ok);
    g.dispatch('time/sleep');
  }
  assert.equal(g.query('farm/tileView', 0, 0).mature, true);
  assert.ok(g.dispatch('farm/interact', { x: 0, y: 0 }).ok);
  assert.ok(g.query('inventory/count', 'starwheat') >= 1);
});

test('未浇水不生长', () => {
  const g = newGame();
  g.dispatch('player/selectTool', { tool: 'hoe' });
  g.dispatch('farm/interact', { x: 1, y: 1 });
  g.dispatch('player/selectSeed', { seed: 'seed_starwheat' });
  g.dispatch('farm/interact', { x: 1, y: 1 });
  g.dispatch('time/sleep');
  g.dispatch('time/sleep');
  assert.equal(g.query('farm/tileView', 1, 1).mature, false);
});

test('科技解锁挖矿，挖矿得矿石，修飞船后可出航', () => {
  const g = newGame();
  assert.equal(g.dispatch('mine/hit', { index: 0 }).ok, false);
  g.query('inventory/add', 'credits', 5000);
  g.query('inventory/add', 'starwheat', 5);
  assert.ok(g.dispatch('tech/research', { id: 'tech_drill' }).ok);
  assert.ok(g.isUnlocked('mining'));
  const nodes = g.query('mining/nodes');
  assert.ok(nodes.length > 0);
  for (let i = 0; i < nodes[0].maxHp; i++) g.dispatch('mine/hit', { index: 0 });
  assert.equal(g.query('mining/nodes').length, nodes.length - 1);

  assert.equal(g.query('travel/destinations').length, 0);
  g.query('inventory/add', 'ore_ferrite', 30);
  g.query('inventory/add', 'ore_cuprite', 10);
  assert.ok(g.dispatch('tech/research', { id: 'tech_ship_repair' }).ok);
  const dests = g.query('travel/destinations');
  assert.ok(dests.length > 0);
  assert.ok(g.dispatch('travel/go', { planetId: dests[0].id }).ok);
  assert.equal(g.state.player.planetId, dests[0].id);
});

test('解锁曲速后生成新星团', () => {
  const g = newGame();
  const before = g.query('universe/systems').length;
  g.unlock('tier_cluster');
  assert.equal(g.query('universe/systems').length, before + 6);
});

test('存档往返一致，同 seed 宇宙一致', () => {
  const a = newGame(7);
  const b = newGame(7);
  assert.deepEqual(Object.keys(a.state.universe.planets), Object.keys(b.state.universe.planets));
  const restored = deserialize(serialize(a.state));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(a.state)));
});

test('every planet has a persistent terrain seed, including newly unlocked systems', () => {
  const a = newGame(7);
  const b = newGame(7);
  a.unlock('tier_cluster');
  b.unlock('tier_cluster');
  for (const p of Object.values(a.state.universe.planets)) {
    assert.equal(p.terrainSeed, planetTerrainSeed(7, p.id));
    assert.equal(p.terrainSeed, b.state.universe.planets[p.id].terrainSeed);
  }
  assert.deepEqual(deserialize(serialize(a.state)).universe, a.state.universe);
});

test('v1 saves gain deterministic planet seeds without losing farms, ores or progress', () => {
  const g = newGame(11);
  g.dispatch('farm/interact', { x: 0, y: 0 });
  g.unlock('mining');
  const old = JSON.parse(serialize(g.state));
  old.meta.version = 1;
  for (const p of Object.values(old.universe.planets)) delete p.terrainSeed;
  const restored = deserialize(JSON.stringify(old));
  assert.equal(restored.meta.version, SAVE_VERSION);
  assert.deepEqual(restored.planets, old.planets);
  assert.deepEqual(restored.inventory, old.inventory);
  assert.deepEqual(restored.unlocks, old.unlocks);
  for (const p of Object.values(restored.universe.planets)) assert.equal(p.terrainSeed, planetTerrainSeed(11, p.id));
  const game = new Game({ data: buildData(), state: restored, systems: allSystems });
  game.start();
  assert.equal(game.query('farm/tileView', 0, 0).soil, 'tilled');
});
