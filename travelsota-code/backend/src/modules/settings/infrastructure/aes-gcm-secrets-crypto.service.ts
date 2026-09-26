import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretsCryptoPort } from '../application/ports/secrets-crypto.port';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

@Injectable()
export class AesGcmSecretsCryptoService implements SecretsCryptoPort {
  private readonly logger = new Logger(AesGcmSecretsCryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.PROVIDER_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'PROVIDER_ENCRYPTION_KEY environment variable is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.key = Buffer.from(raw, 'hex');
    if (this.key.length !== 32) {
      throw new Error(
        `PROVIDER_ENCRYPTION_KEY must be 32 bytes (64 hex characters), got ${this.key.length} bytes`,
      );
    }
  }

  encrypt(plain: string): string {
    if (!plain) return plain;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Pack: iv (12) + authTag (16) + ciphertext (variable)
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(cipher: string): string {
    if (!cipher) return cipher;
    try {
      const buf = Buffer.from(cipher, 'base64');
      if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        this.logger.warn('Ciphertext too short, returning as-is');
        return cipher;
      }
      const iv = buf.subarray(0, IV_LENGTH);
      const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(encrypted, undefined, 'utf-8') + decipher.final('utf-8');
    } catch (err) {
      this.logger.error('Decryption failed — key may have changed or data is corrupted');
      throw err;
    }
  }
}
