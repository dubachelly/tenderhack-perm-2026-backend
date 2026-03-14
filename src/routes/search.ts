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
		const limit = Math.min(
			200,
			Math.max(1, parseInt(req.query.limit as string) || 50),
		);
		const offset = (page - 1) * limit;

		const [rows, countResult] = await Promise.all([
			db.execute(sql`
        WITH StePriceStats AS (
          SELECT
            ci.ste_id,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ci.unit_price) AS q1,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ci.unit_price) AS q3
          FROM contract_items ci
          GROUP BY ci.ste_id
        ),
        SteFilteredPrices AS (
          SELECT
            ci.id,
            ci.contract_id,
            ci.ste_id,
            ci.ste_item_name,
            ci.quantity,
            ci.unit,
            ci.unit_price
          FROM contract_items ci
          JOIN StePriceStats sps ON ci.ste_id = sps.ste_id
          WHERE
            ci.unit_price >= (sps.q1 - 1.5 * (sps.q3 - sps.q1)) AND
            ci.unit_price <= (sps.q3 + 1.5 * (sps.q3 - sps.q1))
        )
        SELECT
          s.id              AS ste_id,
          s.name            AS ste_name,
          s.category        AS ste_category,
          s.manufacturer    AS ste_manufacturer,
          s.characteristics AS ste_characteristics,
          ts_rank(s.search_vector, plainto_tsquery('russian', ${q})) AS rank,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sfp.unit_price) AS median_price,
          json_agg(
            json_build_object(
              'id',           sfp.id,
              'contract_id',  sfp.contract_id,
              'ste_item_name', sfp.ste_item_name,
              'quantity',     sfp.quantity,
              'unit',         sfp.unit,
              'unit_price',   sfp.unit_price
            )
            ORDER BY sfp.id
          ) AS contracts
        FROM ste s
        INNER JOIN SteFilteredPrices sfp ON sfp.ste_id = s.id
        WHERE s.search_vector @@ plainto_tsquery('russian', ${q})
        GROUP BY s.id, s.name, s.category, s.manufacturer, s.characteristics, rank
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
			db.execute(sql`
        WITH StePriceStats AS (
          SELECT
            ci.ste_id,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ci.unit_price) AS q1,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ci.unit_price) AS q3
          FROM contract_items ci
          GROUP BY ci.ste_id
        ),
        SteFilteredPrices AS (
          SELECT
            ci.id,
            ci.contract_id,
            ci.ste_id,
            ci.unit_price
          FROM contract_items ci
          JOIN StePriceStats sps ON ci.ste_id = sps.ste_id
          WHERE
            ci.unit_price >= (sps.q1 - 1.5 * (sps.q3 - sps.q1)) AND
            ci.unit_price <= (sps.q3 + 1.5 * (sps.q3 - sps.q1))
        )
        SELECT count(DISTINCT s.id)::int AS count
        FROM ste s
        INNER JOIN SteFilteredPrices sfp ON sfp.ste_id = s.id
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
