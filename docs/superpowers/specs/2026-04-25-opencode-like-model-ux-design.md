# OpenCode-Like Model & Provider UX

**Date:** 2026-04-25
**Status:** Approved (design)
**Project:** yuva-code CLI

## Goal

Bring OpenCode's model-and-provider experience to yuva-code: a current model catalog users don't have to wait for releases to update, an interactive picker, the ability to plug in any model ID or any OpenAI-compatible endpoint, and a setup wizard that auto-detects what's already on the user's machine.

## Non-goals (deferred to other specs)

- Native tool calling (replacing the JSON-text tool-call extraction). Tracked separately.
- Streaming with incremental tool-call display.
- Tests, lint, or CI for any code outside this spec's scope.
- Multiple named custom endpoints (today: one custom endpoint slot is enough).
- An always-on `/detect` re-scan command (first-run detection only).

## Decisions locked during brainstorm

1. **Catalog source:** hybrid — bundled snapshot in the package + background refresh from [models.dev](https://models.dev), cached in `~/.yuva-ai/catalog.json`.
2. **Picker UX:** interactive arrow-key + type-ahead via `@inquirer/prompts`.
3. **Add-your-own:** freeform model ID for any provider, plus one custom OpenAI-compatible endpoint slot.
4. **Auto-detection:** runs once during first-run setup. No re-scan command.
5. **Provider classes:** collapse Groq, OpenRouter, and the new custom endpoint into one `OpenAICompatibleProvider`. Keep Gemini and Ollama as their own classes.

## Architecture

Four layers, each with one responsibility.

```
UI commands:   setup.js   /model   /provider   /models   /add-endpoint
                                  │
                            ┌─────▼─────┐
                            │ picker.js │   inquirer-based picker
                            └─────┬─────┘
                                  │
                ┌─────────────────┼──────────────────┐
                │                 │                  │
          ┌─────▼──────┐    ┌─────▼─────┐     ┌─────▼─────┐
          │ catalog.js │    │ detect.js │     │ config.js │
          └─────┬──────┘    └───────────┘     └───────────┘
                │
   bundled catalog.json + ~/.yuva-ai/catalog.json (cache)
                ↑ refreshed from models.dev


Provider classes:
  providers/gemini.js              (unique API)
  providers/ollama.js              (unique API)
  providers/openai-compatible.js   (Groq, OpenRouter, Custom, future OpenAI-shaped)
```

- **Catalog** is the source of truth for "what models exist." Bundled JSON ships in the package; the cache layer overrides bundled when newer; refresh runs in the background on launch when the cache is stale (>7 days) or missing.
- **Picker** is owned by no command. Setup, `/model`, `/provider`, and `/models` all call it. Returns `{providerId, modelId}`.
- **Detect** is called only by setup on first run. Scans env vars and pings Ollama; returns available providers with rationale.
- **Providers** drop from four classes to three. Groq, OpenRouter, and custom endpoints all instantiate `OpenAICompatibleProvider` with different `baseUrl`/`headers` from the catalog or config.

## Components

### New files

| File | Exports | Responsibility |
|------|---------|----------------|
| `src/catalog.js` | `loadCatalog()`, `refreshCatalog()`, `getModels(providerId)`, `getModel(providerId, modelId)` | Load bundled snapshot, overlay cache, fetch from models.dev with timeout, write cache. Models keyed by `providerId/modelId`. |
| `src/picker.js` | `pickProvider(providers)`, `pickModel(providerId, models, {allowCustom: true})` | Inquirer-based pickers. `pickModel` adds an "Enter custom model ID…" option that drops to a text prompt. |
| `src/detect.js` | `detectProviders()` | Returns `[{providerId, source, ready}]`. Checks `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` env vars; pings `${ollamaUrl}/api/tags` with 1s timeout. |
| `src/providers/openai-compatible.js` | `OpenAICompatibleProvider` | One class, parameterized by `{baseUrl, apiKey, headers, model}`. Replaces `GroqProvider` + `OpenRouterProvider`. |
| `src/data/catalog.json` | — | Bundled model snapshot. Trimmed subset of models.dev (only providers we ship support for). Refreshed by hand at release time. |

### Modified files

| File | Change |
|------|--------|
| `src/config.js` | Schema bump to `{schemaVersion: 2, ...}`. New shape: `{provider, model, apiKeys: {gemini, groq, openrouter, custom}, customEndpoint: {baseUrl, headers}, ollamaUrl, maxTokens, temperature, systemPrompt, ...}`. The custom endpoint's API key lives in `apiKeys.custom` (consistent with the other providers); `customEndpoint.headers` is for *additional* headers only (e.g. `X-Title`). Add `migrateV1ToV2(old)`. **Stop overwriting `systemPrompt` on every load** (existing bug — the spread at line 67 always wins, so user edits never persist). |
| `src/setup.js` | Replace numbered prompts with: `detect → pickProvider → prompt for missing API key → pickModel → save`. |
| `src/app.js` | `/model` and `/provider` call the picker instead of taking args. New `/models` lists everything in the catalog. New `/add-endpoint` configures the custom OpenAI-compatible endpoint. |
| `src/providers/index.js` | `createProvider(config)` reads provider metadata from catalog (or config for custom), instantiates the right class. Drop the hardcoded `PROVIDER_MODELS` export — callers go through `catalog.js`. |

### Deleted files

- `src/providers/groq.js`
- `src/providers/openrouter.js`

### Dependencies

- **Add:** `@inquirer/prompts` (~50KB, tree-shakeable).
- **Remove:** the phantom `readline` dep (Node has it built in; the npm package is unrelated).

## Data flow

### 1. First-run `yuva` (no `~/.yuva-ai/config.json`)

```
yuva launches
 → config.js: no file → triggers setup
 → setup.js: detect.detectProviders()
     ├─ checks GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY env vars
     └─ pings ${ollamaUrl}/api/tags (1s timeout)
 → setup.js: catalog.loadCatalog() (bundled, no network)
 → picker.pickProvider(detected ∪ available-but-no-key)
     ├─ if user picks one with key from env → use env value
     └─ if no key → prompt for it (or skip for ollama)
 → picker.pickModel(providerId, catalog.getModels(providerId), {allowCustom: true})
 → config.saveConfig({schemaVersion: 2, provider, model, apiKeys, ...})
 → drop into chat loop
```

### 2. Normal launch (config exists)

```
yuva launches
 → config.js: load → if schemaVersion < 2, migrateV1ToV2 → save
 → catalog.js: loadCatalog (bundled + cache merged)
 → if cache.lastRefresh > 7 days OR no cache: fire-and-forget catalog.refreshCatalog()
     ├─ fetch https://models.dev/api.json with 5s timeout
     ├─ on success → write ~/.yuva-ai/catalog.json
     └─ on failure → silent (next launch retries)
 → createProvider(config) using catalog metadata
 → drop into chat loop
```

### 3. `/model` (in-session model switch)

```
user types /model
 → picker.pickModel(config.provider, catalog.getModels(config.provider), {allowCustom: true})
 → config.model = result; saveConfig; recreate provider
 → continue chat
```

### 4. `/provider` (in-session provider switch)

```
user types /provider
 → picker.pickProvider(all-known-providers)
 → if missing API key for chosen provider → prompt
 → picker.pickModel(...) for that provider
 → saveConfig; recreate provider
```

### 5. `/add-endpoint` (configure custom OpenAI-compatible URL)

```
user types /add-endpoint
 → prompt: base URL (e.g. http://localhost:1234/v1)
 → prompt: API key (optional; some local servers don't need one) → apiKeys.custom
 → prompt: model ID (text input — no catalog for custom)
 → saveConfig with provider="custom", customEndpoint={baseUrl, headers: {}}, apiKeys.custom, model
 → recreate provider (instantiates OpenAICompatibleProvider with baseUrl + apiKeys.custom + customEndpoint.headers)
```

### Edge behaviors

- `refreshCatalog` runs **after** the welcome banner prints — never blocks the prompt.
- If a saved `model` no longer exists in the catalog, we don't error; we trust the saved value (covers "user typed a custom model ID for a real provider").
- If models.dev returns an unknown provider (e.g. `anthropic`), we ignore it — only catalog entries for providers we ship support for are surfaced.

## Error handling

Principle: auto-detection, catalog refresh, and migration are best-effort. None of them ever prevent the user from launching `yuva` and chatting. Hard errors only at moments the user is actively choosing something (picker, `/add-endpoint`).

### Catalog

- Bundled snapshot missing/corrupt → fall back to a tiny hardcoded default (gemini-2.0-flash + a Groq + an Ollama model).
- Cache file corrupt → ignore cache, use bundled. Don't crash, don't prompt.
- models.dev fetch times out (5s) or returns non-200 → silent. Last-good cache stays; next launch retries.
- models.dev returns malformed JSON → reject. Don't overwrite valid cache with garbage.
- Schema drift (unknown fields in models.dev response) → tolerate. Require only `{id, name, provider}` per model. Filter out providers we don't ship support for.

### Detection

- Ollama ping fails / times out (1s budget) → mark unavailable, no error surfaced.
- Env var present but empty string → treat as not-set.
- DNS / network error during ping → silent. Detection is best-effort; never blocks setup.

### Picker (Ctrl+C / ESC)

- During first-run setup → exit cleanly with `Setup cancelled. Run yuva --setup to retry.` No partial config written.
- During `/model`, `/provider`, `/add-endpoint` → return to chat prompt unchanged. Config not modified.
- User picks "custom model ID" then submits empty → re-prompt once; second empty submit cancels.

### Custom endpoint

- Invalid URL in `/add-endpoint` (no protocol, malformed) → reject inline, ask again. Don't save.
- Endpoint unreachable at chat time → surface fetch error verbatim with the existing red `✗` chat-error UI. Pop the user message so retry works (existing behavior).
- Endpoint returns non-OpenAI-shaped JSON → fail with `Custom endpoint did not return an OpenAI-compatible response`. Suggest checking the base URL.

### Config migration (V1 → V2)

- Unknown V1 fields → preserve under `_legacy` so we don't silently drop user data.
- Migration crash → keep V1 file untouched, write `~/.yuva-ai/config.v2-migration-error.log` with the exception, run setup wizard. User loses no data.
- Saved provider/model no longer in catalog → don't error, trust the saved value (covered in flow #2).
- Saved provider class deleted in a future yuva version → log a warning, fall back to default provider, run a one-line `your old provider X was removed; using Y instead. Run /provider to change.`

## Testing

The project has no tests today. This spec adds tests for the modules where logic correctness matters most. Picker and slash-command UX get manual verification.

**Test runner:** Node's built-in `node:test` + `node:assert/strict`. No new dependencies.

**Files to add:**

| File | Coverage |
|------|----------|
| `tests/catalog.test.js` | `loadCatalog` returns bundled when no cache; cache overrides bundled when newer; corrupt cache → falls back to bundled; `refreshCatalog` writes cache on success; `refreshCatalog` leaves cache untouched on bad-JSON response; schema validation drops unknown providers but keeps unknown fields. |
| `tests/config-migration.test.js` | V1 config (with `apiKey`, `groqApiKey`, `openrouterApiKey`) migrates to V2 `apiKeys` map correctly; unknown V1 fields preserved under `_legacy`; broken V1 file doesn't crash, gets backed up. |
| `tests/detect.test.js` | Env vars present → ready; absent → not-ready; empty string → not-ready; Ollama mock-server returns 200 → ready; mock-server times out → not-ready (within 1s budget). Uses `node:test`'s built-in mock for `fetch`. |
| `tests/openai-compatible.test.js` | Sends correct request shape (Authorization header, model, messages); parses standard response; surfaces 4xx/5xx as a thrown error with status; handles non-JSON response cleanly. Mocks `fetch`. |

**Manual verification checklist** (run before each release):

- `yuva --setup` on a clean machine (delete `~/.yuva-ai/`) → detects Ollama if running, picks Gemini if `GEMINI_API_KEY` set.
- `/model`, `/provider`, `/models`, `/add-endpoint` each work end to end.
- Old V1 config opens and migrates without data loss.

**`package.json` changes:**

- Add `"test": "node --test tests/"` script.
- Add `"engines": {"node": ">=20"}` (needed for built-in `node:test` mocking and stable `fetch`).

## Out of scope (worth tracking elsewhere)

- Tests for the existing `extractToolCalls`, `executeToolCall`, slash-command dispatcher.
- A real CI pipeline (GitHub Actions running `npm test`).
- Lint / format setup.
- Native tool-calling refactor (separate spec).
- The dead `src/ui.js` and `src/tui.js` files (separate cleanup).
