// Postgres access for the transcriber: a shared pool, a startup migration
// runner, and a thin query() helper. Connection details come from the standard
// libpq env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE) or a single
// DATABASE_URL — node-postgres reads both natively, so we pass nothing explicit.

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}
);

function query(text, params) {
  return pool.query(text, params);
}

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
// Arbitrary fixed key so concurrent app instances serialize on the same lock.
const MIGRATION_LOCK_KEY = 919283746;

// Load .sql migrations sorted by filename (e.g. 0001_*, 0002_*).
function loadMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      id: file.replace(/\.sql$/, ""),
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    }));
}

// Apply any migrations not yet recorded in schema_migrations. Runs at startup.
// A session-level advisory lock prevents two instances migrating at once; each
// migration runs in its own transaction so a failure rolls back cleanly and the
// rest are left unapplied.
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query("SELECT id FROM schema_migrations")).rows.map((r) => r.id)
    );

    let count = 0;
    for (const m of loadMigrations()) {
      if (applied.has(m.id)) continue;
      try {
        await client.query("BEGIN");
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
        console.log(`  [transcribe] migration applied: ${m.id}`);
        count++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`migration ${m.id} failed: ${err.message}`);
      }
    }
    if (count === 0) console.log("  [transcribe] migrations up to date");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

module.exports = { pool, query, migrate };
