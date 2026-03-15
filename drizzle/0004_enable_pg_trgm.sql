-- Включаем расширение для нечёткого (fuzzy) поиска по триграммам
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Индекс для ускорения fuzzy-поиска по названию СТЕ
CREATE INDEX IF NOT EXISTS ste_name_trgm_idx ON ste USING gin (name gin_trgm_ops);
