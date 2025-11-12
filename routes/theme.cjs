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

// POST: Upload image stream
const upload = (req, res) => {
  if (req.method !== 'POST') {
    return sendJSON(res, 405, { error: 'Method Not Allowed' });
  }

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
    return sendJSON(res, 400, { error: 'Expected multipart/form-data' });
  }

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    return sendJSON(res, 400, { error: 'Missing boundary' });
  }

  const boundaryBytes = Buffer.from(`--${boundary}`);
  const boundaryEnd = Buffer.from(`--${boundary}--`);
  let chunks = [];
  let fileStarted = false;
  let filename = '';
  let fileStream = null;
  let fileUrl = '';

  const finishUpload = () => {
    if (!fileUrl) {
      return sendJSON(res, 400, { error: 'No file uploaded' });
    }
    sendJSON(res, 200, { message: 'Upload complete', url: fileUrl });
  };

  req.on('data', (chunk) => {
    chunks.push(chunk);

    // Wait until we have enough data to parse
    if (!fileStarted && chunks.length > 0) {
      const buffer = Buffer.concat(chunks);
      const boundaryIndex = buffer.indexOf(boundaryBytes);

      if (boundaryIndex !== -1) {
        // Find filename from headers
        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), boundaryIndex);
        if (headerEnd !== -1) {
          const headers = buffer.slice(boundaryIndex, headerEnd).toString();
          const filenameMatch = headers.match(/filename="([^"]+)"/);
          if (filenameMatch) {
            filename = `${uuidv4()}${path.extname(filenameMatch[1]) || '.png'}`;
            const filepath = path.join(UPLOADS_DIR, filename);
            fileStream = fs.createWriteStream(filepath);
            fileUrl = `/images/${filename}`;

            // Write file content (after \r\n\r\n)
            const fileStart = headerEnd + 4;
            const initialData = buffer.slice(fileStart);
            if (initialData.length > 0) {
              fileStream.write(initialData);
            }
            fileStarted = true;
            chunks = []; // Clear chunks after first write
          }
        }
      }
    } else if (fileStarted && fileStream) {
      // Write incoming chunks to file
      const buffer = Buffer.from(chunk);
      const endIndex = buffer.indexOf(boundaryEnd);
      if (endIndex !== -1) {
        // Last chunk — write up to boundary
        fileStream.write(buffer.slice(0, endIndex));
        fileStream.end();
        req.pause(); // Stop reading
      } else {
        const boundaryIndex = buffer.indexOf(boundaryBytes);
        if (boundaryIndex !== -1) {
          fileStream.write(buffer.slice(0, boundaryIndex));
          fileStream.end();
        } else {
          fileStream.write(buffer);
        }
      }
    }
  });

  req.on('end', () => {
    if (fileStream) {
      fileStream.on('finish', finishUpload);
      fileStream.on('error', (err) => {
        console.error('File write error:', err);
        sendJSON(res, 500, { error: 'Upload failed' });
      });
    } else {
      finishUpload();
    }
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
    if (fileStream) fileStream.destroy();
    sendJSON(res, 500, { error: 'Upload failed' });
  });
};