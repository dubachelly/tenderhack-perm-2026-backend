import { Router } from "express";
import { db } from "../db";
import { sql, SQL } from "drizzle-orm";

const router = Router();

function parseMultiParam(val: unknown): string[] | null {
	const arr = Array.isArray(val) ? val : val ? [val] : [];
	const filtered = arr.filter(
		(v): v is string => typeof v === "string" && v.length > 0,
	);
	return filtered.length > 0 ? filtered : null;
}

function inCondition(column: SQL, values: string[]): SQL {
	return sql`${column} = ANY(ARRAY[${sql.join(
		values.map((v) => sql`${v}`),
		sql`, `,
	)}])`;
}

// GET /search/items?q=...&page=1&limit=50&supplier_region=...&period_from=YYYY-MM-DD&period_to=YYYY-MM-DD&category=...&procurement_method=...
// Параметры category, supplier_region, procurement_method поддерживают несколько значений (?category=A&category=B)
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

		const supplierRegions = parseMultiParam(req.query.supplier_region);
		const periodFrom = (req.query.period_from as string) || null;
		const periodTo = (req.query.period_to as string) || null;
		const categories = parseMultiParam(req.query.category);
		const procurementMethods = parseMultiParam(req.query.procurement_method);

		// Filters on ste table
		const steExtraConditions: SQL[] = [];
		if (categories)
			steExtraConditions.push(inCondition(sql`s.category`, categories));

		// Filters on contracts table
		const contractConditions: SQL[] = [];
		if (supplierRegions)
			contractConditions.push(
				inCondition(sql`c.supplier_region`, supplierRegions),
			);
		if (periodFrom)
			contractConditions.push(
				sql`c.contract_signing_date >= ${periodFrom}::date`,
			);
		if (periodTo)
			contractConditions.push(
				sql`c.contract_signing_date <= ${periodTo}::date`,
			);
		if (procurementMethods)
			contractConditions.push(
				inCondition(sql`c.procurement_method`, procurementMethods),
			);

		const steWhere =
			steExtraConditions.length > 0
				? sql` AND ${sql.join(steExtraConditions, sql` AND `)}`
				: sql``;

		// Contract filters go into JOIN ON so STEs without matching contracts still appear (with empty contract_ids)
		const contractOnExtra =
			contractConditions.length > 0
				? sql` AND ${sql.join(contractConditions, sql` AND `)}`
				: sql``;

		const contractJoin = sql`LEFT JOIN contract_items ci ON ci.ste_id = s.id LEFT JOIN contracts c ON c.id = ci.contract_id${contractOnExtra}`;

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
        ${contractJoin}
        WHERE s.search_vector @@ plainto_tsquery('russian', ${q})
          ${steWhere}
        GROUP BY s.id, s.name, s.category, s.manufacturer, s.characteristics, rank
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
			db.execute(sql`
        SELECT count(DISTINCT s.id)::int AS count
        FROM ste s
        ${contractJoin}
        WHERE s.search_vector @@ plainto_tsquery('russian', ${q})
          ${steWhere}
      `),
		]);

		const total = (countResult.rows[0] as { count: number }).count;
		res.json({ data: rows.rows, total, page, limit });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// GET /search/ste/:steId/contracts?supplier_region=...&period_from=YYYY-MM-DD&period_to=YYYY-MM-DD&category=...&procurement_method=...
// Параметры category, supplier_region, procurement_method поддерживают несколько значений (?category=A&category=B)
// Возвращает список контрактов с данным СТЕ
router.get("/ste/:steId/contracts", async (req, res) => {
	try {
		const steId = parseInt(req.params.steId);
		if (isNaN(steId)) return res.status(400).json({ error: "invalid steId" });

		const supplierRegions = parseMultiParam(req.query.supplier_region);
		const periodFrom = (req.query.period_from as string) || null;
		const periodTo = (req.query.period_to as string) || null;
		const categories = parseMultiParam(req.query.category);
		const procurementMethods = parseMultiParam(req.query.procurement_method);

		const extraConditions: SQL[] = [];
		if (supplierRegions)
			extraConditions.push(
				inCondition(sql`c.supplier_region`, supplierRegions),
			);
		if (periodFrom)
			extraConditions.push(sql`c.contract_signing_date >= ${periodFrom}::date`);
		if (periodTo)
			extraConditions.push(sql`c.contract_signing_date <= ${periodTo}::date`);
		if (categories)
			extraConditions.push(inCondition(sql`s.category`, categories));
		if (procurementMethods)
			extraConditions.push(
				inCondition(sql`c.procurement_method`, procurementMethods),
			);

		const extraWhere =
			extraConditions.length > 0
				? sql` AND ${sql.join(extraConditions, sql` AND `)}`
				: sql``;

		// Join ste only when category filter is needed
		const steJoin = categories ? sql`JOIN ste s ON s.id = ci.ste_id` : sql``;

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
      ${steJoin}
      WHERE ci.ste_id = ${steId}
        ${extraWhere}
      ORDER BY c.id, ci.id
    `);

		res.json({ data: rows.rows });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

export default router;
