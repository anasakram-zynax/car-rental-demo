const { Pool } = require('pg');
async function main() {
  const pool = new Pool({ connectionString: (process.env.DATABASE_URL||'').replace(/[?&]sslmode=[^&]*/,''), ssl: { rejectUnauthorized: false } });
  const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='SiteSetting' ORDER BY ordinal_position");
  console.table(r.rows);
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
