const { Pool } = require('pg');
async function main() {
  const pool = new Pool({ connectionString: (process.env.DATABASE_URL||'').replace(/[?&]sslmode=[^&]*/,''), ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`SELECT u."email", u."userType", u."status", r."name" AS role FROM "User" u LEFT JOIN "Role" r ON r."id" = u."roleId"`);
  console.table(r.rows);
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
