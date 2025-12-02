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

const formatMySQLDateTime = (isoString) => {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const pad = (n) => (n < 10 ? "0" + n : n);
    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      " " +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes()) +
      ":" +
      pad(date.getSeconds())
    );
  } catch {
    return null;
  }
};

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

      sendJSON(res, 200, rows[0]);
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
    sendJSON(res, 200, { maintenance: rows });
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

      await pool.query(
        `INSERT INTO maintenance_settings
        (maintenance_mode, subtitle, message, start_time, end_time, timezone, icon, text_align, theme_color, background_color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.maintenance_mode,
          data.subtitle,
          data.message,
          formatMySQLDateTime(data.start_time),
          formatMySQLDateTime(data.end_time),
          data.timezone,
          data.icon,
          data.text_align,
          data.theme_color,
          data.background_color
        ]
      );

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Maintenance setting created" }));
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
        theme_color,https://www.youtube.com/watch?v=pPrHQb5FImI
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
          start_time,
          end_time,
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
