// Ollama Provider (100% free, runs locally)
export class OllamaProvider {
  constructor(config) {
    this.baseUrl = config.ollamaUrl || 'http://localhost:11434';
    this.model = config.model || 'llama3';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
  }

  async chat(messages, systemPrompt) {
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: false,
        options: {
          num_predict: this.maxTokens,
          temperature: this.temperature,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error (${response.status}): Is Ollama running?`);
    }

    const data = await response.json();
    return data.message?.content || '';
  }

  async stream(messages, systemPrompt, onChunk) {
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: true,
        options: {
          num_predict: this.maxTokens,
          temperature: this.temperature,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error (${response.status}): Is Ollama running?`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let hasStarted = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const text = parsed.message?.content || '';

          // Only output actual content, skip thinking tokens silently
          if (text) {
            fullText += text;
            onChunk(text);
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    return fullText;
  }
}
