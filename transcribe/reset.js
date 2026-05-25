// Standalone database reset — `npm run db:reset`.
//
// Drops the transcriber tables and the migrations ledger, then re-applies every
// migration to recreate a clean, empty schema. Destructive: every job, chunk,
// and saved setting is removed. (Bucket objects are NOT touched — clear those
// separately if you also want the storage wiped.) Loads .env so DATABASE_URL /
// PG* are available when run on its own.

require("dotenv").config();

const db = require("./db");

// transcribe_chunks references transcribe_jobs; CASCADE handles the FK either way.
const DROP_SQL = `
  DROP TABLE IF EXISTS
    transcribe_chunks,
    transcribe_jobs,
    transcribe_settings,
    schema_migrations
  CASCADE;
`;

(async () => {
  try {
    console.log("Resetting database — dropping transcriber tables…");
    await db.query(DROP_SQL);
    console.log("  dropped. Re-applying migrations…");
    await db.migrate();
    console.log("Database reset complete.");
    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error(`Reset failed: ${err.message || err}`);
    await db.pool.end().catch(() => {});
    process.exit(1);
  }
})();
