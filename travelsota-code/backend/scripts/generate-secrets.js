/**
 * Generate secure secrets for TravelsOTA backend.
 * Run: node scripts/generate-secrets.js
 *
 * Outputs new values for:
 *   - PROVIDER_ENCRYPTION_KEY (32 bytes hex)
 *   - JWT_SECRET (32 bytes hex)
 *   - ADMIN_PASSWORD (16 chars random)
 */
const crypto = require('crypto');

const encryptionKey = crypto.randomBytes(32).toString('hex');
const jwtSecret = crypto.randomBytes(32).toString('hex');
const adminPassword = crypto.randomBytes(12).toString('base64').replace(/[/+=]/g, '').slice(0, 16);

console.log('\n=== GENERATED SECRETS ===\n');
console.log(`PROVIDER_ENCRYPTION_KEY=${encryptionKey}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ADMIN_PASSWORD=${adminPassword}`);
console.log('\nUpdate your .env file with these values.');
console.log('IMPORTANT: After changing ADMIN_PASSWORD, re-run the admin seed script.\n');
