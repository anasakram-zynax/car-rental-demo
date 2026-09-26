import { spawn } from 'child_process';
import { join } from 'path';

export interface DownloadFileOptions {
  url: string;
  destPath: string;
  timeoutMs?: number;
}

/**
 * Download a file from a URL to a local path.
 *
 * Delegates to a child process.  On Node 24 / Windows the IPC channel
 * interferes with TLS in the child (`fork`/`spawn`+ipc both cause
 * ECONNRESET), so we use plain spawn and read the result from stdout.
 */
export async function downloadFile(opts: DownloadFileOptions): Promise<void> {
  const { url, destPath, timeoutMs = 300_000 } = opts;

  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [
      join(__dirname, 'download-worker.js'),
      url,
      destPath,
      String(timeoutMs),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error(`Download timed out after ${timeoutMs}ms`));
    }, timeoutMs + 5_000);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`Download failed: ${detail}`));
      } else {
        resolve();
      }
    });
  });
}
