const sendJSON = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

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
    const [rows] = await pool.query("SELECT * FROM games ORDER BY displayOrder ASC");
    sendJSON(res, 200, { games: rows });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to fetch games" });
  }
};

// POST: Create a new game
const create = async (pool, req, res) => {
  try {
    const { categoryId, displayOrder, name, displayName, isActive = false } = await parseBody(req);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (isActive) {
        await connection.query("UPDATE games SET isActive = 0");
      }

      await connection.query(
        `INSERT INTO games (categoryId, displayOrder, name, displayName, isActive)
         VALUES (?, ?, ?, ?, ?)`,
        [categoryId, displayOrder, name, displayName, isActive ? 1 : 0]
      );

      await connection.commit();
      sendJSON(res, 201, { message: "Game created successfully" });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to create game" });
  }
};

const getById = async (pool, req, res) => {
  try {
    const { id } = await parseBody(req);
    const [rows] = await pool.query("SELECT * FROM games WHERE id = ?", [id]);

    if (rows.length === 0) {
      return sendJSON(res, 404, { error: "Not found" });
    }

    sendJSON(res, 200, rows[0]);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to fetch record" });
  }
};

// POST: Update an existing game
const update = async (pool, req, res) => {
  try {
    const { id, categoryId, displayOrder, name, displayName, isActive = false } = await parseBody(req);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (isActive) {
        await connection.query("UPDATE games SET isActive = 0 WHERE id <> ?", [id]);
      }

      await connection.query(
        `UPDATE games SET 
         categoryId = ?,
         displayOrder = ?,
         name = ?,
         displayName = ?,
         isActive = ?
         WHERE id = ?`,
        [categoryId, displayOrder, name, displayName, isActive ? 1 : 0, id]
      );

      await connection.commit();
      sendJSON(res, 200, { message: "Game updated successfully" });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to update game" });
  }
};
