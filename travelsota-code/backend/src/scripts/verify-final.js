const { Pool } = require('pg');
async function main() {
  const pool = new Pool({ connectionString: (process.env.DATABASE_URL||'').replace(/[?&]sslmode=[^&]*/,''), ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`SELECT 'manual_hotels' t, COUNT(*) c FROM "ManualHotel" UNION ALL SELECT 'manual_rooms', COUNT(*) FROM "ManualHotelRoom" UNION ALL SELECT 'manual_flights', COUNT(*) FROM "ManualFlight" UNION ALL SELECT 'currencies', COUNT(*) FROM "Currency" UNION ALL SELECT 'blog_posts', COUNT(*) FROM "BlogPost" UNION ALL SELECT 'flight_locations', COUNT(*) FROM "FlightLocation"`);
  console.table(r.rows);
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
