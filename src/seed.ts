import "dotenv/config";
import path from "path";
import * as XLSX from "xlsx";
import { db, pool } from "./db";
import { ste, contracts, contractItems } from "../schema";
import type { NewSte, NewContract, NewContractItem } from "../schema";
import { sql } from "drizzle-orm";

const DATA_DIR = path.resolve(__dirname, "..");

const BATCH_SIZE = 100;

async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  label: string,
) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(table).values(batch as never[]).onConflictDoNothing();
    inserted += batch.length;
    process.stdout.write(`\r${label}: ${inserted}/${rows.length}`);
  }
  console.log();
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Excel serial date number
  if (typeof value === "number") {
    return XLSX.SSF.parse_date_code(value) as unknown as Date;
  }
  const s = String(value).trim();
  if (!s) return null;

  // Try DD.MM.YYYY format
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    return new Date(`${dotMatch[3]}-${dotMatch[2].padStart(2, "0")}-${dotMatch[1].padStart(2, "0")}`);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "number") {
    const info = XLSX.SSF.parse_date_code(value);
    if (info) {
      return new Date(Date.UTC(info.y, info.m - 1, info.d, info.H || 0, info.M || 0, info.S || 0));
    }
  }
  // String like "2025-12-01 14:32:09.307"
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function num(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : String(n);
}

async function seedSte(): Promise<Set<number>> {
  console.log("Reading СТЕ xlsx...");
  const wb = XLSX.readFile(path.join(DATA_DIR, "TenderHack_СТЕ_20260313.xlsx"), {
    cellDates: false,
    dense: true,
  });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Skip header row
  const data: NewSte[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const id = parseInt(String(r[0]));
    if (isNaN(id)) continue;
    data.push({
      id,
      name: str(r[1]) ?? "(без названия)",
      category: str(r[2]),
      manufacturer: str(r[3]),
      characteristics: str(r[4]),
    });
  }

  console.log(`Loaded ${data.length} СТЕ records`);
  await batchInsert(ste, data, "Inserting СТЕ");
  return new Set(data.map((d) => d.id));
}

async function seedContracts(validSteIds: Set<number>) {
  console.log("Reading Контракты xlsx...");
  const wb = XLSX.readFile(path.join(DATA_DIR, "TenderHack_Контракты_20260313.xlsx"), {
    cellDates: false,
    dense: true,
  });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Columns:
  // A(0): Наименование закупки
  // B(1): Количество
  // C(2): Единица измерения
  // D(3): Идентификатор контракта
  // E(4): Способ закупки
  // F(5): Начальная стоимость контракта
  // G(6): Стоимость контракта после заключения
  // H(7): % снижения
  // I(8): Ставка НДС
  // J(9): Дата заключения контракта
  // K(10): ИНН заказчика
  // L(11): Регион заказчика
  // M(12): ИНН поставщика
  // N(13): Регион поставщика
  // O(14): Идентификатор СТЕ по контракту
  // P(15): Наименование позиции СТЕ
  // Q(16): Цена за единицу

  const contractMap = new Map<number, NewContract>();
  const items: NewContractItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const contractId = parseInt(String(r[3]));
    if (isNaN(contractId)) continue;

    if (!contractMap.has(contractId)) {
      contractMap.set(contractId, {
        id: contractId,
        procurementName: str(r[0]) ?? "(без названия)",
        procurementMethod: str(r[4]),
        initialContractValue: num(r[5]),
        contractValueAfterSigning: num(r[6]),
        reductionPercent: num(r[7]),
        vatRate: str(r[8])?.slice(0, 20) ?? null,
        contractSigningDate: parseExcelDate(r[9]),
        buyerInn: str(r[10])?.slice(0, 12) ?? null,
        buyerRegion: str(r[11]),
        supplierInn: str(r[12])?.slice(0, 12) ?? null,
        supplierRegion: str(r[13]),
      });
    }

    const steId = r[14] != null ? parseInt(String(r[14])) : null;
    const resolvedSteId = steId && !isNaN(steId) && validSteIds.has(steId) ? steId : null;
    items.push({
      contractId,
      steId: resolvedSteId,
      steItemName: str(r[15]),
      quantity: num(r[1]),
      unit: str(r[2]),
      unitPrice: num(r[16]),
    });
  }

  const contractsData = Array.from(contractMap.values());
  console.log(`Loaded ${contractsData.length} unique contracts, ${items.length} line items`);

  await batchInsert(contracts, contractsData, "Inserting contracts");
  await batchInsert(contractItems, items, "Inserting contract items");
}

async function buildSearchVectors() {
  console.log("Building search_vector for СТЕ...");
  await db.execute(sql`
    UPDATE ste SET search_vector =
      setweight(to_tsvector('russian', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('russian',
        coalesce(replace(replace(characteristics, ':', ' '), ';', ' '), '')
      ), 'B')
  `);
  console.log("search_vector built.");
}

async function main() {
  console.log("Starting seed...");
  try {
    const validSteIds = await seedSte();
    await seedContracts(validSteIds);
    await buildSearchVectors();
    console.log("Seed complete!");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
