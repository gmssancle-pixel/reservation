const { pool, resetDatabaseData } = require("../lib/database");

async function resetData() {
  await resetDatabaseData();
  console.log("Database reset completed.");
}

resetData()
  .catch((error) => {
    console.error("Error while resetting database:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
