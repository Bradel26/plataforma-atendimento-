-- CreateEnum
CREATE TYPE "FunnelTipo" AS ENUM ('COMERCIAL', 'ESTEIRA');

-- CreateEnum
CREATE TYPE "SituacaoCredenciamento" AS ENUM ('REPROVADO', 'CANCELADO', 'INATIVADO');

-- DropIndex
DROP INDEX "oportunidades_aprovacao_idx";

-- DropIndex
DROP INDEX "oportunidades_temperatura_idx";

-- AlterTable
ALTER TABLE "funis" ADD COLUMN     "tipo" "FunnelTipo" NOT NULL DEFAULT 'COMERCIAL';

-- CreateTable
CREATE TABLE "credenciamentos" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "contato_id" TEXT NOT NULL,
    "conta_id" TEXT,
    "funil_id" TEXT NOT NULL,
    "estagio_id" TEXT NOT NULL,
    "responsavel_id" TEXT,
    "situacao_excecao" "SituacaoCredenciamento",
    "motivo_excecao" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "fechado_em" TIMESTAMP(3),

    CONSTRAINT "credenciamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credenciamentos_organizacao_id_estagio_id_atualizado_em_idx" ON "credenciamentos"("organizacao_id", "estagio_id", "atualizado_em");

-- RenameForeignKey
ALTER TABLE "valores_campo_customizado_conta" RENAME CONSTRAINT "valores_campo_customizado_conta_campo_fkey" TO "valores_campo_customizado_conta_campo_customizado_id_fkey";

-- RenameForeignKey
ALTER TABLE "valores_campo_customizado_conta" RENAME CONSTRAINT "valores_campo_customizado_conta_conta_fkey" TO "valores_campo_customizado_conta_conta_id_fkey";

-- RenameForeignKey
ALTER TABLE "valores_campo_customizado_lead" RENAME CONSTRAINT "valores_campo_customizado_lead_campo_fkey" TO "valores_campo_customizado_lead_campo_customizado_id_fkey";

-- RenameForeignKey
ALTER TABLE "valores_campo_customizado_lead" RENAME CONSTRAINT "valores_campo_customizado_lead_lead_fkey" TO "valores_campo_customizado_lead_lead_id_fkey";

-- RenameForeignKey
ALTER TABLE "valores_campo_customizado_oportunidade" RENAME CONSTRAINT "valores_campo_customizado_oportunidade_campo_fkey" TO "valores_campo_customizado_oportunidade_campo_customizado_i_fkey";

-- RenameForeignKey
ALTER TABLE "valores_campo_customizado_oportunidade" RENAME CONSTRAINT "valores_campo_customizado_oportunidade_oportunidade_fkey" TO "valores_campo_customizado_oportunidade_oportunidade_id_fkey";

-- AddForeignKey
ALTER TABLE "credenciamentos" ADD CONSTRAINT "credenciamentos_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamentos" ADD CONSTRAINT "credenciamentos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamentos" ADD CONSTRAINT "credenciamentos_funil_id_fkey" FOREIGN KEY ("funil_id") REFERENCES "funis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamentos" ADD CONSTRAINT "credenciamentos_estagio_id_fkey" FOREIGN KEY ("estagio_id") REFERENCES "funil_estagios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamentos" ADD CONSTRAINT "credenciamentos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciamentos" ADD CONSTRAINT "credenciamentos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "atividades_obrigatoria_idx" RENAME TO "atividades_organizacao_id_oportunidade_id_obrigatoria_concl_idx";

-- RenameIndex
ALTER INDEX "atividades_visita_em_andamento_idx" RENAME TO "atividades_organizacao_id_checkin_em_checkout_em_idx";

-- RenameIndex
ALTER INDEX "campos_customizados_organizacao_entidade_chave_idx" RENAME TO "campos_customizados_organizacao_id_entidade_chave_key";

-- RenameIndex
ALTER INDEX "campos_customizados_organizacao_entidade_idx" RENAME TO "campos_customizados_organizacao_id_entidade_idx";

-- RenameIndex
ALTER INDEX "componentes_garantia_produto_do_cliente_idx" RENAME TO "componentes_garantia_produto_do_cliente_id_idx";

-- RenameIndex
ALTER INDEX "consumo_ia_periodo_idx" RENAME TO "consumo_ia_organizacao_id_criado_em_idx";

-- RenameIndex
ALTER INDEX "consumo_ia_recurso_idx" RENAME TO "consumo_ia_organizacao_id_recurso_criado_em_idx";

-- RenameIndex
ALTER INDEX "contatos_papel_idx" RENAME TO "contatos_organizacao_id_conta_id_papel_na_conta_idx";

-- RenameIndex
ALTER INDEX "filiais_organizacao_idx" RENAME TO "filiais_organizacao_id_idx";

-- RenameIndex
ALTER INDEX "filiais_organizacao_nome_idx" RENAME TO "filiais_organizacao_id_nome_key";

-- RenameIndex
ALTER INDEX "metas_mes_idx" RENAME TO "metas_organizacao_id_mes_idx";

-- RenameIndex
ALTER INDEX "metas_unica_idx" RENAME TO "metas_organizacao_id_usuario_id_escopo_mes_key";

-- RenameIndex
ALTER INDEX "oportunidade_auditoria_idx" RENAME TO "oportunidade_auditoria_oportunidade_id_criado_em_idx";

-- RenameIndex
ALTER INDEX "produtos_do_cliente_organizacao_conta_idx" RENAME TO "produtos_do_cliente_organizacao_id_conta_id_idx";

-- RenameIndex
ALTER INDEX "valores_campo_customizado_conta_campo_conta_idx" RENAME TO "valores_campo_customizado_conta_campo_customizado_id_conta__key";

-- RenameIndex
ALTER INDEX "valores_campo_customizado_conta_campo_valor_idx" RENAME TO "valores_campo_customizado_conta_campo_customizado_id_valor_idx";

-- RenameIndex
ALTER INDEX "valores_campo_customizado_lead_campo_lead_idx" RENAME TO "valores_campo_customizado_lead_campo_customizado_id_lead_id_key";

-- RenameIndex
ALTER INDEX "valores_campo_customizado_lead_campo_valor_idx" RENAME TO "valores_campo_customizado_lead_campo_customizado_id_valor_idx";

-- RenameIndex
ALTER INDEX "valores_campo_customizado_oportunidade_campo_oport_idx" RENAME TO "valores_campo_customizado_oportunidade_campo_customizado_id_key";

-- RenameIndex
ALTER INDEX "valores_campo_customizado_oportunidade_campo_valor_idx" RENAME TO "valores_campo_customizado_oportunidade_campo_customizado_id_idx";

-- RenameIndex
ALTER INDEX "visoes_salvas_organizacao_entidade_idx" RENAME TO "visoes_salvas_organizacao_id_entidade_idx";

-- RenameIndex
ALTER INDEX "visoes_salvas_organizacao_entidade_nome_idx" RENAME TO "visoes_salvas_organizacao_id_entidade_nome_key";
