const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");

const sendJSON = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const UPLOADS_DIR = path.join(__dirname, "../images");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

module.exports = (pool, parsedUrl, req, res, user) => {
  if (parsedUrl.pathname.endsWith("/theme/list")) {
    return list(pool, res);
  }
  if (parsedUrl.pathname.endsWith("/theme/save")) {
    return save(pool, req, res);
  }
  if (parsedUrl.pathname.endsWith("/theme/upload")) {
    return upload(req, res);
  }
  if (parsedUrl.pathname.endsWith("/theme/get")) {
    return getById(req, res);
  }
};

const getById = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id } = JSON.parse(body);
      const [rows] = await pool.query("SELECT * FROM theme_settings WHERE id = ?", [id]);

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

// GET: List all active theme settings by type
const list = async (pool, res) => {
  try {
    const [rows] = await pool.query("SELECT type, url FROM theme_settings WHERE is_active = 1 ORDER BY id ASC");
    const theme = rows.reduce((acc, row) => {
      acc[row.type] = row.url;
      return acc;
    }, {});
    sendJSON(res, 200, { theme });
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Failed to fetch theme settings" });
  }
};

// POST: Insert or update one theme type
const save = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { type, url } = JSON.parse(body);

      if (!type || !url || !['logo', 'bg', 'auth'].includes(type)) {
        return sendJSON(res, 400, { error: "Invalid type or url" });
      }

      // Deactivate existing record of the same type
      await pool.query("UPDATE theme_settings SET is_active = 0 WHERE type = ?", [type]);

      // Insert new active record
      await pool.query(
        `INSERT INTO theme_settings (type, url, is_active, updated_at) VALUES (?, ?, 1, NOW())`,
        [type, url]
      );

      sendJSON(res, 200, { message: "Theme type saved successfully" });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: "Failed to save theme setting" });
    }
  });
};

// POST: Upload image stream
const upload = (req, res) => {
  const busboy = new Busboy({ headers: req.headers });
  let fileUrl = "";

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const ext = path.extname(filename) || ".png";
    const newFilename = `${uuidv4()}${ext}`;
    const filepath = path.join(UPLOADS_DIR, newFilename);

    file.pipe(fs.createWriteStream(filepath));
    fileUrl = `/images/${newFilename}`;
  });

  busboy.on("finish", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Upload complete", url: fileUrl }));
  });

  busboy.on("error", (err) => {
    console.error("Upload error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Upload failed" }));
  });

  req.pipe(busboy);
};