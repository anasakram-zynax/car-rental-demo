/**
 * Worker process for downloadFile.
 * Runs via spawn() — downloads with retry + backoff since the S3 endpoint
 * has 8 IPs behind DNS and some intermittently reset the TLS handshake.
 */

const { get: httpsGet } = require('https');
const { createWriteStream, unlinkSync } = require('fs');

const url = process.argv[2];
const destPath = process.argv[3];
const timeoutMs = parseInt(process.argv[4], 10) || 300000;

const SSL_OP_NO_TLSv1 = 0x04000000;
const SSL_OP_NO_TLSv1_1 = 0x10000000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function tryDownload(attempt) {
  const writeStream = createWriteStream(destPath);
  writeStream.on('error', function () { /* cleanup handles it */ });
  let finished = false;

  const cleanup = function () {
    writeStream.destroy();
    try { unlinkSync(destPath); } catch (e) { /* ignore */ }
  };

  const req = httpsGet(
    url,
    {
      headers: { Accept: 'application/octet-stream' },
      secureOptions: SSL_OP_NO_TLSv1 | SSL_OP_NO_TLSv1_1,
    },
    function (res) {
      const statusCode = res.statusCode;
      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        cleanup();
        if (statusCode === 429 && attempt < MAX_RETRIES) {
          return retry(attempt);
        }
        return die('HTTP ' + statusCode + ' for ' + url);
      }
      res.pipe(writeStream);
      writeStream.on('finish', function () {
        finished = true;
        process.exit(0);
      });
    },
  );

  const onError = function (err) {
    if (finished) return;
    finished = true;
    cleanup();
    if (attempt < MAX_RETRIES) {
      return retry(attempt);
    }
    die(err instanceof Error ? err.message : String(err));
  };

  req.on('error', onError);
  req.on('aborted', function () { onError(new Error('aborted')); });
  req.setTimeout(timeoutMs, function () { onError(new Error('Timed out after ' + timeoutMs + 'ms')); });
}

function retry(attempt) {
  setTimeout(function () { tryDownload(attempt + 1); }, RETRY_DELAY_MS * (attempt + 1));
}

function die(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

tryDownload(0);
