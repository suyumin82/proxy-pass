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
          changelog ? changelog.join("\\n") : ""
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
          changelog ? changelog.join("\\n") : "",
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
