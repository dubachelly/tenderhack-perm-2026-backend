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
				summary: "Заявка со всеми запросами и привязанными СТЕ",
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
		"/applications/{appId}/queries/{queryId}/stes": {
			post: {
				tags: ["Applications"],
				summary: "Привязать СТЕ к запросу",
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
								required: ["steId", "nameMatchPercent"],
								properties: {
									steId: { type: "integer" },
									nameMatchPercent: {
										type: "number",
										minimum: 0,
										maximum: 100,
									},
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
								schema: { $ref: "#/components/schemas/ApplicationQuerySte" },
							},
						},
					},
					"400": errorResponse,
					"404": errorResponse,
					"500": errorResponse,
				},
			},
		},
		"/applications/{appId}/queries/{queryId}/stes/{steId}": {
			delete: {
				tags: ["Applications"],
				summary: "Отвязать СТЕ от запроса",
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
						name: "steId",
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
		"/search/items": {
			get: {
				tags: ["Search"],
				summary: "Полнотекстовый поиск позиций контрактов по СТЕ",
				parameters: paginatedQuery([
					{
						name: "q",
						in: "query",
						required: true,
						description: "Поисковый запрос (русский язык)",
						schema: { type: "string", example: "мешок мусорный 20 литров" },
					},
				]),
				responses: {
					"200": paginatedResponse({
						$ref: "#/components/schemas/SearchSteGroup",
					}),
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
					initialContractValue: {
						type: "string",
						nullable: true,
						description: "numeric",
					},
					contractValueAfterSigning: {
						type: "string",
						nullable: true,
						description: "numeric",
					},
					reductionPercent: { type: "string", nullable: true },
					vatRate: { type: "string", nullable: true },
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
					quantity: { type: "string", nullable: true },
					unit: { type: "string", nullable: true },
					unitPrice: { type: "string", nullable: true },
					steName: { type: "string", nullable: true },
					steCategory: { type: "string", nullable: true },
					steManufacturer: { type: "string", nullable: true },
					steCharacteristics: { type: "string", nullable: true },
					medianPrice: {
						type: "number",
						nullable: true,
						description: "Median unit price for the STE, excluding outliers",
					},
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
			ApplicationQuerySte: {
				type: "object",
				properties: {
					id: { type: "integer" },
					queryId: { type: "integer" },
					steId: { type: "integer" },
					nameMatchPercent: { type: "string", description: "numeric(5,2)" },
				},
			},
			ApplicationQuerySteWithSte: {
				type: "object",
				properties: {
					id: { type: "integer" },
					queryId: { type: "integer" },
					steId: { type: "integer" },
					nameMatchPercent: { type: "string" },
					steName: { type: "string", nullable: true },
					steCategory: { type: "string", nullable: true },
					steManufacturer: { type: "string", nullable: true },
					steCharacteristics: { type: "string", nullable: true },
					medianPrice: {
						type: "number",
						nullable: true,
						description: "Median unit price for the STE, excluding outliers",
					},
				},
			},
			ApplicationQueryFull: {
				type: "object",
				properties: {
					id: { type: "integer" },
					applicationId: { type: "integer" },
					queryText: { type: "string" },
					stes: {
						type: "array",
						items: { $ref: "#/components/schemas/ApplicationQuerySteWithSte" },
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
			SearchContractItem: {
				type: "object",
				properties: {
					id: { type: "integer" },
					contract_id: { type: "integer" },
					ste_item_name: { type: "string", nullable: true },
					quantity: { type: "string", nullable: true },
					unit: { type: "string", nullable: true },
					unit_price: { type: "string", nullable: true },
				},
			},
			SearchSteGroup: {
				type: "object",
				description:
					"СТЕ с вложенным списком контрактов, в которых она встречается",
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
					median_price: {
						type: "number",
						nullable: true,
						description: "Median unit price for the STE, excluding outliers",
					},
					contracts: {
						type: "array",
						items: { $ref: "#/components/schemas/SearchContractItem" },
					},
				},
			},
		},
	},
};
