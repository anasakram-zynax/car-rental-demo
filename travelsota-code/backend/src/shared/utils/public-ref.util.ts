/**
 * Human-friendly booking reference generator.
 *
 * Format: TQ-XXXX-XXXX — groups of four, unambiguous alphabet
 * (no 0/O, 1/I/L) so a support agent can read it over a phone call.
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generatePublicRef(prefix = 'TQ'): string {
  let code = '';
  const buf = typeof globalThis.crypto?.getRandomValues === 'function'
    ? globalThis.crypto.getRandomValues(new Uint32Array(8))
    : null;
  for (let i = 0; i < 8; i++) {
    const n = buf ? buf[i] : Math.floor(Math.random() * 0xffffffff);
    code += ALPHABET[n % ALPHABET.length];
  }
  return `${prefix}-${code.slice(0, 4)}-${code.slice(4)}`;
}
