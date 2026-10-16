import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, copyFile, access, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { crops } from '../src/data/crops.js';
import { validateCropCatalog } from '../src/data/cropSchema.js';

test('bundled seed editor has a current standalone catalog and local assets', async () => {
  const editor = new URL('../UniversalFarmSeedEditor/', import.meta.url);
  const html = await readFile(new URL('index.html', editor), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(assets.includes('catalog.js'));
  assert.ok(assets.includes('editor.js'));
  for (const asset of assets) {
    assert.ok(!asset.includes('..') && !asset.includes(':'), 'Editor assets must be standalone');
    await access(new URL(asset, editor));
  }
  const source = await readFile(new URL('catalog.js', editor), 'utf8');
  const snapshot = runInNewContext(`${source}\nJSON.stringify(DEFAULT_CROPS);`);
  assert.deepEqual(JSON.parse(snapshot), crops);
  assert.deepEqual(validateCropCatalog(JSON.parse(snapshot)), []);
});

test('catalog sync writes inside the repository regardless of working directory', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'universal-farm-sync-'));
  t.after(async () => {
    assert.equal(dirname(temporary), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith('universal-farm-sync-'));
    await rm(temporary, { recursive: true, force: true });
  });
  const root = join(temporary, 'UniversalFarm');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'src', 'data'), { recursive: true });
  await copyFile(new URL('../package.json', import.meta.url), join(root, 'package.json'));
  for (const file of ['scripts/sync-seed-editor.mjs', 'src/data/crops.js', 'src/data/cropSchema.js']) {
    await copyFile(new URL(`../${file}`, import.meta.url), join(root, file));
  }
  execFileSync(process.execPath, [join(root, 'scripts', 'sync-seed-editor.mjs')], { cwd: temporary });
  const generated = await readFile(join(root, 'UniversalFarmSeedEditor', 'catalog.js'), 'utf8');
  const bundled = await readFile(new URL('../UniversalFarmSeedEditor/catalog.js', import.meta.url), 'utf8');
  assert.equal(generated, bundled);
  await assert.rejects(access(join(temporary, 'UniversalFarmSeedEditor')), { code: 'ENOENT' });
});
