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

  const BOUNDARY      = Buffer.from(`--${boundary}`);
  const BOUNDARY_END  = Buffer.from(`--${boundary}--`);
  const HEADER_END    = Buffer.from("\r\n\r\n");

  let chunks      = [];          // collected incoming data
  let fileStream  = null;        // write-stream for the image
  let savedUrl    = "";          // /images/xxxx.png
  let inFilePart  = false;       // true after we have seen the file headers

  const finish = () => {
    if (!savedUrl) return sendJSON(res, 400, { error: "No file received" });
    sendJSON(res, 200, { message: "Upload complete", url: savedUrl });
  };

  req.on("data", chunk => {
    chunks.push(chunk);

    // ----- FIRST CHUNK – locate the file part -----------------
    if (!inFilePart) {
      const buf = Buffer.concat(chunks);
      const bIdx = buf.indexOf(BOUNDARY);
      if (bIdx === -1) return;

      const hEnd = buf.indexOf(HEADER_END, bIdx);
      if (hEnd === -1) return;               // need more data

      const headerText = buf.slice(bIdx, hEnd).toString("utf8");
      const fnMatch = headerText.match(/filename="([^"]+)"/i);
      if (!fnMatch) return sendJSON(res, 400, { error: "No filename" });

      // ---- create file -------------------------------------------------
      const ext = path.extname(fnMatch[1]) || ".png";
      const name = `${uuidv4()}${ext}`;
      const fullPath = path.join(UPLOADS_DIR, name);
      fileStream = fs.createWriteStream(fullPath);
      savedUrl = `/images/${name}`;

      // write everything **after** \r\n\r\n
      const start = hEnd + HEADER_END.length;
      const firstData = buf.slice(start);
      if (firstData.length) fileStream.write(firstData);

      // keep the part that is still in the buffer
      chunks = [buf.slice(start)];
      inFilePart = true;
      return;
    }

    // ----- SUBSEQUENT CHUNKS – write until next boundary ----------
    const buf = Buffer.concat(chunks);
    const endIdx = buf.indexOf(BOUNDARY_END);
    const nextIdx = buf.indexOf(BOUNDARY);

    if (endIdx !== -1) {                     // final boundary
      fileStream.write(buf.slice(0, endIdx));
      fileStream.end();
      req.pause();                           // stop reading
    } else if (nextIdx !== -1) {             // next part starts
      fileStream.write(buf.slice(0, nextIdx));
      fileStream.end();
    } else {
      fileStream.write(buf);
    }
    chunks = [];                             // reset for next round
  });

  req.on("end", () => {
    if (fileStream) {
      fileStream.on("finish", finish);
      fileStream.on("error", err => {
        console.error("Write error:", err);
        sendJSON(res, 500, { error: "Write failed" });
      });
    } else {
      finish();
    }
  });

  req.on("error", err => {
    console.error("Request error:", err);
    if (fileStream) fileStream.destroy();
    sendJSON(res, 500, { error: "Upload aborted" });
  });
};