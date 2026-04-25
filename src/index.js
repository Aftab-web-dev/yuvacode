import chalk from 'chalk';
import { runSetup } from './setup.js';

const accent = chalk.hex('#B392F0').bold;
const muted = chalk.hex('#6A737D');
const txt = chalk.hex('#E1E4E8');

const args = process.argv.slice(2);

if (args.includes('--setup') || args.includes('-s')) {
  await runSetup();
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  console.log();
  console.log(accent('  ✻ YUVA Code') + muted(' - AI Coding Assistant'));
  console.log();
  console.log(txt('  Usage:'));
  console.log(muted('    yuva              ') + txt('Start interactive chat'));
  console.log(muted('    yuva --setup      ') + txt('Run setup wizard'));
  console.log(muted('    yuva --help       ') + txt('Show this help'));
  console.log(muted('    yuva --version    ') + txt('Show version'));
  console.log();
  process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
  console.log('yuva-code v1.0.0');
  process.exit(0);
}

import('./app.js');
