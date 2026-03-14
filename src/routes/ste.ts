import { Router } from "express";
import { db } from "../db";
import { ste } from "../../schema";
import { eq, ilike, sql } from "drizzle-orm";

const router = Router();

// GET /ste?page=1&limit=50&search=&category=
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;

    const conditions = [];
    if (search) conditions.push(ilike(ste.name, `%${search}%`));
    if (category) conditions.push(ilike(ste.category, `%${category}%`));

    const where = conditions.length > 0
      ? conditions.reduce((acc, c) => sql`${acc} AND ${c}`)
      : undefined;

    const [rows, [{ count }]] = await Promise.all([
      db.select().from(ste).where(where).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(ste).where(where),
    ]);

    res.json({ data: rows, total: count, page, limit });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /ste/categories?query= — список уникальных категорий (с опциональным полнотекстовым поиском по имени СТЕ)
router.get("/categories", async (req, res) => {
  try {
    const query = (req.query.query as string)?.trim();

    let rows: { category: string | null }[];
    if (query) {
      const result = await db.execute(sql`
        SELECT DISTINCT category
        FROM ste
        WHERE search_vector @@ plainto_tsquery('russian', ${query})
          AND category IS NOT NULL
        ORDER BY category
      `);
      rows = result.rows as { category: string | null }[];
    } else {
      rows = await db
        .selectDistinct({ category: ste.category })
        .from(ste)
        .orderBy(ste.category);
    }

    res.json(rows.map((r) => r.category).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /ste/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [row] = await db.select().from(ste).where(eq(ste.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
