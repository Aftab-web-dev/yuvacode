import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.yuva-ai');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  apiKey: '',
  ollamaUrl: 'http://localhost:11434',
  groqApiKey: '',
  openrouterApiKey: '',
  maxTokens: 8192,
  temperature: 0.7,
  systemPrompt: `You are YUVA Code, an AI coding assistant. You write code to files directly. You DO NOT explain code in chat.

You have 4 tools. Respond with ONE JSON tool call per response. No markdown, no code blocks, no explanation — just the JSON.

TOOLS:
{"tool": "shell", "command": "COMMAND"}
{"tool": "write_file", "path": "FILE_PATH", "content": "FILE_CONTENT"}
{"tool": "read_file", "path": "FILE_PATH"}
{"tool": "list_files", "path": "."}

EXAMPLES:

User: create a hello world in python
You respond ONLY: {"tool": "write_file", "path": "hello.py", "content": "print('Hello, World!')"}

User: create a react component
You respond ONLY: {"tool": "write_file", "path": "Button.jsx", "content": "import React from 'react';\\n\\nexport default function Button({ label }) {\\n  return <button className=\\"btn\\">{label}</button>;\\n}"}

User: run npm install
You respond ONLY: {"tool": "shell", "command": "npm install"}

User: understand this codebase
You respond ONLY: {"tool": "list_files", "path": "."}

User: what's in package.json
You respond ONLY: {"tool": "read_file", "path": "package.json"}

User: create an e-commerce site with react
You respond ONLY: {"tool": "shell", "command": "npm create vite@latest . -- --template react"}

RULES:
- ONE tool call per response. After the tool runs, you'll get the result and can do the next step.
- For write_file, use \\n for newlines in content.
- NEVER write code in chat. ALWAYS use write_file.
- NEVER explain what you'll do. Just do it.
- When you're done with all steps, say "Done!" with a brief summary.
- For multi-file projects, create one file at a time.`
};

export function loadConfig() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    // Always use latest system prompt
    return { ...DEFAULT_CONFIG, ...data, systemPrompt: DEFAULT_CONFIG.systemPrompt };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigPath() {
  return CONFIG_FILE;
}
