# NVIDIA-Only Redesign

**Date:** 2026-04-25
**Status:** Approved (design)
**Project:** yuva-code CLI
**Supersedes:** `2026-04-25-opencode-like-model-ux-design.md` (multi-provider OpenCode-style UX — abandoned mid-implementation)

## Goal

Strip yuva-code down to a focused, minimal CLI that does one thing well: agentic coding against NVIDIA Build's free-tier OpenAI-compatible API. Optimize for the four operations the user named — writing files, writing code, reading code, debugging code — by using native tool calling (not text-parsed JSON) and adding a surgical `edit_file` tool so the model can change a few lines without re-emitting the whole file.

## Non-goals (deferred)

- Other providers (Gemini, Groq, OpenRouter, Ollama, custom endpoints). Hard-removed.
- Streaming responses.
- Parallel tool execution (model may request multiple tool_calls; we run them serially for simpler permission UX).
- Conversation history persistence across sessions.
- Token usage / cost tracking.
- Lint, format, CI.

## Decisions locked during brainstorm

1. **Provider:** NVIDIA Build only. Endpoint `https://integrate.api.nvidia.com/v1/chat/completions`. Bearer auth.
2. **Tool calling:** Native OpenAI-format `tools` field — not text-parsed JSON. The CLI ships only models that support tool calling.
3. **Tool surface:** 5 tools — `shell`, `read_file`, `write_file`, `edit_file` (search/replace), `list_files`.
4. **Default model:** `meta/llama-3.3-70b-instruct`. Curated 4-model list shipped: Llama 3.3 70B, Nemotron 70B, Qwen 2.5 Coder 32B, Mistral Large 2.
5. **Cleanup:** Hard reset to baseline commit `040756b` and force-push. The multi-provider work in commits `2269a71..53cc64f` (and unpushed `aca7fbd`) is discarded entirely.
6. **Architecture:** 7 small files (one of which is the 2-line `bin/` entry), each ≤180 LOC, single responsibility.

## Architecture

```
bin/yuva.js
  └─→ src/index.js   (arg parsing, banner, dispatch to setup or app)
        ├─→ src/setup.js   (paste key, pick model, save)
        ├─→ src/app.js     (chat loop, tool dispatch, slash commands)
        │     ├─→ src/nvidia.js  (NVIDIAClient + MODELS list)
        │     └─→ src/tools.js   (TOOL_SCHEMAS, TOOL_HANDLERS, executeTool)
        └─→ src/config.js  (load/save ~/.yuva-ai/config.json)
```

- **One provider class.** `NVIDIAClient` posts to `/chat/completions` with `tools` populated from `tools.js` schemas, parses `choices[0].message.tool_calls`, returns `{content, toolCalls}`.
- **Tool registry as data.** `tools.js` exports `TOOL_SCHEMAS` (array of OpenAI function definitions) and `TOOL_HANDLERS` (map from name → handler). Adding a tool = one schema + one handler in one file.
- **Tool execution loop in app.js.** Model returns tool_calls → app dispatches each handler → results sent back as `tool` role messages → next API call → repeat until model returns content with no tool_calls.
- **Permission prompts** for `shell`, `write_file`, `edit_file` (destructive). `read_file` and `list_files` run automatically. Session-scoped "always allow" cache (Set, never persisted).
- **Curated 4-model list** as a constant in `nvidia.js`.

## Components

### Files to create (post-reset)

| File | Exports | Responsibility | Approx LOC |
|------|---------|----------------|------------|
| `bin/yuva.js` | — | `#!/usr/bin/env node` shebang + `import('../src/index.js')`. | 2 |
| `src/index.js` | — | Top-level entry. Parses `--setup`, `--help`, `--version`. Imports `app.js` for chat or `setup.js` for `--setup`. Prints welcome banner. | ~30 |
| `src/app.js` | — | The chat loop. Handles user input, calls `NVIDIAClient.chat()`, dispatches tool_calls via `tools.js`, prints results, handles slash commands (`/help`, `/clear`, `/model`, `/config`, `/cd`, `/exit`, `!cmd`). | ~150 |
| `src/nvidia.js` | `NVIDIAClient`, `MODELS`, `DEFAULT_MODEL` | Class wrapping NVIDIA's API. `chat(messages, opts)` posts to `/chat/completions` with `tools`, returns `{content, toolCalls, finishReason}`. Throws on non-2xx with status + body. Retries once on 429 after 5s. | ~80 |
| `src/tools.js` | `TOOL_SCHEMAS`, `TOOL_HANDLERS`, `executeTool(name, args, ctx)` | Tool registry. Schemas in OpenAI `tools` format. Handlers take `(args, ctx)` where `ctx = {cwd, askPermission, sessionAllow}`. | ~180 |
| `src/config.js` | `loadConfig`, `saveConfig`, `getConfigPath` | Loads/saves `~/.yuva-ai/config.json` (or `$YUVA_CONFIG_DIR/config.json` for tests). Schema: `{apiKey, model, systemPrompt}`. Backs up corrupt files. Preserves user-edited `systemPrompt`. | ~60 |
| `src/setup.js` | `runSetup` | Prompts: API key with link to `https://build.nvidia.com/`, pick model from `MODELS`, save. Uses `@inquirer/prompts`. | ~60 |

### Tests to create

| File | Coverage |
|------|----------|
| `tests/nvidia.test.js` | Request shape (URL, Authorization, body); parses tool_calls; handles plain content; throws on 401/malformed/empty; retries once on 429. Mocks `fetch`. |
| `tests/tools.test.js` | Each handler — read/write/edit/list/shell — happy and error paths. `edit_file` no-match and ambiguous-match returning errors. `executeTool` catches handler throws. Permission gating tested via injected mock asker. |
| `tests/config.test.js` | Defaults written when no file; round-trip save/load; corrupt file backed up + defaults written; user-edited `systemPrompt` preserved (carry-over from prior bug fix). |

### Curated `MODELS` list (in `src/nvidia.js`)

```js
export const MODELS = [
  { id: 'meta/llama-3.3-70b-instruct',           name: 'Llama 3.3 70B (recommended)' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B' },
  { id: 'qwen/qwen2.5-coder-32b-instruct',       name: 'Qwen 2.5 Coder 32B' },
  { id: 'mistralai/mistral-large-2-instruct',    name: 'Mistral Large 2' }
];
export const DEFAULT_MODEL = MODELS[0].id;
```

### Final `package.json` shape

```json
{
  "name": "yuva-code",
  "version": "1.0.0",
  "bin": { "yuva": "./bin/yuva.js" },
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.3.0"
  }
}
```

Drops: `blessed`, `marked`, `marked-terminal`, `ora`, the phantom `readline`. None are referenced in the new design.

## Data flow

### 1. First-run `yuva` (no config)

```
yuva
 → loadConfig() → defaults with empty apiKey
 → empty apiKey detected → runs setup wizard inline
 → setup.js prompts:
     ├─ API key (masked input, link to build.nvidia.com)
     └─ model (inquirer select, default = DEFAULT_MODEL)
 → saveConfig
 → drops into chat loop
```

### 2. Normal launch

```
yuva
 → loadConfig() returns saved config
 → welcome banner: model + cwd + hint line
 → prompt loop
```

### 3. Chat with native tool calls (core loop)

```
user: "fix the bug in src/foo.js"
 → messages.push({role: 'user', content: input})
 → spinner: "thinking..."
 → nvidia.chat(messages, systemPrompt, TOOL_SCHEMAS)
     POST { model, messages: [{role:system,...}, ...messages], tools, tool_choice: 'auto', stream: false }
     ← { content: '', toolCalls: [{id, name: 'read_file', args: {path: 'src/foo.js'}}] }

 → clear spinner
 → if content: print
 → for each toolCall (serially):
     ├─ if requires permission: ask y/n/a (a = always allow this tool this session)
     │  if denied: result = {error: 'denied by user'}
     ├─ executeTool(name, args, ctx) → result
     ├─ print "● <Tool>(<args>)" with summary of result (first N lines for files, exit code for shell)
     └─ messages.push({role: 'assistant', content: '', tool_calls: [tc]})
        messages.push({role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result)})

 → if any tool calls: loop back
 → if no tool calls + content: print, return to prompt
 → end-of-turn: print "Brewed for Xs"
```

### 4. Slash commands (no API call)

```
/help              prints command list
/clear             messages = [], reprint banner
/model             inquirer select from MODELS, saveConfig, recreate client
/config            prints config path + current model + masked apiKey ("nvapi-...3a2f")
/cd <path>         process.chdir, update prompt
/exit | /quit      goodbye, exit 0
!<cmd>             one-shot shell, no permission, output displayed
```

### 5. `edit_file` flow (most novel — worth detailing)

```
model returns: tool_calls: [{name: 'edit_file', args: {path, search, replace}}]
 → permission prompt (destructive)
 → executeTool('edit_file', args):
     ├─ read file → content
     ├─ count occurrences of literal `search` string
     ├─ 0 matches:    return {error: 'search string not found in <path>'}
     ├─ ≥2 matches:   return {error: 'search string matches N times — make it unique by including more context'}
     ├─ 1 match:      replace, write file → {ok: true, path, lines_changed: N}
 → result fed back to model; model continues
```

### Edge behaviors

- Tool call without `id` → generate `tool_${index}`. Defensive only; modern models always include `id`.
- Empty content + empty tool_calls → treat as model-produced-nothing; surface error, pop user message.
- `process.chdir` for `/cd` mutates global cwd — used by all tool handlers.

## Error handling

**Principle:** the chat loop never crashes. Every error path leaves the prompt healthy. Tool errors get surfaced to the model as data so it can recover; transport/network errors get surfaced to the user.

### NVIDIA / API

- **401 Unauthorized** → red error: `API key rejected. Run /config to check, or yuva --setup to set a new one.` Pop user message.
- **403 Forbidden** (model not on tier) → `Model X not available on your tier. Run /model to pick another.`
- **429 Rate limit** → wait 5s, retry once. If still 429 → `Rate limited. Try again in a minute.` Pop.
- **5xx server errors** → surface verbatim with status. Pop.
- **Network/DNS/timeout** → `Cannot reach NVIDIA. Check your internet.` Pop.
- **Malformed JSON** → `Unexpected response from NVIDIA. Try again or switch model.` Pop.
- **Empty content + empty tool_calls** → surface as model-empty error. Pop.

### Tool execution

- `read_file` missing path → `{error: 'ENOENT', path}` to model. No throw.
- `write_file` missing parent dirs → create them recursively. If still fails → `{error: <message>}`.
- `edit_file` no match → `{error: 'search string not found in <path>'}`.
- `edit_file` ambiguous match → `{error: 'search string matches N times — make it unique by including more context'}`.
- `shell` non-zero exit → `{exit_code, stdout, stderr, success: false}`. Model sees and reacts.
- `shell` runs forever → 60s default timeout. Kill, return `{error: 'timeout after 60s'}`.
- Tool handler throws unexpectedly → caught by `executeTool`, returns `{error, tool}`. Never propagates.

### Permission flow

- **Ctrl+C during prompt** → treated as denied. Result = `{error: 'cancelled'}`. Loop continues.
- **Always allow** → session-scoped `Set`, keyed by tool name. Never written to disk.

### Config

- Corrupt `config.json` → renamed to `config.json.bak-<timestamp>`, defaults written. Continue.
- Permission denied on config dir → exit 1 with `Cannot write to <path>. Check permissions.`

### Tool-loop bounds

- More than 30 tool calls in a single turn → break with `Stopped after 30 tool calls. Type "continue" to keep going.`
- Same tool + same args 3 times in a row → break with `Detected loop: <tool> called repeatedly with same args. Try a different approach.`

## Testing

### Test runner

Node's built-in `node:test` + `node:assert/strict`. Mocking via `mock.method(globalThis, 'fetch', ...)`. No new deps.

### `tests/nvidia.test.js`

| Test | Verifies |
|------|----------|
| `chat sends correct request shape` | URL, `Authorization: Bearer <key>`, body has `model`, `messages` (system prepended), `tools`, `tool_choice: 'auto'`, `stream: false`. |
| `chat parses tool_calls from response` | Returns `{content, toolCalls: [{id, name, args}]}`; `args` is parsed JSON of `function.arguments`. |
| `chat handles plain content (no tool_calls)` | Returns `{content, toolCalls: []}`. |
| `chat throws on 401 with body` | Error message includes status and body excerpt. |
| `chat retries once on 429, then surfaces` | Confirms 5s wait + retry. Use mock clock to avoid real wait. |
| `chat throws when response is malformed JSON` | Throws clear message. |
| `chat throws on empty content + empty tool_calls` | Throws. |

### `tests/tools.test.js`

| Test | Verifies |
|------|----------|
| `read_file returns content` | Reads file, returns bytes. |
| `read_file errors on missing path` | `{error: 'ENOENT', path}`. |
| `write_file creates parent dirs` | Works when intermediate dirs missing. |
| `write_file returns ok with path + lines` | Result shape correct. |
| `edit_file replaces single match` | Content updated; `{ok, path, lines_changed}`. |
| `edit_file errors on no match` | `{error: ...}`, file untouched. |
| `edit_file errors on ambiguous match` | `{error: 'matches N times...'}`, file untouched. |
| `list_files returns directory entries` | Array of names. |
| `shell returns stdout + exit_code` | For an `echo`-equivalent. |
| `shell respects timeout` | 100ms test override; long-running command killed. |
| `executeTool catches handler throws` | Returns `{error, tool}` instead of propagating. |
| `permission denied returns error result` | Mock asker denies → `{error: 'denied'}`. |

### `tests/config.test.js`

| Test | Verifies |
|------|----------|
| `loadConfig writes defaults when no file exists` | File created at `$YUVA_CONFIG_DIR/config.json`. |
| `loadConfig round-trips a saved config` | `saveConfig(x)` then `loadConfig()` returns `x`. |
| `loadConfig backs up corrupt file` | Bad JSON → renamed to `config.json.bak-...`, defaults written. |
| `loadConfig preserves user-edited systemPrompt` | Carry-over guard against the prior overwrite bug. |

### Manual smoke checklist

1. `rm -rf ~/.yuva-ai && yuva` → setup wizard runs, paste key, pick model, lands in chat.
2. Type `read package.json` → model calls `read_file`, displays content, finishes.
3. Type `list files in src` → model calls `list_files`, prints names.
4. Type `add a hello function to src/foo.js` → model uses `edit_file` (or `write_file`), permission prompt, approve, file changes.
5. Type `run the tests` → model calls `shell` with `npm test`, permission prompt, output shown.
6. `/model` → picker shows 4 models; switch; new request uses new model.
7. `/clear` → conversation reset.
8. `/exit` → clean exit.

### `package.json` script

```json
"test": "node --test"
```

## Out of scope (separate specs if needed later)

- Streaming responses (incremental tool-call display)
- Conversation persistence
- Token / cost tracking
- Lint, format, CI pipeline
- Multi-provider support (deliberately removed)
- A web UI or TUI overhaul (current chalked-text UX is the target)

## Rollback note

After the implementation plan lands, if the NVIDIA-only direction proves wrong:
- The pre-redesign multi-provider work is preserved in the *force-pushed-away* git refs locally for ~30 days (Git's reflog) but not on GitHub. Within that window, `git reflog` + `git reset --hard <old-sha>` + force-push restores the old direction.
- After 30 days, the old work is gone from local reflog too. At that point the multi-provider design doc (`2026-04-25-opencode-like-model-ux-design.md`) and its plan are the only record.
