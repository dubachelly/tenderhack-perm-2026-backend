/**
 * Тест целостности данных: сравнивает содержимое xlsx-файлов с тем, что лежит в postgres.
 *
 * Запуск:  npx tsx src/test-data-integrity.ts
 *
 * Что проверяется:
 *  1. Таблица `ste`         — каждая строка из СТЕ xlsx, все 5 колонок
 *  2. Таблица `contracts`   — каждый уникальный контракт из Контракты xlsx, все 12 колонок
 *  3. Таблица `contract_items` — все позиции контрактов из Контракты xlsx, все 6 колонок
 */

import "dotenv/config";
import path from "path";
import * as XLSX from "xlsx";
import { db, pool } from "./db";
import { ste, contracts, contractItems } from "../schema";
import type { Ste, Contract, ContractItem } from "../schema";

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, "..");
const STE_FILE = path.join(DATA_DIR, "TenderHack_СТЕ_20260313.xlsx");
const CONTRACTS_FILE = path.join(DATA_DIR, "TenderHack_Контракты_20260313.xlsx");

// ─── Вспомогательные функции парсинга (идентичны seed.ts) ────────────────────

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "number") {
    const info = XLSX.SSF.parse_date_code(value);
    if (info) {
      return new Date(
        Date.UTC(info.y, info.m - 1, info.d, info.H || 0, info.M || 0, info.S || 0)
      );
    }
  }
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

// ─── Нормализация для сравнения ───────────────────────────────────────────────

function normalizeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/**
 * Сравниваем числа с учётом точности postgres numeric(20, scale).
 * Оба значения округляются до `scale` знаков после запятой перед сравнением —
 * так устраняются расхождения из-за float64 в JS и ограниченной точности postgres.
 *
 * Схема:
 *   numeric(20,5)  — initialContractValue, contractValueAfterSigning, reductionPercent
 *   numeric(20,11) — quantity, unitPrice
 */
function numsEqual(a: unknown, b: unknown, scale: number): boolean {
  const na = normalizeNum(a);
  const nb = normalizeNum(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  return na.toFixed(scale) === nb.toFixed(scale);
}

/** Даты сравниваем по timestamp UTC. */
function datesEqual(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

function strsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = a ?? null;
  const nb = b ?? null;
  return na === nb;
}

// ─── Счётчики результатов ────────────────────────────────────────────────────

interface Stats {
  checked: number;
  mismatches: number;
  missing: number;   // есть в xlsx, нет в postgres
  extra: number;     // есть в postgres, нет в xlsx
}

function newStats(): Stats {
  return { checked: 0, mismatches: 0, missing: 0, extra: 0 };
}

// ─── 1. Проверка таблицы STE ─────────────────────────────────────────────────

async function testSte(): Promise<Stats> {
  console.log("\n══════════════════════════════════════════════════════");
  console.log(" ПРОВЕРКА: ste (СТЕ)");
  console.log("══════════════════════════════════════════════════════");

  // ── Читаем xlsx ──
  const wb = XLSX.readFile(STE_FILE, { cellDates: false, dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  type XlsxSte = {
    id: number;
    name: string;
    category: string | null;
    manufacturer: string | null;
    characteristics: string | null;
  };

  const xlsxMap = new Map<number, XlsxSte>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = parseInt(String(r[0]));
    if (isNaN(id)) continue;
    xlsxMap.set(id, {
      id,
      name: str(r[1]) ?? "(без названия)",
      category: str(r[2]),
      manufacturer: str(r[3]),
      characteristics: str(r[4]),
    });
  }
  console.log(`  xlsx: ${xlsxMap.size} записей`);

  // ── Читаем postgres ──
  const pgRows: Ste[] = await db.select().from(ste);
  const pgMap = new Map<number, Ste>(pgRows.map((r) => [r.id, r]));
  console.log(`  postgres: ${pgMap.size} записей`);

  const stats = newStats();

  // ── Проверяем каждую запись из xlsx ──
  for (const [id, x] of xlsxMap) {
    stats.checked++;
    const p = pgMap.get(id);

    if (!p) {
      stats.missing++;
      console.log(`  [ОТСУТСТВУЕТ в postgres] ste.id=${id}`);
      continue;
    }

    const mismatched: string[] = [];

    if (!strsEqual(x.name, p.name))
      mismatched.push(`name: xlsx="${x.name}" | pg="${p.name}"`);
    if (!strsEqual(x.category, p.category))
      mismatched.push(`category: xlsx="${x.category}" | pg="${p.category}"`);
    if (!strsEqual(x.manufacturer, p.manufacturer))
      mismatched.push(`manufacturer: xlsx="${x.manufacturer}" | pg="${p.manufacturer}"`);
    if (!strsEqual(x.characteristics, p.characteristics))
      mismatched.push(`characteristics: xlsx="${x.characteristics?.slice(0, 60)}…" | pg="${p.characteristics?.slice(0, 60)}…"`);

    if (mismatched.length > 0) {
      stats.mismatches++;
      console.log(`  [РАСХОЖДЕНИЕ] ste.id=${id}:`);
      for (const m of mismatched) console.log(`    • ${m}`);
    }
  }

  // ── Проверяем лишние записи в postgres ──
  for (const id of pgMap.keys()) {
    if (!xlsxMap.has(id)) {
      stats.extra++;
      console.log(`  [ЛИШНЯЯ запись в postgres] ste.id=${id}`);
    }
  }

  printStats("ste", stats);
  return stats;
}

// ─── 2. Проверка таблицы contracts ───────────────────────────────────────────

async function testContracts(): Promise<Stats> {
  console.log("\n══════════════════════════════════════════════════════");
  console.log(" ПРОВЕРКА: contracts (Контракты)");
  console.log("══════════════════════════════════════════════════════");

  // ── Читаем xlsx ──
  const wb = XLSX.readFile(CONTRACTS_FILE, { cellDates: false, dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  type XlsxContract = {
    id: number;
    procurementName: string;
    procurementMethod: string | null;
    initialContractValue: string | null;
    contractValueAfterSigning: string | null;
    reductionPercent: string | null;
    vatRate: string | null;
    contractSigningDate: Date | null;
    buyerInn: string | null;
    buyerRegion: string | null;
    supplierInn: string | null;
    supplierRegion: string | null;
  };

  const xlsxMap = new Map<number, XlsxContract>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = parseInt(String(r[3]));
    if (isNaN(id) || xlsxMap.has(id)) continue;
    xlsxMap.set(id, {
      id,
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
  console.log(`  xlsx: ${xlsxMap.size} уникальных контрактов`);

  // ── Читаем postgres ──
  const pgRows: Contract[] = await db.select().from(contracts);
  const pgMap = new Map<number, Contract>(pgRows.map((r) => [r.id, r]));
  console.log(`  postgres: ${pgMap.size} записей`);

  const stats = newStats();

  for (const [id, x] of xlsxMap) {
    stats.checked++;
    const p = pgMap.get(id);

    if (!p) {
      stats.missing++;
      console.log(`  [ОТСУТСТВУЕТ в postgres] contracts.id=${id}`);
      continue;
    }

    const mismatched: string[] = [];

    if (!strsEqual(x.procurementName, p.procurementName))
      mismatched.push(`procurementName: xlsx="${x.procurementName}" | pg="${p.procurementName}"`);
    if (!strsEqual(x.procurementMethod, p.procurementMethod))
      mismatched.push(`procurementMethod: xlsx="${x.procurementMethod}" | pg="${p.procurementMethod}"`);
    if (!numsEqual(x.initialContractValue, p.initialContractValue, 5))
      mismatched.push(`initialContractValue: xlsx=${x.initialContractValue} | pg=${p.initialContractValue}`);
    if (!numsEqual(x.contractValueAfterSigning, p.contractValueAfterSigning, 5))
      mismatched.push(`contractValueAfterSigning: xlsx=${x.contractValueAfterSigning} | pg=${p.contractValueAfterSigning}`);
    if (!numsEqual(x.reductionPercent, p.reductionPercent, 5))
      mismatched.push(`reductionPercent: xlsx=${x.reductionPercent} | pg=${p.reductionPercent}`);
    if (!strsEqual(x.vatRate, p.vatRate))
      mismatched.push(`vatRate: xlsx="${x.vatRate}" | pg="${p.vatRate}"`);
    if (!datesEqual(x.contractSigningDate, p.contractSigningDate))
      mismatched.push(
        `contractSigningDate: xlsx=${x.contractSigningDate?.toISOString()} | pg=${p.contractSigningDate?.toISOString()}`
      );
    if (!strsEqual(x.buyerInn, p.buyerInn))
      mismatched.push(`buyerInn: xlsx="${x.buyerInn}" | pg="${p.buyerInn}"`);
    if (!strsEqual(x.buyerRegion, p.buyerRegion))
      mismatched.push(`buyerRegion: xlsx="${x.buyerRegion}" | pg="${p.buyerRegion}"`);
    if (!strsEqual(x.supplierInn, p.supplierInn))
      mismatched.push(`supplierInn: xlsx="${x.supplierInn}" | pg="${p.supplierInn}"`);
    if (!strsEqual(x.supplierRegion, p.supplierRegion))
      mismatched.push(`supplierRegion: xlsx="${x.supplierRegion}" | pg="${p.supplierRegion}"`);

    if (mismatched.length > 0) {
      stats.mismatches++;
      console.log(`  [РАСХОЖДЕНИЕ] contracts.id=${id}:`);
      for (const m of mismatched) console.log(`    • ${m}`);
    }
  }

  for (const id of pgMap.keys()) {
    if (!xlsxMap.has(id)) {
      stats.extra++;
      console.log(`  [ЛИШНЯЯ запись в postgres] contracts.id=${id}`);
    }
  }

  printStats("contracts", stats);
  return stats;
}

// ─── 3. Проверка таблицы contract_items ──────────────────────────────────────

async function testContractItems(): Promise<Stats> {
  console.log("\n══════════════════════════════════════════════════════");
  console.log(" ПРОВЕРКА: contract_items (Позиции контрактов)");
  console.log("══════════════════════════════════════════════════════");

  // ── Читаем xlsx ──
  const wb = XLSX.readFile(CONTRACTS_FILE, { cellDates: false, dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  // Получаем заранее все STE ids из БД чтобы понять, какие steId были resolvedSteId=null
  const steIdsInDb = new Set<number>(
    (await db.select({ id: ste.id }).from(ste)).map((r) => r.id)
  );

  type XlsxItem = {
    contractId: number;
    steId: number | null;
    steItemName: string | null;
    quantity: string | null;
    unit: string | null;
    unitPrice: string | null;
  };

  // Группируем по contractId (сохраняем порядок строк)
  const xlsxByContract = new Map<number, XlsxItem[]>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const contractId = parseInt(String(r[3]));
    if (isNaN(contractId)) continue;

    const rawSteId = r[14] != null ? parseInt(String(r[14])) : null;
    const steId =
      rawSteId !== null && !isNaN(rawSteId) && steIdsInDb.has(rawSteId) ? rawSteId : null;

    const item: XlsxItem = {
      contractId,
      steId,
      steItemName: str(r[15]),
      quantity: num(r[1]),
      unit: str(r[2]),
      unitPrice: num(r[16]),
    };

    if (!xlsxByContract.has(contractId)) xlsxByContract.set(contractId, []);
    xlsxByContract.get(contractId)!.push(item);
  }

  const totalXlsx = [...xlsxByContract.values()].reduce((s, arr) => s + arr.length, 0);
  console.log(`  xlsx: ${xlsxByContract.size} контрактов, ${totalXlsx} позиций`);

  // ── Читаем postgres ──
  const pgRows: ContractItem[] = await db
    .select()
    .from(contractItems)
    .orderBy(contractItems.id);

  const pgByContract = new Map<number, ContractItem[]>();
  for (const row of pgRows) {
    if (!pgByContract.has(row.contractId)) pgByContract.set(row.contractId, []);
    pgByContract.get(row.contractId)!.push(row);
  }

  const totalPg = pgRows.length;
  console.log(`  postgres: ${pgByContract.size} контрактов, ${totalPg} позиций`);

  const stats = newStats();

  for (const [contractId, xlsxItems] of xlsxByContract) {
    const pgItems = pgByContract.get(contractId) ?? [];

    if (pgItems.length === 0) {
      stats.missing += xlsxItems.length;
      console.log(
        `  [ОТСУТСТВУЮТ в postgres] contract_items для contracts.id=${contractId} (${xlsxItems.length} строк)`
      );
      continue;
    }

    // Сравниваем по позиции: порядок строк в xlsx = порядок вставки = postgres id ASC.
    // pgItems уже отсортированы по id (см. orderBy выше).
    if (xlsxItems.length !== pgItems.length) {
      console.log(
        `  [РАЗНОЕ КОЛИЧЕСТВО] contracts.id=${contractId}: xlsx=${xlsxItems.length}, postgres=${pgItems.length}`
      );
    }

    const len = Math.max(xlsxItems.length, pgItems.length);
    for (let j = 0; j < len; j++) {
      stats.checked++;
      const x = xlsxItems[j];
      const p = pgItems[j];

      if (!x) {
        stats.extra++;
        console.log(`  [ЛИШНЯЯ позиция в postgres] contracts.id=${contractId}, pg.id=${p.id}`);
        continue;
      }
      if (!p) {
        stats.missing++;
        console.log(
          `  [ОТСУТСТВУЕТ позиция в postgres] contracts.id=${contractId}, xlsx-позиция#${j + 1}`
        );
        continue;
      }

      const mismatched: string[] = [];

      if (x.steId !== (p.steId ?? null))
        mismatched.push(`steId: xlsx=${x.steId} | pg=${p.steId}`);
      if (!strsEqual(x.steItemName, p.steItemName))
        mismatched.push(`steItemName: xlsx="${x.steItemName}" | pg="${p.steItemName}"`);
      if (!numsEqual(x.quantity, p.quantity, 11))
        mismatched.push(`quantity: xlsx=${x.quantity} | pg=${p.quantity}`);
      if (!strsEqual(x.unit, p.unit))
        mismatched.push(`unit: xlsx="${x.unit}" | pg="${p.unit}"`);
      if (!numsEqual(x.unitPrice, p.unitPrice, 11))
        mismatched.push(`unitPrice: xlsx=${x.unitPrice} | pg=${p.unitPrice}`);

      if (mismatched.length > 0) {
        stats.mismatches++;
        console.log(`  [РАСХОЖДЕНИЕ] contracts.id=${contractId}, позиция#${j + 1} (pg.id=${p.id}):`);
        for (const m of mismatched) console.log(`    • ${m}`);
      }
    }
  }

  // Лишние контракты в postgres (есть в postgres, нет в xlsx)
  for (const contractId of pgByContract.keys()) {
    if (!xlsxByContract.has(contractId)) {
      const items = pgByContract.get(contractId)!;
      stats.extra += items.length;
      console.log(
        `  [ЛИШНИЙ контракт в postgres] contracts.id=${contractId} (${items.length} позиций)`
      );
    }
  }

  printStats("contract_items", stats);
  return stats;
}

// ─── Вывод итогов ─────────────────────────────────────────────────────────────

function printStats(table: string, s: Stats) {
  console.log(`\n  Итог [${table}]:`);
  console.log(`    Проверено строк : ${s.checked}`);
  console.log(`    Расхождений     : ${s.mismatches}`);
  console.log(`    Отсутствует в PG: ${s.missing}`);
  console.log(`    Лишних в PG     : ${s.extra}`);
  const ok = s.mismatches === 0 && s.missing === 0 && s.extra === 0;
  console.log(`    Статус          : ${ok ? "✔ OK" : "✘ ЕСТЬ ПРОБЛЕМЫ"}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Тест целостности данных xlsx → postgres ===");
  console.log(`СТЕ     : ${STE_FILE}`);
  console.log(`Контракты: ${CONTRACTS_FILE}`);

  let hasProblems = false;

  try {
    const s1 = await testSte();
    const s2 = await testContracts();
    const s3 = await testContractItems();

    const allStats = [s1, s2, s3];
    hasProblems = allStats.some(
      (s) => s.mismatches > 0 || s.missing > 0 || s.extra > 0
    );

    console.log("\n══════════════════════════════════════════════════════");
    console.log(" ОБЩИЙ ИТОГ");
    console.log("══════════════════════════════════════════════════════");
    const totalChecked = allStats.reduce((s, a) => s + a.checked, 0);
    const totalMismatches = allStats.reduce((s, a) => s + a.mismatches, 0);
    const totalMissing = allStats.reduce((s, a) => s + a.missing, 0);
    const totalExtra = allStats.reduce((s, a) => s + a.extra, 0);
    console.log(`  Всего проверено : ${totalChecked}`);
    console.log(`  Расхождений     : ${totalMismatches}`);
    console.log(`  Отсутствует в PG: ${totalMissing}`);
    console.log(`  Лишних в PG     : ${totalExtra}`);
    console.log(`\n  Финальный статус: ${hasProblems ? "✘ ДАННЫЕ РАСХОДЯТСЯ" : "✔ ВСЕ ДАННЫЕ СОВПАДАЮТ"}`);
  } catch (err) {
    console.error("\nОшибка выполнения теста:", err);
    hasProblems = true;
  } finally {
    await pool.end();
  }

  process.exit(hasProblems ? 1 : 0);
}

main();
