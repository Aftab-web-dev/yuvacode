# NVIDIA-Only Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip yuva-code to a focused agentic-coding CLI for NVIDIA Build's free OpenAI-compatible API, using native tool calling and a curated 4-model list.

**Architecture:** 7 small files (~600 LOC total). One provider class (`NVIDIAClient`), one tool registry (`tools.js`) with 5 tools (`shell`, `read_file`, `write_file`, `edit_file`, `list_files`), one chat loop (`app.js`) that dispatches native `tool_calls` from the model. Permission prompts for destructive tools, session-scoped "always allow" cache.

**Tech Stack:** Node.js ≥20 (built-in `fetch`, `node:test`, `node:test` mocking), `@inquirer/prompts` for setup picker, `chalk` for color.

**Spec:** `docs/superpowers/specs/2026-04-25-nvidia-only-redesign.md`

---

## Notes for the implementer

- **Project is a git repo with a remote.** Origin: `git@github.com:Aftab-web-dev/yuvacode.git`. User's git identity: `aftab-web-dev <aftabshaikh4643@gmail.com>` (already configured locally).
- **Task 0 is destructive.** It hard-resets to a specific SHA and force-pushes. Do not skip the verification steps.
- **Test runner:** `node --test` (no path argument — Node 24 dropped the directory-positional form). Tests auto-discovered as `**/*.test.js`.
- **Path overrides for tests:** modules touching `~/.yuva-ai/` resolve at call time via `process.env.YUVA_CONFIG_DIR || join(homedir(), '.yuva-ai')`. Tests set `YUVA_CONFIG_DIR` to a tmp dir per test.
- **Untracked files survive `git reset --hard`.** The new spec at `docs/superpowers/specs/2026-04-25-nvidia-only-redesign.md` and this plan are currently untracked — they'll survive Task 0's reset and get committed in Task 1.

---

## Task 0: Hard reset to baseline and force-push

**Files:**
- None modified directly. Resets the git repo.

- [ ] **Step 1: Verify the new spec and plan are untracked**

Run: `git status --short docs/superpowers/`
Expected: shows `?? docs/superpowers/plans/2026-04-25-nvidia-only-redesign.md` and `?? docs/superpowers/specs/2026-04-25-nvidia-only-redesign.md`. Anything else (especially `M` or staged changes) means you have uncommitted work — stop and ask the controller.

- [ ] **Step 2: Confirm the target baseline commit exists**

Run: `git log --oneline 040756b -1`
Expected: prints `040756b chore: baseline before opencode-like model UX refactor`. If this fails, the SHA has been GC'd or doesn't exist — stop and report BLOCKED.

- [ ] **Step 3: Hard reset working tree to the baseline**

Run: `git reset --hard 040756b`
Expected: working tree files revert to the baseline state. Untracked files (the new spec + plan) remain on disk because `--hard` doesn't touch untracked files.

- [ ] **Step 4: Verify the new spec and plan survived the reset**

Run: `ls docs/superpowers/specs/2026-04-25-nvidia-only-redesign.md && ls docs/superpowers/plans/2026-04-25-nvidia-only-redesign.md`
Expected: both paths print without error. If either is missing, stop — they should not have been committed before the reset.

- [ ] **Step 5: Force-push to GitHub**

Run: `git push --force origin main`
Expected: `forced update` line in output. The remote `main` now matches the local `040756b`.

- [ ] **Step 6: Verify**

Run: `git log --oneline -5`
Expected: shows two commits — `040756b` and `22e117c`.

(No commit in this task — it's a destructive cleanup, not a code change.)

---

## Task 1: Bootstrap — wipe old src/bin/tests, write new package.json, commit spec + plan

**Files:**
- Delete: all `src/`, `bin/`, `tests/`, `node_modules/`, `package-lock.json`
- Modify: `package.json` (full rewrite)
- Modify: `.gitignore` (ensure `node_modules/` and `*.bak-*`)
- Add: `docs/superpowers/specs/2026-04-25-nvidia-only-redesign.md` (already exists untracked)
- Add: `docs/superpowers/plans/2026-04-25-nvidia-only-redesign.md` (already exists untracked)

- [ ] **Step 1: Wipe old source tree, lockfile, and node_modules**

Run:
```bash
rm -rf src/ bin/ tests/ node_modules/ package-lock.json
```

Verify: `ls src/ bin/ tests/ 2>&1 | head` should report no such file or directory for all three.

- [ ] **Step 2: Rewrite `package.json`**

Replace the file at `package.json` with:

```json
{
  "name": "yuva-code",
  "version": "1.0.0",
  "description": "Minimal NVIDIA-powered AI coding CLI",
  "main": "src/index.js",
  "bin": {
    "yuva": "./bin/yuva.js"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js",
    "test": "node --test"
  },
  "keywords": ["ai", "cli", "coding-assistant", "nvidia", "yuva"],
  "author": "aftab-web-dev",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.3.0"
  }
}
```

- [ ] **Step 3: Ensure `.gitignore` covers what we need**

Read `.gitignore`. If it doesn't already include `node_modules/`, `*.log`, `.env`, `*.bak-*`, write this:

```
node_modules/
*.log
.DS_Store
.env
.env.*
!.env.example
*.bak-*
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: installs `@inquirer/prompts` and `chalk` cleanly. Should be small — under 30 packages total.

- [ ] **Step 5: Verify test runner works on an empty test set**

Run: `npm test 2>&1 | head -10`
Expected: no errors and no tests run (something like `tests 0 / pass 0 / fail 0`). If any errors, investigate before continuing.

- [ ] **Step 6: Stage and commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: reset to NVIDIA-only baseline, add redesign spec + plan

Wipes the multi-provider scaffolding and starts from a minimal package.json.
Adds the NVIDIA-only spec and plan as the first commit on the new history.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push**

Run: `git push origin main`
Expected: succeeds (regular push, no force needed since the remote was just force-set in Task 0).

- [ ] **Step 8: Verify**

Run: `git log --oneline -5`
Expected: shows the new commit on top of `040756b` and `22e117c`.

Run: `git show --stat HEAD | tail -10`
Expected: shows `package.json`, `package-lock.json`, `.gitignore`, the spec and plan files, plus deletions of `src/*`, `bin/*`, etc.

---

## Task 2: `src/config.js` + tests

**Files:**
- Create: `src/config.js`
- Create: `tests/config.test.js`

**TDD: Write tests first.**

- [ ] **Step 1: Write failing tests**

Create `tests/config.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npm test`
Expected: all 5 tests fail with `Cannot find module '../src/config.js'`.

- [ ] **Step 3: Implement `src/config.js`**

Create `src/config.js`:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_SYSTEM_PROMPT = `You are YUVA Code, an agentic coding assistant.

You have 5 tools: read_file, write_file, edit_file, list_files, shell. Use them to do real work — don't paste code into chat for the user to copy.

GUIDELINES:
- Use edit_file (search/replace) for small changes — much faster than rewriting whole files.
- Use write_file only when creating new files or making sweeping changes.
- Read before you edit. If you don't know what's in a file, read it first.
- Use shell for build/test/lint/git commands.
- Keep responses concise. Tool output already shows what happened.
- When you're done, say "Done." and summarize in one sentence.

EDIT_FILE RULES:
- Provide the exact substring to replace, including enough surrounding context to uniquely identify the location.
- If your search string matches multiple times, the tool will reject it — add more context and retry.
- If your search string isn't found, the tool will tell you — re-read the file to see what's actually there.`;

const DEFAULT_CONFIG = {
  apiKey: '',
  model: 'meta/llama-3.3-70b-instruct',
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

function backupCorrupt(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try { renameSync(path, `${path}.bak-${stamp}`); } catch { /* ignore */ }
}

function withDefaults(cfg) {
  return { ...DEFAULT_CONFIG, ...cfg };
}

export function loadConfig() {
  ensureDir();
  const path = configPath();

  if (!existsSync(path)) {
    const cfg = withDefaults({});
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    backupCorrupt(path);
    const cfg = withDefaults({});
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  return withDefaults(raw);
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
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat: add config module (load/save with corrupt-file backup)"
```

---

## Task 3: `src/nvidia.js` + tests

**Files:**
- Create: `src/nvidia.js`
- Create: `tests/nvidia.test.js`

**TDD: Write tests first.**

- [ ] **Step 1: Write failing tests**

Create `tests/nvidia.test.js`:

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
      json: async () => ({ choices: [{ message: { content: 'hi', tool_calls: null }, finish_reason: 'stop' }] })
    };
  });

  const { NVIDIAClient } = await import('../src/nvidia.js?t=' + Date.now());
  const c = new NVIDIAClient({ apiKey: 'nvapi-test', model: 'meta/llama-3.3-70b-instruct' });
  const tools = [{ type: 'function', function: { name: 'read_file', description: 'r', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }];

  const out = await c.chat([{ role: 'user', content: 'hi' }], 'sys', tools);

  assert.equal(out.content, 'hi');
  assert.deepEqual(out.toolCalls, []);
  assert.equal(captured.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(captured.opts.headers['Authorization'], 'Bearer nvapi-test');
  assert.equal(captured.opts.headers['Content-Type'], 'application/json');
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.model, 'meta/llama-3.3-70b-instruct');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, 'sys');
  assert.equal(body.messages[1].content, 'hi');
  assert.deepEqual(body.tools, tools);
  assert.equal(body.tool_choice, 'auto');
  assert.equal(body.stream, false);
});

test('chat parses tool_calls from response', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: '',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: JSON.stringify({ path: 'foo.js' }) }
          }]
        },
        finish_reason: 'tool_calls'
      }]
    })
  }));

  const { NVIDIAClient } = await import('../src/nvidia.js?t=' + Date.now());
  const c = new NVIDIAClient({ apiKey: 'k', model: 'm' });
  const out = await c.chat([{ role: 'user', content: 'hi' }], 'sys', []);

  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].id, 'call_1');
  assert.equal(out.toolCalls[0].name, 'read_file');
  assert.deepEqual(out.toolCalls[0].args, { path: 'foo.js' });
  assert.equal(out.finishReason, 'tool_calls');
});

test('chat throws on 401 with body excerpt', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: false, status: 401, text: async () => 'invalid api key'
  }));

  const { NVIDIAClient } = await import('../src/nvidia.js?t=' + Date.now());
  const c = new NVIDIAClient({ apiKey: 'k', model: 'm' });
  await assert.rejects(() => c.chat([{ role: 'user', content: 'hi' }], 's', []), /401/);
});

test('chat retries once on 429 then surfaces', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => {
    calls++;
    return { ok: false, status: 429, text: async () => 'rate limit' };
  });

  const { NVIDIAClient } = await import('../src/nvidia.js?t=' + Date.now());
  const c = new NVIDIAClient({ apiKey: 'k', model: 'm', retryDelayMs: 10 });
  await assert.rejects(() => c.chat([{ role: 'user', content: 'hi' }], 's', []), /429/);
  assert.equal(calls, 2, 'retried exactly once');
});

test('chat throws when response shape is malformed', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true, json: async () => ({ unexpected: 'shape' })
  }));

  const { NVIDIAClient } = await import('../src/nvidia.js?t=' + Date.now());
  const c = new NVIDIAClient({ apiKey: 'k', model: 'm' });
  await assert.rejects(() => c.chat([{ role: 'user', content: 'hi' }], 's', []), /unexpected/i);
});

test('chat throws on empty content + empty tool_calls', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '', tool_calls: [] }, finish_reason: 'stop' }] })
  }));

  const { NVIDIAClient } = await import('../src/nvidia.js?t=' + Date.now());
  const c = new NVIDIAClient({ apiKey: 'k', model: 'm' });
  await assert.rejects(() => c.chat([{ role: 'user', content: 'hi' }], 's', []), /empty/i);
});

test('MODELS exports include the curated 4', async () => {
  const { MODELS, DEFAULT_MODEL } = await import('../src/nvidia.js?t=' + Date.now());
  const ids = MODELS.map(m => m.id);
  assert.ok(ids.includes('meta/llama-3.3-70b-instruct'));
  assert.ok(ids.includes('nvidia/llama-3.1-nemotron-70b-instruct'));
  assert.ok(ids.includes('qwen/qwen2.5-coder-32b-instruct'));
  assert.ok(ids.includes('mistralai/mistral-large-2-instruct'));
  assert.equal(DEFAULT_MODEL, 'meta/llama-3.3-70b-instruct');
});
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npm test`
Expected: all new tests fail with `Cannot find module '../src/nvidia.js'`.

- [ ] **Step 3: Implement `src/nvidia.js`**

Create `src/nvidia.js`:

```js
const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_RETRY_DELAY_MS = 5000;

export const MODELS = [
  { id: 'meta/llama-3.3-70b-instruct',            name: 'Llama 3.3 70B (recommended)' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B' },
  { id: 'qwen/qwen2.5-coder-32b-instruct',        name: 'Qwen 2.5 Coder 32B' },
  { id: 'mistralai/mistral-large-2-instruct',     name: 'Mistral Large 2' }
];

export const DEFAULT_MODEL = MODELS[0].id;

export class NVIDIAClient {
  constructor({ apiKey, model, maxTokens, temperature, retryDelayMs }) {
    this.apiKey = apiKey || '';
    this.model = model || DEFAULT_MODEL;
    this.maxTokens = maxTokens || 4096;
    this.temperature = temperature ?? 0.7;
    this.retryDelayMs = retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async chat(messages, systemPrompt, tools) {
    const body = {
      model: this.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: false
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    let res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });

    // Retry once on 429
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, this.retryDelayMs));
      res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
    }

    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch { /* ignore */ }
      const excerpt = bodyText.slice(0, 500);
      throw new Error(`NVIDIA API error (${res.status}): ${excerpt}`);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('Unexpected response from NVIDIA: not valid JSON');
    }

    const choice = data?.choices?.[0];
    if (!choice || !choice.message) {
      throw new Error('Unexpected response shape from NVIDIA: missing choices/message');
    }

    const content = choice.message.content || '';
    const rawToolCalls = choice.message.tool_calls || [];
    const toolCalls = rawToolCalls.map((tc, idx) => {
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        args = {};
      }
      return {
        id: tc.id || `tool_${idx}`,
        name: tc.function?.name,
        args
      };
    });

    if (!content && toolCalls.length === 0) {
      throw new Error('NVIDIA returned an empty response (no content, no tool calls)');
    }

    return {
      content,
      toolCalls,
      finishReason: choice.finish_reason
    };
  }
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test`
Expected: all nvidia tests pass; total test count = 12 (5 config + 7 nvidia).

- [ ] **Step 5: Commit**

```bash
git add src/nvidia.js tests/nvidia.test.js
git commit -m "feat: add NVIDIAClient with native tool calling + curated model list"
```

---

## Task 4: `src/tools.js` + tests

**Files:**
- Create: `src/tools.js`
- Create: `tests/tools.test.js`

This is the largest single file. The tool registry has 5 tools — schemas (sent to the model verbatim) plus handlers.

**TDD: Write tests first.**

- [ ] **Step 1: Write failing tests**

Create `tests/tools.test.js`:

```js
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
  // Cross-platform: use node -e
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
  // Pass deliberately bad args: read_file with missing path field
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
```

- [ ] **Step 2: Run tests — they should fail**

Run: `npm test`
Expected: all 13 new tool tests fail with `Cannot find module '../src/tools.js'`.

- [ ] **Step 3: Implement `src/tools.js`**

Create `src/tools.js`:

```js
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';

const DESTRUCTIVE = new Set(['shell', 'write_file', 'edit_file']);

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Path is relative to the current working directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path, relative to cwd' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file (creates parent dirs if needed). Overwrites existing files. For small edits, prefer edit_file.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path, relative to cwd' },
          content: { type: 'string', description: 'Full file content' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace a single occurrence of "search" with "replace" in the given file. Search must be unique in the file — include enough surrounding context to identify the location. If the search string matches zero or multiple times, the call fails and you should adjust.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path, relative to cwd' },
          search:  { type: 'string', description: 'Exact substring to find (must be unique)' },
          replace: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'search', 'replace']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List entries in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path, relative to cwd. Defaults to "."' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Run a shell command. Use for build/test/lint/git operations. Times out after 60 seconds by default.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' }
        },
        required: ['command']
      }
    }
  }
];

const handlers = {
  read_file: async ({ path }, { cwd }) => {
    if (!path) return { ok: false, error: 'path is required' };
    const fp = resolve(cwd, path);
    try {
      const content = await readFile(fp, 'utf-8');
      return { ok: true, content, path };
    } catch (err) {
      return { ok: false, error: err.code === 'ENOENT' ? `ENOENT: ${path} not found` : err.message };
    }
  },

  write_file: async ({ path, content }, { cwd }) => {
    if (!path) return { ok: false, error: 'path is required' };
    if (typeof content !== 'string') return { ok: false, error: 'content must be a string' };
    const fp = resolve(cwd, path);
    try {
      await mkdir(dirname(fp), { recursive: true });
      await writeFile(fp, content);
      return { ok: true, path, lines: content.split('\n').length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  edit_file: async ({ path, search, replace }, { cwd }) => {
    if (!path || typeof search !== 'string' || typeof replace !== 'string') {
      return { ok: false, error: 'path, search, and replace are required strings' };
    }
    const fp = resolve(cwd, path);
    let content;
    try {
      content = await readFile(fp, 'utf-8');
    } catch (err) {
      return { ok: false, error: err.code === 'ENOENT' ? `ENOENT: ${path} not found` : err.message };
    }
    const parts = content.split(search);
    const matches = parts.length - 1;
    if (matches === 0) return { ok: false, error: `search string not found in ${path}` };
    if (matches > 1) return { ok: false, error: `search string matches ${matches} times in ${path} — make it unique by including more surrounding context` };
    const updated = parts.join(replace);
    try {
      await writeFile(fp, updated);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    const linesChanged = Math.abs(updated.split('\n').length - content.split('\n').length);
    return { ok: true, path, lines_changed: linesChanged };
  },

  list_files: async ({ path = '.' }, { cwd }) => {
    const fp = resolve(cwd, path);
    try {
      const entries = await readdir(fp);
      // Annotate directories with trailing slash
      const annotated = await Promise.all(entries.map(async (name) => {
        try {
          const st = await stat(resolve(fp, name));
          return st.isDirectory() ? `${name}/` : name;
        } catch {
          return name;
        }
      }));
      return { ok: true, path, entries: annotated };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  shell: async ({ command }, { cwd, timeoutMs = 60_000 }) => {
    if (!command) return { ok: false, error: 'command is required' };
    return new Promise((resolveP) => {
      const isWin = process.platform === 'win32';
      const shell = isWin ? 'cmd.exe' : '/bin/sh';
      const args = isWin ? ['/c', command] : ['-c', command];
      const child = spawn(shell, args, { cwd });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          return resolveP({ ok: false, error: `timeout after ${timeoutMs}ms`, stdout, stderr });
        }
        const ok = code === 0;
        resolveP({ ok, stdout, stderr, exit_code: code });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolveP({ ok: false, error: err.message, stdout, stderr });
      });
    });
  }
};

export async function executeTool(name, args, ctx) {
  const handler = handlers[name];
  if (!handler) return { ok: false, error: `Unknown tool: ${name}` };

  // Permission gate for destructive tools
  if (DESTRUCTIVE.has(name) && !ctx.sessionAllow.has(name)) {
    let decision;
    try {
      decision = await ctx.askPermission(name, args);
    } catch {
      decision = 'no';
    }
    if (decision === 'no') return { ok: false, error: 'denied by user' };
    if (decision === 'always') ctx.sessionAllow.add(name);
  }

  try {
    return await handler(args, ctx);
  } catch (err) {
    return { ok: false, error: err.message || String(err), tool: name };
  }
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test`
Expected: all tool tests pass; total = 25 (5 config + 7 nvidia + 13 tools).

- [ ] **Step 5: Commit**

```bash
git add src/tools.js tests/tools.test.js
git commit -m "feat: add tool registry (read/write/edit/list_files + shell)"
```

---

## Task 5: `src/setup.js`

**Files:**
- Create: `src/setup.js`

No automated tests — interactive prompts. Verified by manual smoke test in Task 8.

- [ ] **Step 1: Implement `src/setup.js`**

Create `src/setup.js`:

```js
import chalk from 'chalk';
import { input, password, select } from '@inquirer/prompts';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { MODELS, DEFAULT_MODEL } from './nvidia.js';

const purple = chalk.hex('#7C3AED').bold;
const gray = chalk.gray;
const green = chalk.green;
const white = chalk.white;

export async function runSetup() {
  console.log();
  console.log(purple('  YUVA Code — NVIDIA Setup'));
  console.log(gray('  ─────────────────────────────'));
  console.log();
  console.log(gray('  Get a free API key at: ') + white('https://build.nvidia.com/'));
  console.log();

  const config = loadConfig();

  let apiKey;
  try {
    apiKey = await password({
      message: 'NVIDIA API key:',
      mask: '*',
      validate: v => v.trim().length > 0 || 'API key is required'
    });
  } catch {
    console.log(gray('\n  Setup cancelled.\n'));
    return;
  }
  config.apiKey = apiKey.trim();

  let model;
  try {
    model = await select({
      message: 'Choose model:',
      default: config.model || DEFAULT_MODEL,
      choices: MODELS.map(m => ({ name: m.name, value: m.id })),
      loop: false
    });
  } catch {
    console.log(gray('\n  Setup cancelled.\n'));
    return;
  }
  config.model = model;

  saveConfig(config);

  console.log();
  console.log(green('  Setup complete.'));
  console.log(gray('  Config: ') + white(getConfigPath()));
  console.log(gray('  Model:  ') + white(config.model));
  console.log(gray('  Run ') + white('yuva') + gray(' to start chatting.'));
  console.log();
}
```

- [ ] **Step 2: Sanity-check imports**

Run: `node -e "import('./src/setup.js').then(m => console.log(typeof m.runSetup))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add src/setup.js
git commit -m "feat: add setup wizard (paste key + pick model)"
```

---

## Task 6: `src/app.js` — chat loop

**Files:**
- Create: `src/app.js`

No automated tests — orchestration with stdin/stdout. Verified manually in Task 8.

- [ ] **Step 1: Implement `src/app.js`**

Create `src/app.js`:

```js
import readline from 'node:readline';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { NVIDIAClient, MODELS, DEFAULT_MODEL } from './nvidia.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { select } from '@inquirer/prompts';

// ── Colors ──
const purple = chalk.hex('#B392F0');
const purpleB = chalk.hex('#B392F0').bold;
const white = chalk.hex('#E1E4E8');
const whiteB = chalk.hex('#E1E4E8').bold;
const dim = chalk.hex('#6A737D');
const green = chalk.hex('#85E89D');
const greenB = chalk.hex('#85E89D').bold;
const orange = chalk.hex('#FFAB70');
const orangeB = chalk.hex('#FFAB70').bold;
const red = chalk.hex('#F97583');
const blue = chalk.hex('#79B8FF');

// ── State ──
let config = loadConfig();
let client = new NVIDIAClient({ apiKey: config.apiKey, model: config.model });
let messages = [];
let currentDir = process.cwd();
const sessionAllow = new Set();

const MAX_TOOL_CALLS_PER_TURN = 30;
const REPETITION_THRESHOLD = 3;

// ── UI helpers ──
function sep() { return dim('─'.repeat(process.stdout.columns || 80)); }

function showLines(lines, max = 30) {
  const show = lines.slice(0, max);
  for (let i = 0; i < show.length; i++) {
    const sym = i === show.length - 1 && lines.length <= max ? '⎿' : '│';
    console.log(dim(`   ${sym} `) + white(show[i]));
  }
  if (lines.length > max) console.log(dim(`   ⎿ … +${lines.length - max} more lines`));
}

function maskKey(k) {
  if (!k) return '(none)';
  if (k.length <= 10) return '***';
  return k.slice(0, 7) + '…' + k.slice(-4);
}

// ── Banner ──
function banner() {
  console.clear();
  console.log();
  console.log(purpleB('  ✻ YUVA Code') + dim('  v1.0.0  ') + dim('NVIDIA-powered'));
  console.log();
  console.log(dim('  model: ') + white(config.model));
  console.log(dim('  cwd:   ') + white(currentDir));
  console.log();
  console.log(dim('  /help for commands · !cmd run shell · /exit quit'));
}

// ── Permission asker ──
async function askPermission(toolName, args) {
  console.log();
  const summary = toolName === 'shell' ? `(${args.command})`
    : toolName === 'write_file' ? `(${args.path}, ${(args.content || '').split('\n').length} lines)`
    : toolName === 'edit_file' ? `(${args.path})`
    : `(${JSON.stringify(args).slice(0, 60)})`;
  console.log(orangeB(' ● ') + whiteB(toolName) + dim(' ' + summary));
  return new Promise((resolveP) => {
    rl.question(dim('   ') + orange('Allow? ') + dim('(y/n/a=always) '), (ans) => {
      const v = ans.trim().toLowerCase();
      if (v === 'a' || v === 'always') resolveP('always');
      else if (v === 'y' || v === 'yes') resolveP('yes');
      else resolveP('no');
    });
  });
}

// ── Pretty print tool result ──
function printToolResult(name, args, result) {
  const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
  const summary = name === 'shell' ? `(${args.command})`
    : name === 'list_files' ? `(${args.path || '.'})`
    : `(${args.path || ''})`;
  console.log();
  const color = result.ok ? greenB : red;
  console.log(color(' ● ') + whiteB(label) + dim(' ' + summary));
  if (!result.ok) {
    console.log(dim('   ⎿ ') + red(result.error || 'failed'));
    return;
  }
  if (name === 'read_file') {
    showLines((result.content || '').split('\n'), 20);
  } else if (name === 'list_files') {
    showLines(result.entries || [], 40);
  } else if (name === 'shell') {
    if (result.stdout) showLines(result.stdout.split('\n').filter(Boolean));
    if (result.stderr) showLines(result.stderr.split('\n').filter(Boolean).map(l => red(l)));
    console.log(dim(`   ⎿ exit ${result.exit_code}`));
  } else if (name === 'write_file') {
    console.log(dim('   ⎿ ') + green(`✓ written (${result.lines} lines)`));
  } else if (name === 'edit_file') {
    console.log(dim('   ⎿ ') + green(`✓ edited (${result.lines_changed} lines changed)`));
  }
}

// ── Tool call signature for repetition detection ──
function tcSignature(tc) {
  return `${tc.name}::${JSON.stringify(tc.args)}`;
}

// ── Chat turn ──
async function doChat(input) {
  messages.push({ role: 'user', content: input });
  const startTime = Date.now();
  let toolCallsThisTurn = 0;
  const recentSignatures = [];

  try {
    while (true) {
      process.stdout.write('\n' + greenB(' ● ') + dim('thinking...'));
      const { content, toolCalls } = await client.chat(messages, config.systemPrompt, TOOL_SCHEMAS);
      process.stdout.write('\r\x1b[2K');

      // Push assistant turn
      const assistantMsg = { role: 'assistant', content: content || null };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) }
        }));
      }
      messages.push(assistantMsg);

      // Display content
      if (content) {
        console.log(greenB(' ● ') + white(content));
      }

      // No tools = end of turn
      if (toolCalls.length === 0) break;

      // Bounds: too many tool calls
      toolCallsThisTurn += toolCalls.length;
      if (toolCallsThisTurn > MAX_TOOL_CALLS_PER_TURN) {
        console.log();
        console.log(orange('  Stopped after ' + toolCallsThisTurn + ' tool calls. Type "continue" to keep going.'));
        break;
      }

      // Bounds: repetition detection
      let repetitionBroke = false;
      for (const tc of toolCalls) {
        const sig = tcSignature(tc);
        recentSignatures.push(sig);
        if (recentSignatures.length > REPETITION_THRESHOLD) recentSignatures.shift();
        if (recentSignatures.length === REPETITION_THRESHOLD && recentSignatures.every(s => s === sig)) {
          console.log();
          console.log(orange(`  Detected loop: ${tc.name} called repeatedly with same args. Stopping.`));
          repetitionBroke = true;
          break;
        }
      }
      if (repetitionBroke) break;

      // Execute tools serially
      for (const tc of toolCalls) {
        const result = await executeTool(tc.name, tc.args, {
          cwd: currentDir,
          askPermission,
          sessionAllow
        });
        printToolResult(tc.name, tc.args, result);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }
    }

    const s = Math.floor((Date.now() - startTime) / 1000);
    if (s >= 1) {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      console.log();
      console.log(dim(`  ※ Brewed for ${m > 0 ? m + 'm ' + rem + 's' : s + 's'}`));
    }
  } catch (err) {
    process.stdout.write('\r\x1b[2K');
    console.log();
    console.log(red(' ✗ ') + white(err.message));
    // Pop the user message so retry works
    while (messages.length > 0 && messages[messages.length - 1].role !== 'user') messages.pop();
    messages.pop();
  }
}

// ── Slash commands ──
async function doSlash(input) {
  const parts = input.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      console.log();
      console.log(whiteB('  Commands'));
      console.log();
      [
        ['/help',         'Show this help'],
        ['/clear',        'Clear conversation'],
        ['/model',        'Switch model (interactive picker)'],
        ['/config',       'Show config path + masked API key'],
        ['/cd <path>',    'Change directory'],
        ['/exit',         'Quit'],
        ['!<command>',    'Run shell command (one-shot, no permission)']
      ].forEach(([c, d]) => console.log(blue(`    ${c.padEnd(18)}`) + dim(d)));
      break;

    case '/clear':
      messages = [];
      banner();
      console.log();
      console.log(greenB(' ● ') + white('Conversation cleared'));
      break;

    case '/model':
      try {
        const newModel = await select({
          message: 'Choose model:',
          default: config.model,
          choices: MODELS.map(m => ({ name: m.name, value: m.id })),
          loop: false
        });
        config.model = newModel;
        saveConfig(config);
        client = new NVIDIAClient({ apiKey: config.apiKey, model: config.model });
        console.log(); console.log(greenB(' ● ') + white(`Model: ${config.model}`));
      } catch {
        console.log(dim('  cancelled'));
      }
      break;

    case '/config':
      console.log();
      console.log(dim('  Config: ') + white(getConfigPath()));
      console.log(dim('  Model:  ') + white(config.model));
      console.log(dim('  Key:    ') + white(maskKey(config.apiKey)));
      break;

    case '/cd':
      if (parts[1]) {
        try {
          process.chdir(resolve(currentDir, parts.slice(1).join(' ')));
          currentDir = process.cwd();
          console.log(); console.log(greenB(' ● ') + white(currentDir));
        } catch {
          console.log(red(' ✗ Directory not found'));
        }
      } else {
        console.log(white(`  ${currentDir}`));
      }
      break;

    case '/exit':
    case '/quit':
      console.log(dim('\n  Goodbye!\n'));
      process.exit(0);

    default:
      console.log(red(` ✗ Unknown: ${cmd}. Type /help`));
  }
}

// ── Bash one-shot ──
async function doBash(cmd) {
  console.log();
  console.log(orangeB(' ● ') + whiteB('Bash') + dim(`(${cmd})`));
  const result = await executeTool('shell', { command: cmd }, {
    cwd: currentDir,
    askPermission: async () => 'always',  // ! prefix is explicit user opt-in
    sessionAllow: new Set(['shell'])
  });
  if (result.stdout) showLines(result.stdout.split('\n').filter(Boolean));
  if (result.stderr) showLines(result.stderr.split('\n').filter(Boolean).map(l => red(l)));
  if (typeof result.exit_code === 'number') console.log(dim(`   ⎿ exit ${result.exit_code}`));
  if (!result.ok && result.error) console.log(dim('   ⎿ ') + red(result.error));
}

// ── Readline ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  console.log();
  console.log(sep());
  rl.question(purple('❯ '), async (input) => {
    input = input.trim();
    if (!input) { prompt(); return; }
    if (input.startsWith('!')) { await doBash(input.slice(1).trim()); prompt(); return; }
    if (input.startsWith('/')) { await doSlash(input); prompt(); return; }
    await doChat(input);
    prompt();
  });
}

rl.on('close', () => { console.log(dim('\n  Goodbye!\n')); process.exit(0); });

// ── Start ──
banner();
prompt();
```

- [ ] **Step 2: Sanity-check imports**

Run: `node -e "console.log('app.js syntax OK')" && node --check src/app.js`
Expected: prints `app.js syntax OK` and the syntax check passes (no output from `node --check` on success).

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: still 25 tests pass (app.js has no automated tests).

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat: chat loop with native tool calling, permissions, and slash commands"
```

---

## Task 7: `src/index.js` and `bin/yuva.js` — entry points

**Files:**
- Create: `src/index.js`
- Create: `bin/yuva.js`

- [ ] **Step 1: Implement `src/index.js`**

Create `src/index.js`:

```js
import chalk from 'chalk';
import { loadConfig } from './config.js';

const accent = chalk.hex('#B392F0').bold;
const muted = chalk.hex('#6A737D');
const txt = chalk.hex('#E1E4E8');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log();
  console.log(accent('  ✻ YUVA Code') + muted(' — NVIDIA-powered AI Coding CLI'));
  console.log();
  console.log(txt('  Usage:'));
  console.log(muted('    yuva              ') + txt('Start interactive chat'));
  console.log(muted('    yuva --setup      ') + txt('Run setup wizard'));
  console.log(muted('    yuva --help       ') + txt('Show this help'));
  console.log(muted('    yuva --version    ') + txt('Show version'));
  console.log();
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('yuva-code v1.0.0');
  process.exit(0);
}

if (args.includes('--setup') || args.includes('-s')) {
  const { runSetup } = await import('./setup.js');
  await runSetup();
  process.exit(0);
}

// First-run check: no apiKey → run setup
const cfg = loadConfig();
if (!cfg.apiKey) {
  console.log();
  console.log(muted('  No API key configured. Running setup...'));
  const { runSetup } = await import('./setup.js');
  await runSetup();
  // Reload to verify setup actually wrote a key
  const c2 = loadConfig();
  if (!c2.apiKey) process.exit(0);  // user cancelled setup
}

// Drop into chat
await import('./app.js');
```

- [ ] **Step 2: Implement `bin/yuva.js`**

Create `bin/yuva.js`:

```js
#!/usr/bin/env node
import '../src/index.js';
```

- [ ] **Step 3: Make the bin script executable (POSIX only — no-op on Windows)**

Run:
```bash
chmod +x bin/yuva.js 2>/dev/null || true
```

(On Windows this fails silently; the npm bin shim works regardless.)

- [ ] **Step 4: Verify the entry point doesn't crash on `--help`**

Run: `node bin/yuva.js --help`
Expected: prints the usage block, exits 0.

Run: `node bin/yuva.js --version`
Expected: prints `yuva-code v1.0.0`, exits 0.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: still 25 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/index.js bin/yuva.js
git commit -m "feat: add CLI entry points (--setup/--help/--version, first-run setup)"
```

---

## Task 8: Manual smoke test + final push

**Files:**
- None modified.

- [ ] **Step 1: Run all tests one final time**

Run: `npm test`
Expected: 25/25 pass. If anything fails, fix before proceeding.

- [ ] **Step 2: Sanity-check the file count**

Run: `find src -type f -name '*.js' | sort && echo '---' && find tests -type f -name '*.js' | sort && echo '---' && find bin -type f | sort`
Expected:
```
src/app.js
src/config.js
src/index.js
src/nvidia.js
src/setup.js
src/tools.js
---
tests/config.test.js
tests/nvidia.test.js
tests/tools.test.js
---
bin/yuva.js
```

(7 source files, 3 test files, 1 bin file. No stray files from old work.)

- [ ] **Step 3: Smoke test — `--help`**

Run: `node bin/yuva.js --help`
Expected: usage block prints. Exit 0.

- [ ] **Step 4: Smoke test — `--version`**

Run: `node bin/yuva.js --version`
Expected: `yuva-code v1.0.0`. Exit 0.

- [ ] **Step 5: Push everything**

Run: `git push origin main`
Expected: succeeds. The new history is now on GitHub.

- [ ] **Step 6: Manual end-to-end checklist (controller / human, not subagent)**

These require a real NVIDIA API key. Mark each as `OK` or `FAIL` and report any FAILs back to the controller; do not attempt to fix mid-checklist.

  - **a)** `rm -rf ~/.yuva-ai && node bin/yuva.js` → setup wizard runs; paste key; pick model; lands in chat.
  - **b)** Type `read package.json` → model calls `read_file`; first 20 lines printed; model finishes with a summary.
  - **c)** Type `list files in src` → model calls `list_files` with `path: 'src'`; entries printed (e.g. `app.js`, `config.js`, …).
  - **d)** Type `add a hello function to a new file src/hello.js` → model uses `write_file`; permission prompt appears; approve with `y`; file created; verify with `cat src/hello.js`.
  - **e)** Follow up: `change "hello" to "hi" in src/hello.js` → model uses `edit_file`; permission prompt; approve; verify diff with `cat src/hello.js`.
  - **f)** Type `run npm test` → model calls `shell` with `npm test`; permission prompt; approve; output streamed; exit 0.
  - **g)** `/model` → picker shows the 4 models; switch to a different one; next request uses the new model.
  - **h)** `/clear` → conversation reset; banner reprints.
  - **i)** `!ls` → one-shot bash; output shown; no permission prompt (the `!` prefix is the explicit consent).
  - **j)** `/exit` → clean exit, exit code 0.

If any step fails, copy the exact error and surface to the controller.

(No commit needed in Task 8 unless a smoke-test fix is required.)

---

## Self-review (run after Task 7)

**Spec coverage** — every spec section maps to a task:

| Spec section | Implemented in |
|---|---|
| NVIDIA-only provider, native tool calling | Task 3 (`nvidia.js`) |
| 5 tools incl. `edit_file` (search/replace) | Task 4 (`tools.js`) |
| Default model `meta/llama-3.3-70b-instruct`, curated 4-model list | Task 3 (`MODELS` const) |
| Hard reset + force-push cleanup | Task 0 |
| Wipe old src/bin/tests, minimal package.json | Task 1 |
| Config schema (apiKey, model, systemPrompt), corrupt-file backup, preserve user systemPrompt | Task 2 (`config.js`) |
| Setup wizard (paste key + pick model) | Task 5 |
| Chat loop with native tool calling, permission prompts, session-scoped allow-list | Task 6 (`app.js`) |
| Slash commands (`/help`, `/clear`, `/model`, `/config`, `/cd`, `/exit`, `!cmd`) | Task 6 |
| 30-call ceiling + 3-in-a-row repetition detection | Task 6 |
| 60s shell timeout | Task 4 |
| `edit_file` no-match and ambiguous-match errors | Task 4 |
| Test runner: `node --test` (no path arg) | Task 1 |
| Entry points (`bin/yuva.js`, `src/index.js`) with `--setup`/`--help`/`--version` and first-run setup | Task 7 |
| Manual smoke checklist | Task 8 |

All sections covered.

**Type/name consistency check:**
- `NVIDIAClient` constructor signature `{apiKey, model, maxTokens, temperature, retryDelayMs}` — used consistently in Tasks 3, 6.
- `executeTool(name, args, ctx)` signature — `ctx = {cwd, askPermission, sessionAllow, timeoutMs?}` — used consistently in Tasks 4, 6.
- Tool result shapes — `{ok: true, ...}` or `{ok: false, error}` — consistent across all 5 handlers and chat loop.
- Config shape `{apiKey, model, systemPrompt}` — consistent across Tasks 2, 5, 6, 7.
- `MODELS`, `DEFAULT_MODEL`, `TOOL_SCHEMAS` — referenced consistently in Tasks 5, 6.

No drift detected.

---

## Rollback

If the implementation goes wrong before Task 8 ships, the safe rollback is `git reset --hard <previous-task-commit>`. Each task's final commit is the natural rollback point.

If the entire NVIDIA-only direction proves wrong after Task 8 ships, the multi-provider work is discoverable via `git reflog` for ~30 days locally (the force-pushed-away commits aren't on GitHub anymore but stay in your local git db until GC). After 30 days, only the design doc `2026-04-25-opencode-like-model-ux-design.md` and its plan remain as historical record.
