import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_SYSTEM_PROMPT = `You are YUVA Code, an agentic coding assistant.

You have 5 tools: read_file, write_file, edit_file, list_files, shell. Use them to do real work — don't paste code into chat for the user to copy.

GUIDELINES:
- Use edit_file (search/replace) for small changes — much faster than rewriting whole files.
- Use write_file only when creating new files or making sweeping changes.
- Read before you edit. If you don't know what's in a file, read it first.
- Use shell for build/test/lint/git commands.
- Keep responses concise. Tool output already shows what happened.
- When you're done, say "Done." and summarize in one sentence.

EDIT_FILE RULES:
- Provide the exact substring to replace, including enough surrounding context to uniquely identify the location.
- If your search string matches multiple times, the tool will reject it — add more context and retry.
- If your search string isn't found, the tool will tell you — re-read the file to see what's actually there.`;

const DEFAULT_CONFIG = {
  apiKey: '',
  model: 'meta/llama-3.3-70b-instruct',
  systemPrompt: DEFAULT_SYSTEM_PROMPT
};

function configDir() {
  return process.env.YUVA_CONFIG_DIR || join(homedir(), '.yuva-ai');
}

function configPath() {
  return join(configDir(), 'config.json');
}

function ensureDir() {
  const d = configDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function backupCorrupt(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try { renameSync(path, `${path}.bak-${stamp}`); } catch { /* ignore */ }
}

function withDefaults(cfg) {
  return { ...DEFAULT_CONFIG, ...cfg };
}

export function loadConfig() {
  ensureDir();
  const path = configPath();

  if (!existsSync(path)) {
    const cfg = withDefaults({});
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    backupCorrupt(path);
    const cfg = withDefaults({});
    writeFileSync(path, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  return withDefaults(raw);
}

export function saveConfig(cfg) {
  ensureDir();
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

export function getConfigPath() {
  return configPath();
}
