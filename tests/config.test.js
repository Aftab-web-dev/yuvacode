import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'yuva-config-test-'));
  process.env.YUVA_CONFIG_DIR = tmpDir;
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.YUVA_CONFIG_DIR;
});

test('loadConfig writes defaults when no file exists', async () => {
  const { loadConfig } = await import('../src/config.js?t=' + Date.now());
  const cfg = loadConfig();
  assert.equal(cfg.model, 'meta/llama-3.3-70b-instruct');
  assert.equal(cfg.apiKey, '');
  assert.ok(cfg.systemPrompt.length > 0);
  assert.ok(existsSync(join(tmpDir, 'config.json')));
});

test('loadConfig round-trips a saved config', async () => {
  const { loadConfig, saveConfig } = await import('../src/config.js?t=' + Date.now());
  saveConfig({ apiKey: 'nvapi-test', model: 'qwen/qwen2.5-coder-32b-instruct', systemPrompt: 'CUSTOM' });
  const cfg = loadConfig();
  assert.equal(cfg.apiKey, 'nvapi-test');
  assert.equal(cfg.model, 'qwen/qwen2.5-coder-32b-instruct');
  assert.equal(cfg.systemPrompt, 'CUSTOM');
});

test('loadConfig backs up corrupt file and writes defaults', async () => {
  writeFileSync(join(tmpDir, 'config.json'), '{not json');
  const { loadConfig } = await import('../src/config.js?t=' + Date.now());
  const cfg = loadConfig();
  assert.equal(cfg.apiKey, '');
  const files = readdirSync(tmpDir);
  assert.ok(files.some(f => f.startsWith('config.json.bak-')), 'backup written');
  assert.ok(files.includes('config.json'), 'fresh defaults written');
});

test('loadConfig preserves user-edited systemPrompt', async () => {
  writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    model: 'meta/llama-3.3-70b-instruct',
    systemPrompt: 'MY CUSTOM PROMPT'
  }));
  const { loadConfig } = await import('../src/config.js?t=' + Date.now());
  const cfg = loadConfig();
  assert.equal(cfg.systemPrompt, 'MY CUSTOM PROMPT');
});

test('getConfigPath returns the resolved path', async () => {
  const { getConfigPath } = await import('../src/config.js?t=' + Date.now());
  assert.equal(getConfigPath(), join(tmpDir, 'config.json'));
});
