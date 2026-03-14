import {
  pgTable,
  bigint,
  text,
  numeric,
  doublePrecision,
  timestamp,
  serial,
  varchar,
  integer,
  index,
  customType,
  primaryKey,
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
    initialContractValue: doublePrecision("initial_contract_value"),
    /** Стоимость контракта после заключения */
    contractValueAfterSigning: doublePrecision("contract_value_after_signing"),
    /** % снижения начальной цены */
    reductionPercent: doublePrecision("reduction_percent"),
    /** Ставка НДС (напр. 20, 0) */
    vatRate: doublePrecision("vat_rate"),
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
    quantity: doublePrecision("quantity"),
    /** Единица измерения */
    unit: text("unit"),
    /** Цена за единицу */
    unitPrice: doublePrecision("unit_price"),
  },
  (t) => [
    index("contract_items_contract_id_idx").on(t.contractId),
    index("contract_items_ste_id_idx").on(t.steId),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const contractsRelations = relations(contracts, ({ many }) => ({
  items: many(contractItems),
  applicationQueryContracts: many(applicationQueryContracts),
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

// ─── Заявки ───────────────────────────────────────────────────────────────────

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow().notNull(),
});

export const applicationQueries = pgTable("application_queries", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  queryText: text("query_text").notNull(),
});

export const applicationQueryContracts = pgTable(
  "application_query_contracts",
  {
    queryId: integer("query_id")
      .notNull()
      .references(() => applicationQueries.id, { onDelete: "cascade" }),
    contractId: bigint("contract_id", { mode: "number" })
      .notNull()
      .references(() => contracts.id),
  },
  (t) => [primaryKey({ columns: [t.queryId, t.contractId] })],
);

export const applicationsRelations = relations(applications, ({ many }) => ({
  queries: many(applicationQueries),
}));

export const applicationQueriesRelations = relations(applicationQueries, ({ one, many }) => ({
  application: one(applications, {
    fields: [applicationQueries.applicationId],
    references: [applications.id],
  }),
  contracts: many(applicationQueryContracts),
}));

export const applicationQueryContractsRelations = relations(applicationQueryContracts, ({ one }) => ({
  query: one(applicationQueries, {
    fields: [applicationQueryContracts.queryId],
    references: [applicationQueries.id],
  }),
  contract: one(contracts, {
    fields: [applicationQueryContracts.contractId],
    references: [contracts.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Ste = typeof ste.$inferSelect;
export type NewSte = typeof ste.$inferInsert;

export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

export type ContractItem = typeof contractItems.$inferSelect;
export type NewContractItem = typeof contractItems.$inferInsert;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export type ApplicationQuery = typeof applicationQueries.$inferSelect;
export type NewApplicationQuery = typeof applicationQueries.$inferInsert;

export type ApplicationQueryContract = typeof applicationQueryContracts.$inferSelect;
export type NewApplicationQueryContract = typeof applicationQueryContracts.$inferInsert;
