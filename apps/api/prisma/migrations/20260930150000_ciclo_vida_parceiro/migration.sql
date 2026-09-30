-- Ciclo de vida do parceiro apos o credenciamento (relacao e acompanhamento,
-- sem producao). Um ciclo por credenciamento.

-- CreateEnum
CREATE TYPE "StatusCicloParceiro" AS ENUM ('NOVO_PARCEIRO', 'EM_IMPLANTACAO', 'ATIVO', 'SEM_ACOMPANHAMENTO', 'EM_RISCO', 'INATIVO', 'REATIVADO');

-- CreateTable
CREATE TABLE "ciclos_parceiro" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "credenciamento_id" TEXT NOT NULL,
    "status" "StatusCicloParceiro" NOT NULL DEFAULT 'NOVO_PARCEIRO',
    "status_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credenciado_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ciclos_parceiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclo_parceiro_etapas" (
    "id" TEXT NOT NULL,
    "ciclo_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "concluida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_por_id" TEXT,

    CONSTRAINT "ciclo_parceiro_etapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclo_parceiro_historico" (
    "id" TEXT NOT NULL,
    "ciclo_id" TEXT NOT NULL,
    "de_status" "StatusCicloParceiro",
    "para_status" "StatusCicloParceiro" NOT NULL,
    "regra" TEXT NOT NULL,
    "motivo" TEXT,
    "observacao" TEXT,
    "usuario_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciclo_parceiro_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ciclos_parceiro_credenciamento_id_key" ON "ciclos_parceiro"("credenciamento_id");
CREATE INDEX "ciclos_parceiro_organizacao_id_status_idx" ON "ciclos_parceiro"("organizacao_id", "status");
CREATE UNIQUE INDEX "ciclo_parceiro_etapas_ciclo_id_chave_key" ON "ciclo_parceiro_etapas"("ciclo_id", "chave");
CREATE INDEX "ciclo_parceiro_historico_ciclo_id_criado_em_idx" ON "ciclo_parceiro_historico"("ciclo_id", "criado_em");

-- AddForeignKey
ALTER TABLE "ciclos_parceiro" ADD CONSTRAINT "ciclos_parceiro_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ciclos_parceiro" ADD CONSTRAINT "ciclos_parceiro_credenciamento_id_fkey" FOREIGN KEY ("credenciamento_id") REFERENCES "credenciamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ciclo_parceiro_etapas" ADD CONSTRAINT "ciclo_parceiro_etapas_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_parceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ciclo_parceiro_etapas" ADD CONSTRAINT "ciclo_parceiro_etapas_concluida_por_id_fkey" FOREIGN KEY ("concluida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ciclo_parceiro_historico" ADD CONSTRAINT "ciclo_parceiro_historico_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_parceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ciclo_parceiro_historico" ADD CONSTRAINT "ciclo_parceiro_historico_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tabela raiz: o CHECK impede o default vazio de virar dado real.
ALTER TABLE "ciclos_parceiro"
  ADD CONSTRAINT "ciclos_parceiro_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');
