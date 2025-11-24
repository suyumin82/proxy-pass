const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

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
  if (parsedUrl.pathname.endsWith("/theme/update")) {
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

// POST: Upload image – NO BUSBOY
const upload = (req, res) => {
  if (req.method !== "POST") {
    return sendJSON(res, 405, { error: "Method Not Allowed" });
  }

  const ct = req.headers["content-type"] || "";
  if (!ct.includes("multipart/form-data")) {
    return sendJSON(res, 400, { error: "Expected multipart/form-data" });
  }

  const boundary = ct.split("boundary=")[1];
  if (!boundary) {
    return sendJSON(res, 400, { error: "Missing boundary" });
  }

  const BOUNDARY = `--${boundary}`;
  const BOUNDARY_END = `--${boundary}--`;

  let buffer = Buffer.alloc(0);
  let fileStream = null;
  let savedUrl = "";
  let filename = "";

  req.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
  });

  req.on("end", () => {
    try {
      const bufferStr = buffer.toString("binary");
      
      // Find the start of the file content (after headers)
      const headerEnd = bufferStr.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return sendJSON(res, 400, { error: "Invalid multipart data" });
      }

      // Extract headers to get filename
      const headers = bufferStr.substring(0, headerEnd);
      const filenameMatch = headers.match(/filename="([^"]+)"/i);
      if (!filenameMatch) {
        return sendJSON(res, 400, { error: "No filename found" });
      }

      filename = filenameMatch[1];
      const ext = path.extname(filename) || ".png";
      const name = `${uuidv4()}${ext}`;
      const fullPath = path.join(UPLOADS_DIR, name);
      savedUrl = `/images/${name}`;

      // Find where file content starts (after \r\n\r\n)
      const fileStart = headerEnd + 4;
      
      // Find where file content ends (before the closing boundary)
      const boundaryEndPos = bufferStr.indexOf(`\r\n${BOUNDARY}`, fileStart);
      if (boundaryEndPos === -1) {
        return sendJSON(res, 400, { error: "Invalid multipart structure" });
      }

      // Extract only the file binary data (not as string!)
      const fileData = buffer.slice(fileStart, boundaryEndPos);

      // Write the actual image data to file
      fs.writeFile(fullPath, fileData, (err) => {
        if (err) {
          console.error("Write error:", err);
          return sendJSON(res, 500, { error: "Failed to save file" });
        }
        sendJSON(res, 200, { message: "Upload complete", url: savedUrl });
      });

    } catch (err) {
      console.error("Upload processing error:", err);
      sendJSON(res, 500, { error: "Failed to process upload" });
    }
  });

  req.on("error", (err) => {
    console.error("Request error:", err);
    if (fileStream) fileStream.destroy();
    sendJSON(res, 500, { error: "Upload aborted" });
  });
};