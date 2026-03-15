import type { OpenAPIV3 } from "openapi-types";

const paginatedQuery = (
	extra: OpenAPIV3.ParameterObject[] = [],
): OpenAPIV3.ParameterObject[] => [
	{ name: "page", in: "query", schema: { type: "integer", default: 1 } },
	{
		name: "limit",
		in: "query",
		schema: { type: "integer", default: 50, maximum: 200 },
	},
	...extra,
];

const paginatedResponse = (
	itemSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
): OpenAPIV3.ResponseObject => ({
	description: "OK",
	content: {
		"application/json": {
			schema: {
				type: "object",
				properties: {
					data: { type: "array", items: itemSchema },
					total: { type: "integer" },
					page: { type: "integer" },
					limit: { type: "integer" },
				},
			},
		},
	},
});

const errorResponse: OpenAPIV3.ResponseObject = {
	description: "Error",
	content: {
		"application/json": { schema: { $ref: "#/components/schemas/Error" } },
	},
};

export const swaggerDocument: OpenAPIV3.Document = {
	openapi: "3.0.3",
	info: { title: "TenderHack Perm 2026 API", version: "1.0.0" },
	paths: {
		"/health": {
			get: {
				summary: "Health check",
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: { status: { type: "string", example: "ok" } },
								},
							},
						},
					},
				},
			},
		},

		// ─── STE ────────────────────────────────────────────────────────────────────
		"/ste": {
			get: {
				tags: ["STE"],
				summary: "Список СТЕ с пагинацией и фильтрацией",
				parameters: paginatedQuery([
					{
						name: "search",
						in: "query",
						description: "Поиск по названию (ilike)",
						schema: { type: "string" },
					},
					{
						name: "category",
						in: "query",
						description: "Фильтр по категории (ilike)",
						schema: { type: "string" },
					},
				]),
				responses: {
					"200": paginatedResponse({ $ref: "#/components/schemas/Ste" }),
					"500": errorResponse,
				},
			},
		},
		"/ste/categories": {
			get: {
				tags: ["STE"],
				summary: "Список уникальных категорий СТЕ",
				parameters: [
					{
						name: "query",
						in: "query",
						required: false,
						description: "Полнотекстовый поиск по имени СТЕ — вернёт только категории из найденных СТЕ",
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: { type: "array", items: { type: "string" } },
							},
						},
					},
					"500": errorResponse,
				},
			},
		},
		"/ste/{id}": {
			get: {
				tags: ["STE"],
				summary: "Получить СТЕ по ID",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Ste" },
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},

		// ─── Contracts ──────────────────────────────────────────────────────────────
		"/contracts": {
			get: {
				tags: ["Contracts"],
				summary: "Список контрактов с пагинацией и фильтрацией",
				parameters: paginatedQuery([
					{
						name: "search",
						in: "query",
						description: "Поиск по наименованию закупки (ilike)",
						schema: { type: "string" },
					},
					{
						name: "buyerInn",
						in: "query",
						description: "ИНН заказчика (точное совпадение)",
						schema: { type: "string" },
					},
					{
						name: "supplierInn",
						in: "query",
						description: "ИНН поставщика (точное совпадение)",
						schema: { type: "string" },
					},
					{
						name: "region",
						in: "query",
						description: "Регион заказчика (ilike)",
						schema: { type: "string" },
					},
					{
						name: "dateFrom",
						in: "query",
						description: "Дата заключения от (ISO 8601)",
						schema: { type: "string", format: "date" },
					},
					{
						name: "dateTo",
						in: "query",
						description: "Дата заключения до (ISO 8601)",
						schema: { type: "string", format: "date" },
					},
				]),
				responses: {
					"200": paginatedResponse({ $ref: "#/components/schemas/Contract" }),
					"500": errorResponse,
				},
			},
		},
		"/contracts/supplier-regions": {
			get: {
				tags: ["Contracts"],
				summary: "Список уникальных регионов поставщиков",
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: { type: "array", items: { type: "string" } },
							},
						},
					},
					"500": errorResponse,
				},
			},
		},
		"/contracts/buyer-regions": {
			get: {
				tags: ["Contracts"],
				summary: "Список уникальных регионов заказчиков",
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: { type: "array", items: { type: "string" } },
							},
						},
					},
					"500": errorResponse,
				},
			},
		},
		"/contracts/procurement-methods": {
			get: {
				tags: ["Contracts"],
				summary: "Список уникальных способов закупки",
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: { type: "array", items: { type: "string" } },
							},
						},
					},
					"500": errorResponse,
				},
			},
		},
		"/contracts/{id}": {
			get: {
				tags: ["Contracts"],
				summary: "Контракт по ID с позициями и данными СТЕ",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									allOf: [
										{ $ref: "#/components/schemas/Contract" },
										{
											type: "object",
											properties: {
												items: {
													type: "array",
													items: {
														$ref: "#/components/schemas/ContractItemWithSte",
													},
												},
											},
										},
									],
								},
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/contracts/{id}/items": {
			get: {
				tags: ["Contracts"],
				summary: "Позиции контракта по ID контракта",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: { $ref: "#/components/schemas/ContractItemWithSte" },
								},
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},

		// ─── Applications ───────────────────────────────────────────────────────────
		"/applications": {
			post: {
				tags: ["Applications"],
				summary: "Создать заявку",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["name"],
								properties: {
									name: { type: "string" },
									queries: { type: "array", items: { type: "string" } },
								},
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Created",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Application" },
							},
						},
					},
					"400": errorResponse,
					"500": errorResponse,
				},
			},
			get: {
				tags: ["Applications"],
				summary: "Список заявок с пагинацией",
				parameters: paginatedQuery(),
				responses: {
					"200": paginatedResponse({
						$ref: "#/components/schemas/Application",
					}),
					"500": errorResponse,
				},
			},
		},
		"/applications/{id}": {
			get: {
				tags: ["Applications"],
				summary: "Заявка со всеми запросами и привязанными контрактами",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApplicationFull" },
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
			patch: {
				tags: ["Applications"],
				summary: "Изменить название заявки",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["name"],
								properties: { name: { type: "string" } },
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Обновлённая заявка",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Application" },
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
			delete: {
				tags: ["Applications"],
				summary: "Удалить заявку (каскад)",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: { ok: { type: "boolean" } },
								},
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/applications/{id}/queries": {
			post: {
				tags: ["Applications"],
				summary: "Добавить запрос в заявку",
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["queryText"],
								properties: { queryText: { type: "string" } },
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Created",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApplicationQuery" },
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/applications/{appId}/queries/{queryId}": {
			patch: {
				tags: ["Applications"],
				summary: "Изменить текст запроса",
				parameters: [
					{
						name: "appId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
					{
						name: "queryId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["queryText"],
								properties: {
									queryText: { type: "string" },
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Обновлённый запрос",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApplicationQuery" },
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
			delete: {
				tags: ["Applications"],
				summary: "Удалить запрос из заявки",
				parameters: [
					{
						name: "appId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
					{
						name: "queryId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: { ok: { type: "boolean" } },
								},
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/applications/{appId}/queries/{queryId}/contracts": {
			post: {
				tags: ["Applications"],
				summary: "Привязать позицию контракта к запросу",
				parameters: [
					{
						name: "appId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
					{
						name: "queryId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["contractItemId"],
								properties: {
									contractItemId: { type: "integer" },
								},
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Created",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ApplicationQueryContract" },
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/applications/{appId}/queries/{queryId}/contracts/{contractItemId}": {
			delete: {
				tags: ["Applications"],
				summary: "Отвязать позицию контракта от запроса",
				parameters: [
					{
						name: "appId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
					{
						name: "queryId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
					{
						name: "contractItemId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: { ok: { type: "boolean" } },
								},
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},

		// ─── Search ─────────────────────────────────────────────────────────────────
		"/search/ai-items": {
			get: {
				tags: ["Search"],
				summary: "AI-поиск СТЕ по точному совпадению названия",
				description: "Запрашивает AI-сервис (localhost:8000/search), затем возвращает СТЕ из БД с точно совпадающим названием. Формат ответа идентичен /search/items.",
				parameters: [
					{
						name: "q",
						in: "query",
						required: true,
						description: "Поисковый запрос, передаётся в AI-сервис",
						schema: { type: "string", example: "пакеты для мусора 35 литров" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: { type: "array", items: { $ref: "#/components/schemas/SearchSteGroup" } },
										total: { type: "integer" },
										page: { type: "integer" },
										limit: { type: "integer" },
									},
								},
							},
						},
					},
					"400": errorResponse,
					"502": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/search/categories": {
			get: {
				tags: ["Search"],
				summary: "Список категорий СТЕ по поисковому запросу",
				parameters: [
					{
						name: "q",
						in: "query",
						required: false,
						description: "Поисковый запрос — возвращаются только категории среди подходящих СТЕ",
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: { type: "array", items: { type: "string" } },
							},
						},
					},
					"500": errorResponse,
				},
			},
		},
				"/search/items": {
			get: {
				tags: ["Search"],
				summary: "Полнотекстовый поиск СТЕ",
				parameters: paginatedQuery([
					{
						name: "q",
						in: "query",
						required: true,
						description: "Поисковый запрос (русский язык)",
						schema: { type: "string", example: "мешок мусорный 20 литров" },
					},
					{
						name: "category",
						in: "query",
						required: false,
						description: "Фильтр по категории СТЕ — ограничивает выдачу (можно несколько: ?category=A&category=B)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
					{
						name: "supplier_region",
						in: "query",
						required: false,
						description: "Фильтр по региону поставщика — влияет на расчёт suggested_items_count (можно несколько)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
					{
						name: "period_from",
						in: "query",
						required: false,
						description: "Начало периода подписания контракта (YYYY-MM-DD) — влияет на расчёт suggested_items_count",
						schema: { type: "string", format: "date" },
					},
					{
						name: "period_to",
						in: "query",
						required: false,
						description: "Конец периода подписания контракта (YYYY-MM-DD) — влияет на расчёт suggested_items_count",
						schema: { type: "string", format: "date" },
					},
					{
						name: "procurement_method",
						in: "query",
						required: false,
						description: "Фильтр по способу закупки — влияет на расчёт suggested_items_count (можно несколько)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
				]),
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: { type: "array", items: { $ref: "#/components/schemas/SearchSteGroup" } },
										total: { type: "integer" },
										page: { type: "integer" },
										limit: { type: "integer" },
									},
								},
							},
						},
					},
					"400": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/search/items-trigram": {
			get: {
				tags: ["Search"],
				summary: "Триграммный поиск СТЕ (pg_trgm)",
				parameters: paginatedQuery([
					{
						name: "q",
						in: "query",
						required: true,
						description: "Поисковый запрос",
						schema: { type: "string", example: "мешок мусорный 20 литров" },
					},
					{
						name: "category",
						in: "query",
						required: false,
						description: "Фильтр по категории СТЕ — ограничивает выдачу (можно несколько: ?category=A&category=B)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
					{
						name: "supplier_region",
						in: "query",
						required: false,
						description: "Фильтр по региону поставщика — влияет на расчёт suggested_items_count (можно несколько)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
					{
						name: "period_from",
						in: "query",
						required: false,
						description: "Начало периода подписания контракта (YYYY-MM-DD) — влияет на расчёт suggested_items_count",
						schema: { type: "string", format: "date" },
					},
					{
						name: "period_to",
						in: "query",
						required: false,
						description: "Конец периода подписания контракта (YYYY-MM-DD) — влияет на расчёт suggested_items_count",
						schema: { type: "string", format: "date" },
					},
					{
						name: "procurement_method",
						in: "query",
						required: false,
						description: "Фильтр по способу закупки — влияет на расчёт suggested_items_count (можно несколько)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
				]),
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: { type: "array", items: { $ref: "#/components/schemas/SearchSteGroup" } },
										total: { type: "integer" },
										page: { type: "integer" },
										limit: { type: "integer" },
									},
								},
							},
						},
					},
					"400": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/search/ste/{steId}/contracts": {
			get: {
				tags: ["Search"],
				summary: "Список контрактов, содержащих данную СТЕ",
				parameters: [
					{
						name: "steId",
						in: "path",
						required: true,
						schema: { type: "integer" },
					},
					{
						name: "category",
						in: "query",
						required: false,
						description: "Фильтр по категории продукции (можно несколько: ?category=A&category=B)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
					{
						name: "supplier_region",
						in: "query",
						required: false,
						description: "Фильтр по региону поставщика (можно несколько)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
					{
						name: "period_from",
						in: "query",
						required: false,
						description: "Начало периода подписания контракта (YYYY-MM-DD)",
						schema: { type: "string", format: "date" },
					},
					{
						name: "period_to",
						in: "query",
						required: false,
						description: "Конец периода подписания контракта (YYYY-MM-DD)",
						schema: { type: "string", format: "date" },
					},
					{
						name: "procurement_method",
						in: "query",
						required: false,
						description: "Фильтр по способу закупки (можно несколько)",
						explode: true,
						schema: { type: "array", items: { type: "string" } },
					},
				],
				responses: {
					"200": {
						description: "Контракты с позициями для данной СТЕ",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										data: {
											type: "array",
											items: { $ref: "#/components/schemas/SteContractRow" },
											description: "Все позиции контрактов, удовлетворяющие фильтрам",
										},
										suggestedItems: {
											type: "array",
											items: { $ref: "#/components/schemas/SteContractRow" },
											description: "Позиции, попадающие в доверительный диапазон цены по IQR (Q1 - 1.5·IQR ≤ unit_price ≤ Q3 + 1.5·IQR)",
										},
									},
								},
							},
						},
					},
					"400": errorResponse,
					"500": errorResponse,
				},
			},
		},
	},

	components: {
		schemas: {
			Error: {
				type: "object",
				properties: { error: { type: "string" } },
			},
			Ste: {
				type: "object",
				properties: {
					id: { type: "integer" },
					name: { type: "string" },
					category: { type: "string", nullable: true },
					manufacturer: { type: "string", nullable: true },
					characteristics: {
						type: "string",
						nullable: true,
						description: "Формат: Ключ1:Значение1;Ключ2:Значение2;...",
					},
				},
			},
			Contract: {
				type: "object",
				properties: {
					id: { type: "integer" },
					procurementName: { type: "string" },
					procurementMethod: { type: "string", nullable: true },
					initialContractValue: { type: "number", nullable: true },
					contractValueAfterSigning: { type: "number", nullable: true },
					reductionPercent: { type: "number", nullable: true },
					vatRate: { type: "number", nullable: true },
					contractSigningDate: {
						type: "string",
						format: "date-time",
						nullable: true,
					},
					buyerInn: { type: "string", nullable: true },
					buyerRegion: { type: "string", nullable: true },
					supplierInn: { type: "string", nullable: true },
					supplierRegion: { type: "string", nullable: true },
				},
			},
			ContractItemWithSte: {
				type: "object",
				properties: {
					id: { type: "integer" },
					steId: { type: "integer", nullable: true },
					steItemName: { type: "string", nullable: true },
					quantity: { type: "number", nullable: true },
					unit: { type: "string", nullable: true },
					unitPrice: { type: "number", nullable: true },
					steName: { type: "string", nullable: true },
					steCategory: { type: "string", nullable: true },
					steManufacturer: { type: "string", nullable: true },
					steCharacteristics: { type: "string", nullable: true },
				},
			},
			Application: {
				type: "object",
				properties: {
					id: { type: "integer" },
					name: { type: "string" },
					createdAt: { type: "string", format: "date-time" },
				},
			},
			ApplicationQuery: {
				type: "object",
				properties: {
					id: { type: "integer" },
					applicationId: { type: "integer" },
					queryText: { type: "string" },
				},
			},
			ApplicationQueryContract: {
				type: "object",
				properties: {
					queryId: { type: "integer" },
					contractItemId: { type: "integer" },
				},
			},
			ApplicationQueryContractWithContract: {
				type: "object",
				properties: {
					queryId: { type: "integer" },
					contractItemId: { type: "integer" },
					steId: { type: "integer", nullable: true },
					steItemName: { type: "string", nullable: true },
					quantity: { type: "number", nullable: true },
					unit: { type: "string", nullable: true },
					unitPrice: { type: "number", nullable: true },
					contractId: { type: "integer" },
					procurementName: { type: "string", nullable: true },
					procurementMethod: { type: "string", nullable: true },
					initialContractValue: { type: "number", nullable: true },
					contractValueAfterSigning: { type: "number", nullable: true },
					reductionPercent: { type: "number", nullable: true },
					vatRate: { type: "number", nullable: true },
					contractSigningDate: { type: "string", format: "date-time", nullable: true },
					buyerInn: { type: "string", nullable: true },
					buyerRegion: { type: "string", nullable: true },
					supplierInn: { type: "string", nullable: true },
					supplierRegion: { type: "string", nullable: true },
				},
			},
			ApplicationQueryFull: {
				type: "object",
				properties: {
					id: { type: "integer" },
					applicationId: { type: "integer" },
					queryText: { type: "string" },
					contracts: {
						type: "array",
						items: { $ref: "#/components/schemas/ApplicationQueryContractWithContract" },
					},
				},
			},
			ApplicationFull: {
				allOf: [
					{ $ref: "#/components/schemas/Application" },
					{
						type: "object",
						properties: {
							queries: {
								type: "array",
								items: { $ref: "#/components/schemas/ApplicationQueryFull" },
							},
						},
					},
				],
			},
			SearchSteGroup: {
				type: "object",
				description:
					"СТЕ с массивом id позиций контрактов, в которых она встречается (пустой массив если контрактов нет)",
				properties: {
					ste_id: { type: "integer" },
					ste_name: { type: "string", nullable: true },
					ste_category: { type: "string", nullable: true },
					ste_manufacturer: { type: "string", nullable: true },
					ste_characteristics: { type: "string", nullable: true },
					rank: {
						type: "number",
						description: "Релевантность полнотекстового поиска",
					},
					suggested_items_count: {
						type: "integer",
						description: "Число позиций контрактов в пределах IQR (рекомендованные цены) с учётом фильтров",
					},
					contract_item_ids: {
						type: "array",
						items: { type: "integer" },
						description: "Массив id позиций контрактов (contract_items), содержащих данную СТЕ",
					},
				},
			},
			SteContractRow: {
				type: "object",
				description: "Строка контракта с данными контракта и позиции СТЕ",
				properties: {
					contract_id: { type: "integer" },
					procurement_name: { type: "string" },
					procurement_method: { type: "string", nullable: true },
					initial_contract_value: { type: "number", nullable: true },
					contract_value_after_signing: { type: "number", nullable: true },
					reduction_percent: { type: "number", nullable: true },
					vat_rate: { type: "number", nullable: true },
					contract_signing_date: { type: "string", format: "date-time", nullable: true },
					buyer_inn: { type: "string", nullable: true },
					buyer_region: { type: "string", nullable: true },
					supplier_inn: { type: "string", nullable: true },
					supplier_region: { type: "string", nullable: true },
					item_id: { type: "integer" },
					ste_item_name: { type: "string", nullable: true },
					quantity: { type: "number", nullable: true },
					unit: { type: "string", nullable: true },
					unit_price: { type: "number", nullable: true },
				},
			},
		},
	},
};
