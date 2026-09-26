import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const pool = new Pool({
    connectionString: (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/, ''),
    ssl: { rejectUnauthorized: false },
  });

  const sql = readFileSync('D:/traval-q/deploy-test/seed-supabase.sql', 'utf8');
  const result = await pool.query(sql);
  
  if (result.rows && result.rows.length > 0) {
    console.table(result.rows);
  }

  await pool.end();
  console.log('Seeding complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
