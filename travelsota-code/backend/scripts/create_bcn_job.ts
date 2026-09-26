import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const pending = await p.hotel_content_sync_jobs.findMany({
  where: { provider: 'ratehawk', status: 'pending' },
  orderBy: { createdAt: 'desc' },
  take: 5
});
console.log('Pending jobs:', JSON.stringify(pending, null, 2));

if (pending.length === 0) {
  const job = await p.hotel_content_sync_jobs.create({
    data: {
      provider: 'ratehawk',
      syncType: 'destination',
      status: 'pending',
      destinationCode: 'BCN',
      destinationName: 'Barcelona',
      inputPayload: { providerCode: '17740', destinationCode: 'BCN' },
      progress: { total: 0, processed: 0, created: 0, updated: 0, failed: 0, errors: [] }
    }
  });
  console.log('Created job:', JSON.stringify(job, null, 2));
} else {
  console.log('Already have pending jobs, waiting for scheduler...');
}

await p.$disconnect();
