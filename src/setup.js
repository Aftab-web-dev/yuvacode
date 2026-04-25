import chalk from 'chalk';
import { password, select } from '@inquirer/prompts';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { NVIDIA_MODELS, DEFAULT_MODEL, PROVIDERS, getModelsForProvider } from './nvidia.js';

const purple = chalk.hex('#7C3AED').bold;
const gray = chalk.gray;
const green = chalk.green;
const orange = chalk.hex('#FFAB70');
const white = chalk.white;
const dim = chalk.hex('#6A737D');

export async function runSetup() {
  console.log();
  console.log(purple('  YUVA Code — Setup'));
  console.log(gray('  ─────────────────────────────'));
  console.log();

  const config = loadConfig();

  // Step 1: Choose provider
  let provider;
  try {
    provider = await select({
      message: 'Choose AI provider:',
      default: 'nvidia',
      choices: Object.entries(PROVIDERS).map(([key, p]) => ({
        name: `${p.name}${p.free ? green(' (FREE)') : orange(' (needs API key)')}`,
        value: key
      })),
      loop: false
    });
  } catch {
    console.log(gray('\n  Setup cancelled.\n'));
    return;
  }
  config.provider = provider;

  // Step 2: API key
  if (provider === 'nvidia') {
    console.log();
    console.log(gray('  Get a free API key at: ') + white('https://build.nvidia.com/'));
    console.log(gray('  (Paste with Ctrl+V — input will be masked)'));
    console.log();
  } else {
    const info = PROVIDERS[provider];
    console.log();
    console.log(gray(`  Get your ${info.name} API key from their dashboard.`));
    console.log();
  }

  let apiKey;
  try {
    apiKey = await password({
      message: `${PROVIDERS[provider]?.name || 'API'} key:`,
      mask: '*',
      validate: v => v.trim().length > 0 || 'API key is required'
    });
  } catch {
    console.log(gray('\n  Setup cancelled.\n'));
    return;
  }
  config.apiKey = apiKey.trim();

  // Step 3: Choose model
  const models = getModelsForProvider(provider);
  if (models.length > 0) {
    let model;
    try {
      model = await select({
        message: 'Choose model:',
        default: provider === 'nvidia' ? DEFAULT_MODEL : models[0].id,
        choices: models.map(m => ({
          name: `${m.name}  ${dim(`(${m.tag})`)}`,
          value: m.id
        })),
        loop: false
      });
    } catch {
      console.log(gray('\n  Setup cancelled. API key not saved.\n'));
      return;
    }
    config.model = model;
  }

  saveConfig(config);

  console.log();
  console.log(green('  ✓ Setup complete.'));
  console.log(gray('  Config:   ') + white(getConfigPath()));
  console.log(gray('  Provider: ') + white(PROVIDERS[provider]?.name || provider));
  console.log(gray('  Model:    ') + white(config.model));
  console.log(gray('  Run ') + white('yuva') + gray(' to start chatting.'));
  console.log();
}
