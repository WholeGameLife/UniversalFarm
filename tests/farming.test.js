import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/Game.js';
import { buildData } from '../src/data/index.js';
import { crops } from '../src/data/crops.js';
import { validateCropCatalog, parseCropCatalog, cropModuleSource } from '../src/data/cropSchema.js';
import { createInitialState } from '../src/state/createInitialState.js';
import { allSystems } from '../src/systems/index.js';
import { deserialize, serialize, SAVE_VERSION } from '../src/core/SaveManager.js';
import { makeCrop } from '../src/view3d/models.js';

function game(options) {
  const data = buildData(options);
  const g = new Game({ data, state: createInitialState(data, 42), systems: allSystems });
  g.start();
  g.query('inventory/add', 'credits', 2000);
  return g;
}
const tile = (g, x = 0, y = 0) => g.query('universe/currentRuntime').farm.tiles[y * 10 + x];
const interact = (g, x = 0, y = 0) => g.dispatch('farm/interact', { x, y });
const tool = (g, name) => g.dispatch('player/selectTool', { tool: name });
function plant(g, id = 'starwheat', x = 0, fertilizer = null) {
  tool(g, 'hoe'); assert.ok(interact(g, x).ok);
  if (fertilizer) {
    g.query('inventory/add', fertilizer, 1);
    g.dispatch('player/selectFertilizer', { id: fertilizer });
    assert.ok(interact(g, x).ok);
  }
  g.query('inventory/add', 'seed_' + id, 1);
  g.dispatch('player/selectSeed', { seed: 'seed_' + id });
  assert.ok(interact(g, x).ok);
}
function grow(g, n, x = 0) {
  for (let i = 0; i < n; i++) { tool(g, 'water'); assert.ok(interact(g, x).ok); g.dispatch('time/sleep'); }
}

test('buy -> fertilize -> plant -> water -> grow -> harvest -> sell is a profitable loop', () => {
  const g = game(), before = g.state.player.credits;
  assert.ok(g.dispatch('shop/buy', { id: 'seed_starwheat', n: 1 }).ok);
  assert.equal(g.state.player.credits, before - 10);
  plant(g, 'starwheat', 0, 'fertilizer_basic');
  const fertilizerCount = g.state.inventory.fertilizer_basic;
  g.dispatch('player/selectFertilizer', { id: 'fertilizer_basic' });
  assert.equal(interact(g).ok, false);
  assert.equal(g.state.inventory.fertilizer_basic, fertilizerCount);
  grow(g, 2);
  assert.ok(g.query('farm/tileView', 0, 0).mature);
  const result = interact(g);
  assert.ok(result.ok);
  assert.ok(result.n >= 1 && result.n <= 2);
  assert.equal(tile(g).crop, null);
  assert.equal(tile(g).fertilizer, null);
  assert.equal(tile(g).soil, 'tilled');
  assert.ok(g.dispatch('shop/sell', { id: result.item, n: result.n }).ok);
  assert.ok(g.state.player.credits > before);
});

test('daily watering consumes energy once; missed watering pauses growth and eventually withers', () => {
  const g = game(); plant(g);
  g.dispatch('time/sleep');
  assert.equal(tile(g).crop.progress, 0);
  assert.equal(g.query('farm/summary').needsWater, 1);
  tool(g, 'water');
  const energy = g.state.player.energy;
  assert.ok(interact(g).ok);
  assert.equal(g.state.player.energy, energy - 1);
  assert.equal(interact(g).ok, false);
  assert.equal(g.state.player.energy, energy - 1);
  g.dispatch('time/sleep');
  assert.equal(tile(g).crop.progress, 1);
  for (let i = 0; i < 4; i++) g.dispatch('time/sleep');
  assert.ok(tile(g).crop.withered);
  assert.equal(g.query('farm/summary').withered, 1);
  assert.ok(!g.query('farm/tileView', 0, 0).mature);
  tool(g, 'hoe'); assert.ok(interact(g).ok);
  assert.equal(tile(g).crop, null);
});

test('mature crops remain harvestable when left in the field without watering', () => {
  const g = game(); plant(g); grow(g, 2);
  for (let i = 0; i < 10; i++) g.dispatch('time/sleep');
  assert.ok(g.query('farm/tileView', 0, 0).mature);
  assert.ok(!tile(g).crop.withered);
});

test('soil requirements reject planting atomically and an amendment enables dryland beans', () => {
  const g = game(); tool(g, 'hoe'); interact(g);
  g.dispatch('shop/buy', { id: 'seed_sunbean' });
  g.dispatch('player/selectSeed', { seed: 'seed_sunbean' });
  const before = g.state.inventory.seed_sunbean;
  assert.equal(interact(g).ok, false);
  assert.equal(g.state.inventory.seed_sunbean, before);
  assert.equal(tile(g).crop, null);
  g.dispatch('shop/buy', { id: 'soil_sand' });
  g.dispatch('player/selectSoil', { id: 'soil_sand' });
  assert.ok(interact(g).ok);
  assert.equal(tile(g).soilType, 'sand');
  g.dispatch('player/selectSeed', { seed: 'seed_sunbean' });
  assert.ok(interact(g).ok);
  tool(g, 'water'); interact(g); g.dispatch('time/sleep');
  assert.equal(tile(g).crop.progress, 1);
  assert.equal(g.query('farm/tileView', 0, 0).needsWater, false);
  g.dispatch('time/sleep');
  assert.equal(tile(g).crop.progress, 2);
  assert.equal(g.query('farm/tileView', 0, 0).needsWater, true);
  g.dispatch('time/sleep');
  assert.equal(tile(g).crop.progress, 2);
});

test('hops repeatedly harvest every regrow cycle and retain fertilizer until cleared', () => {
  const g = game(); plant(g, 'hops', 0, 'fertilizer_basic'); grow(g, 6);
  assert.ok(interact(g).ok);
  assert.equal(tile(g).crop.harvests, 1);
  assert.equal(tile(g).crop.progress, 0);
  assert.equal(tile(g).fertilizer, 'fertilizer_basic');
  assert.equal(g.query('farm/tileView', 0, 0).crop.daysLeft, 2);
  grow(g, 1); assert.ok(!g.query('farm/tileView', 0, 0).mature);
  grow(g, 1); assert.ok(g.query('farm/tileView', 0, 0).mature);
  interact(g); assert.equal(tile(g).crop.harvests, 2);
  tool(g, 'clear'); assert.ok(interact(g).ok);
  assert.equal(tile(g).crop, null);
  assert.equal(tile(g).fertilizer, null);
  assert.ok(g.data.crops.get('hops').uses.processing.some((r) => r.machine === 'keg' && r.output === 'pale_ale'));
});

test('speed fertilizer advances growth and retaining fertilizer preserves water', () => {
  const g = game(); plant(g, 'hops', 0, 'fertilizer_speed'); grow(g, 4);
  assert.equal(tile(g).crop.progress, 5);
  assert.equal(g.query('farm/tileView', 0, 0).crop.daysLeft, 1);
  grow(g, 1); assert.ok(g.query('farm/tileView', 0, 0).mature);
  const h = game(); plant(h, 'hops', 0, 'fertilizer_retaining');
  h.rng.next = () => 0;
  tool(h, 'water'); interact(h); h.dispatch('time/sleep');
  assert.equal(tile(h).watered, true);
  h.dispatch('time/sleep'); assert.equal(tile(h).crop.progress, 2);
  h.rng.next = () => 0.99;
  h.dispatch('time/sleep'); assert.equal(tile(h).watered, false);
});

test('quality increases price, counts toward research and cannot be sold/eaten at another quality price', () => {
  const g = game(); plant(g, 'starwheat', 0, 'fertilizer_basic'); grow(g, 2);
  g.rng.next = () => 0.1;
  const harvest = interact(g);
  assert.equal(harvest.quality, 'gold');
  assert.equal(harvest.item, 'starwheat_gold');
  assert.equal(g.query('economy/sellPrice', harvest.item), 33);
  g.state.inventory = { starwheat_gold: 5 };
  assert.equal(g.query('inventory/count', 'starwheat'), 5);
  assert.equal(g.dispatch('shop/sell', { id: 'starwheat', n: 1 }).ok, false);
  g.state.player.energy = 50;
  assert.equal(g.dispatch('inventory/eat', { id: 'starwheat' }).ok, false);
  assert.ok(g.dispatch('tech/research', { id: 'tech_drill' }).ok);
  assert.equal(g.query('inventory/count', 'starwheat'), 0);
  g.state.inventory = { starwheat: 1, starwheat_gold: 1 };
  assert.equal(g.query('inventory/spend', { starwheat: 2, starwheat_gold: 1 }), false);
  assert.deepEqual(g.state.inventory, { starwheat: 1, starwheat_gold: 1 });
  assert.equal(g.query('inventory/spend', { starwheat: 1, starwheat_gold: 1 }), true);
  assert.deepEqual(g.state.inventory, {});
});

test('food restores capped energy, non-food and empty inventory cannot be consumed', () => {
  const g = game(); g.query('inventory/add', 'turnip', 2);
  assert.equal(g.dispatch('inventory/eat', { id: 'turnip' }).ok, false);
  g.state.player.energy = 95;
  assert.ok(g.dispatch('inventory/eat', { id: 'turnip' }).ok);
  assert.equal(g.state.player.energy, 100);
  assert.equal(g.state.inventory.turnip, 1);
  assert.equal(g.dispatch('inventory/eat', { id: 'hops' }).ok, false);
});

test('invalid quantities, coordinates, item IDs and locked crops cannot mutate resources', () => {
  const g = game();
  const before = serialize(g.state);
  for (const n of [-1, 0, 1.5, NaN, Infinity, 1000]) {
    assert.equal(g.dispatch('shop/buy', { id: 'seed_starwheat', n }).ok, false);
    assert.equal(g.dispatch('shop/sell', { id: 'starwheat', n }).ok, false);
  }
  assert.equal(g.dispatch('shop/buy', { id: 'missing' }).ok, false);
  assert.equal(g.dispatch('shop/buy', { id: 'seed_voidmelon' }).ok, false);
  for (const x of [-1, 0.5, NaN, 10]) assert.equal(g.dispatch('farm/interact', { x, y: 0 }).ok, false);
  assert.equal(g.query('farm/tileView', 200, 0), null);
  assert.equal(g.dispatch('player/selectSeed', { seed: 'missing' }).ok, false);
  assert.equal(g.dispatch('player/selectFertilizer', { id: 'missing' }).ok, false);
  assert.equal(serialize(g.state), before);
});

test('climate data is deferred by default and enforced only with the explicit feature flag', () => {
  const g = game();
  g.query('universe/current').climate = { temperature: -80, moisture: 0 };
  plant(g); grow(g, 1); assert.equal(tile(g).crop.progress, 1);
  const h = game({ farmConfig: { enforceClimate: true } });
  h.query('universe/current').climate = { temperature: -80, moisture: 0 };
  tool(h, 'hoe'); interact(h); h.dispatch('player/selectSeed', { seed: 'seed_starwheat' });
  assert.equal(interact(h).ok, false);
});

test('growth continues for watered farms off planet, but unwatered crops still pause', () => {
  const g = game(); plant(g); tool(g, 'water'); interact(g);
  const origin = tile(g);
  g.unlock('travel_system');
  const dest = g.query('travel/destinations')[0];
  assert.ok(g.dispatch('travel/go', { planetId: dest.id }).ok);
  g.dispatch('time/sleep'); assert.equal(origin.crop.progress, 1);
  g.dispatch('time/sleep'); assert.equal(origin.crop.progress, 1);
});

test('v2 saves migrate existing growing crops and preserve gameplay progress', () => {
  const g = game(); plant(g); tool(g, 'water'); interact(g);
  const old = JSON.parse(serialize(g.state)); old.meta.version = 2;
  for (const rt of Object.values(old.planets)) for (const t of rt.farm.tiles) {
    delete t.soilType; delete t.fertilizer;
    if (t.crop) t.crop = { id: t.crop.id, progress: t.crop.progress };
  }
  const next = deserialize(JSON.stringify(old));
  assert.equal(next.meta.version, SAVE_VERSION);
  assert.equal(next.planets.origin.farm.tiles[0].soilType, 'loam');
  assert.equal(next.planets.origin.farm.tiles[0].crop.moistureDays, 1);
  const restored = new Game({ data: g.data, state: next, systems: allSystems }); restored.start();
  restored.dispatch('time/sleep');
  assert.equal(tile(restored).crop.progress, 1);
});

test('editor data roundtrips safely and drives prices, growth and models without duplicate definitions', () => {
  assert.deepEqual(parseCropCatalog(cropModuleSource(crops)), crops);
  assert.deepEqual(parseCropCatalog(JSON.stringify({ schemaVersion: 1, crops })), crops);
  assert.throws(() => parseCropCatalog('export const crops = (globalThis.hacked = true);'));
  const custom = structuredClone(crops);
  custom[0].seedPrice = 31; custom[0].growDays = 3; custom[0].stageDays = [1, 2];
  custom[0].harvest.sellPrice = 70;
  const g = game({ cropCatalog: custom });
  assert.equal(g.data.items.get('seed_starwheat').price, 31);
  assert.equal(g.data.items.get('starwheat_gold').sellPrice, 105);
  plant(g); grow(g, 2); assert.ok(!g.query('farm/tileView', 0, 0).mature);
  grow(g, 1); assert.ok(g.query('farm/tileView', 0, 0).mature);
  for (const c of custom) for (let stage = 0; stage < c.stages.length; stage++) {
    const model = makeCrop(c.id, c.visual, stage, c.stages.length, stage === c.stages.length - 1);
    assert.ok(model.children.length > 0);
  }
  for (const mutate of [
    (c) => { c[0].stageDays = [0, 1]; }, (c) => { c[0].seedPrice = -1; },
    (c) => { c[0].uses.processing = {}; }, (c) => { c[0].requirements = null; },
    (c) => { c[1].id = c[0].id; }, (c) => { c[0].harvest.max = 0; },
  ]) { const bad = structuredClone(crops); mutate(bad); assert.ok(validateCropCatalog(bad).length); assert.throws(() => cropModuleSource(bad)); }
});
