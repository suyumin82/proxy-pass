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
    await pool.query("UPDATE maintenance_settings SET is_active = 0, maintenance_mode = 0");

    // Step 2: Select active record(s) within time range
    const [activeRows] = await pool.query(
      "SELECT * FROM maintenance_settings WHERE NOW() BETWEEN start_time AND end_time"
    );

    if (activeRows.length > 0) {
      const ids = activeRows.map((r) => r.id);

      // Step 3a: Update DB
      await pool.query("UPDATE maintenance_settings SET is_active = 1, maintenance_mode = 1 WHERE id IN (?)", [ids]);

      // Step 3b: Re-fetch updated row(s)
      const [updatedRows] = await pool.query("SELECT * FROM maintenance_settings WHERE id IN (?)", [ids]);

      // Step 4: Export only the first record
      fs.writeFileSync(exportPath, JSON.stringify(updatedRows[0], null, 2));
      console.log(`[${new Date().toISOString()}] Exported active record to maintenance.json`);
    } else {
      if (fs.existsSync(exportPath)) {
        let maintenanceData = JSON.parse(fs.readFileSync(exportPath, "utf8"));
        maintenanceData.maintenance_mode = false;
        fs.writeFileSync(exportPath, JSON.stringify(maintenanceData, null, 2));
        console.log(`[${new Date().toISOString()}] Updated maintenance_mode to false in maintenance.json`);
      }
    }
  } catch (err) {
    console.error("Error during maintenance cron:", err);
  } finally {
    await pool.end();
  }
};

run();
