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
      const {
        maintenance_mode,
        title,
        subtitle,
        message,
        start_time,
        end_time,
        timezone,
        icon,
        display
      } = JSON.parse(body);

      await pool.query(
        `INSERT INTO maintenance_settings
         (maintenance_mode, title, subtitle, message, start_time, end_time, timezone, icon, text_align, theme_color, background_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          maintenance_mode ? 1 : 0,
          title,
          subtitle,
          message,
          start_time,
          end_time,
          timezone,
          icon,
          display?.text_align || 'center',
          display?.theme_color || '#000000',
          display?.background_color || '#ffffff'
        ]
      );

      sendJSON(res, 201, { message: "Maintenance entry created successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to create maintenance entry" });
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
        title,
        subtitle,
        message,
        start_time,
        end_time,
        timezone,
        icon,
        display
      } = JSON.parse(body);

      await pool.query(
        `UPDATE maintenance_settings SET 
         maintenance_mode = ?,
         title = ?,
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
          title,
          subtitle,
          message,
          start_time,
          end_time,
          timezone,
          icon,
          display?.text_align || 'center',
          display?.theme_color || '#000000',
          display?.background_color || '#ffffff',
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
