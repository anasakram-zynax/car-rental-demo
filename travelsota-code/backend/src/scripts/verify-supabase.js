const { Pool } = require('pg');
async function main() {
  const pool = new Pool({ connectionString: (process.env.DATABASE_URL||'').replace(/[?&]sslmode=[^&]*/,''), ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`SELECT 'permissions' t, COUNT(*) c FROM "Permission" UNION ALL SELECT 'roles', COUNT(*) FROM "Role" UNION ALL SELECT 'role_permissions', COUNT(*) FROM "RolePermission" UNION ALL SELECT 'users', COUNT(*) FROM "User"`);
  console.table(r.rows);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
