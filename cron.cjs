const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// Update DB config
const pool = mysql.createPool({
  host: process.env.DBHOST,
  user: process.env.DBUSER,
  password: process.env.DBPWD,
  database: process.env.DATABASE,
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0,
});
const exportPath = path.join(__dirname, "./json/maintenance.json");

const run = async () => {
  try {
    // Step 1: Set all inactive
    await pool.query("UPDATE maintenance_settings SET is_active = 0");

    // Step 2: Select active record(s) within time range
    const [activeRows] = await pool.query(
      "SELECT * FROM maintenance_settings WHERE NOW() BETWEEN start_time AND end_time"
    );

    // Step 3: Update these to active
    if (activeRows.length > 0) {
      const ids = activeRows.map((r) => r.id);
      await pool.query(
        "UPDATE maintenance_settings SET is_active = 1 WHERE id IN (?)",
        [ids]
      );

      // Step 4: Export to ./json/maintenance.json
      fs.writeFileSync(exportPath, JSON.stringify(activeRows, null, 2));
      console.log(
        `[{new Date().toISOString()}] Exported {activeRows.length} records to maintenance.json`
      );
    } else {
      // Load JSON
      let maintenanceData = JSON.parse(fs.readFileSync(exportPath, "utf8"));

      // Update maintenance_mode to false
      maintenanceData.maintenance_mode = false;

      // Save back to file
      fs.writeFileSync(filePath, JSON.stringify(maintenanceData, null, 2));

      console.log("maintenance_mode has been updated to false.");
    }
  } catch (err) {
    console.error("Error during maintenance cron:", err);
  } finally {
    await pool.end();
  }
};

run();
