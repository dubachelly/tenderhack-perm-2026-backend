-- Меняем numeric-поля на double precision, чтобы на клиенте они приходили числами, а не строками.
-- vat_rate: "Без НДС" → NULL, остальные значения кастуем как есть.

ALTER TABLE contracts
  ALTER COLUMN initial_contract_value      TYPE double precision USING initial_contract_value::double precision,
  ALTER COLUMN contract_value_after_signing TYPE double precision USING contract_value_after_signing::double precision,
  ALTER COLUMN reduction_percent           TYPE double precision USING reduction_percent::double precision,
  ALTER COLUMN vat_rate                    TYPE double precision USING CASE
    WHEN vat_rate ILIKE '%без%ндс%' THEN NULL
    ELSE replace(vat_rate, '%', '')::double precision
  END;

ALTER TABLE contract_items
  ALTER COLUMN quantity   TYPE double precision USING quantity::double precision,
  ALTER COLUMN unit_price TYPE double precision USING unit_price::double precision;
