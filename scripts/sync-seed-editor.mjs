import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crops } from '../src/data/crops.js';

const destination = new URL('../UniversalFarmSeedEditor/', import.meta.url);
await mkdir(destination, { recursive: true });
const schema = (await readFile(new URL('../src/data/cropSchema.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
await writeFile(new URL('catalog.js', destination), `// Standalone snapshot. No game imports or runtime dependencies.\n${schema}\nconst DEFAULT_CROPS = ${JSON.stringify(crops, null, 2)};\n`, 'utf8');
console.log(`Updated standalone catalog: ${fileURLToPath(new URL('catalog.js', destination))}`);
