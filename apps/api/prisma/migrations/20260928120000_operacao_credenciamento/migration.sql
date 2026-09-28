-- Reestruturacao TIM/Starlink (SUGESTOES.docx): historico de etapas da
-- Esteira, UF/cidade do parceiro e tipos de atividade da agenda.
-- Tudo aditivo: nenhuma coluna existente muda de tipo ou some.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoAtividade" ADD VALUE 'RETORNO';
ALTER TYPE "TipoAtividade" ADD VALUE 'DOCUMENTACAO';
ALTER TYPE "TipoAtividade" ADD VALUE 'ACOMPANHAMENTO';
ALTER TYPE "TipoAtividade" ADD VALUE 'OUTRO';

-- AlterTable
ALTER TABLE "contatos" ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "uf" VARCHAR(2);

-- AlterTable
ALTER TABLE "credenciamentos" ADD COLUMN     "estagio_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "credenciamento_historico" (
    "id" TEXT NOT NULL,
    "credenciamento_id" TEXT NOT NULL,
    "de_estagio_id" TEXT,
    "para_estagio_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "segundos_no_estagio" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credenciamento_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credenciamento_historico_credenciamento_id_criado_em_idx" ON "credenciamento_historico"("credenciamento_id", "criado_em");

-- CreateIndex
CREATE INDEX "credenciamento_historico_para_estagio_id_criado_em_idx" ON "credenciamento_historico"("para_estagio_id", "criado_em");

-- CreateIndex
CREATE INDEX "contatos_organizacao_id_uf_idx" ON "contatos"("organizacao_id", "uf");

-- CreateIndex
CREATE INDEX "credenciamentos_organizacao_id_funil_id_estagio_desde_idx" ON "credenciamentos"("organizacao_id", "funil_id", "estagio_desde");

-- AddForeignKey
ALTER TABLE "credenciamento_historico" ADD CONSTRAINT "credenciamento_historico_credenciamento_id_fkey" FOREIGN KEY ("credenciamento_id") REFERENCES "credenciamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamento_historico" ADD CONSTRAINT "credenciamento_historico_de_estagio_id_fkey" FOREIGN KEY ("de_estagio_id") REFERENCES "funil_estagios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamento_historico" ADD CONSTRAINT "credenciamento_historico_para_estagio_id_fkey" FOREIGN KEY ("para_estagio_id") REFERENCES "funil_estagios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamento_historico" ADD CONSTRAINT "credenciamento_historico_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: o credenciamento que ja existia ganha como "no estagio desde" a
-- ultima alteracao (a melhor aproximacao disponivel) e um registro de entrada
-- no historico, para o tempo medio de credenciamento ter ponto de partida.
UPDATE "credenciamentos" SET "estagio_desde" = "atualizado_em";

INSERT INTO "credenciamento_historico" ("id", "credenciamento_id", "de_estagio_id", "para_estagio_id", "criado_em")
SELECT gen_random_uuid()::text, c."id", NULL, c."estagio_id", c."criado_em"
FROM "credenciamentos" c;
