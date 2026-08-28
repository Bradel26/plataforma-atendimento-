-- Atividade ganha organizacao propria.
--
-- Ela e filha (liga-se a contato, conta, oportunidade OU protocolo), e a regra
-- "ao menos um vinculo" e validada no servico, nao no banco. Sem coluna propria,
-- isso abria um caminho de escrita cruzada que nenhum filtro de LEITURA pega:
-- uma atividade com o contato de uma empresa e a oportunidade de outra era
-- aceita pelo Postgres. O `smoke:tenant` provou o furo com um 201 onde esperava
-- 404.
--
-- Mesma sequencia segura do passo 1: anulavel -> backfill pelo vinculo -> nao
-- nula -> CHECK.

ALTER TABLE "atividades" ADD COLUMN "organizacao_id" TEXT;

-- O backfill vem do vinculo que a atividade ja tem, na ordem em que o servico
-- os prefere. COALESCE resolve o primeiro nao nulo.
UPDATE "atividades" a
   SET "organizacao_id" = COALESCE(
     (SELECT c."organizacao_id" FROM "contatos" c WHERE c."id" = a."contato_id"),
     (SELECT o."organizacao_id" FROM "contas" o WHERE o."id" = a."conta_id"),
     (SELECT p."organizacao_id" FROM "oportunidades" p WHERE p."id" = a."oportunidade_id"),
     (SELECT t."organizacao_id" FROM "protocolos" t WHERE t."id" = a."protocolo_id")
   )
 WHERE "organizacao_id" IS NULL;

DO $$
DECLARE
  faltando INT;
BEGIN
  SELECT COUNT(*) INTO faltando FROM "atividades" WHERE "organizacao_id" IS NULL;
  IF faltando > 0 THEN
    RAISE EXCEPTION 'atividade sem vinculo resolvivel: % linha(s)', faltando;
  END IF;
END $$;

ALTER TABLE "atividades" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "atividades" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');

ALTER TABLE "atividades" ADD CONSTRAINT "atividades_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indices recriados com a organizacao no prefixo.
DROP INDEX "atividades_contato_id_criado_em_idx";
DROP INDEX "atividades_conta_id_criado_em_idx";
DROP INDEX "atividades_oportunidade_id_criado_em_idx";
DROP INDEX "atividades_responsavel_id_prazo_idx";
DROP INDEX "atividades_prazo_idx";

CREATE INDEX "atividades_organizacao_id_contato_id_criado_em_idx" ON "atividades"("organizacao_id", "contato_id", "criado_em");
CREATE INDEX "atividades_organizacao_id_conta_id_criado_em_idx" ON "atividades"("organizacao_id", "conta_id", "criado_em");
CREATE INDEX "atividades_organizacao_id_oportunidade_id_criado_em_idx" ON "atividades"("organizacao_id", "oportunidade_id", "criado_em");
CREATE INDEX "atividades_organizacao_id_responsavel_id_prazo_idx" ON "atividades"("organizacao_id", "responsavel_id", "prazo");
CREATE INDEX "atividades_organizacao_id_prazo_idx" ON "atividades"("organizacao_id", "prazo");
