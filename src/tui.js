import blessed from 'blessed';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { createProvider, PROVIDER_MODELS } from './providers/index.js';
import { executeCommand } from './tools/shell.js';
import { readFile, writeFile, listFiles } from './tools/files.js';
import { resolve } from 'path';

let config = loadConfig();
let provider = createProvider(config);
let messages = [];
let currentDir = process.cwd();
let msgTimer = 0;

// ── Screen ──
const screen = blessed.screen({
  smartCSR: true,
  title: 'YUVA Code',
  fullUnicode: true,
});

// ── Output area (scrollable) ──
const output = blessed.box({
  top: 0,
  left: 0,
  right: 0,
  bottom: 4,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    style: { bg: '#6A737D' },
  },
  mouse: true,
  keys: true,
  vi: true,
  tags: true,
  style: {
    fg: '#E1E4E8',
    bg: 'default',
  },
});

// ── Top separator ──
const topSep = blessed.line({
  bottom: 3,
  left: 0,
  right: 0,
  orientation: 'horizontal',
  type: 'line',
  style: { fg: '#6A737D' },
});

// ── Input area ──
const inputBox = blessed.textbox({
  bottom: 1,
  left: 2,
  right: 0,
  height: 1,
  inputOnFocus: true,
  style: {
    fg: '#E1E4E8',
    bg: 'default',
  },
});

// ── Prompt symbol ──
const promptSymbol = blessed.text({
  bottom: 1,
  left: 0,
  width: 2,
  height: 1,
  content: '{#B392F0-fg}❯{/}',
  tags: true,
  style: { bg: 'default' },
});

// ── Bottom separator ──
const bottomSep = blessed.line({
  bottom: 0,
  left: 0,
  right: 0,
  orientation: 'horizontal',
  type: 'line',
  style: { fg: '#6A737D' },
});

// ── Hint bar ──
const hintBar = blessed.text({
  bottom: -1,
  left: 0,
  right: 0,
  height: 1,
  content: '',
  tags: true,
  style: { fg: '#6A737D', bg: 'default' },
});

// Wait — blessed line widgets may not work well on all terminals.
// Let's use box-based separators instead.

// Remove line widgets and use text-based separators
const topSepBox = blessed.box({
  bottom: 3,
  left: 0,
  right: 0,
  height: 1,
  tags: true,
  style: { fg: '#6A737D', bg: 'default' },
});

const bottomSepBox = blessed.box({
  bottom: 0,
  left: 0,
  right: 0,
  height: 1,
  tags: true,
  style: { fg: '#6A737D', bg: 'default' },
});

const hintBox = blessed.box({
  bottom: -1,
  left: 1,
  right: 0,
  height: 1,
  content: '{#6A737D-fg}? for shortcuts{/}',
  tags: true,
  style: { bg: 'default' },
});

function updateSeparators() {
  const w = screen.width;
  const line = '─'.repeat(w);
  topSepBox.setContent(`{#6A737D-fg}${line}{/}`);
  bottomSepBox.setContent(`{#6A737D-fg}${line}{/}`);
}

// ── Assemble screen ──
screen.append(output);
screen.append(topSepBox);
screen.append(promptSymbol);
screen.append(inputBox);
screen.append(bottomSepBox);

// Adjust layout: move hint inside bottom separator area
bottomSepBox.bottom = 1;
const statusBar = blessed.box({
  bottom: 0,
  left: 1,
  right: 0,
  height: 1,
  content: '{#6A737D-fg}  ? for shortcuts{/}',
  tags: true,
  style: { bg: 'default' },
});
screen.append(statusBar);

// Fix positions
output.bottom = 4;
topSepBox.bottom = 3;
promptSymbol.bottom = 2;
inputBox.bottom = 2;
inputBox.left = 2;
bottomSepBox.bottom = 1;
statusBar.bottom = 0;

updateSeparators();

// ── Helper: append to output ──
function appendOutput(text) {
  const current = output.getContent();
  output.setContent(current + (current ? '\n' : '') + text);
  output.setScrollPerc(100);
  screen.render();
}

function clearOutput() {
  output.setContent('');
  screen.render();
}

// ── Color helpers using blessed tags ──
const c = {
  purple: (t) => `{#B392F0-fg}${t}{/}`,
  purpleB: (t) => `{bold}{#B392F0-fg}${t}{/}`,
  white: (t) => `{#E1E4E8-fg}${t}{/}`,
  whiteB: (t) => `{bold}{#E1E4E8-fg}${t}{/}`,
  dim: (t) => `{#6A737D-fg}${t}{/}`,
  green: (t) => `{#85E89D-fg}${t}{/}`,
  greenB: (t) => `{bold}{#85E89D-fg}${t}{/}`,
  yellow: (t) => `{#FFAB70-fg}${t}{/}`,
  yellowB: (t) => `{bold}{#FFAB70-fg}${t}{/}`,
  red: (t) => `{#F97583-fg}${t}{/}`,
  cyan: (t) => `{#79B8FF-fg}${t}{/}`,
};

// ── Welcome message ──
function showWelcome() {
  appendOutput('');
  appendOutput(c.purpleB('  ✻ YUVA Code') + c.dim('  v1.0.0'));
  appendOutput('');
  appendOutput(c.dim('  model: ') + c.white(config.model) + c.dim(' via ') + c.white(config.provider));
  appendOutput(c.dim('  cwd:   ') + c.white(currentDir));
  appendOutput('');
  appendOutput(c.dim('  Tips: ') + c.white('/help') + c.dim(' for commands · ') + c.white('!cmd') + c.dim(' run shell · ') + c.white('/exit') + c.dim(' quit'));
}

// ── Input handling ──
function focusInput() {
  inputBox.clearValue();
  inputBox.focus();
  screen.render();
}

inputBox.on('submit', async (value) => {
  const input = value.trim();
  inputBox.clearValue();
  screen.render();

  if (!input) {
    focusInput();
    return;
  }

  // Show user input in output
  appendOutput('');
  appendOutput(c.purple('❯ ') + c.whiteB(input));

  if (input.startsWith('!')) {
    await handleShell(input.slice(1).trim());
    focusInput();
    return;
  }

  if (input.startsWith('/')) {
    handleSlashCommand(input);
    focusInput();
    return;
  }

  await handleMessage(input);
  focusInput();
});

inputBox.on('cancel', () => {
  focusInput();
});

// ── Shell commands ──
async function handleShell(cmd) {
  appendOutput('');
  appendOutput(c.yellowB(' ● ') + c.whiteB('Bash') + c.dim(`(${cmd})`));
  const r = executeCommand(cmd, currentDir);
  if (r.output) {
    const lines = r.output.split('\n');
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const sym = (i === lines.length - 1 || i === 29) ? '⎿' : '│';
      appendOutput(c.dim(`   ${sym} `) + c.white(lines[i]));
    }
    if (lines.length > 30) appendOutput(c.dim(`   ⎿ … +${lines.length - 30} lines`));
  }
  if (r.error) appendOutput(c.dim('   ⎿ ') + c.red(r.error));
}

// ── Chat messages ──
async function handleMessage(input) {
  messages.push({ role: 'user', content: input });
  msgTimer = Date.now();

  appendOutput('');

  try {
    let response = '';

    // Show thinking indicator
    appendOutput(c.greenB(' ● ') + c.dim('thinking...'));

    try {
      response = await provider.chat(messages, config.systemPrompt);
    } catch (e) {
      // Remove thinking line and show error
      removeLastLine();
      appendOutput(c.red(' ✗ ') + c.white(e.message));
      messages.pop();
      return;
    }

    // Remove "thinking..." and show response
    removeLastLine();

    // Format the response
    const lines = response.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        appendOutput(c.greenB(' ● ') + lines[i]);
      } else {
        appendOutput('   ' + lines[i]);
      }
    }

    messages.push({ role: 'assistant', content: response });

    // Tool calls
    const toolCalls = extractToolCalls(response);
    for (const tc of toolCalls) {
      await handleToolCall(tc);
    }

    // Timer
    const elapsed = Date.now() - msgTimer;
    const s = Math.floor(elapsed / 1000);
    if (s >= 1) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      const t = m > 0 ? `${m}m ${r}s` : `${s}s`;
      appendOutput('');
      appendOutput(c.dim(`  ※ Brewed for ${t}`));
    }
  } catch (error) {
    appendOutput(c.red(' ✗ ') + c.white(error.message));
    messages.pop();
  }
}

function removeLastLine() {
  const content = output.getContent();
  const lines = content.split('\n');
  lines.pop();
  output.setContent(lines.join('\n'));
  screen.render();
}

// ── Tool call handling ──
async function handleToolCall(toolData) {
  switch (toolData.tool) {
    case 'shell': {
      appendOutput('');
      appendOutput(c.yellowB(' ● ') + c.whiteB('Bash') + c.dim(`(${toolData.command})`));

      // Auto-execute for now (in future: add approval dialog)
      const result = executeCommand(toolData.command, currentDir);
      if (result.success && result.output) {
        const lines = result.output.split('\n');
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          const sym = (i === lines.length - 1 || i === 29) ? '⎿' : '│';
          appendOutput(c.dim(`   ${sym} `) + c.white(lines[i]));
        }
      }
      if (result.error) appendOutput(c.dim('   ⎿ ') + c.red(result.error));

      // Feed result back to AI
      messages.push({ role: 'user', content: `Tool result: ${JSON.stringify(result)}` });
      appendOutput('');
      appendOutput(c.greenB(' ● ') + c.dim('thinking...'));

      try {
        const followUp = await provider.chat(messages, config.systemPrompt);
        removeLastLine();
        const fLines = followUp.split('\n');
        for (let i = 0; i < fLines.length; i++) {
          appendOutput(i === 0 ? c.greenB(' ● ') + fLines[i] : '   ' + fLines[i]);
        }
        messages.push({ role: 'assistant', content: followUp });
      } catch { removeLastLine(); }
      break;
    }

    case 'read_file': {
      const fullPath = resolve(currentDir, toolData.path);
      appendOutput('');
      appendOutput(c.yellowB(' ● ') + c.whiteB('Read') + c.dim(`(${fullPath})`));
      const result = readFile(fullPath);
      if (result.success) {
        const lines = result.content.split('\n').slice(0, 25);
        for (let i = 0; i < lines.length; i++) {
          const sym = i === lines.length - 1 ? '⎿' : '│';
          appendOutput(c.dim(`   ${sym} `) + c.white(lines[i]));
        }
      } else {
        appendOutput(c.dim('   ⎿ ') + c.red(result.error));
      }
      break;
    }

    case 'write_file': {
      const fullPath = resolve(currentDir, toolData.path);
      appendOutput('');
      appendOutput(c.yellowB(' ● ') + c.whiteB('Write') + c.dim(`(${fullPath})`));
      const result = writeFile(fullPath, toolData.content);
      if (result.success) {
        appendOutput(c.dim('   ⎿ ') + c.green('File written'));
      } else {
        appendOutput(c.dim('   ⎿ ') + c.red(result.error));
      }
      break;
    }

    case 'list_files': {
      const fullPath = resolve(currentDir, toolData.path || '.');
      appendOutput('');
      appendOutput(c.yellowB(' ● ') + c.whiteB('List') + c.dim(`(${fullPath})`));
      const result = listFiles(fullPath);
      if (result.success) {
        const files = result.files.slice(0, 40);
        for (let i = 0; i < files.length; i++) {
          const sym = i === files.length - 1 ? '⎿' : '│';
          appendOutput(c.dim(`   ${sym} `) + c.white(files[i]));
        }
      } else {
        appendOutput(c.dim('   ⎿ ') + c.red(result.error));
      }
      break;
    }
  }
}

function extractToolCalls(text) {
  const toolCalls = [];
  const jsonRegex = /\{[\s]*"tool"[\s]*:[\s]*"[^"]+?"[\s\S]*?\}/g;
  const matches = text.match(jsonRegex);
  if (matches) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed.tool) toolCalls.push(parsed);
      } catch { /* skip */ }
    }
  }
  return toolCalls;
}

// ── Slash commands ──
function handleSlashCommand(input) {
  const parts = input.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      appendOutput('');
      appendOutput(c.whiteB('  Commands'));
      appendOutput('');
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
      for (const [cc, d] of cmds) {
        appendOutput(c.cyan(`    ${cc.padEnd(20)}`) + c.dim(d));
      }
      appendOutput('');
      break;

    case '/clear':
      messages = [];
      clearOutput();
      showWelcome();
      appendOutput('');
      appendOutput(c.greenB(' ● ') + c.white('Conversation cleared'));
      break;

    case '/model':
      if (parts[1]) {
        config.model = parts.slice(1).join(' ');
        saveConfig(config);
        provider = createProvider(config);
        appendOutput('');
        appendOutput(c.greenB(' ● ') + c.white(`Model: ${config.model}`));
      } else {
        appendOutput('');
        appendOutput(c.white(`  Current: ${config.model}`));
        (PROVIDER_MODELS[config.provider] || []).forEach(m => appendOutput(c.dim('    ') + c.white(m)));
      }
      break;

    case '/provider':
      if (parts[1]) {
        const p = parts[1].toLowerCase();
        if (['gemini','ollama','groq','openrouter'].includes(p)) {
          config.provider = p;
          config.model = PROVIDER_MODELS[p][0];
          saveConfig(config);
          provider = createProvider(config);
          appendOutput('');
          appendOutput(c.greenB(' ● ') + c.white(`${config.provider} / ${config.model}`));
        } else {
          appendOutput(c.red(' ✗ Use: gemini, ollama, groq, openrouter'));
        }
      } else {
        appendOutput('');
        appendOutput(c.white(`  Current: ${config.provider}`));
        appendOutput(c.dim('  Available: gemini, ollama, groq, openrouter'));
      }
      break;

    case '/config':
      appendOutput('');
      appendOutput(c.dim('  Config:   ') + c.white(getConfigPath()));
      appendOutput(c.dim('  Provider: ') + c.white(config.provider));
      appendOutput(c.dim('  Model:    ') + c.white(config.model));
      break;

    case '/cd':
      if (parts[1]) {
        try {
          process.chdir(parts.slice(1).join(' '));
          currentDir = process.cwd();
          appendOutput('');
          appendOutput(c.greenB(' ● ') + c.white(currentDir));
        } catch {
          appendOutput(c.red(' ✗ Directory not found'));
        }
      } else {
        appendOutput(c.white(`\n  ${currentDir}`));
      }
      break;

    case '/history':
      appendOutput('');
      if (!messages.length) {
        appendOutput(c.dim('  No messages yet.'));
      } else {
        for (const m of messages) {
          const r = m.role === 'user' ? c.dim('  you  ') : c.purple('  yuva ');
          const preview = m.content.slice(0, 60) + (m.content.length > 60 ? '...' : '');
          appendOutput(r + c.dim(preview));
        }
      }
      break;

    case '/exit':
    case '/quit':
      process.exit(0);

    default:
      appendOutput(c.red(` ✗ Unknown: ${cmd}. Type /help`));
  }
}

// ── Key bindings ──
screen.key(['escape', 'C-c'], () => {
  process.exit(0);
});

screen.key(['?'], () => {
  // Only trigger if input is not focused
  if (screen.focused !== inputBox) {
    handleSlashCommand('/help');
    focusInput();
  }
});

// Scroll output with mouse and keys
output.key(['up'], () => { output.scroll(-1); screen.render(); });
output.key(['down'], () => { output.scroll(1); screen.render(); });
output.key(['pageup'], () => { output.scroll(-10); screen.render(); });
output.key(['pagedown'], () => { output.scroll(10); screen.render(); });

// ── Handle resize ──
screen.on('resize', () => {
  updateSeparators();
  screen.render();
});

// ── Start ──
showWelcome();
focusInput();
screen.render();
