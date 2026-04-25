import chalk from 'chalk';
import { password, select } from '@inquirer/prompts';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { MODELS, DEFAULT_MODEL } from './nvidia.js';

const purple = chalk.hex('#7C3AED').bold;
const gray = chalk.gray;
const green = chalk.green;
const white = chalk.white;

export async function runSetup() {
  console.log();
  console.log(purple('  YUVA Code — NVIDIA Setup'));
  console.log(gray('  ─────────────────────────────'));
  console.log();
  console.log(gray('  Get a free API key at: ') + white('https://build.nvidia.com/'));
  console.log(gray('  (Paste with Ctrl+V or Cmd+V — input will be masked)'));
  console.log();

  const config = loadConfig();

  let apiKey;
  try {
    apiKey = await password({
      message: 'NVIDIA API key:',
      mask: '*',
      validate: v => v.trim().length > 0 || 'API key is required'
    });
  } catch {
    console.log(gray('\n  Setup cancelled.\n'));
    return;
  }
  config.apiKey = apiKey.trim();

  const validModelIds = new Set(MODELS.map(m => m.id));
  const defaultModel = validModelIds.has(config.model) ? config.model : DEFAULT_MODEL;
  if (config.model && !validModelIds.has(config.model)) {
    console.log(gray(`  (Saved model "${config.model}" is no longer in the curated list — defaulting to ${DEFAULT_MODEL})`));
    console.log();
  }

  let model;
  try {
    model = await select({
      message: 'Choose model:',
      default: defaultModel,
      choices: MODELS.map(m => ({ name: m.name, value: m.id })),
      loop: false
    });
  } catch {
    console.log(gray('\n  Setup cancelled. API key not saved.\n'));
    return;
  }
  config.model = model;

  saveConfig(config);

  console.log();
  console.log(green('  Setup complete.'));
  console.log(gray('  Config: ') + white(getConfigPath()));
  console.log(gray('  Model:  ') + white(config.model));
  console.log(gray('  Run ') + white('yuva') + gray(' to start chatting.'));
  console.log();
}
