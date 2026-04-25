// Groq Provider (Free tier, super fast inference)
export class GroqProvider {
  constructor(config) {
    this.apiKey = config.groqApiKey;
    this.model = config.model || 'llama-3.3-70b-versatile';
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
  }

  async chat(messages, systemPrompt) {
    if (!this.apiKey) {
      throw new Error('Groq API key not set. Run: yuva --setup');
    }

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async stream(messages, systemPrompt, onChunk) {
    if (!this.apiKey) {
      throw new Error('Groq API key not set. Run: yuva --setup');
    }

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error (${response.status}): ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.choices?.[0]?.delta?.content || '';
            if (text) {
              fullText += text;
              onChunk(text);
            }
          } catch {
            // skip
          }
        }
      }
    }

    return fullText;
  }
}
