ALTER TABLE "contatos"
  ADD COLUMN "segmento_parceiro" TEXT;

-- Backfill pela origem gravada nas observações das importações antigas:
-- "Fonte: CONTATOS STARLINK", "Fonte: ... TIM", "Importado da carteira PDV TIM".
-- Mesmas regras de identificarSegmentoParceiro (src/modules/crm/segmentoParceiro.ts):
-- o valor da "Fonte:" (até o próximo ";", "|" ou quebra de linha) decide
-- primeiro, e só palavra inteira conta — "último" e "estimativa" não são TIM.
UPDATE "contatos" AS c
SET "segmento_parceiro" = s.segmento
FROM (
  SELECT
    id,
    CASE
      WHEN fonte ~* '\mstarlink\M' THEN 'STARLINK'
      WHEN fonte ~* '\mtim\M' THEN 'TIM'
      WHEN obs ~* '\mimportad[oa]\M[^;|\n]{0,80}\mstarlink\M|\mcontatos?\s+starlink\M' THEN 'STARLINK'
      WHEN obs ~* '\mimportad[oa]\M[^;|\n]{0,80}\mtim\M|\mcarteira\M[^;|\n]{0,40}\mtim\M|\mpdv\s+tim\M|\mcontatos?\s+tim\M' THEN 'TIM'
    END AS segmento
  FROM (
    SELECT
      id,
      "observacoes" AS obs,
      substring("observacoes" FROM '(?i)fonte\s*:([^;|\n]*)') AS fonte
    FROM "contatos"
    WHERE "observacoes" ~* '(tim|starlink)'
  ) AS origem
) AS s
WHERE c.id = s.id
  AND s.segmento IS NOT NULL;

ALTER TABLE "contatos"
  ADD CONSTRAINT "contatos_segmento_parceiro_valido"
  CHECK ("segmento_parceiro" IS NULL OR "segmento_parceiro" IN ('TIM', 'STARLINK'));
