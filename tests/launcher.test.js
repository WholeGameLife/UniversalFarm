import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Windows launcher stays ASCII with CRLF line endings', () => {
  const bytes = readFileSync(new URL('../start.bat', import.meta.url));
  assert.ok(bytes.every((byte) => byte < 128), 'Non-ASCII batch content can depend on the cmd.exe code page');
  const text = bytes.toString('ascii');
  assert.ok(text.includes('\r\n'));
  assert.ok(!/[\r\n]/.test(text.replaceAll('\r\n', '')), 'Batch files must use Windows CRLF line endings');
});
