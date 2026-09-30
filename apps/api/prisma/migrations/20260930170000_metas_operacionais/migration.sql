-- Metas operacionais do consultor de credenciamento (processo, nao dinheiro).

-- CreateEnum
CREATE TYPE "IndicadorMeta" AS ENUM ('NOVOS_PARCEIROS', 'CREDENCIAMENTOS_CONCLUIDOS', 'TAXA_CONVERSAO', 'PARCEIROS_ATIVADOS', 'CONTATOS_REALIZADOS', 'PARCEIROS_SEM_ACOMPANHAMENTO', 'REATIVACOES');

-- CreateTable
CREATE TABLE "metas_operacionais" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "usuario_id" TEXT NOT NULL,
    "indicador" "IndicadorMeta" NOT NULL,
    "mes" DATE NOT NULL,
    "alvo" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metas_operacionais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metas_operacionais_organizacao_id_usuario_id_indicador_mes_key" ON "metas_operacionais"("organizacao_id", "usuario_id", "indicador", "mes");
CREATE INDEX "metas_operacionais_organizacao_id_mes_idx" ON "metas_operacionais"("organizacao_id", "mes");

-- AddForeignKey
ALTER TABLE "metas_operacionais" ADD CONSTRAINT "metas_operacionais_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metas_operacionais" ADD CONSTRAINT "metas_operacionais_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tabela raiz: o CHECK impede o default vazio de virar dado real.
ALTER TABLE "metas_operacionais"
  ADD CONSTRAINT "metas_operacionais_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');
