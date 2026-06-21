-- Migração de schema: índices e função usados pela tela de Análise por Polo Agro.
--
-- Sem isso, a busca por polo faz varredura completa de bigdata_ofertas recalculando
-- unaccent() linha a linha em cada query (analysis, dashboard, query, export-excel),
-- o que torna a tela de Análise lenta (~5s por carregamento em vez de ~350-450ms).
--
-- Seguro de rodar mais de uma vez (todos os comandos são idempotentes).
--
-- Como rodar:
--   psql -h <host> -p <porta> -U <user> -d <banco> -f db/migrations/001_indices_performance_polo.sql

CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() nativo é STABLE, não IMMUTABLE, então não pode ser usado direto em
-- índice funcional. Este wrapper marca como IMMUTABLE para permitir indexação.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

-- Acelera o join bigdata_ofertas -> reserva_legal por uf + cidade/município sem acento.
CREATE INDEX IF NOT EXISTS idx_bigdata_ofertas_uf_municipio
ON bigdata_ofertas (uf, (upper(immutable_unaccent(municipio))));

CREATE INDEX IF NOT EXISTS idx_reserva_legal_uf_cidade
ON reserva_legal (uf, (upper(immutable_unaccent(cidade))));

-- Acelera a contagem de CARs por polo (gráfico de Cobertura de Ofertas vs. CAR).
-- car_compilado.car tem o formato "UF-GEOCODIGO-HASH"; o geocódigo é extraído via split_part.
CREATE INDEX IF NOT EXISTS idx_car_compilado_geocodigo
ON car_compilado (((split_part(car, '-', 2))::bigint));
