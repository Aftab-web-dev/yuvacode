import { executeCommand } from './shell.js';
import { readFile, writeFile, listFiles } from './files.js';
import { resolve } from 'path';
import {
  toolHeader, toolOutput, toolErr, toolDenied, toolOutputLine,
  approvalPrompt, muted, txt, warn
} from '../ui.js';

export async function handleToolCall(toolData, cwd, rl) {
  switch (toolData.tool) {
    case 'shell': {
      toolHeader('Bash', toolData.command);
      const approved = await askApproval(rl);
      if (!approved) { toolDenied(); return { tool: 'shell', denied: true }; }
      const result = executeCommand(toolData.command, cwd);
      if (result.success) {
        if (result.output) toolOutput(result.output.split('\n'));
      } else {
        toolErr(result.error || 'Command failed');
      }
      return { tool: 'shell', ...result };
    }

    case 'read_file': {
      const fullPath = resolve(cwd, toolData.path);
      toolHeader('Read', fullPath);
      const result = readFile(fullPath);
      if (result.success) {
        const lines = result.content.split('\n');
        toolOutput(lines.slice(0, 25));
        if (lines.length > 25) console.log(muted(`   ⎿ … +${lines.length - 25} lines`));
      } else {
        toolErr(result.error);
      }
      return { tool: 'read_file', ...result };
    }

    case 'write_file': {
      const fullPath = resolve(cwd, toolData.path);
      const lineCount = toolData.content.split('\n').length;
      toolHeader('Write', `${fullPath} (${lineCount} lines)`);
      const approved = await askApproval(rl);
      if (!approved) { toolDenied(); return { tool: 'write_file', denied: true }; }
      const result = writeFile(fullPath, toolData.content);
      if (result.success) {
        console.log(muted('   ⎿ ') + txt('File written'));
      } else {
        toolErr(result.error);
      }
      return { tool: 'write_file', ...result };
    }

    case 'list_files': {
      const fullPath = resolve(cwd, toolData.path || '.');
      toolHeader('List', fullPath);
      const result = listFiles(fullPath);
      if (result.success) {
        toolOutput(result.files.slice(0, 40));
        if (result.files.length > 40) console.log(muted(`   ⎿ … +${result.files.length - 40} more`));
      } else {
        toolErr(result.error);
      }
      return { tool: 'list_files', ...result };
    }

    default:
      return null;
  }
}

function askApproval(rl) {
  return new Promise((resolve) => {
    rl.question(approvalPrompt(), (answer) => {
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

export function extractToolCalls(text) {
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
