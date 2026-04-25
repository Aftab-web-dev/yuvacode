import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawn, execSync } from 'node:child_process';

const DESTRUCTIVE = new Set(['shell', 'write_file', 'edit_file']);

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Path is relative to the current working directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path, relative to cwd' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file (creates parent dirs if needed). Overwrites existing files. For small edits, prefer edit_file.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path, relative to cwd' },
          content: { type: 'string', description: 'Full file content' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace a single occurrence of "search" with "replace" in the given file. Search must be unique in the file — include enough surrounding context to identify the location. If the search string matches zero or multiple times, the call fails and you should adjust.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path, relative to cwd' },
          search:  { type: 'string', description: 'Exact substring to find (must be unique)' },
          replace: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'search', 'replace']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List entries in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path, relative to cwd. Defaults to "."' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Run a shell command. Use for build/test/lint/git operations. Times out after 60 seconds by default.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' }
        },
        required: ['command']
      }
    }
  }
];

const handlers = {
  read_file: async ({ path }, { cwd }) => {
    if (!path) return { ok: false, error: 'path is required' };
    const fp = resolve(cwd, path);
    try {
      const MAX_FILE_BYTES = 256_000;
      const buf = await readFile(fp);
      let content = buf.toString('utf-8');
      let truncated = false;
      if (buf.length > MAX_FILE_BYTES) {
        content = buf.subarray(0, MAX_FILE_BYTES).toString('utf-8') + `\n\n... [truncated, file is ${buf.length} bytes total]`;
        truncated = true;
      }
      return { ok: true, content, path, truncated };
    } catch (err) {
      return { ok: false, error: err.code === 'ENOENT' ? `ENOENT: ${path} not found` : err.message };
    }
  },

  write_file: async ({ path, content }, { cwd }) => {
    if (!path) return { ok: false, error: 'path is required' };
    if (typeof content !== 'string') return { ok: false, error: 'content must be a string' };
    const fp = resolve(cwd, path);
    try {
      await mkdir(dirname(fp), { recursive: true });
      await writeFile(fp, content);
      return { ok: true, path, lines: content.split('\n').length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  edit_file: async ({ path, search, replace }, { cwd }) => {
    if (!path || typeof search !== 'string' || typeof replace !== 'string') {
      return { ok: false, error: 'path, search, and replace are required strings' };
    }
    const fp = resolve(cwd, path);
    let content;
    try {
      content = await readFile(fp, 'utf-8');
    } catch (err) {
      return { ok: false, error: err.code === 'ENOENT' ? `ENOENT: ${path} not found` : err.message };
    }
    const parts = content.split(search);
    const matches = parts.length - 1;
    if (matches === 0) return { ok: false, error: `search string not found in ${path}` };
    if (matches > 1) return { ok: false, error: `search string matches ${matches} times in ${path} — make it unique by including more surrounding context` };
    const updated = parts.join(replace);
    try {
      await writeFile(fp, updated);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    const linesChanged = Math.abs(updated.split('\n').length - content.split('\n').length);
    return { ok: true, path, lines_changed: linesChanged };
  },

  list_files: async ({ path = '.' }, { cwd }) => {
    const fp = resolve(cwd, path);
    try {
      const dirents = await readdir(fp, { withFileTypes: true });
      const annotated = dirents.map(e => e.isDirectory() ? `${e.name}/` : e.name);
      return { ok: true, path, entries: annotated };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  shell: async ({ command }, { cwd, timeoutMs = 60_000 }) => {
    if (!command) return { ok: false, error: 'command is required' };
    return new Promise((resolveP) => {
      const child = spawn(command, [], { cwd, shell: true });

      const MAX_OUTPUT = 1_000_000; // ~1 MB cap per stream
      let stdout = '';
      let stderr = '';
      let truncated = false;
      let timedOut = false;
      let resolved = false;

      const safeResolve = (result) => {
        if (resolved) return;
        resolved = true;
        resolveP(result);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        // On Windows, kill the entire process tree; on Unix, SIGKILL is sufficient
        try {
          if (process.platform === 'win32' && child.pid) {
            execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
          } else {
            child.kill('SIGKILL');
          }
        } catch { /* ignore if process already dead */ }
        // Resolve immediately — don't wait for close (Windows orphan-child issue)
        safeResolve({ ok: false, error: `timeout after ${timeoutMs}ms`, stdout, stderr, truncated });
      }, timeoutMs);

      child.stdout.on('data', d => {
        if (stdout.length < MAX_OUTPUT) stdout += d.toString();
        else truncated = true;
      });
      child.stderr.on('data', d => {
        if (stderr.length < MAX_OUTPUT) stderr += d.toString();
        else truncated = true;
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) return; // Already resolved by the timer
        const ok = code === 0;
        safeResolve({ ok, stdout, stderr, exit_code: code, truncated });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        safeResolve({ ok: false, error: err.message, stdout, stderr, truncated });
      });
    });
  }
};

export async function executeTool(name, args, ctx) {
  const handler = handlers[name];
  if (!handler) return { ok: false, error: `Unknown tool: ${name}` };

  if (DESTRUCTIVE.has(name) && !ctx.sessionAllow.has(name)) {
    let decision;
    try {
      decision = await ctx.askPermission(name, args);
    } catch {
      decision = 'no';
    }
    if (decision === 'no') return { ok: false, error: 'denied by user' };
    if (decision === 'always') ctx.sessionAllow.add(name);
  }

  try {
    return await handler(args, ctx);
  } catch (err) {
    return { ok: false, error: err.message || String(err), tool: name };
  }
}
