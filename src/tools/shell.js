import { execSync } from 'child_process';

export function executeCommand(command, cwd) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5, // 5MB
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      output: error.stdout?.trim() || '',
      error: error.stderr?.trim() || error.message
    };
  }
}
