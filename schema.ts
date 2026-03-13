import {
  pgTable,
  bigint,
  text,
  numeric,
  timestamp,
  serial,
  varchar,
  index,
  foreignKey,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const tsvectorType = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ─── СТЕ (Стандартизированная товарная единица) ───────────────────────────────

export const ste = pgTable(
  "ste",
  {
    /** Идентификатор СТЕ */
    id: bigint("id", { mode: "number" }).primaryKey(),
    /** Наименование СТЕ */
    name: text("name").notNull(),
    /** Категория */
    category: text("category"),
    /** Производитель */
    manufacturer: text("manufacturer"),
    /**
     * Характеристики СТЕ.
     * Хранится как строка вида "Ключ1:Значение1;Ключ2:Значение2;..."
     */
    characteristics: text("characteristics"),
    /** Вектор полнотекстового поиска: name (вес A) + characteristics (вес B) */
    searchVector: tsvectorType("search_vector"),
  },
  (t) => [
    index("ste_name_idx").on(t.name),
    index("ste_category_idx").on(t.category),
    index("ste_search_vector_idx").using("gin", t.searchVector),
  ],
);

// ─── Контракты (заголовок контракта) ─────────────────────────────────────────

export const contracts = pgTable(
  "contracts",
  {
    /** Идентификатор контракта */
    id: bigint("id", { mode: "number" }).primaryKey(),
    /** Наименование закупки */
    procurementName: text("procurement_name").notNull(),
    /** Способ закупки (напр. "Контракт по итогам котировочной сессии") */
    procurementMethod: text("procurement_method"),
    /** Начальная (максимальная) стоимость контракта */
    initialContractValue: numeric("initial_contract_value", {
      precision: 20,
      scale: 5,
    }),
    /** Стоимость контракта после заключения */
    contractValueAfterSigning: numeric("contract_value_after_signing", {
      precision: 20,
      scale: 5,
    }),
    /** % снижения начальной цены */
    reductionPercent: numeric("reduction_percent", { precision: 20, scale: 5 }),
    /** Ставка НДС (напр. "20%", "Без НДС") */
    vatRate: varchar("vat_rate", { length: 20 }),
    /** Дата заключения контракта */
    contractSigningDate: timestamp("contract_signing_date", {
      withTimezone: false,
    }),
    /** ИНН заказчика */
    buyerInn: varchar("buyer_inn", { length: 12 }),
    /** Регион заказчика */
    buyerRegion: text("buyer_region"),
    /** ИНН поставщика */
    supplierInn: varchar("supplier_inn", { length: 12 }),
    /** Регион поставщика */
    supplierRegion: text("supplier_region"),
  },
  (t) => [
    index("contracts_buyer_inn_idx").on(t.buyerInn),
    index("contracts_supplier_inn_idx").on(t.supplierInn),
    index("contracts_signing_date_idx").on(t.contractSigningDate),
    index("contracts_region_idx").on(t.buyerRegion, t.supplierRegion),
  ],
);

// ─── Позиции контракта (строки контракта, линк к СТЕ) ────────────────────────

export const contractItems = pgTable(
  "contract_items",
  {
    id: serial("id").primaryKey(),
    /** FK → contracts.id */
    contractId: bigint("contract_id", { mode: "number" })
      .notNull()
      .references(() => contracts.id),
    /** FK → ste.id (Идентификатор СТЕ по контракту) */
    steId: bigint("ste_id", { mode: "number" }).references(() => ste.id),
    /**
     * Наименование позиции СТЕ в контракте.
     * Может отличаться от ste.name — это описание из самого контракта.
     */
    steItemName: text("ste_item_name"),
    /** Количество */
    quantity: numeric("quantity", { precision: 20, scale: 11 }),
    /** Единица измерения */
    unit: text("unit"),
    /** Цена за единицу */
    unitPrice: numeric("unit_price", { precision: 20, scale: 11 }),
  },
  (t) => [
    index("contract_items_contract_id_idx").on(t.contractId),
    index("contract_items_ste_id_idx").on(t.steId),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const contractsRelations = relations(contracts, ({ many }) => ({
  items: many(contractItems),
}));

export const contractItemsRelations = relations(contractItems, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractItems.contractId],
    references: [contracts.id],
  }),
  ste: one(ste, {
    fields: [contractItems.steId],
    references: [ste.id],
  }),
}));

export const steRelations = relations(ste, ({ many }) => ({
  contractItems: many(contractItems),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Ste = typeof ste.$inferSelect;
export type NewSte = typeof ste.$inferInsert;

export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

export type ContractItem = typeof contractItems.$inferSelect;
export type NewContractItem = typeof contractItems.$inferInsert;
