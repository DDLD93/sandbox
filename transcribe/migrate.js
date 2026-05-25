// Standalone migration runner — `npm run migrate`.
//
// Applies any pending SQL migrations and exits. The server also runs migrate()
// on startup; this script is for running them on demand (CI, deploys, or before
// first boot). Loads .env so DATABASE_URL / PG* are available when run on its own.

require("dotenv").config();

const db = require("./db");

(async () => {
  try {
    await db.migrate();
    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error(`Migration failed: ${err.message || err}`);
    await db.pool.end().catch(() => {});
    process.exit(1);
  }
})();
