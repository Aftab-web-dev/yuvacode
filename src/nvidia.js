const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;

// ── NVIDIA NIM Free Models (build.nvidia.com — April 2026) ──
// All models below are FREE with rate limits (~40 req/min)
// API endpoint: https://integrate.api.nvidia.com/v1/chat/completions
export const NVIDIA_MODELS = [
  // Coding specialists
  { id: 'qwen/qwen3-coder-480b-a35b-instruct',       name: '⭐ Qwen3 Coder 480B',        tag: 'Best for coding' },
  { id: 'deepseek-ai/deepseek-v4-flash',              name: '⚡ DeepSeek V4 Flash',        tag: 'Fast, 1M context' },
  { id: 'deepseek-ai/deepseek-v4-pro',                name: '🧠 DeepSeek V4 Pro',          tag: 'Most intelligent' },
  { id: 'mistralai/devstral-2-123b-instruct-2512',    name: '🔧 Devstral 2 123B',          tag: 'Code specialist' },
  { id: 'moonshotai/kimi-k2-instruct',                name: '🌙 Kimi K2',                  tag: 'Long context coding' },
  { id: 'moonshotai/kimi-k2-instruct-0905',           name: '🌙 Kimi K2 (0905)',           tag: 'Updated version' },
  // Reasoning & agentic
  { id: 'z-ai/glm-5.1',                               name: '🤖 GLM 5.1',                  tag: 'Agentic AI' },
  { id: 'z-ai/glm-4.7',                               name: '🤖 GLM 4.7',                  tag: 'Tool calling' },
  { id: 'minimaxai/minimax-m2.7',                      name: '📐 MiniMax M2.7',             tag: 'Coding' },
  { id: 'minimaxai/minimax-m2.5',                      name: '📐 MiniMax M2.5',             tag: 'Reasoning' },
  { id: 'stepfun-ai/step-3.5-flash',                   name: '🏃 Step 3.5 Flash',           tag: 'Agentic' },
  { id: 'mistralai/magistral-small-2506',              name: '🎓 Magistral Small',          tag: 'Coding' },
  // Lightweight
  { id: 'google/gemma-4-31b-it',                       name: '💎 Gemma 4 31B',              tag: 'Lightweight' },
  { id: 'sarvamai/sarvam-m',                            name: '🇮🇳 Sarvam M',                tag: 'Multilingual' },
  { id: 'meta/llama-3.3-70b-instruct',                name: '🦙 Llama 3.3 70B',            tag: 'Reliable fallback' },
];

// ── External Provider Presets ──
// These require their own API keys — users configure via /provider command
export const PROVIDERS = {
  nvidia: {
    name: 'NVIDIA NIM',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    keyPrefix: 'nvapi-',
    free: true,
    keyUrl: 'https://build.nvidia.com/',
  },
  gemini: {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyPrefix: '',
    free: false,
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash',             name: '⚡ Gemini 2.5 Flash',       tag: 'Fast + cheap' },
      { id: 'gemini-2.5-pro',               name: '🧠 Gemini 2.5 Pro',         tag: 'Best reasoning' },
      { id: 'gemini-3-flash-preview',        name: '🚀 Gemini 3 Flash',         tag: 'Latest preview' },
    ]
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyPrefix: 'sk-',
    free: false,
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o',             name: '🌟 GPT-4o',              tag: 'Best overall' },
      { id: 'gpt-4o-mini',        name: '⚡ GPT-4o Mini',         tag: 'Fast & cheap' },
      { id: 'gpt-4.1',            name: '🧠 GPT-4.1',             tag: 'Latest' },
      { id: 'o3-mini',            name: '💡 o3 Mini',             tag: 'Reasoning' },
    ]
  },
  anthropic: {
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    keyPrefix: 'sk-ant-',
    free: false,
    keyUrl: 'https://console.anthropic.com/',
    models: [
      { id: 'claude-sonnet-4-20250514',     name: '🎵 Claude Sonnet 4',   tag: 'Best coding' },
      { id: 'claude-opus-4-20250514',       name: '🎼 Claude Opus 4',     tag: 'Most capable' },
      { id: 'claude-3.5-haiku-20241022',    name: '⚡ Claude 3.5 Haiku',  tag: 'Fast' },
    ]
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    keyPrefix: '',
    free: false,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat',      name: '💬 DeepSeek V3',         tag: 'General chat' },
      { id: 'deepseek-reasoner',   name: '🧠 DeepSeek R1',         tag: 'Chain-of-thought' },
      { id: 'deepseek-coder',     name: '🔧 DeepSeek Coder',      tag: 'Code specialist' },
    ]
  },
  kimi: {
    name: 'Moonshot Kimi',
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    keyPrefix: '',
    free: false,
    keyUrl: 'https://platform.moonshot.cn/',
    models: [
      { id: 'kimi-k2.5-preview',            name: '🌙 Kimi K2.5',           tag: 'Latest' },
      { id: 'moonshot-v1-128k',             name: '🌙 Moonshot V1 128K',    tag: 'Long context' },
      { id: 'moonshot-v1-32k',              name: '🌙 Moonshot V1 32K',     tag: 'Balanced' },
    ]
  },
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyPrefix: 'gsk_',
    free: false,
    keyUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile',     name: '🦙 Llama 3.3 70B',     tag: 'Very fast' },
      { id: 'llama-3.1-8b-instant',        name: '🦙 Llama 3.1 8B',      tag: 'Ultra fast' },
      { id: 'mixtral-8x7b-32768',          name: '🔀 Mixtral 8x7B',      tag: 'Balanced' },
      { id: 'gemma2-9b-it',                name: '💎 Gemma 2 9B',         tag: 'Lightweight' },
    ]
  },
  qwen: {
    name: 'Alibaba Qwen',
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    keyPrefix: '',
    free: false,
    keyUrl: 'https://dashscope.console.aliyun.com/',
    models: [
      { id: 'qwen-max',                     name: '🏆 Qwen Max',           tag: 'Most capable' },
      { id: 'qwen-plus',                    name: '⚡ Qwen Plus',          tag: 'Fast' },
      { id: 'qwen-turbo',                   name: '🚀 Qwen Turbo',         tag: 'Cheapest' },
      { id: 'qwen-coder-plus',              name: '🔧 Qwen Coder Plus',    tag: 'Code specialist' },
    ]
  },
  xai: {
    name: 'xAI Grok',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    keyPrefix: '',
    free: false,
    keyUrl: 'https://console.x.ai/',
    models: [
      { id: 'grok-3',                       name: '🤖 Grok 3',             tag: 'Latest' },
      { id: 'grok-3-mini',                  name: '⚡ Grok 3 Mini',        tag: 'Fast' },
    ]
  },
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyPrefix: 'sk-or-',
    free: false,
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'anthropic/claude-sonnet-4',    name: '🎵 Claude Sonnet 4',   tag: 'Via OpenRouter' },
      { id: 'google/gemini-2.5-pro',        name: '🧠 Gemini 2.5 Pro',   tag: 'Via OpenRouter' },
      { id: 'deepseek/deepseek-r1',         name: '🧠 DeepSeek R1',      tag: 'Via OpenRouter' },
      { id: 'qwen/qwen-2.5-coder-32b',     name: '🔧 Qwen Coder 32B',   tag: 'Via OpenRouter' },
    ]
  },
  // ── Local AI Providers (no API key needed) ──
  ollama: {
    name: 'Ollama (Local)',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    keyPrefix: '',
    free: true,
    local: true,
    keyUrl: 'https://ollama.com/download',
    modelsEndpoint: 'http://localhost:11434/api/tags',
    models: [
      { id: 'qwen3:32b',                name: '🏠 Qwen3 32B',           tag: 'Local coding' },
      { id: 'deepseek-coder-v2:16b',    name: '🏠 DeepSeek Coder V2',   tag: 'Local coding' },
      { id: 'codellama:34b',            name: '🏠 CodeLlama 34B',       tag: 'Local coding' },
      { id: 'llama3.3:70b',             name: '🏠 Llama 3.3 70B',       tag: 'Local general' },
      { id: 'mistral:7b',               name: '🏠 Mistral 7B',          tag: 'Local fast' },
    ]
  },
  lmstudio: {
    name: 'LM Studio (Local)',
    endpoint: 'http://localhost:1234/v1/chat/completions',
    keyPrefix: '',
    free: true,
    local: true,
    keyUrl: 'https://lmstudio.ai/',
    modelsEndpoint: 'http://localhost:1234/v1/models',
    models: []
  },
  jan: {
    name: 'Jan (Local)',
    endpoint: 'http://localhost:1337/v1/chat/completions',
    keyPrefix: '',
    free: true,
    local: true,
    keyUrl: 'https://jan.ai/',
    modelsEndpoint: 'http://localhost:1337/v1/models',
    models: []
  },
  custom: {
    name: 'Custom API',
    endpoint: '',
    keyPrefix: '',
    free: false,
    keyUrl: '',
    models: []
  }
};

// Fetch locally installed models from Ollama/LMStudio/Jan
export async function fetchLocalModels(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider?.modelsEndpoint) return [];

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000); // 3s timeout
    const res = await fetch(provider.modelsEndpoint, { signal: ac.signal });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();

    // Ollama format: { models: [{ name, ... }] }
    if (data.models && Array.isArray(data.models)) {
      return data.models.map(m => ({
        id: m.name || m.model,
        name: `🏠 ${m.name || m.model}`,
        tag: `${formatSize(m.size)} · local`
      }));
    }

    // OpenAI format: { data: [{ id, ... }] }
    if (data.data && Array.isArray(data.data)) {
      return data.data.map(m => ({
        id: m.id,
        name: `🏠 ${m.id}`,
        tag: 'local'
      }));
    }
  } catch {
    // Server not running or unreachable
  }
  return [];
}

function formatSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)}MB`;
}

// Helper to get all models for a provider
export function getModelsForProvider(providerId) {
  if (providerId === 'nvidia') return NVIDIA_MODELS;
  return PROVIDERS[providerId]?.models || [];
}

// Helper to get endpoint for provider
export function getEndpointForProvider(providerId) {
  return PROVIDERS[providerId]?.endpoint || '';
}

// Legacy export for backward compatibility
export const MODELS = NVIDIA_MODELS;
export const DEFAULT_MODEL = NVIDIA_MODELS[0].id;

export class NVIDIAClient {
  constructor({ apiKey, model, maxTokens, temperature, retryDelayMs, requestTimeoutMs, provider, customEndpoint }) {
    this.apiKey = apiKey || '';
    this.model = model || DEFAULT_MODEL;
    this.maxTokens = maxTokens || 16384;
    this.temperature = temperature ?? 0.7;
    this.retryDelayMs = retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.requestTimeoutMs = requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.provider = provider || 'nvidia';
    // Determine endpoint
    if (customEndpoint) {
      this.endpoint = customEndpoint;
    } else {
      this.endpoint = getEndpointForProvider(this.provider);
    }
  }


  async chat(messages, systemPrompt, tools, onStream) {
    const body = {
      model: this.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: true
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const fetchWithTimeout = async () => {
      const ac = new AbortController();
      // 10 minute timeout for streaming response
      const timer = setTimeout(() => ac.abort(), 600000);
      try {
        return await fetch(this.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    let res;
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        res = await fetchWithTimeout();
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('NVIDIA request timed out');
        throw err;
      }

      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt < MAX_RETRIES) {
          const waitMs = 10000 * Math.pow(2, attempt); // 10s, 20s, 40s, 80s, 160s
          const reasons = { 429: 'Rate limited', 502: 'Server error', 503: 'Model busy', 504: 'Gateway timeout' };
          if (onStream) onStream(`\n[${reasons[res.status] || 'Error'} — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})...]\n`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }
      break; // Success or non-retryable error
    }

    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch { /* ignore */ }
      const status = res.status;
      // Human-friendly error messages
      if (status === 401) throw new Error(`Invalid API key. Run 'yuva --setup' or use /provider to reconfigure.`);
      if (status === 403) throw new Error(`Access denied. Your API key may not have access to model '${this.model}'.`);
      if (status === 404) throw new Error(`Model '${this.model}' not found. Try /model to switch models.`);
      if (status === 429) throw new Error(`Rate limited after ${MAX_RETRIES} retries. Wait a minute or switch models with /model.`);
      if (status === 502 || status === 503 || status === 504) throw new Error(`Model '${this.model}' is overloaded (${status}). Try:\n  • /model to switch to a different model\n  • Wait a few seconds and retry`);
      const excerpt = bodyText.slice(0, 300);
      throw new Error(`API error (${status}): ${excerpt}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let contentBuffer = '';
    let finalContent = '';
    let toolCallsMap = new Map();
    let buffer = ''; // SSE line buffer

    function cleanContent(text) {
      let cleaned = text;
      // Strip any line/segment containing DSML or tool_calls control tokens
      // These come from DeepSeek and other models as internal delimiters
      cleaned = cleaned.replace(/<[^>]{0,50}DSML[^>]{0,50}/g, '');
      cleaned = cleaned.replace(/<[^>]{0,50}tool[_\u2581]?calls[^>]{0,50}/g, '');
      // Strip thinking tags (Qwen, DeepSeek R1, MiniMax, etc.)
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
      cleaned = cleaned.replace(/<\/?think>/g, '');
      cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '');
      cleaned = cleaned.replace(/<\/?reasoning>/g, '');
      // Strip fullwidth vertical bars that are part of control tokens
      cleaned = cleaned.replace(/\uff5c/g, '');
      return cleaned.trim() ? cleaned : '';
    }

    // Strip untagged thinking/reasoning lines from final output
    function stripThinkingLines(text) {
      const lines = text.split('\n');
      const cleaned = [];
      let skipBlock = false;

      for (const line of lines) {
        const trimmed = line.trim();
        // Detect internal reasoning lines (common patterns from various models)
        const isThinking = /^(The user (said|wants?|is asking|asked|needs?)|I (should|need to|will|can|must)|Let me |This is a |My (plan|approach|strategy)|Step \d+[:.])/i.test(trimmed);
        
        // If line looks like internal reasoning and we haven't seen real content yet, skip
        if (isThinking && cleaned.length === 0) {
          skipBlock = true;
          continue;
        }
        // Stop skipping when we hit a blank line after thinking block
        if (skipBlock && trimmed === '') {
          continue; // skip the blank line between thinking and real content
        }
        skipBlock = false;
        cleaned.push(line);
      }
      return cleaned.join('\n').trim();
    }

    // Flush buffered content, holding back potential partial control tokens
    function flushBuffer(force = false) {
      if (!contentBuffer) return;
      if (!force) {
        // Hold back if buffer ends with something that looks like a partial control token
        const holdIdx = contentBuffer.lastIndexOf('<');
        if (holdIdx >= 0 && holdIdx > contentBuffer.length - 50) {
          const safe = contentBuffer.slice(0, holdIdx);
          contentBuffer = contentBuffer.slice(holdIdx);
          const cleaned = cleanContent(safe);
          if (cleaned) {
            finalContent += cleaned;
            if (onStream) onStream(cleaned);
          }
          return;
        }
      }
      const cleaned = cleanContent(contentBuffer);
      contentBuffer = '';
      if (cleaned) {
        finalContent += cleaned;
        if (onStream) onStream(cleaned);
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete chunk
      
      for (const line of lines) {
        const tLine = line.trim();
        if (!tLine.startsWith('data: ')) continue;
        if (tLine === 'data: [DONE]') continue;

        try {
          const data = JSON.parse(tLine.slice(6));
          const delta = data.choices?.[0]?.delta;
          if (!delta) continue;

          // Skip reasoning_content (DeepSeek R1, MiniMax thinking output)
          // We only want delta.content, not delta.reasoning_content

          if (delta.content) {
            contentBuffer += delta.content;
            flushBuffer(false);
          }

          if (delta.tool_calls) {
            // Flush any remaining content before processing tool calls
            flushBuffer(true);
            for (const tc of delta.tool_calls) {
              if (!toolCallsMap.has(tc.index)) {
                toolCallsMap.set(tc.index, { id: '', name: '', argsStr: '' });
              }
              const existing = toolCallsMap.get(tc.index);
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.argsStr += tc.function.arguments;
            }
          }
        } catch (e) { /* ignore partial json error */ }
      }
    }

    // Final flush
    flushBuffer(true);

    const toolCalls = Array.from(toolCallsMap.values()).map(tc => {
      let args = {};
      try { args = JSON.parse(tc.argsStr || '{}'); } catch { args = {}; }
      return { id: tc.id || `tool_${Math.random().toString(36).slice(2)}`, name: tc.name, args };
    });

    if (!finalContent && toolCalls.length === 0) {
      throw new Error('NVIDIA returned an empty response (no content, no tool calls)');
    }

    // Strip any leaked thinking/reasoning from the final output
    finalContent = stripThinkingLines(finalContent);

    return { content: finalContent, toolCalls };
  }
}
