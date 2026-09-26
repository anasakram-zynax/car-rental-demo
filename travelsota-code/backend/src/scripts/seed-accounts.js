const { Pool } = require('pg');
const { readFileSync } = require('fs');
async function main() {
  const pool = new Pool({ connectionString: (process.env.DATABASE_URL||'').replace(/[?&]sslmode=[^&]*/,''), ssl: { rejectUnauthorized: false } });
  const sql = readFileSync('D:/traval-q/deploy-test/seed-accounts.sql', 'utf8');
  const r = await pool.query(sql);
  console.table(r.rows);
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
