import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { GroqProvider } from './groq.js';
import { OpenRouterProvider } from './openrouter.js';

export function createProvider(config) {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'groq':
      return new GroqProvider(config);
    case 'openrouter':
      return new OpenRouterProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}. Use: gemini, ollama, groq, openrouter`);
  }
}

export const PROVIDER_MODELS = {
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
  ollama: ['llama3', 'deepseek-coder-v2', 'qwen2.5-coder', 'codellama', 'mistral'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  openrouter: ['meta-llama/llama-3-8b-instruct:free', 'mistralai/mistral-7b-instruct:free', 'google/gemma-2-9b-it:free']
};
