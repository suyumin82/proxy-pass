const FAQ_TABLE = process.env.FAQ_TABLE || "faqs";

const sendJSON = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

module.exports = (pool, parsedUrl, req, res, user) => {
  if (parsedUrl.pathname.endsWith("/faq/list")) {
    return list(pool, req, res);
  }

  if (parsedUrl.pathname.endsWith("/faq/get")) {
    return getById(pool, req, res);
  }

  if (parsedUrl.pathname.endsWith("/faq/create")) {
    return create(pool, req, res, user);
  }

  if (parsedUrl.pathname.endsWith("/faq/update")) {
    return update(pool, req, res, user);
  }

  if (parsedUrl.pathname.endsWith("/faq/status")) {
    return updateStatus(pool, req, res, user);
  }

  return sendJSON(res, 404, { error: "Route not found" });
};

const coerceBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    if (["true", "1", "active"].includes(value.toLowerCase())) return true;
    if (["false", "0", "inactive"].includes(value.toLowerCase())) return false;
  }
  return undefined;
};

const list = async (pool, req, res) => {
  try {
    const { topic, status, search, page = 1, limit = 50 } = await parseBody(req);

    const filters = [];
    const params = [];

    if (topic) {
      filters.push("topic = ?");
      params.push(topic);
    }

    const normalizedStatus = coerceBoolean(status);
    if (typeof normalizedStatus === "boolean") {
      filters.push("is_active = ?");
      params.push(normalizedStatus ? 1 : 0);
    }

    if (search) {
      filters.push("(title LIKE ? OR body LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (currentPage - 1) * pageSize;

    const [rows] = await pool.query(
      `SELECT id, title, body, topic, is_active, created_by, updated_by, created_at, updated_at
       FROM ${FAQ_TABLE}
       ${whereClause}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${FAQ_TABLE} ${whereClause}`,
      params
    );

    sendJSON(res, 200, {
      faqs: rows,
      pagination: {
        total,
        pageSize,
        currentPage,
        totalPages: Math.ceil(total / pageSize) || 0,
      },
    });
  } catch (err) {
    console.error("Failed to list FAQs:", err);
    sendJSON(res, 500, { error: "Failed to fetch FAQs" });
  }
};

const getById = async (pool, req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id } = body ? JSON.parse(body) : {};
      if (!id) {
        return sendJSON(res, 400, { error: "id is required" });
      }

      const [rows] = await pool.query(
        `SELECT id, title, body, topic, is_active, created_by, updated_by, created_at, updated_at
         FROM ${FAQ_TABLE}
         WHERE id = ?`,
        [id]
      );

      if (!rows.length) {
        return sendJSON(res, 404, { error: "FAQ not found" });
      }

      sendJSON(res, 200, rows[0]);
    } catch (err) {
      console.error("Failed to fetch FAQ:", err);
      sendJSON(res, 500, { error: "Failed to fetch FAQ" });
    }
  });
};

const create = async (pool, req, res, user) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { title, body: content, topic, isActive = true } = body ? JSON.parse(body) : {};

      if (!title || !content || !topic) {
        return sendJSON(res, 400, { error: "title, body, and topic are required" });
      }

      const normalizedStatus = coerceBoolean(isActive);
      if (typeof normalizedStatus === "undefined") {
        return sendJSON(res, 400, { error: "isActive must be true or false" });
      }

      const [result] = await pool.query(
        `INSERT INTO ${FAQ_TABLE} (title, body, topic, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)` ,
        [title.trim(), content, topic.trim(), normalizedStatus ? 1 : 0, user?.username || null, user?.username || null]
      );

      sendJSON(res, 201, { message: "FAQ created", id: result.insertId });
    } catch (err) {
      console.error("Failed to create FAQ:", err);
      sendJSON(res, 500, { error: "Failed to create FAQ" });
    }
  });
};

const update = async (pool, req, res, user) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id, title, body: content, topic, isActive } = body ? JSON.parse(body) : {};

      if (!id) return sendJSON(res, 400, { error: "id is required" });
      if (!title && !content && !topic && typeof isActive === "undefined") {
        return sendJSON(res, 400, { error: "Nothing to update" });
      }

      const fields = [];
      const params = [];

      if (title) {
        fields.push("title = ?");
        params.push(title.trim());
      }
      if (content) {
        fields.push("body = ?");
        params.push(content);
      }
      if (topic) {
        fields.push("topic = ?");
        params.push(topic.trim());
      }
      if (typeof isActive !== "undefined") {
        const normalizedStatus = coerceBoolean(isActive);
        if (typeof normalizedStatus === "undefined") {
          return sendJSON(res, 400, { error: "isActive must be true or false" });
        }
        fields.push("is_active = ?");
        params.push(normalizedStatus ? 1 : 0);
      }

      fields.push("updated_by = ?");
      params.push(user?.username || null);

      params.push(id);

      await pool.query(
        `UPDATE ${FAQ_TABLE}
         SET ${fields.join(", ")}, updated_at = NOW()
         WHERE id = ?`,
        params
      );

      sendJSON(res, 200, { message: "FAQ updated" });
    } catch (err) {
      console.error("Failed to update FAQ:", err);
      sendJSON(res, 500, { error: "Failed to update FAQ" });
    }
  });
};

const updateStatus = async (pool, req, res, user) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { id, isActive } = body ? JSON.parse(body) : {};
      if (!id || typeof isActive === "undefined") {
        return sendJSON(res, 400, { error: "id and isActive are required" });
      }

      const normalizedStatus = coerceBoolean(isActive);
      if (typeof normalizedStatus === "undefined") {
        return sendJSON(res, 400, { error: "isActive must be true or false" });
      }

      await pool.query(
        `UPDATE ${FAQ_TABLE}
         SET is_active = ?, updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [normalizedStatus ? 1 : 0, user?.username || null, id]
      );

      sendJSON(res, 200, { message: "FAQ status updated" });
    } catch (err) {
      console.error("Failed to update FAQ status:", err);
      sendJSON(res, 500, { error: "Failed to update FAQ status" });
    }
  });
};
