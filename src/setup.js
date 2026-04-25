import chalk from 'chalk';
import readline from 'readline';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { PROVIDER_MODELS } from './providers/index.js';

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

export async function runSetup() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log();
  console.log(chalk.hex('#7C3AED').bold('  YUVA AI - Setup Wizard'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  console.log();

  const config = loadConfig();

  // Provider selection
  console.log(chalk.white('  Available AI providers:'));
  console.log(chalk.gray('    1. ') + chalk.white('Gemini') + chalk.gray('      - Google AI (free tier, recommended)'));
  console.log(chalk.gray('    2. ') + chalk.white('Ollama') + chalk.gray('      - Local AI (100% free, needs Ollama installed)'));
  console.log(chalk.gray('    3. ') + chalk.white('Groq') + chalk.gray('        - Cloud AI (free tier, super fast)'));
  console.log(chalk.gray('    4. ') + chalk.white('OpenRouter') + chalk.gray('  - Multi-model gateway (some free models)'));
  console.log();

  const providerChoice = await ask(rl, chalk.hex('#A78BFA')('  Choose provider (1-4): '));
  const providers = ['gemini', 'ollama', 'groq', 'openrouter'];
  config.provider = providers[parseInt(providerChoice) - 1] || 'gemini';
  console.log(chalk.green(`  Selected: ${config.provider}`));
  console.log();

  // Model selection
  const models = PROVIDER_MODELS[config.provider];
  console.log(chalk.white(`  Available models for ${config.provider}:`));
  models.forEach((m, i) => {
    console.log(chalk.gray(`    ${i + 1}. `) + chalk.white(m));
  });
  console.log();

  const modelChoice = await ask(rl, chalk.hex('#A78BFA')('  Choose model (number) or type custom: '));
  const modelIndex = parseInt(modelChoice) - 1;
  config.model = (modelIndex >= 0 && modelIndex < models.length) ? models[modelIndex] : modelChoice.trim() || models[0];
  console.log(chalk.green(`  Selected: ${config.model}`));
  console.log();

  // API key
  if (config.provider !== 'ollama') {
    const keyField = {
      gemini: 'apiKey',
      groq: 'groqApiKey',
      openrouter: 'openrouterApiKey'
    }[config.provider];

    const keyUrls = {
      gemini: 'https://aistudio.google.com/apikey',
      groq: 'https://console.groq.com/keys',
      openrouter: 'https://openrouter.ai/keys'
    };

    console.log(chalk.gray(`  Get your free API key at: ${keyUrls[config.provider]}`));
    const apiKey = await ask(rl, chalk.hex('#A78BFA')('  Enter API key: '));
    if (apiKey.trim()) {
      config[keyField] = apiKey.trim();
    }
  } else {
    console.log(chalk.gray('  Make sure Ollama is running: ollama serve'));
    const ollamaUrl = await ask(rl, chalk.hex('#A78BFA')(`  Ollama URL (${config.ollamaUrl}): `));
    if (ollamaUrl.trim()) {
      config.ollamaUrl = ollamaUrl.trim();
    }
  }

  saveConfig(config);
  console.log();
  console.log(chalk.green.bold('  Setup complete!'));
  console.log(chalk.gray(`  Config saved to: ${getConfigPath()}`));
  console.log(chalk.gray('  Run ') + chalk.white('yuva') + chalk.gray(' to start chatting!'));
  console.log();

  rl.close();
}
