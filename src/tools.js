import { readFile, writeFile, mkdir, readdir, access, unlink, rmdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawn, execSync } from 'node:child_process';

const DESTRUCTIVE = new Set(['shell', 'write_file', 'edit_file', 'delete_file']);

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
      description: 'List entries in a directory. Set recursive=true to get the full project tree (recommended on first use to understand the project structure).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path, relative to cwd. Defaults to "."' },
          recursive: { type: 'boolean', description: 'If true, list all files recursively (depth-limited to 5 levels, max 500 entries). Defaults to false.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Run a shell command. Use for build/test/lint/git operations. Times out after 5 minutes by default.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Search for a text pattern across all files in a directory (recursively). Returns matching lines with file paths and line numbers. Skips node_modules, .git, dist, build. Use this to find function definitions, imports, usage patterns, or errors across the codebase WITHOUT reading every file.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for' },
          path:    { type: 'string', description: 'Directory to search in, relative to cwd. Defaults to "."' },
          include: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.ts", "*.jsx"). Optional.' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or empty directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or directory path, relative to cwd' }
        },
        required: ['path']
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
      let content;
      let truncated = false;
      if (buf.length > MAX_FILE_BYTES) {
        content = buf.subarray(0, MAX_FILE_BYTES).toString('utf-8') + `\n\n... [truncated, file is ${buf.length} bytes total]`;
        truncated = true;
      } else {
        content = buf.toString('utf-8');
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
    let existed = false;
    try {
      await access(fp);
      existed = true;
    } catch { /* file doesn't exist, that's fine */ }
    try {
      await mkdir(dirname(fp), { recursive: true });
      await writeFile(fp, content);
      return {
        ok: true,
        path,
        lines: content.split('\n').length,
        overwritten: existed,
        message: existed ? `WARNING: ${path} already existed and was overwritten. Do NOT write this file again.` : `Created ${path}`
      };
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
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const normalizedSearch = search.replace(/\r\n/g, '\n');
    const normalizedReplace = replace.replace(/\r\n/g, '\n');

    const parts = normalizedContent.split(normalizedSearch);
    const matches = parts.length - 1;
    if (matches === 0) return { ok: false, error: `search string not found in ${path}` };
    if (matches > 1) return { ok: false, error: `search string matches ${matches} times in ${path} — make it unique by including more surrounding context` };
    const updated = parts.join(normalizedReplace);
    try {
      await writeFile(fp, updated);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    const linesChanged = Math.abs(updated.split('\n').length - content.split('\n').length);
    return { ok: true, path, lines_changed: linesChanged };
  },

  list_files: async ({ path = '.', recursive = false }, { cwd }) => {
    const fp = resolve(cwd, path);
    const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', '.cache']);
    const MAX_ENTRIES = 500;
    const MAX_DEPTH = 5;

    async function walk(dir, prefix = '', depth = 0) {
      if (depth > MAX_DEPTH) return [];
      let entries = [];
      try {
        const dirents = await readdir(dir, { withFileTypes: true });
        for (const e of dirents) {
          if (entries.length >= MAX_ENTRIES) break;
          const rel = prefix ? `${prefix}/${e.name}` : e.name;
          if (e.isDirectory()) {
            if (SKIP.has(e.name)) {
              entries.push(`${rel}/ (skipped)`);
            } else {
              entries.push(`${rel}/`);
              if (recursive) {
                const sub = await walk(resolve(dir, e.name), rel, depth + 1);
                entries = entries.concat(sub);
              }
            }
          } else {
            entries.push(rel);
          }
        }
      } catch (err) {
        return [{ error: err.message }];
      }
      return entries;
    }

    try {
      const entries = await walk(fp);
      const truncated = entries.length >= MAX_ENTRIES;
      return { ok: true, path, entries, truncated, total: entries.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  shell: async ({ command }, { cwd, timeoutMs = 300_000 }) => {
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
        safeResolve({ ok, error: ok ? undefined : `Process exited with code ${code}`, stdout, stderr, exit_code: code, truncated });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        safeResolve({ ok: false, error: err.message, stdout, stderr, truncated });
      });
    });
  },

  grep_search: async ({ pattern, path = '.', include }, { cwd }) => {
    if (!pattern) return { ok: false, error: 'pattern is required' };
    const fp = resolve(cwd, path);
    const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', '.cache']);
    const MAX_RESULTS = 100;
    const MAX_FILE_SIZE = 512_000; // Skip files > 512KB
    const results = [];

    async function searchDir(dir, prefix = '') {
      if (results.length >= MAX_RESULTS) return;
      let dirents;
      try { dirents = await readdir(dir, { withFileTypes: true }); } catch { return; }

      for (const e of dirents) {
        if (results.length >= MAX_RESULTS) break;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;

        if (e.isDirectory()) {
          if (!SKIP.has(e.name)) await searchDir(resolve(dir, e.name), rel);
        } else {
          // Check include glob
          if (include && !matchGlob(e.name, include)) continue;
          // Skip binary/large files
          try {
            const buf = await readFile(resolve(dir, e.name));
            if (buf.length > MAX_FILE_SIZE) continue;
            const text = buf.toString('utf-8');
            const lines = text.split('\n');
            let re;
            try { re = new RegExp(pattern, 'gi'); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= MAX_RESULTS) break;
              if (re.test(lines[i])) {
                results.push({ file: rel, line: i + 1, content: lines[i].trim().slice(0, 200) });
              }
              re.lastIndex = 0; // Reset regex state
            }
          } catch { /* skip unreadable files */ }
        }
      }
    }

    function matchGlob(filename, glob) {
      const ext = glob.replace('*', '');
      return filename.endsWith(ext);
    }

    try {
      await searchDir(fp);
      return { ok: true, pattern, results, total: results.length, truncated: results.length >= MAX_RESULTS };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  delete_file: async ({ path: filePath }, { cwd }) => {
    if (!filePath) return { ok: false, error: 'path is required' };
    const fp = resolve(cwd, filePath);
    try {
      await unlink(fp);
      return { ok: true, path: filePath, message: `Deleted file: ${filePath}` };
    } catch (err) {
      if (err.code === 'EISDIR' || err.code === 'EPERM') {
        try {
          await rmdir(fp);
          return { ok: true, path: filePath, message: `Deleted directory: ${filePath}` };
        } catch (dirErr) {
          return { ok: false, error: dirErr.message };
        }
      }
      return { ok: false, error: err.code === 'ENOENT' ? `ENOENT: ${filePath} not found` : err.message };
    }
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
