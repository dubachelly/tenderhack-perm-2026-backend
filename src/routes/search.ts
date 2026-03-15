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
// Фильтры category ограничивают выдачу СТЕ; остальные влияют на расчёт suggested_items_count через IQR
router.get("/items", async (req, res) => {
	try {
		const q = (req.query.q as string)?.trim();
		if (!q) return res.status(400).json({ error: "q parameter required" });
		if (q.length < 3)
			return res.status(400).json({ error: "q must be at least 3 characters" });

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

		const tsQuery = sql`plainto_tsquery('russian', ${q})`;

		// Фильтр категорий применяется к matching (ограничивает выдачу СТЕ)
		const categoryWhere = categories
			? sql` AND ${inCondition(sql`s.category`, categories)}`
			: sql``;

		const searchWhere = sql`s.search_vector @@ ${tsQuery}${categoryWhere}`;

		// Фильтры контрактов применяются к ste_prices (влияют на IQR и suggested_items_count)
		const priceFilterConditions: SQL[] = [];
		if (supplierRegions)
			priceFilterConditions.push(
				inCondition(sql`c.supplier_region`, supplierRegions),
			);
		if (periodFrom)
			priceFilterConditions.push(
				sql`c.contract_signing_date >= ${periodFrom}::date`,
			);
		if (periodTo)
			priceFilterConditions.push(
				sql`c.contract_signing_date <= ${periodTo}::date`,
			);
		if (procurementMethods)
			priceFilterConditions.push(
				inCondition(sql`c.procurement_method`, procurementMethods),
			);

		const priceFilterWhere =
			priceFilterConditions.length > 0
				? sql` AND ${sql.join(priceFilterConditions, sql` AND `)}`
				: sql``;

		const [rows, countResult] = await Promise.all([
			db.execute(sql`
        WITH matching AS (
          SELECT s.id
          FROM ste s
          WHERE ${searchWhere}
        ),
        ste_prices AS (
          SELECT ci.ste_id, ci.unit_price
          FROM contract_items ci
          JOIN contracts c ON c.id = ci.contract_id
          WHERE ci.ste_id IN (SELECT id FROM matching)
            AND ci.unit_price IS NOT NULL
            ${priceFilterWhere}
        ),
        ste_iqr AS (
          SELECT
            ste_id,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price) AS q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price) AS q3
          FROM ste_prices
          GROUP BY ste_id
        ),
        ste_suggested AS (
          SELECT sp.ste_id, COUNT(*) AS suggested_count
          FROM ste_prices sp
          JOIN ste_iqr iq ON iq.ste_id = sp.ste_id
          WHERE sp.unit_price >= (iq.q1 - 1.5 * (iq.q3 - iq.q1))
            AND sp.unit_price <= (iq.q3 + 1.5 * (iq.q3 - iq.q1))
          GROUP BY sp.ste_id
        )
        SELECT
          s.id              AS ste_id,
          s.name            AS ste_name,
          s.category        AS ste_category,
          s.manufacturer    AS ste_manufacturer,
          s.characteristics AS ste_characteristics,
          CASE WHEN lower(s.name) = lower(${q}) THEN 1 ELSE 0 END AS exact_match,
          ts_rank(to_tsvector('russian', s.name), ${tsQuery}, 2) AS name_rank,
          ts_rank(
            setweight(to_tsvector('russian', s.name), 'A') ||
            setweight(to_tsvector('russian', COALESCE(s.manufacturer, '')), 'B') ||
            setweight(to_tsvector('russian', COALESCE(s.characteristics, '')), 'C') ||
            setweight(to_tsvector('russian', COALESCE(s.category, '')), 'D'),
            ${tsQuery}
          ) AS rank,
          COALESCE(ss.suggested_count, 0) AS suggested_items_count,
          COALESCE(
            array_agg(DISTINCT ci.id) FILTER (WHERE ci.id IS NOT NULL),
            '{}'
          ) AS contract_item_ids
        FROM ste s
        LEFT JOIN contract_items ci ON ci.ste_id = s.id
        LEFT JOIN ste_suggested ss ON ss.ste_id = s.id
        WHERE ${searchWhere}
        GROUP BY s.id, s.name, s.category, s.manufacturer, s.characteristics, ss.suggested_count
        ORDER BY exact_match DESC, name_rank DESC, rank DESC, suggested_items_count DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
			db.execute(sql`
        SELECT count(DISTINCT s.id)::int AS count
        FROM ste s
        WHERE ${searchWhere}
      `),
		]);

		const total = (countResult.rows[0] as { count: number }).count;
		res.json({ data: rows.rows, total, page, limit });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// GET /search/items-trigram?q=...&page=1&limit=50&supplier_region=...&period_from=YYYY-MM-DD&period_to=YYYY-MM-DD&category=...&procurement_method=...
// Аналог /search/items, но использует триграммный поиск (pg_trgm) вместо полнотекстового
router.get("/items-trigram", async (req, res) => {
	try {
		const q = (req.query.q as string)?.trim();
		if (!q) return res.status(400).json({ error: "q parameter required" });
		if (q.length < 3)
			return res.status(400).json({ error: "q must be at least 3 characters" });

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

		const categoryWhere = categories
			? sql` AND ${inCondition(sql`s.category`, categories)}`
			: sql``;

		const searchWhere = sql`word_similarity(${q}, s.name) > 0.1${categoryWhere}`;

		const priceFilterConditions: SQL[] = [];
		if (supplierRegions)
			priceFilterConditions.push(
				inCondition(sql`c.supplier_region`, supplierRegions),
			);
		if (periodFrom)
			priceFilterConditions.push(
				sql`c.contract_signing_date >= ${periodFrom}::date`,
			);
		if (periodTo)
			priceFilterConditions.push(
				sql`c.contract_signing_date <= ${periodTo}::date`,
			);
		if (procurementMethods)
			priceFilterConditions.push(
				inCondition(sql`c.procurement_method`, procurementMethods),
			);

		const priceFilterWhere =
			priceFilterConditions.length > 0
				? sql` AND ${sql.join(priceFilterConditions, sql` AND `)}`
				: sql``;

		const [rows, countResult] = await Promise.all([
			db.execute(sql`
        WITH matching AS (
          SELECT s.id
          FROM ste s
          WHERE ${searchWhere}
        ),
        ste_prices AS (
          SELECT ci.ste_id, ci.unit_price
          FROM contract_items ci
          JOIN contracts c ON c.id = ci.contract_id
          WHERE ci.ste_id IN (SELECT id FROM matching)
            AND ci.unit_price IS NOT NULL
            ${priceFilterWhere}
        ),
        ste_iqr AS (
          SELECT
            ste_id,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price) AS q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price) AS q3
          FROM ste_prices
          GROUP BY ste_id
        ),
        ste_suggested AS (
          SELECT sp.ste_id, COUNT(*) AS suggested_count
          FROM ste_prices sp
          JOIN ste_iqr iq ON iq.ste_id = sp.ste_id
          WHERE sp.unit_price >= (iq.q1 - 1.5 * (iq.q3 - iq.q1))
            AND sp.unit_price <= (iq.q3 + 1.5 * (iq.q3 - iq.q1))
          GROUP BY sp.ste_id
        )
        SELECT
          s.id              AS ste_id,
          s.name            AS ste_name,
          s.category        AS ste_category,
          s.manufacturer    AS ste_manufacturer,
          s.characteristics AS ste_characteristics,
          CASE WHEN lower(s.name) = lower(${q}) THEN 1 ELSE 0 END AS exact_match,
          word_similarity(${q}, s.name) AS name_rank,
          word_similarity(${q}, s.name) AS rank,
          COALESCE(ss.suggested_count, 0) AS suggested_items_count,
          COALESCE(
            array_agg(DISTINCT ci.id) FILTER (WHERE ci.id IS NOT NULL),
            '{}'
          ) AS contract_item_ids
        FROM ste s
        LEFT JOIN contract_items ci ON ci.ste_id = s.id
        LEFT JOIN ste_suggested ss ON ss.ste_id = s.id
        WHERE ${searchWhere}
        GROUP BY s.id, s.name, s.category, s.manufacturer, s.characteristics, ss.suggested_count
        ORDER BY exact_match DESC, name_rank DESC, suggested_items_count DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
			db.execute(sql`
        SELECT count(DISTINCT s.id)::int AS count
        FROM ste s
        WHERE ${searchWhere}
      `),
		]);

		const total = (countResult.rows[0] as { count: number }).count;
		res.json({ data: rows.rows, total, page, limit });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// GET /search/ai-items?q=...
// Принимает queryText, запрашивает AI-сервис (localhost:8000/search), берёт СТЕ с точно совпадающим названием
// Возвращает ответ в том же формате, что и /search/items
router.get("/ai-items", async (req, res) => {
	try {
		const q = (req.query.q as string)?.trim();
		if (!q) return res.status(400).json({ error: "q parameter required" });

		const aiResponse = await fetch("http://localhost:8001/search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query: q, top_k: 20 }),
		});

		if (!aiResponse.ok) {
			return res
				.status(502)
				.json({ error: `AI search service error: ${aiResponse.status}` });
		}

		const aiData = (await aiResponse.json()) as unknown;

		let names: string[] = [];
		if (Array.isArray(aiData)) {
			names = (aiData as Array<Record<string, unknown>>)
				.map((item) => item.name as string)
				.filter((n): n is string => typeof n === "string" && n.length > 0);
		} else if (aiData && typeof aiData === "object") {
			const obj = aiData as Record<string, unknown>;
			const list = Array.isArray(obj.results)
				? obj.results
				: Array.isArray(obj.items)
					? obj.items
					: [];
			names = (list as Array<Record<string, unknown>>)
				.map((item) => item.title as string)
				.filter((n): n is string => typeof n === "string" && n.length > 0);
		}

		if (names.length === 0) {
			return res.json({ data: [], total: 0, page: 1, limit: 0 });
		}

		const namesSql = sql.join(
			names.map((n) => sql`lower(${n})`),
			sql`, `,
		);

		const rows = await db.execute(sql`
      WITH ste_prices AS (
        SELECT ci.ste_id, ci.unit_price
        FROM contract_items ci
        WHERE ci.ste_id IN (
          SELECT id FROM ste WHERE lower(name) = ANY(ARRAY[${namesSql}])
        )
          AND ci.unit_price IS NOT NULL
      ),
      ste_iqr AS (
        SELECT
          ste_id,
          percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price) AS q1,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price) AS q3
        FROM ste_prices
        GROUP BY ste_id
      ),
      ste_suggested AS (
        SELECT sp.ste_id, COUNT(*) AS suggested_count
        FROM ste_prices sp
        JOIN ste_iqr iq ON iq.ste_id = sp.ste_id
        WHERE sp.unit_price >= (iq.q1 - 1.5 * (iq.q3 - iq.q1))
          AND sp.unit_price <= (iq.q3 + 1.5 * (iq.q3 - iq.q1))
        GROUP BY sp.ste_id
      )
      SELECT
        s.id              AS ste_id,
        s.name            AS ste_name,
        s.category        AS ste_category,
        s.manufacturer    AS ste_manufacturer,
        s.characteristics AS ste_characteristics,
        1                 AS exact_match,
        0                 AS rank,
        COALESCE(ss.suggested_count, 0) AS suggested_items_count,
        COALESCE(
          array_agg(DISTINCT ci.id) FILTER (WHERE ci.id IS NOT NULL),
          '{}'
        ) AS contract_item_ids
      FROM ste s
      LEFT JOIN contract_items ci ON ci.ste_id = s.id
      LEFT JOIN ste_suggested ss ON ss.ste_id = s.id
      WHERE lower(s.name) = ANY(ARRAY[${namesSql}])
      GROUP BY s.id, s.name, s.category, s.manufacturer, s.characteristics, ss.suggested_count
      ORDER BY suggested_items_count DESC
    `);

		res.json({
			data: rows.rows,
			total: rows.rows.length,
			page: 1,
			limit: rows.rows.length,
		});
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// GET /search/categories?q=...
// Возвращает список уникальных категорий СТЕ, подходящих под поисковый запрос q.
// Если q не передан — возвращаются все категории.
router.get("/categories", async (req, res) => {
	try {
		const q = (req.query.q as string)?.trim() || null;

		const whereClause = q
			? sql`s.category IS NOT NULL AND s.search_vector @@ plainto_tsquery('russian', ${q})`
			: sql`s.category IS NOT NULL`;

		const rows = await db.execute(sql`
      SELECT DISTINCT s.category
      FROM ste s
      WHERE ${whereClause}
      ORDER BY s.category
    `);

		res.json((rows.rows as Array<{ category: string }>).map((r) => r.category));
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

		// Фильтры применяются только к рекомендованным позициям
		const filterConditions: SQL[] = [];
		if (supplierRegions)
			filterConditions.push(
				inCondition(sql`a.supplier_region`, supplierRegions),
			);
		if (periodFrom)
			filterConditions.push(
				sql`a.contract_signing_date >= ${periodFrom}::date`,
			);
		if (periodTo)
			filterConditions.push(sql`a.contract_signing_date <= ${periodTo}::date`);
		if (categories)
			filterConditions.push(
				sql`(SELECT category FROM ste WHERE id = ${steId}) = ANY(ARRAY[${sql.join(
					categories.map((v) => sql`${v}`),
					sql`, `,
				)}])`,
			);
		if (procurementMethods)
			filterConditions.push(
				inCondition(sql`a.procurement_method`, procurementMethods),
			);

		const filterWhere =
			filterConditions.length > 0
				? sql` AND ${sql.join(filterConditions, sql` AND `)}`
				: sql``;

		const rows = await db.execute(sql`
      WITH all_items AS (
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
      ),
      filtered AS (
        SELECT a.*
        FROM all_items a
        WHERE true ${filterWhere}
      ),
      iqr AS (
        SELECT
          percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price) AS q1,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price) AS q3
        FROM filtered
        WHERE unit_price IS NOT NULL
      ),
      suggested AS (
        SELECT f.item_id
        FROM filtered f, iqr
        WHERE f.unit_price IS NOT NULL
          AND f.unit_price >= (iqr.q1 - 1.5 * (iqr.q3 - iqr.q1))
          AND f.unit_price <= (iqr.q3 + 1.5 * (iqr.q3 - iqr.q1))
      )
      SELECT
        a.*,
        (a.item_id IN (SELECT item_id FROM suggested)) AS in_iqr_range
      FROM all_items a
      ORDER BY a.contract_id, a.item_id
    `);

		const allItems = rows.rows as Array<Record<string, unknown>>;
		const data = allItems.map(({ in_iqr_range, ...item }) => item);
		const referenceDate = periodTo ? new Date(periodTo) : new Date();
		const suggestedItems = allItems
			.filter((row) => row.in_iqr_range)
			.sort((a, b) => {
				const da = a.contract_signing_date
					? new Date(a.contract_signing_date as string).getTime()
					: 0;
				const db_ = b.contract_signing_date
					? new Date(b.contract_signing_date as string).getTime()
					: 0;
				return (
					Math.abs(da - referenceDate.getTime()) -
					Math.abs(db_ - referenceDate.getTime())
				);
			})
			.slice(0, 5)
			.map(({ in_iqr_range, ...item }) => item);

		res.json({ data, suggestedItems });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

export default router;
