import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// GET /search/items?q=мешок+мусорный+20+литров&page=1&limit=50
// Возвращает список всех СТЕ по запросу (включая без контрактов), contract_ids — массив id контрактов
router.get("/items", async (req, res) => {
	try {
		const q = (req.query.q as string)?.trim();
		if (!q) return res.status(400).json({ error: "q parameter required" });

		const page = Math.max(1, parseInt(req.query.page as string) || 1);
		const limit = Math.min(
			200,
			Math.max(1, parseInt(req.query.limit as string) || 50),
		);
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
          COALESCE(
            array_agg(DISTINCT ci.contract_id) FILTER (WHERE ci.contract_id IS NOT NULL),
            '{}'
          ) AS contract_ids
        FROM ste s
        LEFT JOIN contract_items ci ON ci.ste_id = s.id
        WHERE s.search_vector @@ plainto_tsquery('russian', ${q})
        GROUP BY s.id, s.name, s.category, s.manufacturer, s.characteristics, rank
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
			db.execute(sql`
        SELECT count(DISTINCT s.id)::int AS count
        FROM ste s
        WHERE s.search_vector @@ plainto_tsquery('russian', ${q})
      `),
		]);

		const total = (countResult.rows[0] as { count: number }).count;

		res.json({ data: rows.rows, total, page, limit });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// GET /search/ste/:steId/contracts
// Возвращает список контрактов с данным СТЕ
router.get("/ste/:steId/contracts", async (req, res) => {
	try {
		const steId = parseInt(req.params.steId);
		if (isNaN(steId)) return res.status(400).json({ error: "invalid steId" });

		const rows = await db.execute(sql`
      SELECT
        c.id                          AS contract_id,
        c.procurement_name,
        c.procurement_method,
        c.initial_contract_value,
        c.contract_value_after_signing,
        c.reduction_percent,
        c.vat_rate,
        c.contract_signing_date,
        c.buyer_inn,
        c.buyer_region,
        c.supplier_inn,
        c.supplier_region,
        ci.id                         AS item_id,
        ci.ste_item_name,
        ci.quantity,
        ci.unit,
        ci.unit_price
      FROM contract_items ci
      JOIN contracts c ON c.id = ci.contract_id
      WHERE ci.ste_id = ${steId}
      ORDER BY c.id, ci.id
    `);

		res.json({ data: rows.rows });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

export default router;
