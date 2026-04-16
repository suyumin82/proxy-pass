const API_LOG_TABLE = process.env.API_LOG_TABLE || "api_logs";

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
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

module.exports = (pool, parsedUrl, req, res) => {
  if (parsedUrl.pathname.endsWith("/logs/list")) {
    return list(pool, req, res);
  }

  return sendJSON(res, 404, { error: "Route not found" });
};

const list = async (pool, req, res) => {
  try {
    const {
      startDate,
      endDate,
      apiName,
      userId,
      balance,
      authorization,
      type,
      limit = 50,
      page = 1,
    } = await parseBody(req);

    if (!startDate || !endDate) {
      return sendJSON(res, 400, {
        error: "startDate and endDate are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return sendJSON(res, 400, { error: "Invalid date range" });
    }

    const filters = ["`date` BETWEEN ? AND ?"];
    const params = [start, end];

    if (apiName) {
      filters.push("api_name LIKE ?");
      params.push(`%${apiName}%`);
    }

    if (userId) {
      filters.push("JSON_UNQUOTE(JSON_EXTRACT(body, '$.data.userId')) = ?");
      params.push(String(userId));
    }

    if (balance) {
      filters.push("JSON_UNQUOTE(JSON_EXTRACT(body, '$.data.balance')) = ?");
      params.push(String(balance));
    }

    if (authorization) {
      filters.push("JSON_UNQUOTE(JSON_EXTRACT(header, '$.authorization')) LIKE ?");
      params.push("%" + authorization + "%");
    }

    if (type) {
      const normalizedType = String(type).toLowerCase();
      if (!["request", "response"].includes(normalizedType)) {
        return sendJSON(res, 400, { error: "type must be request or response" });
      }
      filters.push("`type` = ?");
      params.push(normalizedType);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (currentPage - 1) * pageSize;

    const [rows] = await pool.query(
      `SELECT id, api_name, type, date, body, header
       FROM ${API_LOG_TABLE}
       ${whereClause}
       ORDER BY date DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${API_LOG_TABLE} ${whereClause}`,
      params
    );

    sendJSON(res, 200, {
      logs: rows,
      pagination: {
        total,
        pageSize,
        currentPage,
        totalPages: Math.ceil(total / pageSize) || 0,
      },
    });
  } catch (err) {
    console.error("Failed to list api logs:", err);
    sendJSON(res, 500, { error: "Failed to fetch logs" });
  }
};
