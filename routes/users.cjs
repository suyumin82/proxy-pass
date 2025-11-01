const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken'); // add this at top
const verifyJWT = require('../utils/auth.cjs');

const sendJSON = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

module.exports = (pool, parsedUrl, req, res) => {
  if (parsedUrl.pathname.endsWith("/user/login")) {
    return userLogin(pool, req, res);
  }
  const user = verifyJWT(req, res);
  if (parsedUrl.pathname.endsWith("/user/create")) {  
    if (!user) return; // token invalid

    return userCreate(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/user/update")) {
    if (!user) return; // token invalid

    return userUpdate(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/user/list")) {
    if (!user) return; // token invalid

    return userList(pool, res);
  }
  if (parsedUrl.pathname.endsWith("/user/get")) {
    if (!user) return; // token invalid

    return getById(pool, req, res); // ← 💬 Suggestion added here
  }
};

// Handler functions
const userLogin = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { username, password } = JSON.parse(body);
      const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
      if (rows.length === 0) return sendJSON(res, 401, { error: "Invalid username or password" });

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return sendJSON(res, 401, { error: "user not found!" });

      // ✅ Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      sendJSON(res, 200, {
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          role: user.role
        }
      });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Login failed" });
    }
  });
};

const getById = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id } = JSON.parse(body);
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);

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

const userCreate = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { username, name, password, role } = JSON.parse(body);
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        "INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)",
        [username, name, hash, role || "viewer"]
      );
      sendJSON(res, 201, { message: "User created successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "User creation failed" });
    }
  });
};

const userUpdate = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id, name, password, role } = JSON.parse(body);
      const hash = password ? await bcrypt.hash(password, 10) : null;

      let query = "UPDATE users SET name = ?, role = ?";
      let values = [name, role];

      if (hash) {
        query += ", password_hash = ?";
        values.push(hash);
      }

      query += " WHERE id = ?";
      values.push(id);

      await pool.query(query, values);
      sendJSON(res, 200, { message: "User updated successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "User update failed" });
    }
  });
};

const userList = async (pool, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, username, name, role, created_at FROM users ORDER BY id DESC"
    );
    sendJSON(res, 200, { users: rows });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to fetch users" });
  }
};