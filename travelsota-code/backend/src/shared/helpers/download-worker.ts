/**
 * Worker process for downloadFile.
 * Runs via spawn() — downloads with retry + backoff since the S3 endpoint
 * has 8 IPs behind DNS and some intermittently reset the TLS handshake.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { get: httpsGet } = require('https');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createWriteStream, unlinkSync } = require('fs');

const url = process.argv[2];
const destPath = process.argv[3];
const timeoutMs = parseInt(process.argv[4], 10) || 300_000;

const SSL_OP_NO_TLSv1 = 0x04_00_00_00;
const SSL_OP_NO_TLSv1_1 = 0x10_00_00_00;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function tryDownload(attempt: number): void {
  const writeStream = createWriteStream(destPath);
  writeStream.on('error', () => { /* cleanup handles it */ });
  let finished = false;

  const cleanup = () => {
    writeStream.destroy();
    try { unlinkSync(destPath); } catch { /* ignore */ }
  };

  const req = httpsGet(
    url,
    {
      headers: { Accept: 'application/octet-stream' },
      secureOptions: SSL_OP_NO_TLSv1 | SSL_OP_NO_TLSv1_1,
    },
    (res) => {
      const { statusCode } = res;
      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        cleanup();
        if (statusCode === 429 && attempt < MAX_RETRIES) {
          return retry(attempt);
        }
        return die(`HTTP ${statusCode} for ${url}`);
      }
      res.pipe(writeStream);
      writeStream.on('finish', () => {
        finished = true;
        process.exit(0);
      });
    },
  );

  const onError = (err: unknown) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (attempt < MAX_RETRIES) {
      return retry(attempt);
    }
    die(err instanceof Error ? err.message : String(err));
  };

  req.on('error', onError);
  req.on('aborted', () => onError(new Error('aborted')));
  req.setTimeout(timeoutMs, () => onError(new Error(`Timed out after ${timeoutMs}ms`)));
}

function retry(attempt: number): void {
  setTimeout(() => tryDownload(attempt + 1), RETRY_DELAY_MS * (attempt + 1));
}

function die(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

tryDownload(0);
