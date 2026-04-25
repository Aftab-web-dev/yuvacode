import chalk from 'chalk';

// ── Claude Code color palette ──
const accent  = chalk.hex('#B392F0');
const accentB = chalk.hex('#B392F0').bold;
const txt     = chalk.hex('#E1E4E8');
const txtB    = chalk.hex('#E1E4E8').bold;
const muted   = chalk.hex('#6A737D');
const ok      = chalk.hex('#85E89D');
const okB     = chalk.hex('#85E89D').bold;
const warn    = chalk.hex('#FFAB70');
const warnB   = chalk.hex('#FFAB70').bold;
const err     = chalk.hex('#F97583');
const info    = chalk.hex('#79B8FF');

let msgTimer = 0;

// ── Separator line ──
function sep() {
  const cols = process.stdout.columns || 80;
  return muted('─'.repeat(cols));
}

// ── Bottom bar: separator + prompt + separator + hint ──
export function drawBottomBar() {
  // Save cursor position
  process.stdout.write('\x1b7');
  // Write separator below prompt, then hint
  process.stdout.write('\n' + sep());
  process.stdout.write('\n' + muted('  ? for shortcuts'));
  // Move back up 2 lines to the prompt line
  process.stdout.write('\x1b8');
}

export function getPromptWithSep() {
  // Print separator above prompt, then the prompt character
  return '\n' + sep() + '\n' + accent('❯ ');
}

export function showWelcome(config) {
  console.clear();
  console.log();
  console.log(accentB('  ✻ YUVA Code') + muted('  v1.0.0'));
  console.log();
  console.log(muted('  model: ') + txt(config.model) + muted(' via ') + txt(config.provider));
  console.log(muted('  cwd:   ') + txt(process.cwd()));
  console.log();
  console.log(muted('  Tips: ') + txt('/help') + muted(' for commands · ') + txt('!cmd') + muted(' run shell · ') + txt('/exit') + muted(' quit'));
}

// ── Response formatting ──

export function startMsg() {
  msgTimer = Date.now();
  console.log();
}

export function writeGreenDot() {
  process.stdout.write(okB(' ● '));
}

export function endMsg() {
  console.log();
  const elapsed = Date.now() - msgTimer;
  const s = Math.floor(elapsed / 1000);
  if (s >= 1) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    const t = m > 0 ? `${m}m ${r}s` : `${s}s`;
    console.log(muted(`  ※ Brewed for ${t}`));
  }
}

// ── Tool calls ──

export function toolHeader(name, detail) {
  console.log();
  console.log(warnB(' ● ') + txtB(name) + muted(`(${truncate(detail, 60)})`));
}

export function toolOutputLine(line, isLast) {
  const sym = isLast ? '⎿' : '│';
  console.log(muted(`   ${sym} `) + txt(line));
}

export function toolOutput(lines) {
  if (!lines || lines.length === 0) return;
  const show = lines.slice(0, 30);
  for (let i = 0; i < show.length; i++) {
    toolOutputLine(show[i], i === show.length - 1 && lines.length <= 30);
  }
  if (lines.length > 30) {
    console.log(muted(`   ⎿ … +${lines.length - 30} lines`));
  }
}

export function toolDenied() {
  console.log(muted('   ⎿ ') + warn('Skipped by user'));
}

export function toolErr(message) {
  console.log(muted('   ⎿ ') + err(message));
}

export function approvalPrompt() {
  return muted('   ') + warn('Allow? ') + muted('(y/n) ');
}

// ── Slash commands ──

export function showHelp() {
  console.log();
  console.log(txtB('  Commands'));
  console.log();
  const cmds = [
    ['/help',           'Show this help'],
    ['/clear',          'Clear conversation'],
    ['/model <name>',   'Change AI model'],
    ['/provider <name>','Switch provider'],
    ['/config',         'Show config path'],
    ['/cd <path>',      'Change directory'],
    ['/history',        'Show history'],
    ['/exit',           'Quit'],
    ['!<command>',      'Run shell command'],
  ];
  for (const [c, d] of cmds) {
    console.log(info(`    ${c.padEnd(20)}`) + muted(d));
  }
  console.log();
}

// ── Utilities ──

export function msgOk(text)   { console.log(okB(' ● ') + txt(text)); }
export function msgErr(text)  { console.log(err(' ✗ ') + txt(text)); }
export function msgInfo(text) { console.log(muted('   ' + text)); }

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

export { accent, accentB, txt, txtB, muted, ok, okB, warn, warnB, err, info };
