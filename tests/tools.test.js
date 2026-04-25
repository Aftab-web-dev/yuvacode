import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'yuva-tools-test-'));
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  mock.restoreAll();
});

const allowAll = { askPermission: async () => 'yes', sessionAllow: new Set() };

test('TOOL_SCHEMAS contains all 5 tools', async () => {
  const { TOOL_SCHEMAS } = await import('../src/tools.js?t=' + Date.now());
  const names = TOOL_SCHEMAS.map(s => s.function.name).sort();
  assert.deepEqual(names, ['edit_file', 'list_files', 'read_file', 'shell', 'write_file']);
});

test('read_file returns content', async () => {
  writeFileSync(join(tmpDir, 'a.txt'), 'hello');
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('read_file', { path: 'a.txt' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, true);
  assert.equal(result.content, 'hello');
});

test('read_file returns error on missing path', async () => {
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('read_file', { path: 'nope.txt' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, false);
  assert.match(result.error, /ENOENT|not found/i);
});

test('write_file creates parent dirs', async () => {
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('write_file', { path: 'a/b/c/file.txt', content: 'x' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, true);
  assert.equal(readFileSync(join(tmpDir, 'a/b/c/file.txt'), 'utf-8'), 'x');
});

test('edit_file replaces single match', async () => {
  writeFileSync(join(tmpDir, 'f.txt'), 'foo bar baz');
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('edit_file', { path: 'f.txt', search: 'bar', replace: 'BAR' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, true);
  assert.equal(readFileSync(join(tmpDir, 'f.txt'), 'utf-8'), 'foo BAR baz');
});

test('edit_file errors on no match', async () => {
  writeFileSync(join(tmpDir, 'f.txt'), 'foo');
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('edit_file', { path: 'f.txt', search: 'xyz', replace: 'q' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, false);
  assert.match(result.error, /not found/i);
  assert.equal(readFileSync(join(tmpDir, 'f.txt'), 'utf-8'), 'foo');
});

test('edit_file errors on ambiguous match', async () => {
  writeFileSync(join(tmpDir, 'f.txt'), 'foo foo foo');
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('edit_file', { path: 'f.txt', search: 'foo', replace: 'x' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, false);
  assert.match(result.error, /matches 3/i);
  assert.equal(readFileSync(join(tmpDir, 'f.txt'), 'utf-8'), 'foo foo foo');
});

test('list_files returns directory entries', async () => {
  writeFileSync(join(tmpDir, 'a.txt'), '');
  writeFileSync(join(tmpDir, 'b.txt'), '');
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('list_files', { path: '.' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, true);
  assert.ok(result.entries.includes('a.txt'));
  assert.ok(result.entries.includes('b.txt'));
});

test('shell returns stdout and exit_code', async () => {
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('shell', { command: 'node -e "console.log(\'ok\')"' }, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, true);
  assert.match(result.stdout, /ok/);
  assert.equal(result.exit_code, 0);
});

test('shell respects timeout', async () => {
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool(
    'shell',
    { command: 'node -e "setTimeout(()=>{}, 5000)"' },
    { cwd: tmpDir, ...allowAll, timeoutMs: 200 }
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /timeout/i);
});

test('executeTool catches handler throws and returns error result', async () => {
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const result = await executeTool('read_file', {}, { cwd: tmpDir, ...allowAll });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('permission denied returns error result', async () => {
  writeFileSync(join(tmpDir, 'f.txt'), 'x');
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  const ctx = {
    cwd: tmpDir,
    askPermission: async () => 'no',
    sessionAllow: new Set()
  };
  const result = await executeTool('write_file', { path: 'f.txt', content: 'y' }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error, /denied|cancelled/i);
  assert.equal(readFileSync(join(tmpDir, 'f.txt'), 'utf-8'), 'x', 'file unchanged');
});

test('always-allow caches the decision for the session', async () => {
  writeFileSync(join(tmpDir, 'f.txt'), 'x');
  const sessionAllow = new Set();
  let asked = 0;
  const askPermission = async () => { asked++; return 'always'; };
  const { executeTool } = await import('../src/tools.js?t=' + Date.now());
  await executeTool('write_file', { path: 'f.txt', content: 'y' }, { cwd: tmpDir, askPermission, sessionAllow });
  await executeTool('write_file', { path: 'f.txt', content: 'z' }, { cwd: tmpDir, askPermission, sessionAllow });
  assert.equal(asked, 1, 'permission asked only once');
  assert.equal(readFileSync(join(tmpDir, 'f.txt'), 'utf-8'), 'z');
});
