import { Router } from "express";
import { db } from "../db";
import {
	applications,
	applicationQueries,
	applicationQueryContracts,
} from "../../schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// POST /applications
router.post("/", async (req, res) => {
	try {
		const { name, queries } = req.body as { name?: string; queries?: string[] };
		if (!name) return res.status(400).json({ error: "name is required" });

		const [app] = await db.insert(applications).values({ name }).returning();

		if (queries && queries.length > 0) {
			await db
				.insert(applicationQueries)
				.values(
					queries.map((queryText) => ({ applicationId: app.id, queryText })),
				);
		}

		res.status(201).json(app);
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// GET /applications
router.get("/", async (req, res) => {
	try {
		const page = Math.max(1, parseInt(req.query.page as string) || 1);
		const limit = Math.min(
			200,
			Math.max(1, parseInt(req.query.limit as string) || 50),
		);
		const offset = (page - 1) * limit;

		const [rows, [{ count }]] = await Promise.all([
			db
				.select()
				.from(applications)
				.limit(limit)
				.offset(offset)
				.orderBy(applications.createdAt),
			db.select({ count: sql<number>`count(*)::int` }).from(applications),
		]);

		res.json({ data: rows, total: count, page, limit });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// GET /applications/:id
router.get("/:id", async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, id));
		if (!app) return res.status(404).json({ error: "Not found" });

		const queries = await db
			.select()
			.from(applicationQueries)
			.where(eq(applicationQueries.applicationId, id));

		const queryIds = queries.map((q) => q.id);

		const contractLinks =
			queryIds.length > 0
				? await db.execute(sql`
            SELECT
              aqc.query_id                        AS "queryId",
              aqc.contract_item_id                AS "contractItemId",
              ci.ste_id                           AS "steId",
              ci.ste_item_name                    AS "steItemName",
              ci.quantity                         AS "quantity",
              ci.unit                             AS "unit",
              ci.unit_price                       AS "unitPrice",
              c.id                                AS "contractId",
              c.procurement_name                  AS "procurementName",
              c.procurement_method                AS "procurementMethod",
              c.initial_contract_value            AS "initialContractValue",
              c.contract_value_after_signing      AS "contractValueAfterSigning",
              c.reduction_percent                 AS "reductionPercent",
              c.vat_rate                          AS "vatRate",
              c.contract_signing_date             AS "contractSigningDate",
              c.buyer_inn                         AS "buyerInn",
              c.buyer_region                      AS "buyerRegion",
              c.supplier_inn                      AS "supplierInn",
              c.supplier_region                   AS "supplierRegion"
            FROM application_query_contracts aqc
            LEFT JOIN contract_items ci ON aqc.contract_item_id = ci.id
            LEFT JOIN contracts c ON ci.contract_id = c.id
            WHERE aqc.query_id = ANY(ARRAY[${sql.raw(queryIds.join(","))}])
          `)
				: { rows: [] };

		const formattedLinks = contractLinks.rows;

		const contractsByQuery: Record<number, typeof formattedLinks> = {};
		for (const link of formattedLinks) {
			const qid = (link as { queryId: number }).queryId;
			if (!contractsByQuery[qid]) contractsByQuery[qid] = [];
			contractsByQuery[qid].push(link);
		}

		const result = {
			...app,
			queries: queries.map((q) => ({
				...q,
				contracts: contractsByQuery[q.id] ?? [],
			})),
		};

		res.json(result);
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// PATCH /applications/:id
router.patch("/:id", async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

		const { name } = req.body as { name?: string };
		if (!name || !name.trim())
			return res.status(400).json({ error: "name is required" });

		const [updated] = await db
			.update(applications)
			.set({ name: name.trim() })
			.where(eq(applications.id, id))
			.returning();

		if (!updated) return res.status(404).json({ error: "Not found" });
		res.json(updated);
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// DELETE /applications/:id
router.delete("/:id", async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

		const [deleted] = await db
			.delete(applications)
			.where(eq(applications.id, id))
			.returning();

		if (!deleted) return res.status(404).json({ error: "Not found" });
		res.json({ ok: true });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// POST /applications/:id/queries
router.post("/:id/queries", async (req, res) => {
	try {
		const applicationId = parseInt(req.params.id);
		if (isNaN(applicationId))
			return res.status(400).json({ error: "Invalid id" });

		const { queryText } = req.body as { queryText?: string };
		if (!queryText)
			return res.status(400).json({ error: "queryText is required" });

		const [app] = await db
			.select()
			.from(applications)
			.where(eq(applications.id, applicationId));
		if (!app) return res.status(404).json({ error: "Application not found" });

		const [query] = await db
			.insert(applicationQueries)
			.values({ applicationId, queryText })
			.returning();

		res.status(201).json(query);
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// PATCH /applications/:appId/queries/:queryId
router.patch("/:appId/queries/:queryId", async (req, res) => {
	try {
		const appId = parseInt(req.params.appId);
		const queryId = parseInt(req.params.queryId);
		if (isNaN(appId) || isNaN(queryId))
			return res.status(400).json({ error: "Invalid id" });

		const { queryText } = req.body as { queryText?: string };
		if (!queryText)
			return res.status(400).json({ error: "queryText is required" });

		const [updated] = await db
			.update(applicationQueries)
			.set({ queryText })
			.where(eq(applicationQueries.id, queryId))
			.returning();

		if (!updated) return res.status(404).json({ error: "Not found" });
		res.json(updated);
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// DELETE /applications/:appId/queries/:queryId
router.delete("/:appId/queries/:queryId", async (req, res) => {
	try {
		const appId = parseInt(req.params.appId);
		const queryId = parseInt(req.params.queryId);
		if (isNaN(appId) || isNaN(queryId))
			return res.status(400).json({ error: "Invalid id" });

		const [deleted] = await db
			.delete(applicationQueries)
			.where(eq(applicationQueries.id, queryId))
			.returning();

		if (!deleted) return res.status(404).json({ error: "Not found" });
		res.json({ ok: true });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// POST /applications/:appId/queries/:queryId/contracts
router.post("/:appId/queries/:queryId/contracts", async (req, res) => {
	try {
		const queryId = parseInt(req.params.queryId);
		if (isNaN(queryId))
			return res.status(400).json({ error: "Invalid queryId" });

		const { contractItemId } = req.body as { contractItemId?: number };
		if (contractItemId === undefined) {
			return res.status(400).json({ error: "contractItemId is required" });
		}

		const [query] = await db
			.select()
			.from(applicationQueries)
			.where(eq(applicationQueries.id, queryId));
		if (!query) return res.status(404).json({ error: "Query not found" });

		const [existing] = await db
			.select()
			.from(applicationQueryContracts)
			.where(
				sql`${applicationQueryContracts.queryId} = ${queryId} AND ${applicationQueryContracts.contractItemId} = ${contractItemId}`,
			);
		if (existing)
			return res
				.status(409)
				.json({ error: "Contract item already linked to this query" });

		const [link] = await db
			.insert(applicationQueryContracts)
			.values({ queryId, contractItemId })
			.returning();

		res.status(201).json(link);
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

// DELETE /applications/:appId/queries/:queryId/contracts/:contractItemId
router.delete("/:appId/queries/:queryId/contracts/:contractItemId", async (req, res) => {
	try {
		const queryId = parseInt(req.params.queryId);
		const contractItemId = parseInt(req.params.contractItemId);
		if (isNaN(queryId) || isNaN(contractItemId))
			return res.status(400).json({ error: "Invalid id" });

		const [deleted] = await db
			.delete(applicationQueryContracts)
			.where(
				sql`${applicationQueryContracts.queryId} = ${queryId} AND ${applicationQueryContracts.contractItemId} = ${contractItemId}`,
			)
			.returning();

		if (!deleted) return res.status(404).json({ error: "Not found" });
		res.json({ ok: true });
	} catch (err) {
		res.status(500).json({ error: String(err) });
	}
});

export default router;
