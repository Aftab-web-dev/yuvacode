import chalk from 'chalk';
import { loadConfig } from './config.js';

const accent = chalk.hex('#B392F0').bold;
const muted = chalk.hex('#6A737D');
const txt = chalk.hex('#E1E4E8');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log();
  console.log(accent('  ✻ YUVA Code') + muted(' — NVIDIA-powered AI Coding CLI'));
  console.log();
  console.log(txt('  Usage:'));
  console.log(muted('    yuva                  ') + txt('Start interactive chat'));
  console.log(muted('    yuva --setup, -s      ') + txt('Run setup wizard'));
  console.log(muted('    yuva --help,  -h      ') + txt('Show this help'));
  console.log(muted('    yuva --version, -v    ') + txt('Show version'));
  console.log();
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('yuva-code v1.0.0');
  process.exit(0);
}

if (args.includes('--setup') || args.includes('-s')) {
  const { runSetup } = await import('./setup.js');
  await runSetup();
  process.exit(0);
}

// First-run check: no apiKey → run setup
const cfg = loadConfig();
if (!cfg.apiKey) {
  console.log();
  console.log(muted('  No API key configured. Running setup...'));
  const { runSetup } = await import('./setup.js');
  await runSetup();
  // Reload to verify setup actually wrote a key
  const c2 = loadConfig();
  if (!c2.apiKey) process.exit(0);  // user cancelled setup
}

// Drop into chat
await import('./app.js');
