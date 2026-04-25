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
