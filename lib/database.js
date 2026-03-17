const { Pool } = require("pg");
const { defaultSpaces } = require("./default-data");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required. "
      + "Set it in Render Environment using your Postgres Internal Database URL."
  );
}

const useSSL = /sslmode=require/i.test(DATABASE_URL) || /^true$/i.test(process.env.PGSSL || "");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

async function createSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      open_time TIME NULL,
      close_time TIME NULL,
      CHECK (
        (open_time IS NULL AND close_time IS NULL)
        OR (open_time IS NOT NULL AND close_time IS NOT NULL)
      )
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id UUID PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      resident_name TEXT NOT NULL,
      room_number TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      cancellation_pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_time > start_time)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_reservations_space_date_time
      ON reservations (space_id, date, start_time)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_reservations_active
      ON reservations (date, end_time)
  `);
}

async function seedSpaces(client) {
  for (const space of defaultSpaces) {
    await client.query(
      `
        INSERT INTO spaces (id, name, description, capacity, open_time, close_time)
        VALUES ($1, $2, $3, $4, $5::time, $6::time)
        ON CONFLICT (id) DO UPDATE
        SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          capacity = EXCLUDED.capacity,
          open_time = EXCLUDED.open_time,
          close_time = EXCLUDED.close_time
      `,
      [space.id, space.name, space.description, space.capacity, space.openTime, space.closeTime]
    );
  }
}

async function withTransaction(task) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_rollbackError) {
      // Ignore rollback errors to preserve original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  await withTransaction(async (client) => {
    await createSchema(client);
    await seedSpaces(client);
  });
}

async function resetDatabaseData() {
  await withTransaction(async (client) => {
    await createSchema(client);
    await client.query("DELETE FROM reservations");
    await seedSpaces(client);
  });
}

module.exports = {
  pool,
  initializeDatabase,
  resetDatabaseData,
  withTransaction
};
