import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

async function main() {
  console.log('\n=== Clear Encrypted Configs ===\n');
  console.log('This script clears encrypted secret data from the database so you can re-enter');
  console.log('API keys through the admin UI after a PROVIDER_ENCRYPTION_KEY change.\n');

  if (!process.env.PROVIDER_ENCRYPTION_KEY) {
    console.error('PROVIDER_ENCRYPTION_KEY is not set. Set it in .env first.');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);

    // 1. Clear payment gateway configs
    const paymentGateways = await prisma.paymentGatewayConfig.findMany();
    console.log(`Found ${paymentGateways.length} payment gateway config(s).`);
    for (const gw of paymentGateways) {
      const parsed = JSON.parse(gw.encryptedConfig || '{}') as Record<string, any>;
      const secretFields = ['secretKey', 'webhookSecret', 'clientSecret', 'webhookId'];
      const kept: Record<string, any> = {};
      let removedCount = 0;
      for (const [key, val] of Object.entries(parsed)) {
        if (secretFields.includes(key)) {
          removedCount++;
        } else {
          kept[key] = val;
        }
      }
      await prisma.paymentGatewayConfig.update({
        where: { gateway: gw.gateway as any },
        data: { encryptedConfig: JSON.stringify(kept) },
      });
      console.log(`  ✓ ${gw.gateway}: removed ${removedCount} secret field(s), kept ${Object.keys(kept).length} field(s)`);
    }

    // 2. Clear provider configs
    const providers = await prisma.providerConfig.findMany();
    console.log(`\nFound ${providers.length} provider config(s).`);
    for (const p of providers) {
      const parsed = JSON.parse(p.encryptedConfig || '{}') as Record<string, any>;
      const secretFields = ['password', 'clientSecret', 'apiKey', 'secret', 'sslCert', 'sslKey'];
      const kept: Record<string, any> = {};
      let removedCount = 0;
      for (const [key, val] of Object.entries(parsed)) {
        if (secretFields.includes(key)) {
          removedCount++;
        } else {
          kept[key] = val;
        }
      }
      await prisma.providerConfig.update({
        where: { module_provider: { module: p.module, provider: p.provider } },
        data: { encryptedConfig: JSON.stringify(kept) },
      });
      console.log(`  ✓ ${p.module}/${p.provider}: removed ${removedCount} secret field(s), kept ${Object.keys(kept).length} field(s)`);
    }

    console.log('\n=== Done ===\n');
    console.log('All encrypted secrets have been cleared from the database.');
    console.log('Go to the admin UI → Settings → Modules / Payment to re-enter your API keys.\n');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Script failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
