import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';

export function readFile(filePath) {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    const content = readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function writeFile(filePath, content) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function listFiles(dirPath, depth = 2) {
  try {
    if (!existsSync(dirPath)) {
      return { success: false, error: `Directory not found: ${dirPath}` };
    }
    const files = [];
    function walk(dir, currentDepth) {
      if (currentDepth > depth) return;
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        const fullPath = join(dir, entry);
        const relPath = relative(dirPath, fullPath);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            files.push(relPath + '/');
            walk(fullPath, currentDepth + 1);
          } else {
            files.push(relPath);
          }
        } catch {
          // skip inaccessible files
        }
      }
    }
    walk(dirPath, 0);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
