import readline from 'node:readline';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { NVIDIAClient, MODELS } from './nvidia.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { select } from '@inquirer/prompts';

// ── Colors ──
const purple = chalk.hex('#B392F0');
const purpleB = chalk.hex('#B392F0').bold;
const white = chalk.hex('#E1E4E8');
const whiteB = chalk.hex('#E1E4E8').bold;
const dim = chalk.hex('#6A737D');
const green = chalk.hex('#85E89D');
const greenB = chalk.hex('#85E89D').bold;
const orange = chalk.hex('#FFAB70');
const orangeB = chalk.hex('#FFAB70').bold;
const red = chalk.hex('#F97583');
const blue = chalk.hex('#79B8FF');

// ── State ──
let config = loadConfig();
let client = new NVIDIAClient({ apiKey: config.apiKey, model: config.model });
let messages = [];
let currentDir = process.cwd();
const sessionAllow = new Set();

const MAX_TOOL_CALLS_PER_TURN = 30;
const REPETITION_THRESHOLD = 3;

// ── UI helpers ──
function sep() { return dim('─'.repeat(process.stdout.columns || 80)); }

function showLines(lines, max = 30) {
  const show = lines.slice(0, max);
  for (let i = 0; i < show.length; i++) {
    const sym = i === show.length - 1 && lines.length <= max ? '⎿' : '│';
    console.log(dim(`   ${sym} `) + white(show[i]));
  }
  if (lines.length > max) console.log(dim(`   ⎿ … +${lines.length - max} more lines`));
}

function maskKey(k) {
  if (!k) return '(none)';
  if (k.length <= 10) return '***';
  return k.slice(0, 7) + '…' + k.slice(-4);
}

// ── Banner ──
function banner() {
  console.clear();
  console.log();
  console.log(purpleB('  ✻ YUVA Code') + dim('  v1.0.0  ') + dim('NVIDIA-powered'));
  console.log();
  console.log(dim('  model: ') + white(config.model));
  console.log(dim('  cwd:   ') + white(currentDir));
  console.log();
  console.log(dim('  /help for commands · !cmd run shell · /exit quit'));
}

// ── Permission asker ──
async function askPermission(toolName, args) {
  console.log();
  const summary = toolName === 'shell' ? `(${args.command})`
    : toolName === 'write_file' ? `(${args.path}, ${(args.content || '').split('\n').length} lines)`
    : toolName === 'edit_file' ? `(${args.path})`
    : `(${JSON.stringify(args).slice(0, 60)})`;
  console.log(orangeB(' ● ') + whiteB(toolName) + dim(' ' + summary));
  return new Promise((resolveP) => {
    rl.question(dim('   ') + orange('Allow? ') + dim('(y/n/a=always) '), (ans) => {
      const v = ans.trim().toLowerCase();
      if (v === 'a' || v === 'always') resolveP('always');
      else if (v === 'y' || v === 'yes') resolveP('yes');
      else resolveP('no');
    });
  });
}

// ── Pretty print tool result ──
function printToolResult(name, args, result) {
  const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
  const summary = name === 'shell' ? `(${args.command})`
    : name === 'list_files' ? `(${args.path || '.'})`
    : `(${args.path || ''})`;
  console.log();
  const color = result.ok ? greenB : red;
  console.log(color(' ● ') + whiteB(label) + dim(' ' + summary));
  if (!result.ok) {
    console.log(dim('   ⎿ ') + red(result.error || 'failed'));
    return;
  }
  if (name === 'read_file') {
    showLines((result.content || '').split('\n'), 20);
  } else if (name === 'list_files') {
    showLines(result.entries || [], 40);
  } else if (name === 'shell') {
    if (result.stdout) showLines(result.stdout.split('\n').filter(Boolean));
    if (result.stderr) showLines(result.stderr.split('\n').filter(Boolean).map(l => red(l)));
    console.log(dim(`   ⎿ exit ${result.exit_code}`));
  } else if (name === 'write_file') {
    console.log(dim('   ⎿ ') + green(`✓ written (${result.lines} lines)`));
  } else if (name === 'edit_file') {
    console.log(dim('   ⎿ ') + green(`✓ edited (${result.lines_changed} lines changed)`));
  }
}

// ── Tool call signature for repetition detection ──
function tcSignature(tc) {
  return `${tc.name}::${JSON.stringify(tc.args)}`;
}

// ── Chat turn ──
async function doChat(input) {
  messages.push({ role: 'user', content: input });
  const startTime = Date.now();
  let toolCallsThisTurn = 0;
  const recentSignatures = [];

  try {
    while (true) {
      process.stdout.write('\n' + greenB(' ● ') + dim('thinking...'));
      const { content, toolCalls } = await client.chat(messages, config.systemPrompt, TOOL_SCHEMAS);
      process.stdout.write('\r\x1b[2K');

      // Push assistant turn
      const assistantMsg = { role: 'assistant', content: content || null };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) }
        }));
      }
      messages.push(assistantMsg);

      // Display content
      if (content) {
        console.log(greenB(' ● ') + white(content));
      }

      // No tools = end of turn
      if (toolCalls.length === 0) break;

      // Bounds: too many tool calls
      toolCallsThisTurn += toolCalls.length;
      if (toolCallsThisTurn > MAX_TOOL_CALLS_PER_TURN) {
        console.log();
        console.log(orange('  Stopped after ' + toolCallsThisTurn + ' tool calls. Type "continue" to keep going.'));
        break;
      }

      // Bounds: repetition detection
      let repetitionBroke = false;
      for (const tc of toolCalls) {
        const sig = tcSignature(tc);
        recentSignatures.push(sig);
        if (recentSignatures.length > REPETITION_THRESHOLD) recentSignatures.shift();
        if (recentSignatures.length === REPETITION_THRESHOLD && recentSignatures.every(s => s === sig)) {
          console.log();
          console.log(orange(`  Detected loop: ${tc.name} called repeatedly with same args. Stopping.`));
          repetitionBroke = true;
          break;
        }
      }
      if (repetitionBroke) break;

      // Execute tools serially
      const MAX_TOOL_CONTENT_BYTES = 64_000;
      for (const tc of toolCalls) {
        const result = await executeTool(tc.name, tc.args, {
          cwd: currentDir,
          askPermission,
          sessionAllow
        });
        printToolResult(tc.name, tc.args, result);
        let toolContent = JSON.stringify(result);
        if (toolContent.length > MAX_TOOL_CONTENT_BYTES) {
          toolContent = toolContent.slice(0, MAX_TOOL_CONTENT_BYTES) + '... [truncated for context]';
        }
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolContent
        });
      }
    }

    const s = Math.floor((Date.now() - startTime) / 1000);
    if (s >= 1) {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      console.log();
      console.log(dim(`  ※ Brewed for ${m > 0 ? m + 'm ' + rem + 's' : s + 's'}`));
    }
  } catch (err) {
    process.stdout.write('\r\x1b[2K');
    console.log();
    console.log(red(' ✗ ') + white(err.message));
    // Pop the user message so retry works
    while (messages.length > 0 && messages[messages.length - 1].role !== 'user') messages.pop();
    messages.pop();
  }
}

// ── Slash commands ──
async function doSlash(input) {
  const parts = input.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      console.log();
      console.log(whiteB('  Commands'));
      console.log();
      [
        ['/help',         'Show this help'],
        ['/clear',        'Clear conversation'],
        ['/model',        'Switch model (interactive picker)'],
        ['/config',       'Show config path + masked API key'],
        ['/cd <path>',    'Change directory'],
        ['/exit',         'Quit'],
        ['!<command>',    'Run shell command (one-shot, no permission)']
      ].forEach(([c, d]) => console.log(blue(`    ${c.padEnd(18)}`) + dim(d)));
      break;

    case '/clear':
      messages = [];
      banner();
      console.log();
      console.log(greenB(' ● ') + white('Conversation cleared'));
      break;

    case '/model':
      try {
        const newModel = await select({
          message: 'Choose model:',
          default: config.model,
          choices: MODELS.map(m => ({ name: m.name, value: m.id })),
          loop: false
        });
        config.model = newModel;
        saveConfig(config);
        client = new NVIDIAClient({ apiKey: config.apiKey, model: config.model });
        console.log(); console.log(greenB(' ● ') + white(`Model: ${config.model}`));
      } catch {
        console.log(dim('  cancelled'));
      }
      break;

    case '/config':
      console.log();
      console.log(dim('  Config: ') + white(getConfigPath()));
      console.log(dim('  Model:  ') + white(config.model));
      console.log(dim('  Key:    ') + white(maskKey(config.apiKey)));
      break;

    case '/cd':
      if (parts[1]) {
        try {
          process.chdir(resolve(currentDir, parts.slice(1).join(' ')));
          currentDir = process.cwd();
          console.log(); console.log(greenB(' ● ') + white(currentDir));
        } catch {
          console.log(red(' ✗ Directory not found'));
        }
      } else {
        console.log(white(`  ${currentDir}`));
      }
      break;

    case '/exit':
    case '/quit':
      console.log(dim('\n  Goodbye!\n'));
      process.exit(0);
      break;

    default:
      console.log(red(` ✗ Unknown: ${cmd}. Type /help`));
  }
}

// ── Bash one-shot ──
async function doBash(cmd) {
  console.log();
  console.log(orangeB(' ● ') + whiteB('Bash') + dim(`(${cmd})`));
  const result = await executeTool('shell', { command: cmd }, {
    cwd: currentDir,
    askPermission: async () => 'always',  // ! prefix is explicit user opt-in
    sessionAllow: new Set(['shell'])
  });
  if (result.stdout) showLines(result.stdout.split('\n').filter(Boolean));
  if (result.stderr) showLines(result.stderr.split('\n').filter(Boolean).map(l => red(l)));
  if (typeof result.exit_code === 'number') console.log(dim(`   ⎿ exit ${result.exit_code}`));
  if (!result.ok && result.error) console.log(dim('   ⎿ ') + red(result.error));
}

// ── Readline ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  console.log();
  console.log(sep());
  rl.question(purple('❯ '), async (input) => {
    input = input.trim();
    if (!input) { prompt(); return; }
    if (input.startsWith('!')) { await doBash(input.slice(1).trim()); prompt(); return; }
    if (input.startsWith('/')) { await doSlash(input); prompt(); return; }
    await doChat(input);
    prompt();
  });
}

rl.on('close', () => { console.log(dim('\n  Goodbye!\n')); process.exit(0); });

// ── Start ──
banner();
prompt();
