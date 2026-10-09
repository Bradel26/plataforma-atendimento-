-- CreateEnum
CREATE TYPE "ConversaOrigem" AS ENUM ('ATIVO', 'RECEPTIVO');

-- CreateEnum
CREATE TYPE "EventoConversa" AS ENUM ('ACEITE', 'TRANSFERENCIA', 'ENCERRAMENTO');

-- AlterTable
ALTER TABLE "conversas" ADD COLUMN     "atendente_inicial_id" TEXT,
ADD COLUMN     "origem" "ConversaOrigem" NOT NULL DEFAULT 'RECEPTIVO',
ADD COLUMN     "protocolo" TEXT;

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "enviada_por_dispositivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "evento" "EventoConversa";

-- AlterTable
ALTER TABLE "canais_config" ADD COLUMN     "espelhar_celular" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "contadores_protocolo" (
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "dia" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_protocolo_pkey" PRIMARY KEY ("organizacao_id","dia")
);

-- CreateIndex
CREATE INDEX "contadores_protocolo_organizacao_id_dia_idx" ON "contadores_protocolo"("organizacao_id", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "conversas_organizacao_id_protocolo_key" ON "conversas"("organizacao_id", "protocolo");

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_atendente_inicial_id_fkey" FOREIGN KEY ("atendente_inicial_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contadores_protocolo" ADD CONSTRAINT "contadores_protocolo_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tabela raiz: o CHECK impede o default vazio de virar dado real.
ALTER TABLE "contadores_protocolo"
  ADD CONSTRAINT "contadores_protocolo_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');

-- Backfill: origem pela primeira mensagem de gente (cliente ou agente).
UPDATE "conversas" AS c
SET "origem" = 'ATIVO'
WHERE (
  SELECT m."autor"::text
  FROM "mensagens" AS m
  WHERE m."conversa_id" = c."id" AND m."autor" IN ('CLIENTE', 'AGENTE')
  ORDER BY m."criado_em" ASC, m."id" ASC
  LIMIT 1
) = 'AGENTE';

-- Backfill: atendente inicial aproximado pelo responsavel atual (o historico de
-- transferencias antigas nao guarda o id de quem aceitou primeiro).
UPDATE "conversas" SET "atendente_inicial_id" = "agente_id" WHERE "agente_id" IS NOT NULL;

-- Backfill: protocolo AAMMDD-NNNNN pela data de criacao em Brasilia.
UPDATE "conversas" AS c
SET "protocolo" = s.protocolo
FROM (
  SELECT
    "id",
    to_char(("criado_em" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD')
      || '-'
      || lpad(
        row_number() OVER (
          PARTITION BY "organizacao_id",
            to_char(("criado_em" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD')
          ORDER BY "criado_em", "id"
        )::text,
        5,
        '0'
      ) AS protocolo
  FROM "conversas"
) AS s
WHERE c."id" = s."id";

-- Contadores continuam de onde o backfill parou.
INSERT INTO "contadores_protocolo" ("organizacao_id", "dia", "ultimo")
SELECT "organizacao_id", left("protocolo", 6), count(*)::int
FROM "conversas"
WHERE "protocolo" IS NOT NULL
GROUP BY "organizacao_id", left("protocolo", 6);
