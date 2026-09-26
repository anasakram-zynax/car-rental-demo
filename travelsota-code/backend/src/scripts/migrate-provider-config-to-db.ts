/**
 * One-time migration script: reads provider-config.json and writes to ProviderConfig DB table.
 * Secrets are re-encrypted using AesGcmSecretsCryptoService during migration.
 *
 * Usage: npx ts-node src/scripts/migrate-provider-config-to-db.ts
 */
import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated';
import { AesGcmSecretsCryptoService } from '../modules/settings/infrastructure/aes-gcm-secrets-crypto.service';

async function migrate() {
  const filePath = path.resolve(process.cwd(), 'data/provider-config.json');

  let fileData: string;
  try {
    fileData = await fs.readFile(filePath, 'utf-8');
  } catch {
    console.log('No provider-config.json found — nothing to migrate.');
    return;
  }

  const records = JSON.parse(fileData);
  if (!Array.isArray(records) || records.length === 0) {
    console.log('Empty or invalid provider-config.json — nothing to migrate.');
    return;
  }

  const crypto = new AesGcmSecretsCryptoService();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  try {
    for (const record of records) {
      const config = { ...record.config };

      // Encrypt secrets that were stored in plaintext
      if (config.password) config.password = crypto.encrypt(config.password);
      if (config.clientSecret) config.clientSecret = crypto.encrypt(config.clientSecret);
      if (config.apiKey) config.apiKey = crypto.encrypt(config.apiKey);
      if (config.secret) config.secret = crypto.encrypt(config.secret);
      if (config.sslCert) config.sslCert = crypto.encrypt(config.sslCert);
      if (config.sslKey) config.sslKey = crypto.encrypt(config.sslKey);

      // Remove derived fields (authUrl, baseUrl, endpoint) — not stored in DB
      delete config.authUrl;
      delete config.baseUrl;
      delete config.endpoint;

      await prisma.providerConfig.upsert({
        where: {
          module_provider: {
            module: record.module,
            provider: record.provider,
          },
        },
        create: {
          module: record.module,
          provider: record.provider,
          enabled: record.enabled,
          encryptedConfig: JSON.stringify(config),
        },
        update: {
          enabled: record.enabled,
          encryptedConfig: JSON.stringify(config),
        },
      });

      console.log(`Migrated ${record.module}.${record.provider}`);
    }

    console.log('Migration complete.');
  } finally {
    await prisma.$disconnect();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
