import { Router } from "express";
import { db } from "../db";
import { contracts, contractItems, ste } from "../../schema";
import { eq, ilike, sql, and, gte, lte } from "drizzle-orm";

const router = Router();

// GET /contracts?page=1&limit=50&search=&buyerInn=&supplierInn=&region=&dateFrom=&dateTo=
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const search = req.query.search as string | undefined;
    const buyerInn = req.query.buyerInn as string | undefined;
    const supplierInn = req.query.supplierInn as string | undefined;
    const region = req.query.region as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const conditions = [];
    if (search) conditions.push(ilike(contracts.procurementName, `%${search}%`));
    if (buyerInn) conditions.push(eq(contracts.buyerInn, buyerInn));
    if (supplierInn) conditions.push(eq(contracts.supplierInn, supplierInn));
    if (region) conditions.push(ilike(contracts.buyerRegion, `%${region}%`));
    if (dateFrom) conditions.push(gte(contracts.contractSigningDate, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(contracts.contractSigningDate, new Date(dateTo)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ count }]] = await Promise.all([
      db.select().from(contracts).where(where).limit(limit).offset(offset)
        .orderBy(contracts.contractSigningDate),
      db.select({ count: sql<number>`count(*)::int` }).from(contracts).where(where),
    ]);

    res.json({ data: rows, total: count, page, limit });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /contracts/supplier-regions
router.get("/supplier-regions", async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ region: contracts.supplierRegion })
      .from(contracts)
      .where(sql`${contracts.supplierRegion} is not null`)
      .orderBy(contracts.supplierRegion);
    res.json(rows.map((r) => r.region));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /contracts/buyer-regions
router.get("/buyer-regions", async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ region: contracts.buyerRegion })
      .from(contracts)
      .where(sql`${contracts.buyerRegion} is not null`)
      .orderBy(contracts.buyerRegion);
    res.json(rows.map((r) => r.region));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /contracts/procurement-methods
router.get("/procurement-methods", async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ method: contracts.procurementMethod })
      .from(contracts)
      .where(sql`${contracts.procurementMethod} is not null`)
      .orderBy(contracts.procurementMethod);
    res.json(rows.map((r) => r.method));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /contracts/:id — контракт с позициями и СТЕ
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id));
    if (!contract) return res.status(404).json({ error: "Not found" });

    const items = await db
      .select({
        id: contractItems.id,
        steId: contractItems.steId,
        steItemName: contractItems.steItemName,
        quantity: contractItems.quantity,
        unit: contractItems.unit,
        unitPrice: contractItems.unitPrice,
        steName: ste.name,
        steCategory: ste.category,
        steManufacturer: ste.manufacturer,
        steCharacteristics: ste.characteristics,
      })
      .from(contractItems)
      .leftJoin(ste, eq(contractItems.steId, ste.id))
      .where(eq(contractItems.contractId, id));

    res.json({ ...contract, items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /contracts/:id/items
router.get("/:id/items", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const items = await db
      .select({
        id: contractItems.id,
        steId: contractItems.steId,
        steItemName: contractItems.steItemName,
        quantity: contractItems.quantity,
        unit: contractItems.unit,
        unitPrice: contractItems.unitPrice,
        steName: ste.name,
        steCategory: ste.category,
        steManufacturer: ste.manufacturer,
        steCharacteristics: ste.characteristics,
      })
      .from(contractItems)
      .leftJoin(ste, eq(contractItems.steId, ste.id))
      .where(eq(contractItems.contractId, id));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
