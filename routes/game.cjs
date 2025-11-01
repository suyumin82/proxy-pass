const sendJSON = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

module.exports = (pool, parsedUrl, req, res, user) => {
  if (parsedUrl.pathname.endsWith("/games/list")) {
    return list(pool, res);
  }
  if (parsedUrl.pathname.endsWith("/games/create")) {
    return create(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/games/get")) {
    return getById(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/games/update")) {
    return update(pool, req, res);
  }
};

// GET: List all games
const list = async (pool, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM games ORDER BY displayorder ASC");
    sendJSON(res, 200, { games: rows });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to fetch games" });
  }
};

// POST: Create a new game
const create = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { categoryId, displayOrder, name, displayName } = JSON.parse(body);

      await pool.query(
        `INSERT INTO games (categoryId, displayOrder, name, displayName)
         VALUES (?, ?, ?, ?)`,
        [categoryId, displayOrder, name, displayName]
      );

      sendJSON(res, 201, { message: "Game created successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to create game" });
    }
  });
};

const getById = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id } = JSON.parse(body);
      const [rows] = await pool.query("SELECT * FROM games WHERE id = ?", [id]);

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

// POST: Update an existing game
const update = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id, categoryId, displayOrder, name, displayName } = JSON.parse(body);

      await pool.query(
        `UPDATE games SET 
         categoryId = ?,
         displayOrder = ?,
         name = ?,
         displayName = ?
         WHERE id = ?`,
        [categoryId, displayOrder, name, displayName, id]
      );

      sendJSON(res, 200, { message: "Game updated successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to update game" });
    }
  });
};