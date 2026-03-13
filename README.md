# TenderHack Perm 2026 — Backend

REST API на Express + Drizzle ORM + PostgreSQL для работы с данными контрактов и СТЕ.

## Требования

- [Node.js](https://nodejs.org/) >= 18
- [Docker](https://www.docker.com/) и Docker Compose

---

## Быстрый старт

### 1. Установить зависимости

```bash
npm install
```

### 2. Запустить PostgreSQL

```bash
docker compose up -d
```

PostgreSQL будет доступен на `localhost:5432`.

### 3. Создать файл `.env`

```bash
cp .env.example .env
```

Содержимое `.env` по умолчанию уже совпадает с настройками docker-compose:

```env
DATABASE_URL=postgresql://tenderhack:tenderhack@localhost:5432/tenderhack
PORT=3000
```

### 4. Применить схему к базе данных

```bash
npm run db:push
```

### 5. Наполнить базу данными из xlsx-файлов

> Загружает ~244 000 СТЕ и ~461 000 позиций контрактов. Занимает несколько минут.

```bash
npm run seed
```

### 6. Запустить сервер

```bash
# Режим разработки (с авто-перезагрузкой)
npm run dev

# Или production-запуск
npm start
```

Сервер будет доступен на `http://localhost:3000`.

---

## API

### Проверка работоспособности

```
GET /health
```

---

### СТЕ (Стандартизированные товарные единицы)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/ste` | Список СТЕ с пагинацией и фильтрацией |
| GET | `/ste/categories` | Список уникальных категорий |
| GET | `/ste/:id` | Одна запись СТЕ по ID |

**Query-параметры для `GET /ste`:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `page` | number | Номер страницы (по умолчанию: 1) |
| `limit` | number | Записей на страницу, макс. 200 (по умолчанию: 50) |
| `search` | string | Поиск по наименованию СТЕ |
| `category` | string | Фильтр по категории |

**Пример:**
```
GET /ste?search=холодильник&category=бытовая&page=1&limit=20
```

---

### Контракты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/contracts` | Список контрактов с пагинацией и фильтрацией |
| GET | `/contracts/:id` | Контракт с позициями и данными СТЕ |
| GET | `/contracts/:id/items` | Только позиции контракта |

**Query-параметры для `GET /contracts`:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `page` | number | Номер страницы (по умолчанию: 1) |
| `limit` | number | Записей на страницу, макс. 200 (по умолчанию: 50) |
| `search` | string | Поиск по наименованию закупки |
| `buyerInn` | string | ИНН заказчика |
| `supplierInn` | string | ИНН поставщика |
| `region` | string | Фильтр по региону заказчика |
| `dateFrom` | string | Дата заключения от (ISO 8601, напр. `2025-01-01`) |
| `dateTo` | string | Дата заключения до (ISO 8601) |

**Пример:**
```
GET /contracts?region=Пермский&dateFrom=2025-01-01&dateTo=2025-12-31&limit=10
```

---

## Управление базой данных

```bash
# Открыть визуальный интерфейс Drizzle Studio
npm run db:studio

# Пересоздать схему (при изменениях в schema.ts)
npm run db:push

# Остановить и удалить контейнер с данными
docker compose down -v
```
