# proxy-pass

## FAQ Admin API

Authenticated users (valid JWT via `/mcw/api/v2/user/login`) can now manage FAQs under the `/mcw/api/v2/faq/*` namespace.

### Table

Create the backing table (or point `FAQ_TABLE` to your preferred table name):

```sql
CREATE TABLE IF NOT EXISTS faqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  topic VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(100),
  updated_by VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Set `FAQ_TABLE=faqs` (or your custom table) in `.env` if you want a non-default name.

### Endpoints

All endpoints require the `Authorization: Bearer <token>` header.

| Endpoint | Method | Body | Description |
| --- | --- | --- | --- |
| `/mcw/api/v2/faq/list` | POST | `{ "topic?": string, "status?": true/false, "search?": string, "page?": number, "limit?": number }` | Paginated list filtered by topic, status, and free-text search on title/body. |
| `/mcw/api/v2/faq/get` | POST | `{ "id": number }` | Fetch a single FAQ. |
| `/mcw/api/v2/faq/create` | POST | `{ "title": string, "body": string, "topic": string, "isActive?": bool }` | Create a FAQ; `created_by`/`updated_by` are filled with the caller’s username. |
| `/mcw/api/v2/faq/update` | POST | `{ "id": number, "title?": string, "body?": string, "topic?": string, "isActive?": bool }` | Update any combination of fields. |
| `/mcw/api/v2/faq/status` | POST | `{ "id": number, "isActive": bool }` | Quick enable/disable toggle. |

Example list request:

```bash
curl -X POST https://<host>/mcw/api/v2/faq/list \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
        "topic": "withdrawal",
        "status": true,
        "search": "bank",
        "page": 1,
        "limit": 20
      }'
```

Response:

```json
{
  "faqs": [
    {
      "id": 1,
      "title": "How do I reset my password?",
      "body": "Go to settings...",
      "topic": "account",
      "is_active": 1,
      "created_by": "admin",
      "updated_by": "admin",
      "created_at": "2026-03-24T08:15:00.000Z",
      "updated_at": "2026-03-24T08:15:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "pageSize": 20,
    "currentPage": 1,
    "totalPages": 1
  }
}
```
