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

test('MODELS exports the curated tool-supporting models', async () => {
  const { MODELS, DEFAULT_MODEL } = await import('../src/nvidia.js?t=' + Date.now());
  const ids = MODELS.map(m => m.id);
  assert.ok(ids.includes('meta/llama-3.3-70b-instruct'));
  assert.ok(ids.includes('nvidia/llama-3.1-nemotron-70b-instruct'));
  assert.ok(ids.includes('mistralai/mistral-large-2-instruct'));
  assert.ok(!ids.includes('qwen/qwen2.5-coder-32b-instruct'), 'qwen-coder dropped (no tool support on NVIDIA)');
  assert.equal(DEFAULT_MODEL, 'meta/llama-3.3-70b-instruct');
});

test('chat throws timeout error when fetch is aborted', async () => {
  // Mock fetch that never resolves naturally — relies on the AbortSignal
  mock.method(globalThis, 'fetch', (url, opts) => {
    return new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });

  const { NVIDIAClient } = await import('../src/nvidia.js?t=' + Date.now());
  const c = new NVIDIAClient({ apiKey: 'k', model: 'm', requestTimeoutMs: 50 });
  await assert.rejects(() => c.chat([{ role: 'user', content: 'hi' }], 's', []), /timed out/i);
});
