async function main() {
  console.warn('⚠️  seed-admin.ts is DEPRECATED — use npm run seed:rbac instead (it seeds roles, permissions AND the super admin user)');
  console.warn('  Exiting without changes. If you need an admin user, run: npm run seed:rbac');
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
