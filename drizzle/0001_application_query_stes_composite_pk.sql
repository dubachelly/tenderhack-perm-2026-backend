-- Заменяем суррогатный id на составной PK (query_id, ste_id)
ALTER TABLE application_query_stes DROP CONSTRAINT application_query_stes_pkey;
ALTER TABLE application_query_stes DROP COLUMN id;
ALTER TABLE application_query_stes ADD CONSTRAINT application_query_stes_pkey PRIMARY KEY (query_id, ste_id);
