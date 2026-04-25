# OpenCode-Like Model & Provider UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring OpenCode-style model/provider UX to yuva-code: hybrid model catalog (bundled + refresh from models.dev), interactive picker via `@inquirer/prompts`, freeform model IDs, custom OpenAI-compatible endpoint support, and first-run provider auto-detection.

**Architecture:** New layers — `catalog.js` (model metadata, source of truth), `picker.js` (one inquirer-based picker reused by setup and slash commands), `detect.js` (first-run auto-detection). Providers collapse from 4 classes to 3: Gemini, Ollama, and one `OpenAICompatibleProvider` parameterized by `{baseUrl, apiKey, headers, model}` that absorbs Groq, OpenRouter, and the new custom endpoint. Config bumps to schemaVersion 2 with a one-shot migration.

**Tech Stack:** Node.js ≥20 (built-in `fetch`, `node:test`, `node:test` mocking), `@inquirer/prompts` (~50KB), existing `chalk` for color.

**Spec:** `docs/superpowers/specs/2026-04-25-opencode-like-model-ux-design.md`

---

## Notes for the implementer

- **Project is not a git repo today.** The user chose not to `git init`. Treat each `git commit` step as a logical checkpoint — review the diff, mentally "save" the work — but don't run the command. If you initialize git later, every commit step works as written.
- **Path overrides for tests.** Modules that touch `~/.yuva-ai/` resolve the directory at call time via `process.env.YUVA_CONFIG_DIR || join(homedir(), '.yuva-ai')`. Tests set `YUVA_CONFIG_DIR` to a temp dir.
- **Manual smoke test after the whole plan:** delete `~/.yuva-ai/`, run `yuva --setup` with `GEMINI_API_KEY` set, confirm detection picks it up; run `/model`, `/provider`, `/models`, `/add-endpoint`.

---

## Task 0: Project setup (deps, scripts, engines)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `package.json`**

```json
{
  "name": "yuva-code",
  "version": "1.0.0",
  "description": "YUVA Code - An AI-powered CLI coding assistant",
  "main": "src/index.js",
  "bin": {
    "yuva": "./bin/yuva.js"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js",
    "test": "node --test tests/"
  },
  "keywords": ["ai", "cli", "coding-assistant", "yuva"],
  "author": "Aftab",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "blessed": "^0.1.81",
    "chalk": "^5.3.0",
    "marked": "^12.0.0",
    "marked-terminal": "^7.0.0",
    "ora": "^8.0.1"
  }
}
```

(Removed `readline` — built into Node. Added `@inquirer/prompts`, `engines`, `test` script.)

- [ ] **Step 2: Install**

Run: `npm install`
Expected: installs `@inquirer/prompts` cleanly, no errors.

- [ ] **Step 3: Verify test runner works**

Run: `node --test tests/ 2>&1 || echo "no tests yet"`
Expected: prints `no tests yet` (the `tests/` dir doesn't exist yet — that's fine).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @inquirer/prompts, drop phantom readline dep, add test script"
```

---

## Task 1: Bundled catalog snapshot

**Files:**
- Create: `src/data/catalog.json`

- [ ] **Step 1: Create the catalog file**

Create `src/data/catalog.json`:

```json
{
  "version": 1,
  "lastRefresh": 0,
  "providers": {
    "gemini": {
      "id": "gemini",
      "name": "Gemini",
      "type": "gemini",
      "apiKeyUrl": "https://aistudio.google.com/apikey",
      "models": [
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "tools": true, "free": true, "context": 1048576},
        {"id": "gemini-2.0-flash-lite", "name": "Gemini 2.0 Flash Lite", "tools": true, "free": true, "context": 1048576},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "tools": true, "free": true, "context": 1048576}
      ]
    },
    "groq": {
      "id": "groq",
      "name": "Groq",
      "type": "openai-compatible",
      "baseUrl": "https://api.groq.com/openai/v1",
      "apiKeyUrl": "https://console.groq.com/keys",
      "models": [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B Versatile", "tools": true, "free": true, "context": 128000},
        {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B Instant", "tools": true, "free": true, "context": 128000},
        {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B", "tools": true, "free": true, "context": 32768}
      ]
    },
    "openrouter": {
      "id": "openrouter",
      "name": "OpenRouter",
      "type": "openai-compatible",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKeyUrl": "https://openrouter.ai/keys",
      "headers": {"X-Title": "YUVA AI CLI"},
      "models": [
        {"id": "meta-llama/llama-3-8b-instruct:free", "name": "Llama 3 8B (free)", "tools": false, "free": true, "context": 8192},
        {"id": "mistralai/mistral-7b-instruct:free", "name": "Mistral 7B (free)", "tools": false, "free": true, "context": 32768},
        {"id": "google/gemma-2-9b-it:free", "name": "Gemma 2 9B (free)", "tools": false, "free": true, "context": 8192}
      ]
    },
    "ollama": {
      "id": "ollama",
      "name": "Ollama",
      "type": "ollama",
      "models": [
        {"id": "llama3", "name": "Llama 3", "tools": false, "free": true},
        {"id": "qwen2.5-coder", "name": "Qwen 2.5 Coder", "tools": true, "free": true},
        {"id": "deepseek-coder-v2", "name": "DeepSeek Coder V2", "tools": false, "free": true},
        {"id": "codellama", "name": "Code Llama", "tools": false, "free": true},
        {"id": "mistral", "name": "Mistral", "tools": false, "free": true}
      ]
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/data/catalog.json'))" && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/data/catalog.json
git commit -m "feat: add bundled model catalog snapshot"
```

---

## Task 2: Catalog module — load and merge

**Files:**
- Create: `src/catalog.js`
- Create: `tests/catalog.test.js`

- [ ] **Step 1: Write failing test for `loadCatalog` returning bundled when no cache**

Create `tests/catalog.test.js`:

```js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'yuva-catalog-test-'));
  process.env.YUVA_CONFIG_DIR = tmpDir;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.YUVA_CONFIG_DIR;
});

test('loadCatalog returns bundled snapshot when no cache exists', async () => {
  const { loadCatalog } = await import('../src/catalog.js?t=' + Date.now());
  const cat = loadCatalog();
  assert.equal(cat.version, 1);
  assert.ok(cat.providers.gemini, 'gemini provider in bundled catalog');
  assert.ok(cat.providers.gemini.models.length > 0);
});

test('loadCatalog overlays cache when cache is newer', async () => {
  // Write a cache with extra model
  const cache = {
    version: 1,
    lastRefresh: Date.now(),
    providers: {
      gemini: {
        id: 'gemini', name: 'Gemini', type: 'gemini',
        models: [{ id: 'gemini-99-future', name: 'Future Model', tools: true, free: true }]
      }
    }
  };
  writeFileSync(join(tmpDir, 'catalog.json'), JSON.stringify(cache));

  const { loadCatalog } = await import('../src/catalog.js?t=' + Date.now());
  const cat = loadCatalog();
  const ids = cat.providers.gemini.models.map(m => m.id);
  assert.ok(ids.includes('gemini-99-future'), 'cached model is present');
});

test('loadCatalog falls back to bundled when cache is corrupt', async () => {
  writeFileSync(join(tmpDir, 'catalog.json'), '{not valid json');
  const { loadCatalog } = await import('../src/catalog.js?t=' + Date.now());
  const cat = loadCatalog();
  assert.ok(cat.providers.gemini, 'bundled catalog still loads');
});

test('getModels returns the model list for a provider', async () => {
  const { getModels } = await import('../src/catalog.js?t=' + Date.now());
  const models = getModels('groq');
  assert.ok(Array.isArray(models));
  assert.ok(models.length > 0);
});

test('getModel returns a single model by id', async () => {
  const { getModel } = await import('../src/catalog.js?t=' + Date.now());
  const m = getModel('gemini', 'gemini-2.0-flash');
  assert.equal(m.id, 'gemini-2.0-flash');
});

test('getModel returns null for unknown model', async () => {
  const { getModel } = await import('../src/catalog.js?t=' + Date.now());
  const m = getModel('gemini', 'nonexistent-model');
  assert.equal(m, null);
});
```

- [ ] **Step 2: Run the tests — they should fail**

Run: `npm test`
Expected: failures — `Cannot find module '../src/catalog.js'`.

- [ ] **Step 3: Implement `src/catalog.js`**

Create `src/catalog.js`:

```js
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_PATH = join(__dirname, 'data', 'catalog.json');

function configDir() {
  return process.env.YUVA_CONFIG_DIR || join(homedir(), '.yuva-ai');
}

function cachePath() {
  return join(configDir(), 'catalog.json');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function bundled() {
  const data = readJson(BUNDLED_PATH);
  if (data) return data;
  // Hardcoded last-resort fallback
  return {
    version: 1,
    lastRefresh: 0,
    providers: {
      gemini: { id: 'gemini', name: 'Gemini', type: 'gemini', models: [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tools: true, free: true }] }
    }
  };
}

function mergeProvider(base, overlay) {
  if (!overlay) return base;
  const seen = new Set();
  const merged = [];
  for (const m of overlay.models || []) {
    seen.add(m.id);
    merged.push(m);
  }
  for (const m of base.models || []) {
    if (!seen.has(m.id)) merged.push(m);
  }
  return { ...base, ...overlay, models: merged };
}

export function loadCatalog() {
  const base = bundled();
  const cache = readJson(cachePath());
  if (!cache || !cache.providers) return base;

  const providers = { ...base.providers };
  for (const [id, prov] of Object.entries(cache.providers)) {
    if (!providers[id]) continue; // ignore unknown providers
    providers[id] = mergeProvider(providers[id], prov);
  }
  return { ...base, ...cache, providers };
}

export function getModels(providerId) {
  const cat = loadCatalog();
  return cat.providers[providerId]?.models || [];
}

export function getModel(providerId, modelId) {
  return getModels(providerId).find(m => m.id === modelId) || null;
}

export function getProvider(providerId) {
  const cat = loadCatalog();
  return cat.providers[providerId] || null;
}

export function getAllProviders() {
  const cat = loadCatalog();
  return Object.values(cat.providers);
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test`
Expected: all 6 catalog tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/catalog.js tests/catalog.test.js
git commit -m "feat: add catalog module (load + cache merge)"
```

---

## Task 3: Catalog module — refresh from models.dev

**Files:**
- Modify: `src/catalog.js`
- Modify: `tests/catalog.test.js`

- [ ] **Step 1: Add failing tests for `refreshCatalog`**

Append to `tests/catalog.test.js`:

```js
import { mock } from 'node:test';

test('refreshCatalog writes cache on successful fetch', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      providers: {
        gemini: {
          models: { 'gemini-3.0-pro': { id: 'gemini-3.0-pro', name: 'Gemini 3 Pro' } }
        }
      }
    })
  }));

  const { refreshCatalog } = await import('../src/catalog.js?t=' + Date.now());
  const ok = await refreshCatalog();
  assert.equal(ok, true);

  const cachedRaw = JSON.parse(
    require('node:fs').readFileSync(join(tmpDir, 'catalog.json'), 'utf-8')
  );
  assert.ok(cachedRaw.providers.gemini.models.find(m => m.id === 'gemini-3.0-pro'));

  mock.restoreAll();
});

test('refreshCatalog leaves cache untouched on bad-JSON response', async () => {
  // Pre-populate a valid cache
  const good = {
    version: 1, lastRefresh: 1000,
    providers: { gemini: { id: 'gemini', name: 'Gemini', type: 'gemini', models: [{ id: 'pre-existing', name: 'X' }] } }
  };
  writeFileSync(join(tmpDir, 'catalog.json'), JSON.stringify(good));

  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => { throw new Error('bad json'); }
  }));

  const { refreshCatalog } = await import('../src/catalog.js?t=' + Date.now());
  const ok = await refreshCatalog();
  assert.equal(ok, false);

  const cachedRaw = JSON.parse(
    require('node:fs').readFileSync(join(tmpDir, 'catalog.json'), 'utf-8')
  );
  assert.equal(cachedRaw.providers.gemini.models[0].id, 'pre-existing');

  mock.restoreAll();
});

test('refreshCatalog returns false on non-200', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500 }));
  const { refreshCatalog } = await import('../src/catalog.js?t=' + Date.now());
  const ok = await refreshCatalog();
  assert.equal(ok, false);
  mock.restoreAll();
});

test('refreshCatalog filters out unknown providers from response', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      providers: {
        anthropic: { models: { 'claude-99': { id: 'claude-99', name: 'Claude' } } },
        gemini: { models: { 'gemini-2.0-flash': { id: 'gemini-2.0-flash', name: 'Gemini' } } }
      }
    })
  }));

  const { refreshCatalog, loadCatalog } = await import('../src/catalog.js?t=' + Date.now());
  await refreshCatalog();

  const cat = loadCatalog();
  assert.ok(!cat.providers.anthropic, 'unknown provider excluded');
  assert.ok(cat.providers.gemini, 'known provider preserved');

  mock.restoreAll();
});
```

Replace the `import` lines at the top to use ESM-style for `fs`:

```js
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
```

And replace the two `require('node:fs').readFileSync(...)` calls in the new tests with `readFileSync(...)`.

- [ ] **Step 2: Run tests — refresh tests should fail**

Run: `npm test`
Expected: 4 new failures — `refreshCatalog is not a function`.

- [ ] **Step 3: Implement `refreshCatalog`**

Add to `src/catalog.js` (also add `writeFileSync`, `mkdirSync` to the imports):

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
```

Append:

```js
const MODELS_DEV_URL = 'https://models.dev/api.json';
const FETCH_TIMEOUT_MS = 5000;
const KNOWN_PROVIDER_IDS = ['gemini', 'groq', 'openrouter', 'ollama'];

// Map models.dev provider IDs → our IDs (models.dev calls Google's "google", we call it "gemini")
const REMOTE_TO_LOCAL = {
  google: 'gemini',
  gemini: 'gemini',
  groq: 'groq',
  openrouter: 'openrouter',
  ollama: 'ollama'
};

function adapt(remote) {
  const out = { providers: {} };
  for (const [remoteId, prov] of Object.entries(remote.providers || {})) {
    const localId = REMOTE_TO_LOCAL[remoteId];
    if (!localId || !KNOWN_PROVIDER_IDS.includes(localId)) continue;

    const models = [];
    const remoteModels = prov.models || {};
    const list = Array.isArray(remoteModels) ? remoteModels : Object.values(remoteModels);
    for (const m of list) {
      if (!m || !m.id) continue;
      models.push({
        id: m.id,
        name: m.name || m.id,
        tools: !!(m.tool_call ?? m.tools),
        free: m.free ?? m.cost === 0,
        context: m.context_window ?? m.context
      });
    }
    out.providers[localId] = { models };
  }
  return out;
}

export async function refreshCatalog() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let body;
  try {
    const res = await fetch(MODELS_DEV_URL, { signal: ctrl.signal });
    if (!res.ok) return false;
    body = await res.json();
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }

  const adapted = adapt(body);
  if (!adapted || !adapted.providers || Object.keys(adapted.providers).length === 0) {
    return false;
  }

  // Merge with bundled to get full provider records (type, baseUrl, etc.)
  const merged = { version: 1, lastRefresh: Date.now(), providers: {} };
  for (const [id, prov] of Object.entries(adapted.providers)) {
    const base = bundled().providers[id];
    if (!base) continue;
    merged.providers[id] = mergeProvider(base, prov);
  }

  try {
    const dir = configDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(merged, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function isCacheStale(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const cache = readJson(cachePath());
  if (!cache || !cache.lastRefresh) return true;
  return Date.now() - cache.lastRefresh > maxAgeMs;
}
```

- [ ] **Step 4: Run tests — all should pass**

Run: `npm test`
Expected: all catalog tests pass (10 total).

- [ ] **Step 5: Commit**

```bash
git add src/catalog.js tests/catalog.test.js
git commit -m "feat: catalog refresh from models.dev with cache merge"
```

---

## Task 4: Detect module

**Files:**
- Create: `src/detect.js`
- Create: `tests/detect.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/detect.test.js`:

```js
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const ENV_KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'];
const saved = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  mock.restoreAll();
});

test('detects gemini when GEMINI_API_KEY is set', async () => {
  process.env.GEMINI_API_KEY = 'k';
  mock.method(globalThis, 'fetch', async () => { throw new Error('no ollama'); });

  const { detectProviders } = await import('../src/detect.js?t=' + Date.now());
  const result = await detectProviders();
  const gem = result.find(r => r.providerId === 'gemini');
  assert.equal(gem.ready, true);
  assert.equal(gem.source, 'env:GEMINI_API_KEY');
});

test('does not mark gemini ready when env var is empty string', async () => {
  process.env.GEMINI_API_KEY = '';
  mock.method(globalThis, 'fetch', async () => { throw new Error('no ollama'); });

  const { detectProviders } = await import('../src/detect.js?t=' + Date.now());
  const result = await detectProviders();
  const gem = result.find(r => r.providerId === 'gemini');
  assert.equal(gem.ready, false);
});

test('detects ollama when ping succeeds', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true }));

  const { detectProviders } = await import('../src/detect.js?t=' + Date.now());
  const result = await detectProviders();
  const ol = result.find(r => r.providerId === 'ollama');
  assert.equal(ol.ready, true);
  assert.equal(ol.source, 'localhost:11434');
});

test('does not mark ollama ready when ping fails', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new Error('ECONNREFUSED'); });

  const { detectProviders } = await import('../src/detect.js?t=' + Date.now());
  const result = await detectProviders();
  const ol = result.find(r => r.providerId === 'ollama');
  assert.equal(ol.ready, false);
});

test('returns all four known providers, ready or not', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new Error('no'); });

  const { detectProviders } = await import('../src/detect.js?t=' + Date.now());
  const result = await detectProviders();
  const ids = result.map(r => r.providerId).sort();
  assert.deepEqual(ids, ['gemini', 'groq', 'ollama', 'openrouter']);
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npm test`
Expected: failures — `Cannot find module '../src/detect.js'`.

- [ ] **Step 3: Implement `src/detect.js`**

Create `src/detect.js`:

```js
const PING_TIMEOUT_MS = 1000;
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

const ENV_PROVIDERS = [
  { providerId: 'gemini',     envVar: 'GEMINI_API_KEY' },
  { providerId: 'groq',       envVar: 'GROQ_API_KEY' },
  { providerId: 'openrouter', envVar: 'OPENROUTER_API_KEY' }
];

async function pingOllama(baseUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
    return !!res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function detectProviders(ollamaUrl = DEFAULT_OLLAMA_URL) {
  const result = [];

  for (const { providerId, envVar } of ENV_PROVIDERS) {
    const v = process.env[envVar];
    const ready = !!(v && v.trim());
    result.push({
      providerId,
      ready,
      source: ready ? `env:${envVar}` : null
    });
  }

  const ollamaReady = await pingOllama(ollamaUrl);
  result.push({
    providerId: 'ollama',
    ready: ollamaReady,
    source: ollamaReady ? 'localhost:11434' : null
  });

  return result;
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test`
Expected: all 5 detect tests pass (15 tests total now).

- [ ] **Step 5: Commit**

```bash
git add src/detect.js tests/detect.test.js
git commit -m "feat: add provider auto-detection (env vars + Ollama probe)"
```

---

## Task 5: Config schema V2 + migration

**Files:**
- Modify: `src/config.js`
- Create: `tests/config-migration.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/config-migration.test.js`:

```js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

test('migrateV1ToV2 maps apiKey/groqApiKey/openrouterApiKey into apiKeys map', async () => {
  const { migrateV1ToV2 } = await import('../src/config.js?t=' + Date.now());
  const v1 = {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKey: 'gem-key',
    groqApiKey: 'groq-key',
    openrouterApiKey: 'or-key',
    ollamaUrl: 'http://localhost:11434',
    maxTokens: 8192,
    temperature: 0.7,
    systemPrompt: 'custom prompt'
  };
  const v2 = migrateV1ToV2(v1);
  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.provider, 'groq');
  assert.equal(v2.apiKeys.gemini, 'gem-key');
  assert.equal(v2.apiKeys.groq, 'groq-key');
  assert.equal(v2.apiKeys.openrouter, 'or-key');
  assert.equal(v2.systemPrompt, 'custom prompt');
});

test('migrateV1ToV2 preserves unknown V1 fields under _legacy', async () => {
  const { migrateV1ToV2 } = await import('../src/config.js?t=' + Date.now());
  const v1 = { provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'k', someExperiment: 'foo', anotherFlag: true };
  const v2 = migrateV1ToV2(v1);
  assert.equal(v2._legacy.someExperiment, 'foo');
  assert.equal(v2._legacy.anotherFlag, true);
});

test('loadConfig migrates an existing V1 file in place', async () => {
  const v1 = { provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'k' };
  writeFileSync(join(tmpDir, 'config.json'), JSON.stringify(v1));

  const { loadConfig } = await import('../src/config.js?t=' + Date.now());
  const cfg = loadConfig();
  assert.equal(cfg.schemaVersion, 2);
  assert.equal(cfg.apiKeys.gemini, 'k');

  const onDisk = JSON.parse(readFileSync(join(tmpDir, 'config.json'), 'utf-8'));
  assert.equal(onDisk.schemaVersion, 2);
});

test('loadConfig does NOT overwrite a user-edited systemPrompt', async () => {
  const v2 = {
    schemaVersion: 2,
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    apiKeys: { gemini: 'k' },
    systemPrompt: 'MY CUSTOM PROMPT'
  };
  writeFileSync(join(tmpDir, 'config.json'), JSON.stringify(v2));

  const { loadConfig } = await import('../src/config.js?t=' + Date.now());
  const cfg = loadConfig();
  assert.equal(cfg.systemPrompt, 'MY CUSTOM PROMPT');
});

test('loadConfig writes a default V2 config when none exists', async () => {
  const { loadConfig } = await import('../src/config.js?t=' + Date.now());
  const cfg = loadConfig();
  assert.equal(cfg.schemaVersion, 2);
  assert.ok(existsSync(join(tmpDir, 'config.json')));
});

test('broken config file does not crash; gets backed up', async () => {
  writeFileSync(join(tmpDir, 'config.json'), '{not json');
  const { loadConfig } = await import('../src/config.js?t=' + Date.now());
  const cfg = loadConfig();
  assert.equal(cfg.schemaVersion, 2);
  // The corrupt file should have been backed up (not deleted)
  // Look for any .bak file
  const fs = await import('node:fs');
  const files = fs.readdirSync(tmpDir);
  assert.ok(files.some(f => f.startsWith('config.json.bak')), 'backup written');
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npm test`
Expected: 6 failures from config-migration tests.

- [ ] **Step 3: Rewrite `src/config.js`**

Replace `src/config.js` entirely:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KNOWN_V1_FIELDS = new Set([
  'provider', 'model', 'apiKey', 'ollamaUrl',
  'groqApiKey', 'openrouterApiKey',
  'maxTokens', 'temperature', 'systemPrompt'
]);

const DEFAULT_SYSTEM_PROMPT = `You are YUVA Code, an AI coding assistant. You write code to files directly. You DO NOT explain code in chat.

You have 4 tools. Respond with ONE JSON tool call per response. No markdown, no code blocks, no explanation — just the JSON.

TOOLS:
{"tool": "shell", "command": "COMMAND"}
{"tool": "write_file", "path": "FILE_PATH", "content": "FILE_CONTENT"}
{"tool": "read_file", "path": "FILE_PATH"}
{"tool": "list_files", "path": "."}

EXAMPLES:

User: create a hello world in python
You respond ONLY: {"tool": "write_file", "path": "hello.py", "content": "print('Hello, World!')"}

User: create a react component
You respond ONLY: {"tool": "write_file", "path": "Button.jsx", "content": "import React from 'react';\\n\\nexport default function Button({ label }) {\\n  return <button className=\\"btn\\">{label}</button>;\\n}"}

User: run npm install
You respond ONLY: {"tool": "shell", "command": "npm install"}

User: understand this codebase
You respond ONLY: {"tool": "list_files", "path": "."}

User: what's in package.json
You respond ONLY: {"tool": "read_file", "path": "package.json"}

User: create an e-commerce site with react
You respond ONLY: {"tool": "shell", "command": "npm create vite@latest . -- --template react"}

RULES:
- ONE tool call per response. After the tool runs, you'll get the result and can do the next step.
- For write_file, use \\n for newlines in content.
- NEVER write code in chat. ALWAYS use write_file.
- NEVER explain what you'll do. Just do it.
- When you're done with all steps, say "Done!" with a brief summary.
- For multi-file projects, create one file at a time.`;

const DEFAULT_CONFIG = {
  schemaVersion: 2,
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  apiKeys: {
    gemini: '',
    groq: '',
    openrouter: '',
    custom: ''
  },
  customEndpoint: { baseUrl: '', headers: {} },
  ollamaUrl: 'http://localhost:11434',
  maxTokens: 8192,
  temperature: 0.7,
  systemPrompt: DEFAULT_SYSTEM_PROMPT
};

function configDir() {
  return process.env.YUVA_CONFIG_DIR || join(homedir(), '.yuva-ai');
}

function configPath() {
  return join(configDir(), 'config.json');
}

function ensureDir() {
  const d = configDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

export function migrateV1ToV2(v1) {
  const apiKeys = {
    gemini: v1.apiKey || '',
    groq: v1.groqApiKey || '',
    openrouter: v1.openrouterApiKey || '',
    custom: ''
  };

  const _legacy = {};
  for (const [k, v] of Object.entries(v1)) {
    if (!KNOWN_V1_FIELDS.has(k) && k !== 'schemaVersion') {
      _legacy[k] = v;
    }
  }

  const out = {
    schemaVersion: 2,
    provider: v1.provider || DEFAULT_CONFIG.provider,
    model: v1.model || DEFAULT_CONFIG.model,
    apiKeys,
    customEndpoint: { baseUrl: '', headers: {} },
    ollamaUrl: v1.ollamaUrl || DEFAULT_CONFIG.ollamaUrl,
    maxTokens: v1.maxTokens || DEFAULT_CONFIG.maxTokens,
    temperature: v1.temperature ?? DEFAULT_CONFIG.temperature,
    systemPrompt: v1.systemPrompt || DEFAULT_CONFIG.systemPrompt
  };

  if (Object.keys(_legacy).length > 0) out._legacy = _legacy;
  return out;
}

function backupCorrupt(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    renameSync(path, `${path}.bak-${stamp}`);
  } catch { /* ignore */ }
}

export function loadConfig() {
  ensureDir();
  const path = configPath();

  if (!existsSync(path)) {
    const cfg = { ...DEFAULT_CONFIG };
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    backupCorrupt(path);
    const cfg = { ...DEFAULT_CONFIG };
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  // Migrate if needed
  if (!raw.schemaVersion || raw.schemaVersion < 2) {
    try {
      const migrated = migrateV1ToV2(raw);
      writeFileSync(path, JSON.stringify(migrated, null, 2));
      return mergeWithDefaults(migrated);
    } catch (err) {
      try {
        writeFileSync(join(configDir(), 'config.v2-migration-error.log'),
          `${new Date().toISOString()}: ${err.stack || err.message}\n`);
      } catch { /* ignore */ }
      const cfg = { ...DEFAULT_CONFIG };
      return cfg;
    }
  }

  return mergeWithDefaults(raw);
}

function mergeWithDefaults(cfg) {
  // Deep-merge for apiKeys and customEndpoint; shallow for the rest.
  // CRUCIAL: do NOT overwrite user's systemPrompt.
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    apiKeys: { ...DEFAULT_CONFIG.apiKeys, ...(cfg.apiKeys || {}) },
    customEndpoint: { ...DEFAULT_CONFIG.customEndpoint, ...(cfg.customEndpoint || {}) }
  };
}

export function saveConfig(cfg) {
  ensureDir();
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

export function getConfigPath() {
  return configPath();
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test`
Expected: all 6 config-migration tests pass (21 total).

- [ ] **Step 5: Commit**

```bash
git add src/config.js tests/config-migration.test.js
git commit -m "feat: config schema V2 with V1 migration; fix systemPrompt overwrite bug"
```

---

## Task 6: OpenAICompatibleProvider

**Files:**
- Create: `src/providers/openai-compatible.js`
- Create: `tests/openai-compatible.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/openai-compatible.test.js`:

```js
import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

afterEach(() => mock.restoreAll());

test('chat sends correct request shape', async () => {
  let captured;
  mock.method(globalThis, 'fetch', async (url, opts) => {
    captured = { url, opts };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] })
    };
  });

  const { OpenAICompatibleProvider } = await import('../src/providers/openai-compatible.js?t=' + Date.now());
  const p = new OpenAICompatibleProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    model: 'm-1',
    headers: { 'X-Title': 'test' }
  });

  const out = await p.chat([{ role: 'user', content: 'hello' }], 'sys');
  assert.equal(out, 'hi');
  assert.equal(captured.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(captured.opts.headers['Authorization'], 'Bearer sk-test');
  assert.equal(captured.opts.headers['X-Title'], 'test');
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.model, 'm-1');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, 'sys');
  assert.equal(body.messages[1].content, 'hello');
});

test('chat omits Authorization header when no apiKey', async () => {
  let captured;
  mock.method(globalThis, 'fetch', async (url, opts) => {
    captured = { url, opts };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] })
    };
  });

  const { OpenAICompatibleProvider } = await import('../src/providers/openai-compatible.js?t=' + Date.now());
  const p = new OpenAICompatibleProvider({ baseUrl: 'https://x/v1', model: 'm', apiKey: '' });
  await p.chat([{ role: 'user', content: 'hi' }], 'sys');
  assert.equal(captured.opts.headers['Authorization'], undefined);
});

test('chat throws on non-200', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: false, status: 401, text: async () => 'unauthorized'
  }));

  const { OpenAICompatibleProvider } = await import('../src/providers/openai-compatible.js?t=' + Date.now());
  const p = new OpenAICompatibleProvider({ baseUrl: 'x', apiKey: 'k', model: 'm' });
  await assert.rejects(
    () => p.chat([{ role: 'user', content: 'hi' }], 's'),
    /401/
  );
});

test('chat throws when response shape is not OpenAI-compatible', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true, json: async () => ({ unexpected: 'shape' })
  }));

  const { OpenAICompatibleProvider } = await import('../src/providers/openai-compatible.js?t=' + Date.now());
  const p = new OpenAICompatibleProvider({ baseUrl: 'x', apiKey: 'k', model: 'm' });
  await assert.rejects(
    () => p.chat([{ role: 'user', content: 'hi' }], 's'),
    /OpenAI-compatible/
  );
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npm test`
Expected: 4 failures — module missing.

- [ ] **Step 3: Implement `src/providers/openai-compatible.js`**

Create `src/providers/openai-compatible.js`:

```js
export class OpenAICompatibleProvider {
  constructor({ baseUrl, apiKey, model, headers, maxTokens, temperature }) {
    if (!baseUrl) throw new Error('OpenAICompatibleProvider requires baseUrl');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey || '';
    this.model = model;
    this.extraHeaders = headers || {};
    this.maxTokens = maxTokens || 4096;
    this.temperature = temperature ?? 0.7;
  }

  async chat(messages, systemPrompt) {
    const headers = { 'Content-Type': 'application/json', ...this.extraHeaders };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: false
      })
    });

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      throw new Error(`API error (${res.status}): ${body}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Custom endpoint did not return an OpenAI-compatible response');
    }
    return content;
  }
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test`
Expected: all 4 openai-compatible tests pass (25 total).

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai-compatible.js tests/openai-compatible.test.js
git commit -m "feat: add OpenAICompatibleProvider (replaces Groq + OpenRouter classes)"
```

---

## Task 7: Refactor provider factory + delete old providers

**Files:**
- Modify: `src/providers/index.js`
- Delete: `src/providers/groq.js`
- Delete: `src/providers/openrouter.js`

- [ ] **Step 1: Rewrite `src/providers/index.js`**

Replace `src/providers/index.js`:

```js
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { getProvider } from '../catalog.js';

export function createProvider(config) {
  const providerId = config.provider;

  if (providerId === 'custom') {
    const ce = config.customEndpoint || {};
    if (!ce.baseUrl) {
      throw new Error('Custom provider selected but no customEndpoint.baseUrl set. Run: /add-endpoint');
    }
    return new OpenAICompatibleProvider({
      baseUrl: ce.baseUrl,
      apiKey: config.apiKeys?.custom || '',
      headers: ce.headers || {},
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    });
  }

  const meta = getProvider(providerId);
  if (!meta) throw new Error(`Unknown provider: ${providerId}`);

  switch (meta.type) {
    case 'gemini':
      return new GeminiProvider({
        apiKey: config.apiKeys?.gemini || '',
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      });
    case 'ollama':
      return new OllamaProvider({
        ollamaUrl: config.ollamaUrl,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      });
    case 'openai-compatible':
      return new OpenAICompatibleProvider({
        baseUrl: meta.baseUrl,
        apiKey: config.apiKeys?.[providerId] || '',
        headers: meta.headers || {},
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      });
    default:
      throw new Error(`Unsupported provider type: ${meta.type}`);
  }
}
```

(Note: `PROVIDER_MODELS` export is gone. All callers must read from `catalog.js` instead. Tasks 8-10 will fix the callers.)

- [ ] **Step 2: Update `GeminiProvider` constructor to take a flat config**

Modify `src/providers/gemini.js` constructor (and only the constructor) so it doesn't depend on the old config shape's `apiKey` field directly:

The existing code is already compatible — it reads `config.apiKey` and `config.model`. We're now passing `{apiKey, model, maxTokens, temperature}` from the factory, which matches. **No change needed.** Verify by reading the file.

- [ ] **Step 3: Update `OllamaProvider` constructor**

Modify `src/providers/ollama.js`:

The existing constructor reads `config.ollamaUrl`. We're now passing `{ollamaUrl, model, maxTokens, temperature}` — matches. **No change needed.**

- [ ] **Step 4: Delete `src/providers/groq.js` and `src/providers/openrouter.js`**

```bash
rm src/providers/groq.js src/providers/openrouter.js
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all 25 tests still pass (no test imports Groq/OpenRouter directly).

- [ ] **Step 6: Verify the app still launches (sanity check)**

Run: `node -e "import('./src/providers/index.js').then(m => console.log(typeof m.createProvider))"`
Expected: prints `function`.

- [ ] **Step 7: Commit**

```bash
git add src/providers/
git commit -m "refactor: collapse Groq + OpenRouter into OpenAICompatibleProvider; factory uses catalog"
```

---

## Task 8: Picker module

**Files:**
- Create: `src/picker.js`

(No automated tests — picker is interactive. Manual smoke test in Task 11.)

- [ ] **Step 1: Implement `src/picker.js`**

Create `src/picker.js`:

```js
import { select, input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import { getAllProviders, getModels } from './catalog.js';

const dim = chalk.hex('#6A737D');
const green = chalk.hex('#85E89D');

const CUSTOM_MODEL_VALUE = '__custom__';

function providerLabel(prov, detected) {
  const det = detected?.find(d => d.providerId === prov.id);
  const tag = det?.ready ? green(' ✓ detected') : '';
  return `${prov.name}${tag}`;
}

function modelLabel(m) {
  const tags = [];
  if (m.free) tags.push('free');
  if (m.tools) tags.push('tools');
  if (m.context) tags.push(`${Math.round(m.context / 1000)}k ctx`);
  const meta = tags.length ? dim(` (${tags.join(', ')})`) : '';
  return `${m.name || m.id}${meta}`;
}

export async function pickProvider({ detected = [], includeCustom = true } = {}) {
  const providers = getAllProviders();
  const choices = providers.map(p => ({
    name: providerLabel(p, detected),
    value: p.id
  }));
  if (includeCustom) {
    choices.push({ name: 'Custom (OpenAI-compatible endpoint)', value: 'custom' });
  }

  return await select({
    message: 'Choose provider:',
    choices,
    loop: false
  });
}

export async function pickModel(providerId, { allowCustom = true } = {}) {
  if (providerId === 'custom') {
    return await input({
      message: 'Model ID for custom endpoint:',
      validate: v => v.trim().length > 0 || 'Model ID required'
    });
  }

  const models = getModels(providerId);
  const choices = models.map(m => ({ name: modelLabel(m), value: m.id }));
  if (allowCustom) {
    choices.push({ name: dim('Enter a custom model ID…'), value: CUSTOM_MODEL_VALUE });
  }

  const picked = await select({
    message: `Choose model for ${providerId}:`,
    choices,
    loop: false,
    pageSize: 10
  });

  if (picked === CUSTOM_MODEL_VALUE) {
    return await input({
      message: 'Model ID:',
      validate: v => v.trim().length > 0 || 'Model ID required'
    });
  }
  return picked;
}

export async function promptApiKey(providerName, helpUrl) {
  if (helpUrl) console.log(dim(`  Get an API key at: ${helpUrl}`));
  return await password({
    message: `${providerName} API key:`,
    mask: '*'
  });
}

export async function promptCustomEndpoint() {
  const baseUrl = await input({
    message: 'Endpoint base URL (e.g. http://localhost:1234/v1):',
    validate: v => {
      try { new URL(v); return true; }
      catch { return 'Must be a valid URL with protocol'; }
    }
  });
  const apiKey = await password({
    message: 'API key (leave blank if not required):',
    mask: '*'
  });
  const model = await input({
    message: 'Model ID:',
    validate: v => v.trim().length > 0 || 'Model ID required'
  });
  return { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() };
}
```

- [ ] **Step 2: Verify imports load**

Run: `node -e "import('./src/picker.js').then(m => console.log(Object.keys(m)))"`
Expected: prints `[ 'pickProvider', 'pickModel', 'promptApiKey', 'promptCustomEndpoint' ]`.

- [ ] **Step 3: Commit**

```bash
git add src/picker.js
git commit -m "feat: add inquirer-based picker module"
```

---

## Task 9: Rewrite setup wizard

**Files:**
- Modify: `src/setup.js`

- [ ] **Step 1: Rewrite `src/setup.js`**

Replace the entire file:

```js
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { detectProviders } from './detect.js';
import { getProvider } from './catalog.js';
import { pickProvider, pickModel, promptApiKey, promptCustomEndpoint } from './picker.js';

const purple = chalk.hex('#7C3AED').bold;
const gray = chalk.gray;
const green = chalk.green;

export async function runSetup() {
  console.log();
  console.log(purple('  YUVA AI - Setup Wizard'));
  console.log(gray('  ─────────────────────────────────'));
  console.log();

  const config = loadConfig();

  console.log(gray('  Detecting available providers...'));
  const detected = await detectProviders(config.ollamaUrl);
  const readyList = detected.filter(d => d.ready);
  if (readyList.length) {
    console.log(green(`  Detected: ${readyList.map(d => d.providerId).join(', ')}`));
  } else {
    console.log(gray('  Nothing detected — you can still pick a provider and add a key.'));
  }
  console.log();

  let providerId;
  try {
    providerId = await pickProvider({ detected, includeCustom: true });
  } catch {
    console.log(gray('\n  Setup cancelled. Run yuva --setup to retry.\n'));
    return;
  }

  config.provider = providerId;

  if (providerId === 'custom') {
    const { baseUrl, apiKey, model } = await promptCustomEndpoint();
    config.customEndpoint = { baseUrl, headers: {} };
    config.apiKeys.custom = apiKey;
    config.model = model;
  } else {
    const meta = getProvider(providerId);

    // Reuse env var if available, else prompt
    const envKey = {
      gemini: process.env.GEMINI_API_KEY,
      groq: process.env.GROQ_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY
    }[providerId];

    if (providerId !== 'ollama') {
      if (envKey && envKey.trim()) {
        config.apiKeys[providerId] = envKey.trim();
        console.log(green(`  Using ${providerId.toUpperCase()}_API_KEY from environment.`));
      } else if (!config.apiKeys[providerId]) {
        const key = await promptApiKey(meta.name, meta.apiKeyUrl);
        config.apiKeys[providerId] = key.trim();
      }
    } else {
      console.log(gray('  Make sure Ollama is running: ollama serve'));
    }

    try {
      config.model = await pickModel(providerId, { allowCustom: true });
    } catch {
      console.log(gray('\n  Setup cancelled. Run yuva --setup to retry.\n'));
      return;
    }
  }

  saveConfig(config);
  console.log();
  console.log(green('  Setup complete!'));
  console.log(gray(`  Config saved to: ${getConfigPath()}`));
  console.log(gray(`  Provider: ${config.provider}    Model: ${config.model}`));
  console.log(gray('  Run ') + chalk.white('yuva') + gray(' to start chatting!'));
  console.log();
}
```

- [ ] **Step 2: Sanity-check imports**

Run: `node -e "import('./src/setup.js').then(m => console.log(typeof m.runSetup))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add src/setup.js
git commit -m "feat: rewrite setup wizard with detection + picker"
```

---

## Task 10: Update slash commands in app.js

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Update imports at the top of `src/app.js`**

Find the existing imports block (lines 1-7) and replace with:

```js
import readline from 'readline';
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { createProvider } from './providers/index.js';
import { loadCatalog, refreshCatalog, isCacheStale, getAllProviders, getModels } from './catalog.js';
import { pickProvider, pickModel, promptApiKey, promptCustomEndpoint } from './picker.js';
import { executeCommand } from './tools/shell.js';
import { readFile, writeFile, listFiles } from './tools/files.js';
import { resolve } from 'path';
```

- [ ] **Step 2: Add background catalog refresh after the welcome banner**

Find the lines that print the welcome banner (around `console.log(dim('  /help for commands ...'))`). Immediately after them, add:

```js
// Fire-and-forget catalog refresh; never blocks
if (isCacheStale()) {
  refreshCatalog().catch(() => { /* silent */ });
}
```

- [ ] **Step 3: Replace the `/model` case in the `doSlash` switch**

Find `case '/model':` and replace the entire case block (through the next `break;`) with:

```js
    case '/model': {
      try {
        const newModel = await pickModel(config.provider, { allowCustom: true });
        config.model = newModel;
        saveConfig(config);
        provider = createProvider(config);
        console.log(); console.log(greenB(' ● ') + white(`Model: ${config.model}`));
      } catch {
        console.log(dim('  cancelled'));
      }
      break;
    }
```

- [ ] **Step 4: Replace the `/provider` case**

Find `case '/provider':` and replace the entire case block with:

```js
    case '/provider': {
      try {
        const newProv = await pickProvider({ includeCustom: true });
        if (newProv === 'custom') {
          const { baseUrl, apiKey, model } = await promptCustomEndpoint();
          config.provider = 'custom';
          config.customEndpoint = { baseUrl, headers: {} };
          config.apiKeys.custom = apiKey;
          config.model = model;
        } else {
          if (newProv !== 'ollama' && !config.apiKeys[newProv]) {
            const meta = getAllProviders().find(p => p.id === newProv);
            const key = await promptApiKey(meta.name, meta.apiKeyUrl);
            config.apiKeys[newProv] = key.trim();
          }
          config.provider = newProv;
          config.model = await pickModel(newProv, { allowCustom: true });
        }
        saveConfig(config);
        provider = createProvider(config);
        console.log(); console.log(greenB(' ● ') + white(`${config.provider} / ${config.model}`));
      } catch {
        console.log(dim('  cancelled'));
      }
      break;
    }
```

- [ ] **Step 5: Add `/models` and `/add-endpoint` cases**

Add these two cases inside the switch, right before `case '/exit':`:

```js
    case '/models': {
      console.log();
      const cat = loadCatalog();
      for (const prov of Object.values(cat.providers)) {
        console.log(whiteB(`  ${prov.name}`) + dim(` (${prov.models.length} models)`));
        for (const m of prov.models) {
          const tags = [];
          if (m.free) tags.push('free');
          if (m.tools) tags.push('tools');
          const meta = tags.length ? dim(` [${tags.join(', ')}]`) : '';
          console.log(dim('    ') + white(m.id) + meta);
        }
      }
      break;
    }
    case '/add-endpoint': {
      try {
        const { baseUrl, apiKey, model } = await promptCustomEndpoint();
        config.provider = 'custom';
        config.customEndpoint = { baseUrl, headers: {} };
        config.apiKeys.custom = apiKey;
        config.model = model;
        saveConfig(config);
        provider = createProvider(config);
        console.log(); console.log(greenB(' ● ') + white(`Endpoint set: ${baseUrl}`));
      } catch {
        console.log(dim('  cancelled'));
      }
      break;
    }
```

- [ ] **Step 6: Update `/help` to list the new commands**

Find the `/help` case and replace its command-list array with:

```js
      [
        ['/help',           'Show this help'],
        ['/clear',          'Clear conversation'],
        ['/model',          'Switch model (interactive picker)'],
        ['/provider',       'Switch provider (interactive picker)'],
        ['/models',         'List all known models'],
        ['/add-endpoint',   'Configure a custom OpenAI-compatible endpoint'],
        ['/config',         'Show config path'],
        ['/cd <path>',      'Change directory'],
        ['/history',        'Show history'],
        ['/exit',           'Quit'],
        ['!<command>',      'Run shell command'],
      ].forEach(([c, d]) => console.log(blue(`    ${c.padEnd(20)}`) + dim(d)));
```

- [ ] **Step 7: Make `doSlash` async**

Find `function doSlash(input) {` and change it to `async function doSlash(input) {`.

Also update the call site in `prompt()` — find:
```js
    if (input.startsWith('/')) { doSlash(input); prompt(); return; }
```
and change to:
```js
    if (input.startsWith('/')) { await doSlash(input); prompt(); return; }
```

- [ ] **Step 8: Run tests (sanity)**

Run: `npm test`
Expected: all 25 tests still pass.

- [ ] **Step 9: Manual smoke test — first run**

```bash
rm -rf ~/.yuva-ai
GEMINI_API_KEY=test-not-real node bin/yuva.js --setup
```

Expected:
- Setup wizard prints `Detected: gemini`.
- Provider picker shows `Gemini ✓ detected` at the top.
- Picking gemini auto-uses the env key (no prompt).
- Model picker is arrow-key navigable.
- Config written to `~/.yuva-ai/config.json` with `schemaVersion: 2`.

- [ ] **Step 10: Manual smoke test — slash commands**

```bash
node bin/yuva.js
```

In the chat:
- Type `/help` — confirm new commands appear.
- Type `/models` — confirm grouped list with tags.
- Type `/model` — confirm interactive picker; select something, confirm config updates.
- Type `/provider` — confirm interactive picker; cancel with Ctrl+C and verify config is unchanged.
- Type `/add-endpoint` — provide a fake URL like `http://localhost:1234/v1`, blank key, model `whatever` — confirm saves.
- Type `/exit`.

- [ ] **Step 11: Commit**

```bash
git add src/app.js
git commit -m "feat: wire picker + catalog into /model, /provider, /models, /add-endpoint"
```

---

## Self-review (run after Task 10)

Spec coverage check — every spec section maps to a task:

| Spec section | Implemented in |
|---|---|
| Hybrid catalog (bundled + cache + refresh) | Tasks 1, 2, 3 |
| Interactive picker | Task 8, used in Tasks 9 & 10 |
| Add freeform model ID | Task 8 (`pickModel` with `allowCustom`) |
| Custom OpenAI-compatible endpoint | Tasks 6 (provider class), 8 (`promptCustomEndpoint`), 10 (`/add-endpoint`) |
| First-run auto-detection | Tasks 4 (`detect.js`), 9 (used in setup) |
| Provider class collapse (Groq + OpenRouter → OpenAI-compatible) | Tasks 6, 7 |
| Config schema V2 + migration | Task 5 |
| Fix systemPrompt overwrite bug | Task 5 |
| Drop phantom `readline` dep | Task 0 |
| Add `engines: node>=20` | Task 0 |
| `node:test` runner | Tasks 0, 2-6 |
| `_legacy` field for unknown V1 fields | Task 5 |
| Custom endpoint API key in `apiKeys.custom` | Tasks 5 (schema), 7 (factory), 9 & 10 (callers) |
| Catalog refresh fire-and-forget on launch | Task 10 step 2 |
| `/models`, `/add-endpoint` slash commands | Task 10 |

All sections covered.

---

## Rollback note

If anything goes wrong mid-execution, the safest rollback is:
1. `git checkout .` to discard uncommitted changes (only if git is initialized).
2. Restore `src/providers/groq.js` and `src/providers/openrouter.js` from git history.
3. Revert `package.json` to remove `@inquirer/prompts`.

If git isn't initialized, the deleted files are gone — back them up before Task 7 step 4 if you're not sure.
