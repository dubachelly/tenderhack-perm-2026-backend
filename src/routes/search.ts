import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// GET /search/items?q=мешок+мусорный+20+литров&page=1&limit=50
// Возвращает список СТЕ, каждая с вложенным массивом contract_items
router.get("/items", async (req, res) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q) return res.status(400).json({ error: "q parameter required" });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.execute(sql`
        SELECT
          s.id              AS ste_id,
          s.name            AS ste_name,
          s.category        AS ste_category,
          s.manufacturer    AS ste_manufacturer,
          s.characteristics AS ste_characteristics,
          ts_rank(s.search_vector, plainto_tsquery('russian', ${q})) AS rank,
          json_agg(
            json_build_object(
              'id',           ci.id,
              'contract_id',  ci.contract_id,
              'ste_item_name', ci.ste_item_name,
              'quantity',     ci.quantity,
              'unit',         ci.unit,
              'unit_price',   ci.unit_price
            )
            ORDER BY ci.id
          ) AS contracts
        FROM ste s
        INNER JOIN contract_items ci ON ci.ste_id = s.id
        WHERE s.search_vector @@ plainto_tsquery('russian', ${q})
        GROUP BY s.id
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT count(DISTINCT s.id)::int AS count
        FROM ste s
        INNER JOIN contract_items ci ON ci.ste_id = s.id
        WHERE s.search_vector @@ plainto_tsquery('russian', ${q})
      `),
    ]);

    const total = (countResult.rows[0] as { count: number }).count;

    res.json({ data: rows.rows, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
