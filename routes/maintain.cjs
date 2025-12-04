const fs = require("fs");
const path = require("path");

const sendJSON = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

module.exports = (pool, parsedUrl, req, res, user) => {
  if (parsedUrl.pathname.endsWith("/maintain/list")) {
    return list(pool, res);
  }
  if (parsedUrl.pathname.endsWith("/maintain/create")) {
    return create(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/maintain/get")) {
    return getById(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/maintain/update")) {
    return update(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/maintain/activate")) {
    return activate(pool, req, res);
  }
};

// Helper to convert ISO string to MySQL datetime string in GMT+8
function convertGMT8ToUTC(mysqlDateTimeStr) {
  const localDate = new Date(`${mysqlDateTimeStr}+08:00`); // treat as GMT+8
  const utcYear = localDate.getUTCFullYear();
  const utcMonth = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const utcDate = String(localDate.getUTCDate()).padStart(2, '0');
  const utcHour = String(localDate.getUTCHours()).padStart(2, '0');
  const utcMin = String(localDate.getUTCMinutes()).padStart(2, '0');
  const utcSec = String(localDate.getUTCSeconds()).padStart(2, '0');

  return `${utcYear}-${utcMonth}-${utcDate} ${utcHour}:${utcMin}:${utcSec}`;
}

function convertUTCToGMT8(utcDateStr) {
  const utcDate = new Date(utcDateStr);
  const gmt8Date = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000); // add 8 hours

  const year = gmt8Date.getFullYear();
  const month = String(gmt8Date.getMonth() + 1).padStart(2, "0");
  const day = String(gmt8Date.getDate()).padStart(2, "0");
  const hour = String(gmt8Date.getHours()).padStart(2, "0");
  const minute = String(gmt8Date.getMinutes()).padStart(2, "0");
  const second = String(gmt8Date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

const getById = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id } = JSON.parse(body);
      const [rows] = await pool.query("SELECT * FROM maintenance_settings WHERE id = ?", [id]);

      if (rows.length === 0) {
        return sendJSON(res, 404, { error: "Not found" });
      }

      const converted = rows.map((row) => ({
        ...row,
        start_time: convertUTCToGMT8(row.start_time),
        end_time: convertUTCToGMT8(row.end_time),
      }));

      sendJSON(res, 200, converted[0]);
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to fetch record" });
    }
  });
};

// GET: List all maintenance configs
const list = async (pool, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM maintenance_settings ORDER BY id DESC");

    const converted = rows.map((row) => ({
      ...row,
      start_time: convertUTCToGMT8(row.start_time),
      end_time: convertUTCToGMT8(row.end_time),
    }));

    sendJSON(res, 200, { maintenance: converted });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to fetch maintenance records" });
  }
};

// POST: Create a new maintenance config
const create = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);

      const [result] = await pool.query(
        `INSERT INTO maintenance_settings
        (maintenance_mode, subtitle, message, start_time, end_time, timezone, icon, text_align, theme_color, background_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.maintenance_mode,
          data.subtitle,
          data.message,
          convertGMT8ToUTC(data.start_time),
          convertGMT8ToUTC(data.end_time),
          data.timezone,
          data.icon,
          data.text_align,
          data.theme_color,
          data.background_color
        ]
      );

      // res.writeHead(201, { "Content-Type": "application/json" });
      // res.end(JSON.stringify({ message: "Maintenance setting created" }));
      const newId = result.insertId;

      sendJSON(res, 201, {
        message: "Update created successfully",
        id: newId
      });

    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create maintenance config" }));
    }
  });
};

// POST: Update a maintenance config
const update = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const {
        id,
        maintenance_mode,
        subtitle,
        message,
        start_time,
        end_time,
        timezone,
        icon,
        text_align,
        theme_color,
        background_color
      } = JSON.parse(body);

      await pool.query(
        `UPDATE maintenance_settings SET 
         maintenance_mode = ?,
         subtitle = ?,
         message = ?,
         start_time = ?,
         end_time = ?,
         timezone = ?,
         icon = ?,
         text_align = ?,
         theme_color = ?,
         background_color = ?
         WHERE id = ?`,
        [
          maintenance_mode ? 1 : 0,
          subtitle,
          message,
          convertGMT8ToUTC(start_time),
          convertGMT8ToUTC(end_time),
          timezone,
          icon,
          text_align || 'center',
          theme_color || '#000000',
          background_color || '#ffffff',
          id
        ]
      );

      sendJSON(res, 200, { message: "Maintenance entry updated successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to update maintenance entry" });
    }
  });
};

const activate = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id } = JSON.parse(body);
      if (!id) return sendJSON(res, 400, { error: "Missing ID" });

      // Deactivate all
      await pool.query("UPDATE maintenance_settings SET is_active = 0, maintenance_mode = 0");

      // Activate the selected
      await pool.query("UPDATE maintenance_settings SET is_active = 1, maintenance_mode = 1 WHERE id = ?", [id]);

      // Fetch the activated record
      const [rows] = await pool.query("SELECT * FROM maintenance_settings WHERE id = ?", [id]);
      if (rows.length === 0) return sendJSON(res, 404, { error: "Record not found" });

      const item = rows[0];
      const output = {
        maintenance_mode: true,
        subtitle: item.subtitle,
        message: item.message,
        start_time: item.start_time,
        end_time: item.end_time,
        timezone: item.timezone,
        icon: item.icon,
        display: {
          text_align: item.text_align,
          theme_color: item.theme_color,
          background_color: item.background_color
        }
      };

      const jsonDir = path.join(__dirname, "../json");
      if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, "maintenance.json"), JSON.stringify(output, null, 2));

      sendJSON(res, 200, { message: "Activated and exported successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to activate maintenance" });
    }
  });
};
