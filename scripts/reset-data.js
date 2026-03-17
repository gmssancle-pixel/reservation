const fs = require("fs/promises");
const path = require("path");
const { defaultSpaces, defaultReservations } = require("../lib/default-data");

const dataDir = path.join(__dirname, "..", "data");
const spacesPath = path.join(dataDir, "spaces.json");
const reservationsPath = path.join(dataDir, "reservations.json");

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function resetData() {
  await fs.mkdir(dataDir, { recursive: true });
  await writeJson(spacesPath, defaultSpaces);
  await writeJson(reservationsPath, defaultReservations);
  console.log("Data reset completed.");
}

resetData().catch((error) => {
  console.error("Error while resetting data:", error);
  process.exit(1);
});
