const http = require("http");
const httpProxy = require("http-proxy");
const url = require("url");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const userRouter = require("./routes/users.cjs");
const updateRouter = require("./routes/update.cjs");
const maintainRouter = require("./routes/maintain.cjs");
const gameRouter = require("./routes/game.cjs");
const themeRouter = require('./routes/theme.cjs');
const verifyJWT = require("./utils/auth.cjs");
const setCORS = require("./utils/cors.cjs");

// Load environment variables
dotenv.config();

// Get port and target from environment variables with fallback values
const PORT = process.env.PORT || 3000;
const TARGET = process.env.PROXY_TARGET || "bea-data.ixchannels.com";
const MCW_API_PATH = "/mcw/api/";

// Create a proxy server instance
const proxy = httpProxy.createProxyServer({});

// Configuration
const IMAGES_PATH = path.join(__dirname, "images");
const ALLOWED_IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/.txt",
};

// List of API endpoints to proxy
const API_ENDPOINTS = [
  "/api/bd/v2_1/report/generateSettledBetsSummary",
  "/api/bd/v2_1/setting/getCustomerService",
  "/api/bd/v2_1/setting/getRegisterSetting",
  "/api/bd/v2_1/provider/getFavouriteGames",
  "/api/bd/v2_1/provider/setFavoriteByGameId",
  "/api/bd/v2_1/provider/getGameListByCategory",
  "/api/bd/v2_1/provider/getGameUrl",
  "/api/bd/v2_1/user/deleteInbox",
  "/api/bd/v2_1/user/getCaptchaCode",
  "/api/bd/v2_1/user/getInboxFromDC",
  "/api/bd/v2_1/user/getPlayerInfo",
  "/api/bd/v2_1/user/getProfile",
  "/api/bd/v2_1/user/forgotPassword",
  "/api/bd/v2_1/user/getVerifyCodeByContactType",
  "/api/bd/v2_1/user/login",
  "/api/bd/v2_1/user/register",
  "/api/bd/v2_1/user/readInbox",
  "/api/bd/v2_1/user/refreshToken",
  "/api/bd/v2_1/user/verifyContact",
  "/api/bd/v2_1/user/changePassword",
  "/api/bd/v2_1/provider/getCategoriesByGroup",
  "/api/bd/v2_1/provider/getVendors",
  "/api/bd/v2_1/user/getBalance",
  "/api/bd/v2_1/report/generateSettledBetsDetail",
  "/api/bd/v2_1/report/generateUnsettledBetsDetail",
  "/api/bd/v2_1/message/getMessageByTypes",
  "/api/bd/v2_1/provider/getCategoriesByGroup",
  "/api/bd/v2_1/message/getFeaturedGames",
];

//✅ 1. MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DBHOST,
  user: process.env.DBUSER,
  password: process.env.DBPWD,
  database: process.env.DATABASE,
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0,
});

// Function to log request details
const logRequest = (req, body = "") => {
  const timestamp = new Date().toISOString();
  console.log("\n=== Request Log ===");
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.url}`);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));

  if (body) {
    try {
      const parsedBody = JSON.parse(body);
      console.log("Body:", JSON.stringify(parsedBody, null, 2));
    } catch (e) {
      console.log("Body:", body);
    }
  }
};

// Function to decompress response
const decompressResponse = (buffer, encoding) => {
  return new Promise((resolve, reject) => {
    if (!buffer || buffer.length === 0) {
      resolve(buffer);
      return;
    }

    switch (encoding) {
      case "gzip":
        zlib.gunzip(buffer, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
        break;
      case "deflate":
        zlib.inflate(buffer, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
        break;
      case "br":
        zlib.brotliDecompress(buffer, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
        break;
      default:
        resolve(buffer);
    }
  });
};

// Function to log response details
const logResponse = async (proxyRes, req, res) => {
  const chunks = [];

  proxyRes.on("data", (chunk) => chunks.push(chunk));

  proxyRes.on("end", async () => {
    const buffer = Buffer.concat(chunks);
    const encoding = proxyRes.headers["content-encoding"];

    try {
      // Decompress the response if it's compressed
      const decompressedBuffer = await decompressResponse(buffer, encoding);
      const responseBody = decompressedBuffer.toString("utf8");

      console.log("\n=== Response Log ===");
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log(`URL: ${req.url}`);
      console.log(`Status Code: ${proxyRes.statusCode}`);
      console.log(
        "Response Headers:",
        JSON.stringify(proxyRes.headers, null, 2)
      );

      try {
        const parsedBody = JSON.parse(responseBody);
        console.log("Response Body:", JSON.stringify(parsedBody, null, 2));
      } catch (e) {
        console.log("Response Body:", responseBody);
      }
    } catch (error) {
      console.error("Error processing response:", error);
    }
  });
};

// Function to serve static images
const serveImage = (req, res) => {
  const parsedUrl = url.parse(req.url);
  const filename  = path.basename(parsedUrl.pathname);   // <-- safer
  const imagePath = path.join(IMAGES_PATH, filename);

  if (!imagePath.startsWith(IMAGES_PATH)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  const ext = path.extname(imagePath).toLowerCase();
  if (!ALLOWED_IMAGE_TYPES[ext]) {
    res.writeHead(403); res.end("File type not allowed"); return;
  }

  fs.readFile(imagePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    res.writeHead(200, {
      "Content-Type":   ALLOWED_IMAGE_TYPES[ext],
      "Content-Length": data.length,
      "Cache-Control":  "public, max-age=86400",
    });
    res.end(data);
  });
};

// Create server
const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url);

  if (parsedUrl.pathname.startsWith("/images/")) {
    return serveImage(req, res);
  }

  if (parsedUrl.pathname === `${MCW_API_PATH}ping`) {
    return ping(req, res);
  }

  if (parsedUrl.pathname === `${MCW_API_PATH}update`) {
    return forceUpdateFromLocal(req, res);
  }

  if (parsedUrl.pathname === `${MCW_API_PATH}game`) {
    return gameCategoryFromLocal(req, res);
  }

  if (parsedUrl.pathname === `${MCW_API_PATH}maintenance`) {
    return getMaintenanceFromLocal(req, res);
  }

  if (parsedUrl.pathname === `${MCW_API_PATH}v2/update`) {
    return forceUpdate(req, res);
  }

  if (parsedUrl.pathname === `${MCW_API_PATH}v2/game`) {
    return gameCategory(req, res);
  }

  if (parsedUrl.pathname === `${MCW_API_PATH}v2/maintenance`) {
    return getMaintenance(req, res);
  }

  if (parsedUrl.pathname.startsWith(`${MCW_API_PATH}v2/user`)) {
    setCORS(res);
    return userRouter(pool, parsedUrl, req, res);
  }

  if (parsedUrl.pathname.startsWith(`${MCW_API_PATH}v2/updates`)) {
    setCORS(res);
    const user = verifyJWT(req, res);
    if (!user) return;
    return updateRouter(pool, parsedUrl, req, res, user);
  }

  if (parsedUrl.pathname.startsWith(`${MCW_API_PATH}v2/maintain`)) {
    setCORS(res);
    const user = verifyJWT(req, res);
    if (!user) return;
    return maintainRouter(pool, parsedUrl, req, res, user);
  }

  if (parsedUrl.pathname.startsWith(`${MCW_API_PATH}v2/games`)) {
    setCORS(res);
    const user = verifyJWT(req, res);
    if (!user) return;
    return gameRouter(pool, parsedUrl, req, res, user);
  }

  if (parsedUrl.pathname.startsWith(`${MCW_API_PATH}v2/theme`)) {
    setCORS(res);
    const user = verifyJWT(req, res);
    if (!user) return;
    return themeRouter(pool, parsedUrl, req, res, user);
  }

  if (API_ENDPOINTS.includes(parsedUrl.pathname)) {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      // Log the complete request including body
      logRequest(req, body);

      // Create a buffer stream from the body
      const bodyStream = require("stream").Readable.from([body]);

      // Forward the request to the target server
      proxy.web(req, res, {
        target: TARGET,
        changeOrigin: true,
        buffer: bodyStream,
        selfHandleResponse: true, // <-- Add this!
      });
    });
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// API route to serve the update JSON
const forceUpdate = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM app_updates ORDER BY id DESC LIMIT 1"
    );
    if (rows.length === 0)
      return send(res, 404, { error: "No update info found" });

    const data = rows[0];
    const result = {
      update_required: !!data.update_required,
      latest_version: data.latest_version,
      minimum_version: data.minimum_version,
      update_type: data.update_type,
      update_message: data.update_message,
      update_url: data.update_url,
      changelog: data.changelog ? data.changelog.split("\\n") : [],
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("Error parsing force update:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON format in force update" }));
  }
};

// API route to serve the update JSON
const forceUpdateFromLocal = (req, res) => {
  const filePath = path.join(__dirname, "json", "update.json");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading update.json:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Failed to load update details" })
      );
    }

    try {
      const updateInfo = JSON.parse(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(updateInfo));
    } catch (parseError) {
      console.error("Error parsing update.json:", parseError);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON format in update.json" }));
    }
  });
};

const getMaintenance = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM maintenance_settings ORDER BY id DESC LIMIT 1"
    );
    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No maintenance config found" }));
    }

    const data = rows[0];
    const maintenanceInfo = {
      maintenance_mode: !!data.maintenance_mode,
      title: data.title,
      subtitle: data.subtitle,
      message: data.message,
      start_time: data.start_time,
      end_time: data.end_time,
      timezone: data.timezone,
      icon: data.icon,
      display: {
        text_align: data.text_align,
        theme_color: data.theme_color,
        background_color: data.background_color,
      },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(maintenanceInfo));
  } catch (err) {
    console.error("Error parsing maintenance.json:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "Invalid JSON format in maintenance.json" })
    );
  }
};

const getMaintenanceFromLocal = (req, res) => {
  const filePath = path.join(__dirname, "json", "maintenance.json");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading maintenance.json:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Failed to load maintenance data" })
      );
    }

    try {
      const maintenanceInfo = JSON.parse(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(maintenanceInfo));
    } catch (parseError) {
      console.error("Error parsing maintenance.json:", parseError);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Invalid JSON format in maintenance.json" })
      );
    }
  });
};

const removeBackgroundImage = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(removeBackgroundImage);
  } else if (typeof obj === "object" && obj !== null) {
    const cleaned = {};
    for (const key in obj) {
      if (
        typeof obj[key] === "string" &&
        obj[key].includes("background-image:")
      ) {
        cleaned[key] = obj[key].replace(
          /background-image:\s*url\(['"][^)]+['"]\);?/gi,
          ""
        );
      } else {
        cleaned[key] = removeBackgroundImage(obj[key]);
      }
    }
    return cleaned;
  } else {
    return obj;
  }
};

const convertBackgroundToImgSrc = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(convertBackgroundToImgSrc);
  } else if (typeof obj === "object" && obj !== null) {
    const cleaned = {};
    for (const key in obj) {
      if (
        typeof obj[key] === "string" &&
        obj[key].includes("background-image:")
      ) {
        cleaned[key] = transformHtmlWithBackground(obj[key]);
      } else {
        cleaned[key] = convertBackgroundToImgSrc(obj[key]);
      }
    }
    return cleaned;
  } else {
    return obj;
  }
};

const transformHtmlWithBackground = (html) => {
  try {
    // 1. Extract background image URL
    const match = html.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/i);
    if (!match) return html;
    const imageUrl = match[1];

    // 2. Inject src="..." into <img> tag if it exists
    const withSrc = html.replace(
      /<img\s(?![^>]*src=)([^>]*?)>/i, // only if src doesn't already exist
      `<img src="${imageUrl}" $1>`
    );

    // 3. Remove background-image from style
    let cleaned = withSrc.replace(
      /background-image:\s*url\(['"]?.*?['"]?\);?/gi,
      ""
    );

    // 4. Remove any trailing parenthesis or semicolon after style
    cleaned = cleaned.replace(
      /background-size:100%;\s*\);?/gi,
      "background-size:100%;"
    );

    // 5. Clean up extra semicolons and spaces in style attribute
    cleaned = cleaned.replace(/\sstyle="([^"]*)"/gi, (match, style) => {
      const cleanedStyle = style
        .replace(/;;+/g, ";")
        .replace(/\s+/g, " ")
        .trim();
      return ` style="${cleanedStyle}"`;
    });

    return cleaned;
  } catch (e) {
    console.warn("Failed to transform HTML string:", html, e);
    return html;
  }
};

const ping = async (req, res) => {
  try {
    let message = {
      code: 0,
      message: "Hello world!",
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(message));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err }));
  }
};

const gameCategory = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT category_id, display_order, name, display_name FROM games ORDER BY display_order ASC"
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  } catch (err) {
    console.error("Error parsing games.json:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON format in games.json" }));
  }
};

const gameCategoryFromLocal = (req, res) => {
  const filePath = path.join(__dirname, "json", "game.json");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading update.json:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Failed to load update details" })
      );
    }

    try {
      const updateInfo = JSON.parse(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(updateInfo));
    } catch (parseError) {
      console.error("Error parsing update.json:", parseError);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON format in update.json" }));
    }
  });
};

// Error handling
proxy.on("error", (err, req, res) => {
  console.error("Proxy Error:", err);
  if (!res.headersSent) {
    res.writeHead(500, {
      "Content-Type": "text/plain",
    });
    res.end("Proxy Error");
  }
});

// Set up proxy response logging
proxy.on("proxyRes", (proxyRes, req, res) => {
  const chunks = [];
  let responseSent = false; // <-- Add this guard

  proxyRes.on("data", (chunk) => chunks.push(chunk));
  proxyRes.on("end", async () => {
    if (responseSent) return; // <-- Prevent double send
    const buffer = Buffer.concat(chunks);
    const encoding = proxyRes.headers["content-encoding"];

    try {
      const decompressedBuffer = await decompressResponse(buffer, encoding);
      const responseBody = decompressedBuffer.toString("utf8");

      console.log("\n=== Response Log ===");
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log(`URL: ${req.url}`);
      console.log(`Status Code: ${proxyRes.statusCode}`);
      console.log(
        "Response Headers:",
        JSON.stringify(proxyRes.headers, null, 2)
      );

      if (req.url === "/api/bd/v2_1/user/getInboxFromDC") {
        try {
          const parsedBody = JSON.parse(responseBody);
          const cleaned = removeBackgroundImage(parsedBody);
          const finalBody = JSON.stringify(cleaned);

          res.writeHead(proxyRes.statusCode || 200, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(finalBody),
          });
          responseSent = true; // <-- Set guard
          return res.end(finalBody);
        } catch (e) {
          console.error("Failed to parse JSON for cleaning:", e);
          responseSent = true; // <-- Set guard
          return res.end(responseBody);
        }
      } else if (req.url === "/api/bd/v2_1/message/getMessageByTypes") {
        try {
          const parsedBody = JSON.parse(responseBody);
          const cleaned = convertBackgroundToImgSrc(parsedBody);
          const finalBody = JSON.stringify(cleaned);
          res.writeHead(proxyRes.statusCode || 200, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(finalBody),
          });
          responseSent = true; // <-- Set guard
          return res.end(finalBody);
        } catch (e) {
          console.error("Failed to parse JSON for cleaning:", e);
          responseSent = true; // <-- Set guard
          return res.end(responseBody);
        }
      }

      // Fallback: forward response unmodified
      if (!responseSent) {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        res.end(buffer);
        responseSent = true;
      }
    } catch (err) {
      if (!responseSent) {
        console.error("Failed to handle proxy response:", err);
        res.writeHead(500);
        res.end("Proxy error while reading response");
        responseSent = true;
      }
    }
  });
});

// Ensure images directory exists
if (!fs.existsSync(IMAGES_PATH)) {
  fs.mkdirSync(IMAGES_PATH, { recursive: true });
  console.log(`Created images directory at: ${IMAGES_PATH}`);
}

// Start the server
server.listen(PORT, () => {
  console.log(`Proxy server is running on port ${PORT}`);
  console.log(`Serving images from: ${IMAGES_PATH}`);
});
