import readline from 'readline';
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { createProvider, PROVIDER_MODELS } from './providers/index.js';
import { executeCommand } from './tools/shell.js';
import { readFile, writeFile, listFiles } from './tools/files.js';
import { resolve } from 'path';

// ── Colors ──
const purple   = chalk.hex('#B392F0');
const purpleB  = chalk.hex('#B392F0').bold;
const white    = chalk.hex('#E1E4E8');
const whiteB   = chalk.hex('#E1E4E8').bold;
const dim      = chalk.hex('#6A737D');
const green    = chalk.hex('#85E89D');
const greenB   = chalk.hex('#85E89D').bold;
const orange   = chalk.hex('#FFAB70');
const orangeB  = chalk.hex('#FFAB70').bold;
const red      = chalk.hex('#F97583');
const blue     = chalk.hex('#79B8FF');

// ── State ──
let config = loadConfig();
let provider = createProvider(config);
let messages = [];
let currentDir = process.cwd();

// ── Separator ──
function sep() { return dim('─'.repeat(process.stdout.columns || 80)); }

// ── Welcome ──
console.clear();
console.log();
console.log(purpleB('  ✻ YUVA Code') + dim('  v1.0.0'));
console.log();
console.log(dim('  model: ') + white(config.model) + dim(' via ') + white(config.provider));
console.log(dim('  cwd:   ') + white(currentDir));
console.log();
console.log(dim('  /help for commands · !cmd run shell · /exit quit'));

// ── Readline ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  console.log();
  console.log(sep());
  rl.question(purple('❯ '), async (input) => {
    input = input.trim();
    if (!input) { prompt(); return; }
    if (input.startsWith('!')) { doShell(input.slice(1).trim()); prompt(); return; }
    if (input.startsWith('/')) { doSlash(input); prompt(); return; }
    await doChat(input);
    prompt();
  });
}

// ── Get AI response (always non-streaming to allow tool parsing) ──
async function getAIResponse() {
  try {
    return await provider.chat(messages, config.systemPrompt);
  } catch (err) {
    throw err;
  }
}

// ── Extract tool calls from response ──
function extractToolCalls(text) {
  const calls = [];
  // Strip code block wrappers
  let cleaned = text.replace(/```(?:json)?\s*\n?([\s\S]*?)```/g, '$1');

  // Try to parse the entire response as a single JSON tool call first
  try {
    const trimmed = cleaned.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"tool"')) {
      const obj = JSON.parse(trimmed);
      if (obj.tool) return [obj];
    }
  } catch {}

  // Find JSON that starts with {"tool" — use a smarter approach
  // that handles nested braces in content strings
  const toolStarts = [];
  let searchFrom = 0;
  while (true) {
    const idx = cleaned.indexOf('"tool"', searchFrom);
    if (idx === -1) break;
    // Find the opening { before this
    let braceIdx = idx - 1;
    while (braceIdx >= 0 && cleaned[braceIdx] !== '{') braceIdx--;
    if (braceIdx >= 0) toolStarts.push(braceIdx);
    searchFrom = idx + 6;
  }

  for (const start of toolStarts) {
    // Find matching closing brace, accounting for string escaping
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }

    if (end > start) {
      const jsonStr = cleaned.slice(start, end + 1);
      try {
        const obj = JSON.parse(jsonStr);
        if (obj.tool) calls.push(obj);
      } catch {
        // Try fixing escaped quotes issue
        try {
          const fixed = jsonStr.replace(/\\"/g, '"').replace(/"{/g, '{').replace(/}"/g, '}');
          const obj = JSON.parse(fixed);
          if (obj.tool) calls.push(obj);
        } catch {}
      }
    }
  }

  return calls;
}

// ── Remove tool call JSON from display text ──
function getDisplayText(text) {
  // Remove code-block-wrapped tool calls
  let display = text.replace(/```(?:json)?\s*\n?\{[^{}]*"tool"\s*:[^{}]*\}\s*\n?```/g, '');
  // Remove raw tool call JSON lines
  display = display.replace(/^\s*\{[^{}]*"tool"\s*:[^{}]*\}\s*$/gm, '');
  // Clean up multiple blank lines
  display = display.replace(/\n{3,}/g, '\n\n').trim();
  return display;
}

// ── Chat with tool loop ──
async function doChat(input) {
  messages.push({ role: 'user', content: input });
  const startTime = Date.now();

  try {
    let keepGoing = true;

    while (keepGoing) {
      // Show thinking
      process.stdout.write('\n' + greenB(' ● ') + dim('thinking...'));

      const response = await getAIResponse();

      // Clear thinking
      process.stdout.write('\r\x1b[2K');

      messages.push({ role: 'assistant', content: response });

      // Separate display text from tool calls
      const toolCalls = extractToolCalls(response);
      const displayText = getDisplayText(response);

      // Show the text part (if any)
      if (displayText) {
        console.log(greenB(' ● ') + displayText);
      }

      // Execute tool calls
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          const result = await executeToolCall(tc);
          if (result && !result.denied) {
            messages.push({
              role: 'user',
              content: `Tool "${tc.tool}" result: ${summarizeResult(result)}\n\nContinue with the next step.`
            });
          } else if (result && result.denied) {
            messages.push({
              role: 'user',
              content: `User denied the ${tc.tool} action. Skip this and continue.`
            });
          }
        }
        // Continue the loop to get next response
        keepGoing = true;
      } else {
        keepGoing = false;
      }
    }

    // Timer
    const s = Math.floor((Date.now() - startTime) / 1000);
    if (s >= 1) {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      console.log();
      console.log(dim(`  ※ Brewed for ${m > 0 ? m + 'm ' + rem + 's' : s + 's'}`));
    }
  } catch (err) {
    process.stdout.write('\r\x1b[2K');
    console.log(red(' ✗ ') + white(err.message));
    messages.pop();
  }
}

// ── Summarize tool result for AI context ──
function summarizeResult(result) {
  if (result.tool === 'shell') {
    const out = result.output || '';
    return result.success
      ? `Command succeeded.${out ? '\nOutput:\n' + out.slice(0, 1000) : ''}`
      : `Command failed: ${result.error || 'unknown error'}`;
  }
  if (result.tool === 'write_file') return 'File written successfully.';
  if (result.tool === 'read_file') return result.success ? `File content:\n${result.content.slice(0, 3000)}` : `Failed: ${result.error}`;
  if (result.tool === 'list_files') return result.success ? `Files:\n${result.files.join('\n')}` : `Failed: ${result.error}`;
  return JSON.stringify(result).slice(0, 500);
}

// ── Execute a tool call ──
async function executeToolCall(tc) {
  // ── Shell (needs permission) ──
  if (tc.tool === 'shell') {
    console.log();
    console.log(orangeB(' ● ') + whiteB('Bash') + dim(`(${tc.command})`));
    const approved = await ask(dim('   ') + orange('Allow? ') + dim('(y/n) '));
    if (!approved) {
      console.log(dim('   ⎿ ') + orange('Skipped'));
      return { tool: 'shell', denied: true };
    }
    const result = executeCommand(tc.command, currentDir);
    if (result.output) showLines(result.output.split('\n'));
    if (result.error) console.log(dim('   ⎿ ') + red(result.error));
    return { tool: 'shell', ...result };
  }

  // ── Write file (needs permission) ──
  if (tc.tool === 'write_file') {
    let content = tc.content || '';
    if (typeof content === 'string') {
      content = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    }
    const lineCount = content.split('\n').length;
    const fp = resolve(currentDir, tc.path);

    console.log();
    console.log(orangeB(' ● ') + whiteB('Write') + dim(`(${tc.path}, ${lineCount} lines)`));
    const approved = await ask(dim('   ') + orange('Allow? ') + dim('(y/n) '));
    if (!approved) {
      console.log(dim('   ⎿ ') + orange('Skipped'));
      return { tool: 'write_file', denied: true };
    }
    const result = writeFile(fp, content);
    console.log(dim('   ⎿ ') + (result.success ? green('✓ Written') : red(result.error)));
    return { tool: 'write_file', ...result };
  }

  // ── Read file (automatic, no permission) ──
  if (tc.tool === 'read_file') {
    const fp = resolve(currentDir, tc.path);
    console.log();
    console.log(greenB(' ● ') + whiteB('Read') + dim(`(${tc.path})`));
    const result = readFile(fp);
    if (result.success) {
      const lines = result.content.split('\n');
      showLines(lines.slice(0, 20));
      if (lines.length > 20) console.log(dim(`   ⎿ … +${lines.length - 20} lines`));
    } else {
      console.log(dim('   ⎿ ') + red(result.error));
    }
    return { tool: 'read_file', ...result };
  }

  // ── List files (automatic, no permission) ──
  if (tc.tool === 'list_files') {
    const fp = resolve(currentDir, tc.path || '.');
    console.log();
    console.log(greenB(' ● ') + whiteB('List') + dim(`(${tc.path || '.'})`));
    const result = listFiles(fp);
    if (result.success) {
      showLines(result.files.slice(0, 40));
    } else {
      console.log(dim('   ⎿ ') + red(result.error));
    }
    return { tool: 'list_files', ...result };
  }

  return null;
}

function showLines(lines) {
  const show = lines.slice(0, 30);
  for (let i = 0; i < show.length; i++) {
    const sym = i === show.length - 1 ? '⎿' : '│';
    console.log(dim(`   ${sym} `) + white(show[i]));
  }
  if (lines.length > 30) console.log(dim(`   ⎿ … +${lines.length - 30} lines`));
}

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      resolve(ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes');
    });
  });
}

// ── Shell ──
function doShell(cmd) {
  console.log();
  console.log(orangeB(' ● ') + whiteB('Bash') + dim(`(${cmd})`));
  const result = executeCommand(cmd, currentDir);
  if (result.output) showLines(result.output.split('\n'));
  if (result.error) console.log(dim('   ⎿ ') + red(result.error));
}

// ── Slash commands ──
function doSlash(input) {
  const parts = input.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      console.log();
      console.log(whiteB('  Commands'));
      console.log();
      [
        ['/help',           'Show this help'],
        ['/clear',          'Clear conversation'],
        ['/model <name>',   'Change AI model'],
        ['/provider <name>','Switch provider'],
        ['/config',         'Show config path'],
        ['/cd <path>',      'Change directory'],
        ['/history',        'Show history'],
        ['/exit',           'Quit'],
        ['!<command>',      'Run shell command'],
      ].forEach(([c, d]) => console.log(blue(`    ${c.padEnd(20)}`) + dim(d)));
      break;
    case '/clear':
      messages = [];
      console.clear();
      console.log();
      console.log(purpleB('  ✻ YUVA Code') + dim('  v1.0.0'));
      console.log();
      console.log(greenB(' ● ') + white('Conversation cleared'));
      break;
    case '/model':
      if (parts[1]) {
        config.model = parts.slice(1).join(' ');
        saveConfig(config); provider = createProvider(config);
        console.log(); console.log(greenB(' ● ') + white(`Model: ${config.model}`));
      } else {
        console.log(); console.log(white(`  Current: ${config.model}`));
        (PROVIDER_MODELS[config.provider] || []).forEach(m => console.log(dim('    ') + white(m)));
      }
      break;
    case '/provider':
      if (parts[1]) {
        const pp = parts[1].toLowerCase();
        if (['gemini','ollama','groq','openrouter'].includes(pp)) {
          config.provider = pp; config.model = PROVIDER_MODELS[pp][0];
          saveConfig(config); provider = createProvider(config);
          console.log(); console.log(greenB(' ● ') + white(`${config.provider} / ${config.model}`));
        } else console.log(red(' ✗ Use: gemini, ollama, groq, openrouter'));
      } else {
        console.log(white(`  Current: ${config.provider}`));
        console.log(dim('  Available: gemini, ollama, groq, openrouter'));
      }
      break;
    case '/config':
      console.log();
      console.log(dim('  Config:   ') + white(getConfigPath()));
      console.log(dim('  Provider: ') + white(config.provider));
      console.log(dim('  Model:    ') + white(config.model));
      break;
    case '/cd':
      if (parts[1]) {
        try {
          process.chdir(parts.slice(1).join(' '));
          currentDir = process.cwd();
          console.log(); console.log(greenB(' ● ') + white(currentDir));
        } catch { console.log(red(' ✗ Directory not found')); }
      } else console.log(white(`  ${currentDir}`));
      break;
    case '/history':
      console.log();
      if (!messages.length) console.log(dim('  No messages yet.'));
      else messages.forEach(m => {
        const role = m.role === 'user' ? dim('  you  ') : purple('  yuva ');
        console.log(role + dim(m.content.slice(0, 60) + (m.content.length > 60 ? '...' : '')));
      });
      break;
    case '/exit': case '/quit':
      console.log(dim('\n  Goodbye!\n')); process.exit(0);
    default:
      console.log(red(` ✗ Unknown: ${cmd}. Type /help`));
  }
}

rl.on('close', () => { console.log(dim('\n  Goodbye!\n')); process.exit(0); });

// ── Start ──
prompt();
