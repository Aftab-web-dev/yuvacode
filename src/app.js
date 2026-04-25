import readline from 'node:readline';
import chalk from 'chalk';
import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { NVIDIAClient, NVIDIA_MODELS, MODELS, PROVIDERS, getModelsForProvider, getEndpointForProvider, fetchLocalModels } from './nvidia.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { select, input, password } from '@inquirer/prompts';

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
const cyan = chalk.hex('#56D4DD');
const yellow = chalk.hex('#E3B341');

// ── State ──
let config = loadConfig();
let client = new NVIDIAClient({
  apiKey: config.apiKey,
  model: config.model,
  provider: config.provider || 'nvidia',
  customEndpoint: config.customEndpoint
});
let messages = [];
let currentDir = process.cwd();
const sessionAllow = new Set();

const MAX_TOOL_CALLS_PER_TURN = 30;
const REPETITION_THRESHOLD = 3;

// ── Session Tracking ──
const editHistory = [];      // { path, backupContent, action } for /undo
const changedFiles = new Set(); // All files modified this session for /diff
let tokenEstimate = 0;       // Rough token counter
const commandHistory = [];    // User input history for arrow keys
let lastAIResponse = '';      // For /copy

// ── Animated Spinner ──
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerTimer = null;
let spinnerFrame = 0;

function startSpinner(label = 'thinking') {
  spinnerFrame = 0;
  spinnerTimer = setInterval(() => {
    const frame = purple(SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]);
    process.stdout.write(`\r\x1b[2K ${frame} ${dim(label + '...')}`);
    spinnerFrame++;
  }, 80);
}

function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    process.stdout.write('\r\x1b[2K');
  }
}

// ── Markdown Renderer ──
function renderMarkdown(text) {
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockLang = '';
  const rendered = [];

  for (const line of lines) {
    // Code block start/end
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        rendered.push(dim('   ┌─') + (codeBlockLang ? dim(` ${codeBlockLang} `) : '') + dim('─'.repeat(30)));
      } else {
        inCodeBlock = false;
        codeBlockLang = '';
        rendered.push(dim('   └' + '─'.repeat(35)));
      }
      continue;
    }

    if (inCodeBlock) {
      rendered.push(dim('   │ ') + cyan(line));
      continue;
    }

    let processed = line;

    // Headers
    if (processed.startsWith('### ')) {
      rendered.push('   ' + orangeB(processed.slice(4)));
      continue;
    }
    if (processed.startsWith('## ')) {
      rendered.push('   ' + purpleB(processed.slice(3)));
      continue;
    }
    if (processed.startsWith('# ')) {
      rendered.push('   ' + whiteB(processed.slice(2)));
      continue;
    }

    // Bullet points
    if (/^\s*[-*]\s/.test(processed)) {
      processed = processed.replace(/^(\s*)[-*]\s/, '$1' + dim('  • '));
    }
    // Numbered lists
    if (/^\s*\d+\.\s/.test(processed)) {
      processed = processed.replace(/^(\s*)(\d+)\.\s/, '$1' + orange('$2. '));
    }

    // Inline code `...`
    processed = processed.replace(/`([^`]+)`/g, (_, code) => cyan(code));
    // Bold **...**
    processed = processed.replace(/\*\*([^*]+)\*\*/g, (_, text) => whiteB(text));
    // Italic *...*
    processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, text) => chalk.italic(text));

    rendered.push(processed);
  }

  return rendered.join('\n');
}

// ── UI helpers ──
function sep() { return dim('─'.repeat(process.stdout.columns || 80)); }

function padNum(n, width) { return String(n).padStart(width, ' '); }

function showLines(lines, max = 30) {
  const show = lines.slice(0, max);
  for (let i = 0; i < show.length; i++) {
    const sym = i === show.length - 1 && lines.length <= max ? '⎿' : '│';
    console.log(dim(`   ${sym} `) + white(show[i]));
  }
  if (lines.length > max) console.log(dim(`   ⎿ … +${lines.length - max} more lines`));
}

function showNumberedLines(content, max = 25, color = white) {
  const lines = content.split('\n');
  const total = lines.length;
  const show = lines.slice(0, max);
  const pad = String(Math.min(total, max)).length;
  for (let i = 0; i < show.length; i++) {
    const num = dim(padNum(i + 1, pad) + ' │ ');
    console.log(dim('   ') + num + color(show[i]));
  }
  if (total > max) {
    console.log(dim(`   ${''.padStart(pad, ' ')} ⎿ … +${total - max} more lines (${total} total)`));
  }
}

function showDiff(search, replace, maxLines = 12) {
  const oldLines = search.split('\n');
  const newLines = replace.split('\n');
  const showOld = oldLines.slice(0, maxLines);
  const showNew = newLines.slice(0, maxLines);

  for (let i = 0; i < showOld.length; i++) {
    console.log(dim('   ') + red('  - ') + red(showOld[i]));
  }
  if (oldLines.length > maxLines) console.log(dim(`       … +${oldLines.length - maxLines} more removed`));

  for (let i = 0; i < showNew.length; i++) {
    console.log(dim('   ') + green('  + ') + green(showNew[i]));
  }
  if (newLines.length > maxLines) console.log(dim(`       … +${newLines.length - maxLines} more added`));
}

function showTree(entries) {
  // Build proper tree indentation for recursive paths
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isLast = i === entries.length - 1 || 
      (i < entries.length - 1 && !entries[i + 1].startsWith(e.split('/').slice(0, -1).join('/') || '___'));
    
    // Calculate depth from path separators
    const depth = (e.match(/\//g) || []).length;
    const isDir = e.endsWith('/') || e.includes('(skipped)');
    const name = e.split('/').pop() || e;
    
    if (depth === 0) {
      const connector = isLast ? '└── ' : '├── ';
      console.log(dim('   ') + dim(connector) + (isDir ? blue(name) : white(name)));
    } else {
      const indent = '   ' + dim('│   ').repeat(Math.min(depth, 4));
      const nextSameDepth = entries.slice(i + 1).some(x => (x.match(/\//g) || []).length === depth);
      const connector = nextSameDepth ? '├── ' : '└── ';
      console.log(indent + dim(connector) + (isDir ? blue(name) : dim(name)));
    }
  }
}

function maskKey(k) {
  if (!k) return '(none)';
  if (k.length <= 10) return '***';
  return k.slice(0, 7) + '…' + k.slice(-4);
}

// ── Banner ──
function banner() {
  console.clear();
  const g1 = chalk.hex('#B392F0');
  const g3 = chalk.hex('#7C3AED');
  const w = Math.min(process.stdout.columns || 60, 60);
  console.log();
  console.log(g3('  ' + '─'.repeat(w - 4)));
  console.log(g1.bold('  ✻ YUVA Code') + dim('  v1.0.0'));
  console.log(dim('  AI-Powered Coding Assistant'));
  console.log(g3('  ' + '─'.repeat(w - 4)));
  console.log();
  console.log(dim('  model ') + purple('→ ') + white(config.model));
  console.log(dim('  cwd   ') + purple('→ ') + white(currentDir));
  const providerName = PROVIDERS[config.provider || 'nvidia']?.name || config.provider || 'nvidia';
  console.log(dim('  using ') + purple('→ ') + (config.provider === 'nvidia' || !config.provider ? green(providerName) : orange(providerName)));
  console.log();
  console.log(dim('  /help · /model · /provider · /clear · /exit'));
}

// ── Permission asker ──
async function askPermission(toolName, args) {
  console.log();
  if (toolName === 'write_file') {
    const lines = (args.content || '').split('\n');
    const badge = chalk.bgHex('#FFAB70').hex('#000').bold(' WRITE ');
    console.log(` ${badge} ` + purple(args.path) + dim(` (${lines.length} lines)`));
    showNumberedLines(args.content || '', 8, dim);
  } else if (toolName === 'edit_file') {
    const badge = chalk.bgHex('#79B8FF').hex('#000').bold(' EDIT ');
    console.log(` ${badge} ` + purple(args.path));
    showDiff(args.search || '', args.replace || '', 5);
  } else if (toolName === 'shell') {
    const badge = chalk.bgHex('#E3B341').hex('#000').bold(' SHELL ');
    console.log(` ${badge} ` + white(args.command));
  } else if (toolName === 'delete_file') {
    const badge = chalk.bgHex('#F97583').hex('#000').bold(' DELETE ');
    console.log(` ${badge} ` + red(args.path));
  } else {
    const badge = chalk.bgHex('#6A737D').hex('#fff').bold(` ${toolName.toUpperCase()} `);
    const summary = JSON.stringify(args).slice(0, 80);
    console.log(` ${badge} ` + dim(summary));
  }
  return new Promise((resolveP) => {
    rl.question(dim('   ') + orange('Allow? ') + dim('[') + green('y') + dim('/') + red('n') + dim('/') + blue('a') + dim('=always] '), (ans) => {
      const v = ans.trim().toLowerCase();
      if (v === 'a' || v === 'always') resolveP('always');
      else if (v === 'y' || v === 'yes') resolveP('yes');
      else resolveP('no');
    });
  });
}

// ── Pretty print tool result ──
function printToolResult(name, args, result) {
  console.log();

  if (!result.ok) {
    const label = chalk.bgHex('#F97583').hex('#000').bold(' FAIL ');
    console.log(` ${label} ` + whiteB(name.replace(/_/g, ' ')) + dim(` ${args.path || args.command || ''}`));
    console.log(dim('   ⎿ ') + red(result.error || 'failed'));
    if (name === 'shell') {
      if (result.stdout) showLines(result.stdout.split('\n').filter(Boolean));
      if (result.stderr) showLines(result.stderr.split('\n').filter(Boolean).map(l => red(l)));
    }
    return;
  }

  if (name === 'read_file') {
    const lines = (result.content || '').split('\n');
    console.log(greenB(' ⎘ ') + whiteB('Read ') + blue(args.path) + dim(` (${lines.length} lines)`));
    showNumberedLines(result.content || '', 25);
    if (result.truncated) console.log(dim('   ⎿ ') + orange('⚠ File was truncated'));

  } else if (name === 'list_files') {
    console.log(greenB(' 📁 ') + whiteB('Directory ') + blue(args.path || '.'));
    showTree(result.entries || []);

  } else if (name === 'shell') {
    console.log(greenB(' $ ') + whiteB('Shell ') + dim('→ ') + white(args.command));
    if (result.stdout) showLines(result.stdout.split('\n').filter(Boolean));
    if (result.stderr) showLines(result.stderr.split('\n').filter(Boolean).map(l => red(l)));
    console.log(dim(`   ⎿ exit ${result.exit_code}`) + (result.truncated ? orange(' (output truncated)') : ''));

  } else if (name === 'write_file') {
    const lines = (args.content || '').split('\n');
    console.log(greenB(' ✚ ') + whiteB('Created ') + blue(args.path) + dim(` (${lines.length} lines)`));
    showNumberedLines(args.content || '', 15, green);

  } else if (name === 'edit_file') {
    const oldLines = (args.search || '').split('\n').length;
    const newLines = (args.replace || '').split('\n').length;
    console.log(greenB(' ✎ ') + whiteB('Edited ') + blue(args.path) + dim(` (${oldLines} → ${newLines} lines)`));
    showDiff(args.search || '', args.replace || '', 10);

  } else if (name === 'grep_search') {
    console.log(greenB(' 🔍 ') + whiteB('Search ') + purple(`"${args.pattern}"`) + dim(` in ${args.path || '.'}`));
    const matches = result.results || [];
    for (const m of matches.slice(0, 20)) {
      console.log(dim('   ') + blue(m.file) + dim(':') + orange(String(m.line)) + dim(' │ ') + white(m.content));
    }
    if (matches.length > 20) console.log(dim(`   ⎿ … +${matches.length - 20} more matches`));
    if (matches.length === 0) console.log(dim('   ⎿ No matches found'));

  } else if (name === 'delete_file') {
    console.log(red(' 🗑 ') + whiteB('Deleted ') + red(args.path));
  }
}

// ── Tool call signature for repetition detection ──
function tcSignature(tc) {
  return `${tc.name}::${JSON.stringify(tc.args)}`;
}

// ── Auto-context: gather project info to inject into system prompt ──
async function gatherProjectContext() {
  let context = '';
  try {
    // Get project tree
    const { executeTool: exec } = await import('./tools.js');
    const tree = await exec('list_files', { path: '.', recursive: true }, { cwd: currentDir, sessionAllow: new Set(), askPermission: async () => 'yes' });
    if (tree.ok && tree.entries && tree.entries.length > 0) {
      context += `\n[Project Context]\nProject tree (${tree.total} entries):\n`;
      context += tree.entries.slice(0, 100).join('\n');
      if (tree.total > 100) context += `\n... +${tree.total - 100} more files`;
    }

    // Try to read package.json for dependency context
    const pkg = await exec('read_file', { path: 'package.json' }, { cwd: currentDir, sessionAllow: new Set(), askPermission: async () => 'yes' });
    if (pkg.ok && pkg.content) {
      try {
        const parsed = JSON.parse(pkg.content);
        const deps = Object.keys(parsed.dependencies || {});
        const devDeps = Object.keys(parsed.devDependencies || {});
        if (deps.length > 0 || devDeps.length > 0) {
          context += `\n\npackage.json summary:`;
          context += `\n  name: ${parsed.name || 'unknown'}`;
          if (deps.length > 0) context += `\n  dependencies: ${deps.join(', ')}`;
          if (devDeps.length > 0) context += `\n  devDependencies: ${devDeps.join(', ')}`;
          if (parsed.scripts) context += `\n  scripts: ${Object.keys(parsed.scripts).join(', ')}`;
        }
      } catch { /* not valid JSON */ }
    }
  } catch { /* ignore context gathering errors */ }
  return context;
}

// ── Chat turn ──
async function doChat(input) {
  messages.push({ role: 'user', content: input });
  const startTime = Date.now();
  let toolCallsThisTurn = 0;
  const recentSignatures = [];
  const filesWrittenThisTurn = new Set();

  // Auto-gather project context on first message
  let projectContext = '';
  if (messages.filter(m => m.role === 'user').length === 1) {
    projectContext = await gatherProjectContext();
  }

  // Context window management: trim old messages if conversation is too long
  // Rough estimate: 1 token ≈ 4 characters. Keep under ~12k tokens for messages.
  const MAX_CONTEXT_CHARS = 48_000; // ~12k tokens
  function trimContext() {
    let totalChars = messages.reduce((sum, m) => {
      let chars = (m.content || '').length;
      if (m.tool_calls) chars += JSON.stringify(m.tool_calls).length;
      return sum + chars;
    }, 0);

    // Keep at least the last 4 messages (current user msg + last exchange)
    while (totalChars > MAX_CONTEXT_CHARS && messages.length > 4) {
      const removed = messages.shift();
      totalChars -= (removed.content || '').length;
      if (removed.tool_calls) totalChars -= JSON.stringify(removed.tool_calls).length;
    }
  }
  trimContext();

  try {
    while (true) {
      let streamedContent = '';
      let firstChunk = true;
      const dynamicSystemPrompt = `${config.systemPrompt}\n\n[System Info]\nCurrent OS: ${process.platform}\nCurrent Working Directory: ${currentDir}${projectContext}`;
      
      const spinnerLabel = toolCallsThisTurn > 0 ? `working (${toolCallsThisTurn} tools used)` : 'thinking';
      startSpinner(spinnerLabel);
      const { content, toolCalls } = await client.chat(messages, dynamicSystemPrompt, TOOL_SCHEMAS, (chunk) => {
        if (firstChunk) {
          stopSpinner();
          firstChunk = false;
        }
        streamedContent += chunk;
        // Show live progress so user knows data is arriving
        const chars = streamedContent.length;
        process.stdout.write(`\r\x1b[2K ${purple('⠸')} ${dim(`receiving... ${chars} chars`)}`);
      });

      stopSpinner(); // Ensure spinner is stopped
      process.stdout.write('\r\x1b[2K'); // Clear the progress line

      // Render the AI response with markdown formatting
      if (streamedContent.trim()) {
        lastAIResponse = streamedContent.trim();
        const formatted = renderMarkdown(lastAIResponse);
        const lines = formatted.split('\n');
        for (const line of lines) {
          console.log(purple(' │ ') + line);
        }
      } else if (firstChunk) {
        // No text content at all (pure tool calls), nothing to display
      }

      // Track token usage (rough: 1 token ≈ 4 chars)
      tokenEstimate += Math.ceil((streamedContent.length + (content || '').length) / 4);

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
        // Dedup: skip writing the same file twice in one turn
        if (tc.name === 'write_file' && filesWrittenThisTurn.has(tc.args.path)) {
          console.log();
          console.log(orange(' ⚠ ') + dim(`Skipped duplicate write to ${tc.args.path}`));
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: true, skipped: true, message: `DUPLICATE: ${tc.args.path} was already written this turn. Move on to the NEXT file.` })
          });
          continue;
        }

        const result = await executeTool(tc.name, tc.args, {
          cwd: currentDir,
          askPermission,
          sessionAllow
        });
        printToolResult(tc.name, tc.args, result);

        // Track for /undo: save backup before write/edit
        if ((tc.name === 'write_file' || tc.name === 'edit_file') && result.ok) {
          const filePath = resolve(currentDir, tc.args.path);
          // Save the PREVIOUS content (before this change) for undo
          let backupContent = null;
          if (tc.name === 'edit_file') {
            try { backupContent = readFileSync(filePath, 'utf-8'); } catch { backupContent = null; }
          }
          editHistory.push({
            path: tc.args.path,
            fullPath: filePath,
            action: tc.name === 'write_file' ? 'created' : 'edited',
            backupContent, // null for new files (delete on undo), string for edits (restore on undo)
            previouslyExisted: result.overwritten || tc.name === 'edit_file'
          });
          changedFiles.add(tc.args.path);
          filesWrittenThisTurn.add(tc.args.path);
        } else if (tc.name === 'delete_file' && result.ok) {
          changedFiles.add(tc.args.path);
        }

        // Compact tool results to save tokens — the model already knows
        // what it wrote, so don't echo full file contents back
        let toolResult;
        if (tc.name === 'write_file' && result.ok) {
          toolResult = { ok: true, lines: result.lines, overwritten: result.overwritten, message: result.message };
        } else if (tc.name === 'edit_file' && result.ok) {
          toolResult = { ok: true, lines_changed: result.lines_changed, message: `File edited successfully: ${tc.args.path}` };
        } else {
          toolResult = result;
        }

        let toolContent = JSON.stringify(toolResult);
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
      const timeStr = m > 0 ? `${m}m ${rem}s` : `${s}s`;
      const toolStr = toolCallsThisTurn > 0 ? ` · ${toolCallsThisTurn} tools` : '';
      const fileStr = filesWrittenThisTurn.size > 0 ? ` · ${filesWrittenThisTurn.size} files` : '';
      console.log();
      console.log(dim(`  ※ Brewed for ${timeStr}${toolStr}${fileStr}`));
    }
  } catch (err) {
    stopSpinner();
    process.stdout.write('\r\x1b[2K');
    console.log();
    console.log(red(' ✗ ') + white(err.message));

    if (err.message.includes('429') || err.message.includes('502') || err.message.includes('503') || err.message.includes('504') || err.message.includes('Rate') || err.message.includes('timed out') || err.message.includes('overloaded')) {
      // Rate limit / server error — keep conversation intact so user can type "continue"
      console.log();
      console.log(orange('  💡 Progress saved. Type "continue" to retry, or /model to switch models.'));
    } else {
      // Other errors — pop partial messages
      while (messages.length > 0 && messages[messages.length - 1].role !== 'user') messages.pop();
      messages.pop(); // Pop the user message
      if (rl) rl.write(input);
    }
  }
}

// ── Slash commands ──
async function doSlash(input) {
  const parts = input.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      console.log();
      console.log(purpleB('  ⌘ Commands'));
      console.log();
      [
        ['/help',         'Show this help'],
        ['/model',        'Switch AI model'],
        ['/provider',     'Switch provider (OpenAI, Gemini, etc.)'],
        ['/undo',         'Revert last file change'],
        ['/diff',         'Show all files changed this session'],
        ['/save',         'Export conversation to markdown'],
        ['/cost',         'Show token usage stats'],
        ['/clear',        'Clear conversation & reset'],
        ['/config',       'Show config path & API key'],
        ['/cd <path>',    'Change working directory'],
        ['/exit',         'Quit YUVA Code'],
        ['!<command>',    'Run shell directly (no approval needed)']
      ].forEach(([c, d]) => {
        console.log(purple('    ' + c.padEnd(18)) + dim(d));
      });
      console.log();
      console.log(dim('  Tips: Press Tab to auto-complete commands'));
      break;

    case '/clear':
      messages = [];
      banner();
      console.log();
      console.log(greenB(' ● ') + white('Conversation cleared'));
      break;

    case '/model':
      try {
        const currentProvider = config.provider || 'nvidia';
        const provInfo = PROVIDERS[currentProvider];
        let models;

        // For local providers, try to fetch live model list
        if (provInfo?.local) {
          const liveModels = await fetchLocalModels(currentProvider);
          models = liveModels.length > 0 ? liveModels : getModelsForProvider(currentProvider);
          if (liveModels.length > 0) {
            console.log(green(`  ✓ ${liveModels.length} models detected from ${provInfo.name}`));
          } else {
            console.log(orange(`  ⚠ ${provInfo.name} not reachable, using preset list`));
          }
        } else {
          models = getModelsForProvider(currentProvider);
        }

        if (models.length === 0) {
          console.log(orange('  No preset models for this provider. Use /model <model-id> to set manually.'));
          break;
        }
        const newModel = await select({
          message: `Choose model (${provInfo?.name || currentProvider}):`,
          default: config.model,
          choices: models.map(m => ({
            name: `${m.name}  ${dim(`(${m.tag})`)}`,
            value: m.id
          })),
          loop: false
        });
        config.model = newModel;
        saveConfig(config);
        client = new NVIDIAClient({ apiKey: config.apiKey, model: config.model, provider: currentProvider, customEndpoint: config.customEndpoint });
        console.log(); console.log(greenB(' ● ') + white(`Model: ${config.model}`));
      } catch {
        console.log(dim('  cancelled'));
      }
      break;

    case '/provider':
      try {
        const providerChoice = await select({
          message: 'Choose AI provider:',
          default: config.provider || 'nvidia',
          choices: Object.entries(PROVIDERS).map(([key, p]) => {
            let label = p.name;
            if (p.local) label += green(' (LOCAL · FREE)');
            else if (p.free) label += green(' (FREE)');
            else label += orange(' (API key required)');
            return { name: label, value: key };
          }),
          loop: false
        });

        config.provider = providerChoice;
        const providerInfo = PROVIDERS[providerChoice];

        if (providerInfo.local) {
          // ── Local provider (Ollama, LM Studio, Jan) ──
          config.customEndpoint = '';
          config.apiKey = 'local';
          console.log();
          console.log(dim(`  Connecting to ${providerInfo.name}...`));
          console.log(dim(`  Endpoint: ${providerInfo.endpoint}`));

          const localModels = await fetchLocalModels(providerChoice);
          if (localModels.length > 0) {
            console.log(green(`  ✓ Found ${localModels.length} installed models`));
            const modelChoice = await select({
              message: 'Choose model:',
              choices: localModels.map(m => ({
                name: `${m.name}  ${dim(`(${m.tag})`)}`,
                value: m.id
              })),
              loop: false
            });
            config.model = modelChoice;
          } else {
            const fallbackModels = providerInfo.models;
            if (fallbackModels.length > 0) {
              console.log(orange(`  ⚠ Couldn't connect. Is ${providerInfo.name} running?`));
              const modelChoice = await select({
                message: 'Choose model (preset list):',
                choices: fallbackModels.map(m => ({
                  name: `${m.name}  ${dim(`(${m.tag})`)}`,
                  value: m.id
                })),
                loop: false
              });
              config.model = modelChoice;
            } else {
              console.log(orange(`  ⚠ Couldn't detect models.`));
              const modelId = await input({ message: 'Model name (e.g. llama3.3:70b):' });
              config.model = modelId.trim();
            }
          }
        } else if (providerChoice === 'nvidia') {
          // ── NVIDIA (free, needs nvapi key) ──
          config.customEndpoint = '';
          console.log(dim('  Using NVIDIA NIM endpoint (free)'));
          const nvModels = getModelsForProvider('nvidia');
          const mc = await select({
            message: 'Choose model:',
            default: config.model,
            choices: nvModels.map(m => ({ name: `${m.name}  ${dim(`(${m.tag})`)}`, value: m.id })),
            loop: false
          });
          config.model = mc;
        } else if (providerChoice === 'custom') {
          // ── Custom endpoint ──
          const ep = await input({ message: 'API endpoint URL:' });
          config.customEndpoint = ep.trim();
          const ck = await password({ message: 'API key:', mask: '*' });
          config.apiKey = ck.trim();
          const mid = await input({ message: 'Model ID:' });
          config.model = mid.trim();
        } else {
          // ── Cloud provider (needs API key) ──
          console.log();
          if (providerInfo.keyUrl) console.log(dim('  Get your API key at: ') + blue(providerInfo.keyUrl));
          console.log(dim(`  Endpoint: ${providerInfo.endpoint}`));
          const ck = await password({ message: `${providerInfo.name} API key:`, mask: '*' });
          config.apiKey = ck.trim();
          config.customEndpoint = '';
          const models = getModelsForProvider(providerChoice);
          if (models.length > 0) {
            const mc = await select({
              message: 'Choose model:',
              choices: models.map(m => ({ name: `${m.name}  ${dim(`(${m.tag})`)}`, value: m.id })),
              loop: false
            });
            config.model = mc;
          }
        }

        saveConfig(config);
        client = new NVIDIAClient({ apiKey: config.apiKey, model: config.model, provider: config.provider, customEndpoint: config.customEndpoint });
        console.log(); console.log(greenB(' ● ') + white(`Provider: ${PROVIDERS[providerChoice]?.name} → ${config.model}`));
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

    case '/undo': {
      if (editHistory.length === 0) {
        console.log(orange('  No changes to undo'));
        break;
      }
      const last = editHistory.pop();
      try {
        if (last.previouslyExisted && last.backupContent !== null) {
          // Restore previous content
          writeFileSync(last.fullPath, last.backupContent);
          console.log(greenB(' ↩ ') + white(`Restored `) + blue(last.path) + dim(' to previous state'));
        } else {
          // File was newly created — delete it
          const { unlinkSync } = await import('node:fs');
          unlinkSync(last.fullPath);
          console.log(greenB(' ↩ ') + white(`Removed `) + red(last.path) + dim(' (was newly created)'));
        }
      } catch (err) {
        console.log(red(' ✗ ') + white(`Undo failed: ${err.message}`));
        editHistory.push(last); // Put it back
      }
      break;
    }

    case '/diff':
      console.log();
      if (changedFiles.size === 0) {
        console.log(dim('  No files changed this session'));
      } else {
        console.log(purpleB('  ⌘ Files Changed This Session'));
        console.log();
        let i = 0;
        for (const f of changedFiles) {
          i++;
          const exists = existsSync(resolve(currentDir, f));
          const status = exists ? green('✓ modified') : red('✗ deleted');
          console.log(dim(`    ${i}. `) + blue(f) + dim(' — ') + status);
        }
        console.log();
        console.log(dim(`  Total: ${changedFiles.size} files · ${editHistory.length} undoable changes`));
      }
      break;

    case '/save': {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `yuva-session-${timestamp}.md`;
      const savePath = resolve(currentDir, filename);
      let content = `# YUVA Code Session\n\n`;
      content += `**Date:** ${new Date().toLocaleString()}\n`;
      content += `**Model:** ${config.model}\n`;
      content += `**Provider:** ${config.provider || 'nvidia'}\n`;
      content += `**CWD:** ${currentDir}\n\n---\n\n`;
      for (const m of messages) {
        if (m.role === 'user') {
          content += `## User\n\n${m.content}\n\n`;
        } else if (m.role === 'assistant' && m.content) {
          content += `## YUVA\n\n${m.content}\n\n`;
        } else if (m.role === 'tool') {
          content += `> Tool result: \`${m.content?.slice(0, 100)}...\`\n\n`;
        }
      }
      try {
        writeFileSync(savePath, content);
        console.log(greenB(' ● ') + white(`Session saved to `) + blue(filename));
      } catch (err) {
        console.log(red(' ✗ ') + white(`Save failed: ${err.message}`));
      }
      break;
    }

    case '/cost':
      console.log();
      console.log(purpleB('  ⌘ Token Usage'));
      console.log();
      console.log(dim('  Messages:   ') + white(String(messages.length)));
      console.log(dim('  Est tokens: ') + white(`~${tokenEstimate.toLocaleString()}`));
      console.log(dim('  Files:      ') + white(String(changedFiles.size) + ' changed'));
      console.log(dim('  Edits:      ') + white(String(editHistory.length) + ' undoable'));
      if (config.provider === 'nvidia' || !config.provider) {
        console.log(dim('  Cost:       ') + green('$0.00 (NVIDIA NIM is free)'));
      } else {
        console.log(dim('  Cost:       ') + orange('Check your provider dashboard'));
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

// ── Tab Completion ──
const SLASH_COMMANDS = ['/help', '/model', '/provider', '/undo', '/diff', '/save', '/cost', '/clear', '/config', '/cd', '/exit', '/quit'];

function completer(line) {
  // Slash command completion
  if (line.startsWith('/')) {
    const hits = SLASH_COMMANDS.filter(c => c.startsWith(line.toLowerCase()));
    return [hits.length ? hits : SLASH_COMMANDS, line];
  }
  // No completion for regular text
  return [[], line];
}

// ── Readline ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, completer });

function prompt() {
  console.log();
  console.log(dim('─'.repeat(Math.min(process.stdout.columns || 60, 78))));
  rl.question(chalk.hex('#7C3AED')('❯ '), async (input) => {
    input = input.trim();
    if (!input) { prompt(); return; }
    if (input.startsWith('!')) { await doBash(input.slice(1).trim()); prompt(); return; }
    if (input.startsWith('/')) { await doSlash(input); prompt(); return; }
    await doChat(input);
    prompt();
  });
}

rl.on('close', () => {
  console.log();
  console.log(dim('  ✦ Goodbye! Happy coding.'));
  console.log();
  process.exit(0);
});

// ── Start ──
banner();
prompt();
