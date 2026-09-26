/**
 * Hotelbeds X-Signature generator.
 *
 * Usage:
 *   HOTELBEDS_API_KEY=your_key HOTELBEDS_SECRET=your_secret npx ts-node src/scripts/generate-x-signature.ts
 *
 * Or pass as arguments:
 *   npx ts-node src/scripts/generate-x-signature.ts <apiKey> <secret>
 */
import { createHash } from 'node:crypto';

const apiKey = process.env.HOTELBEDS_API_KEY ?? process.argv[2];
const secret = process.env.HOTELBEDS_SECRET ?? process.argv[3];

if (!apiKey || !secret) {
  console.error('Usage: HOTELBEDS_API_KEY=<key> HOTELBEDS_SECRET=<secret> npx ts-node src/scripts/generate-x-signature.ts');
  console.error('   or: npx ts-node src/scripts/generate-x-signature.ts <apiKey> <secret>');
  process.exit(1);
}

const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = createHash('sha256')
  .update(`${apiKey}${secret}${timestamp}`)
  .digest('hex');

console.log(signature);
console.log(`timestamp=${timestamp}`);
