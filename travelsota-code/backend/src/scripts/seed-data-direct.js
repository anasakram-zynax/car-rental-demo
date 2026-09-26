const { Pool } = require('pg');
const { readFileSync } = require('fs');

async function main() {
  const pool = new Pool({
    connectionString: (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/, ''),
    ssl: { rejectUnauthorized: false },
  });

  const sql = readFileSync('D:/traval-q/deploy-test/seed-manual.sql', 'utf8');
  await pool.query(sql);
  
  // Verify
  const r = await pool.query(`
    SELECT 'currencies' t, COUNT(*) c FROM "Currency"
    UNION ALL SELECT 'blog_categories', COUNT(*) FROM "BlogCategory"
    UNION ALL SELECT 'blog_posts', COUNT(*) FROM "BlogPost"
    UNION ALL SELECT 'cms_pages', COUNT(*) FROM "CmsPage"
    UNION ALL SELECT 'cms_footer_categories', COUNT(*) FROM "CmsFooterCategory"
    UNION ALL SELECT 'cms_menus', COUNT(*) FROM "CmsMenu"
    UNION ALL SELECT 'flight_locations', COUNT(*) FROM "FlightLocation"
    UNION ALL SELECT 'site_settings', COUNT(*) FROM "SiteSetting"
  `);
  console.table(r.rows);
  await pool.end();
  console.log('Data seed complete.');
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
