const fs = require("fs");
const path = require("path");

const sendJSON = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

module.exports = (pool, parsedUrl, req, res, user) => {
  if (parsedUrl.pathname.endsWith("/updates/list")) {
    return list(pool, res);
  }
  if (parsedUrl.pathname.endsWith("/updates/create")) {
    return create(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/updates/update")) {
    return update(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/updates/get")) {
    return getById(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/updates/activate")) {
    return activate(pool, req, res);
  }
};

// GET: List all updates
const list = async (pool, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM app_updates ORDER BY id DESC");
    sendJSON(res, 200, { updates: rows });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to fetch updates" });
  }
};

const getById = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id } = JSON.parse(body);
      const [rows] = await pool.query("SELECT * FROM app_updates WHERE id = ?", [id]);

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

// POST: Create a new update config
const create = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const {
        update_required,
        latest_version,
        minimum_version,
        update_type,
        update_message,
        update_url,
        changelog
      } = JSON.parse(body);

      await pool.query(
        `INSERT INTO app_updates 
         (update_required, latest_version, minimum_version, update_type, update_message, update_url, changelog)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          update_required ? 1 : 0,
          latest_version,
          minimum_version,
          update_type,
          update_message,
          update_url,
          changelog ? changelog : ""
        ]
      );

      sendJSON(res, 201, { message: "Update created successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to create update" });
    }
  });
};

// POST: Update an existing update config
const update = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const {
        id,
        update_required,
        latest_version,
        minimum_version,
        update_type,
        update_message,
        update_url,
        changelog
      } = JSON.parse(body);

      await pool.query(
        `UPDATE app_updates SET 
         update_required = ?,
         latest_version = ?,
         minimum_version = ?,
         update_type = ?,
         update_message = ?,
         update_url = ?,
         changelog = ?
         WHERE id = ?`,
        [
          update_required ? 1 : 0,
          latest_version,
          minimum_version,
          update_type,
          update_message,
          update_url,
          changelog ? changelog : "",
          id
        ]
      );

      sendJSON(res, 200, { message: "Update modified successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to update update" });
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
      await pool.query("UPDATE update_settings SET is_active = 0");

      // Activate selected
      await pool.query("UPDATE update_settings SET is_active = 1 WHERE id = ?", [id]);

      // Fetch the activated record
      const [rows] = await pool.query("SELECT * FROM update_settings WHERE id = ?", [id]);
      if (rows.length === 0) return sendJSON(res, 404, { error: "Record not found" });

      const item = rows[0];
      const output = {
        update_required: true,
        latest_version: item.latest_version,
        minimum_version: item.minimum_version,
        update_type: item.update_type,
        update_message: item.update_message,
        update_url: item.update_url,
        changelog: item.changelog ? item.changelog.split("\n") : []
      };

      const jsonDir = path.join(__dirname, "../json");
      if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, "update.json"), JSON.stringify(output, null, 2));

      sendJSON(res, 200, { message: "Activated and exported successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to activate update" });
    }
  });
};