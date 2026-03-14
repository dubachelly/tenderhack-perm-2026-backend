import { Router } from "express";
import { db } from "../db";
import { applications, applicationQueries, applicationQueryStes, ste } from "../../schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// POST /applications
router.post("/", async (req, res) => {
  try {
    const { name, queries } = req.body as { name?: string; queries?: string[] };
    if (!name) return res.status(400).json({ error: "name is required" });

    const [app] = await db.insert(applications).values({ name }).returning();

    if (queries && queries.length > 0) {
      await db.insert(applicationQueries).values(
        queries.map((queryText) => ({ applicationId: app.id, queryText }))
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
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const [rows, [{ count }]] = await Promise.all([
      db.select().from(applications).limit(limit).offset(offset).orderBy(applications.createdAt),
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

    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    if (!app) return res.status(404).json({ error: "Not found" });

    const queries = await db
      .select()
      .from(applicationQueries)
      .where(eq(applicationQueries.applicationId, id));

    const queryIds = queries.map((q) => q.id);

    const steLinks =
      queryIds.length > 0
        ? await db
            .select({
              queryId: applicationQueryStes.queryId,
              steId: applicationQueryStes.steId,
              nameMatchPercent: applicationQueryStes.nameMatchPercent,
              steName: ste.name,
              steCategory: ste.category,
              steManufacturer: ste.manufacturer,
              steCharacteristics: ste.characteristics,
            })
            .from(applicationQueryStes)
            .leftJoin(ste, eq(applicationQueryStes.steId, ste.id))
            .where(sql`${applicationQueryStes.queryId} = ANY(${sql.raw(`ARRAY[${queryIds.join(",")}]`)})`)
        : [];

    const steByQuery: Record<number, typeof steLinks> = {};
    for (const link of steLinks) {
      if (!steByQuery[link.queryId]) steByQuery[link.queryId] = [];
      steByQuery[link.queryId].push(link);
    }

    const result = {
      ...app,
      queries: queries.map((q) => ({
        ...q,
        stes: steByQuery[q.id] ?? [],
      })),
    };

    res.json(result);
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
    if (isNaN(applicationId)) return res.status(400).json({ error: "Invalid id" });

    const { queryText } = req.body as { queryText?: string };
    if (!queryText) return res.status(400).json({ error: "queryText is required" });

    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
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

// DELETE /applications/:appId/queries/:queryId
router.delete("/:appId/queries/:queryId", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const queryId = parseInt(req.params.queryId);
    if (isNaN(appId) || isNaN(queryId)) return res.status(400).json({ error: "Invalid id" });

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

// POST /applications/:appId/queries/:queryId/stes
router.post("/:appId/queries/:queryId/stes", async (req, res) => {
  try {
    const queryId = parseInt(req.params.queryId);
    if (isNaN(queryId)) return res.status(400).json({ error: "Invalid queryId" });

    const { steId, nameMatchPercent } = req.body as { steId?: number; nameMatchPercent?: number };
    if (steId === undefined || nameMatchPercent === undefined) {
      return res.status(400).json({ error: "steId and nameMatchPercent are required" });
    }

    const [query] = await db
      .select()
      .from(applicationQueries)
      .where(eq(applicationQueries.id, queryId));
    if (!query) return res.status(404).json({ error: "Query not found" });

    const [existing] = await db
      .select()
      .from(applicationQueryStes)
      .where(
        sql`${applicationQueryStes.queryId} = ${queryId} AND ${applicationQueryStes.steId} = ${steId}`
      );
    if (existing) return res.status(409).json({ error: "STE already linked to this query" });

    const [link] = await db
      .insert(applicationQueryStes)
      .values({ queryId, steId, nameMatchPercent: String(nameMatchPercent) })
      .returning();

    res.status(201).json(link);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /applications/:appId/queries/:queryId/stes/:steId
router.delete("/:appId/queries/:queryId/stes/:steId", async (req, res) => {
  try {
    const queryId = parseInt(req.params.queryId);
    const steId = parseInt(req.params.steId);
    if (isNaN(queryId) || isNaN(steId)) return res.status(400).json({ error: "Invalid id" });

    const [deleted] = await db
      .delete(applicationQueryStes)
      .where(
        sql`${applicationQueryStes.queryId} = ${queryId} AND ${applicationQueryStes.steId} = ${steId}`
      )
      .returning();

    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
