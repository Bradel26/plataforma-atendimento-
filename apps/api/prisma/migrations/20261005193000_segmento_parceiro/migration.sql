ALTER TABLE "contatos"
  ADD COLUMN "segmento_parceiro" TEXT;

UPDATE "contatos"
SET "segmento_parceiro" = 'STARLINK'
WHERE "observacoes" ILIKE '%CONTATOS STARLINK%'
   OR "observacoes" ILIKE '%IMPORTADO%STARLINK%';

UPDATE "contatos"
SET "segmento_parceiro" = 'TIM'
WHERE "segmento_parceiro" IS NULL
  AND (
    "observacoes" ILIKE '%PDV TIM%'
    OR "observacoes" ILIKE '%CARTEIRA%TIM%'
  );

ALTER TABLE "contatos"
  ADD CONSTRAINT "contatos_segmento_parceiro_valido"
  CHECK ("segmento_parceiro" IS NULL OR "segmento_parceiro" IN ('TIM', 'STARLINK'));
