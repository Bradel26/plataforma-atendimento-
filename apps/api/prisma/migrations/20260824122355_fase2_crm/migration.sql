-- CreateEnum
CREATE TYPE "LeadFase" AS ENUM ('NOVO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "LeadTipo" AS ENUM ('INBOUND', 'OUTBOUND', 'INDICACAO', 'PARCEIRO');

-- CreateEnum
CREATE TYPE "MotivoPerda" AS ENUM ('PRECO', 'SEM_INTERESSE', 'CONCORRENTE', 'SEM_BUDGET', 'SEM_RESPOSTA', 'OUTRO');

-- CreateEnum
CREATE TYPE "OportunidadeStatus" AS ENUM ('ABERTA', 'GANHA', 'PERDIDA');

-- AlterTable
ALTER TABLE "contatos" ADD COLUMN     "conta_id" TEXT;

-- CreateTable
CREATE TABLE "contas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "segmento" TEXT,
    "site" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "contato_id" TEXT NOT NULL,
    "conta_id" TEXT,
    "fase" "LeadFase" NOT NULL DEFAULT 'NOVO',
    "tipo" "LeadTipo" NOT NULL DEFAULT 'INBOUND',
    "responsavel_id" TEXT,
    "prazo" TIMESTAMP(3),
    "canal_origem" "Channel" NOT NULL DEFAULT 'WEBCHAT',
    "motivo_perda" "MotivoPerda",
    "valor_estimado" DECIMAL(14,2),
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "fechado_em" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funis" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funil_estagios" (
    "id" TEXT NOT NULL,
    "funil_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "probabilidade" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "funil_estagios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,
    "funil_id" TEXT NOT NULL,
    "estagio_id" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "responsavel_id" TEXT,
    "status" "OportunidadeStatus" NOT NULL DEFAULT 'ABERTA',
    "motivo_perda" "MotivoPerda",
    "previsao_fechamento" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "fechado_em" TIMESTAMP(3),

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogos_preco" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogos_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo_itens" (
    "id" TEXT NOT NULL,
    "catalogo_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "preco" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "catalogo_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidade_itens" (
    "id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "preco_unitario" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "oportunidade_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contas_cnpj_key" ON "contas"("cnpj");

-- CreateIndex
CREATE INDEX "contas_nome_idx" ON "contas"("nome");

-- CreateIndex
CREATE INDEX "leads_fase_atualizado_em_idx" ON "leads"("fase", "atualizado_em");

-- CreateIndex
CREATE INDEX "leads_responsavel_id_fase_idx" ON "leads"("responsavel_id", "fase");

-- CreateIndex
CREATE UNIQUE INDEX "funis_nome_key" ON "funis"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "funil_estagios_funil_id_ordem_key" ON "funil_estagios"("funil_id", "ordem");

-- CreateIndex
CREATE INDEX "oportunidades_status_atualizado_em_idx" ON "oportunidades"("status", "atualizado_em");

-- CreateIndex
CREATE INDEX "oportunidades_funil_id_estagio_id_idx" ON "oportunidades"("funil_id", "estagio_id");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_sku_key" ON "produtos"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "catalogos_preco_nome_key" ON "catalogos_preco"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_itens_catalogo_id_produto_id_key" ON "catalogo_itens"("catalogo_id", "produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "oportunidade_itens_oportunidade_id_produto_id_key" ON "oportunidade_itens"("oportunidade_id", "produto_id");

-- AddForeignKey
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funil_estagios" ADD CONSTRAINT "funil_estagios_funil_id_fkey" FOREIGN KEY ("funil_id") REFERENCES "funis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_funil_id_fkey" FOREIGN KEY ("funil_id") REFERENCES "funis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_estagio_id_fkey" FOREIGN KEY ("estagio_id") REFERENCES "funil_estagios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_itens" ADD CONSTRAINT "catalogo_itens_catalogo_id_fkey" FOREIGN KEY ("catalogo_id") REFERENCES "catalogos_preco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_itens" ADD CONSTRAINT "catalogo_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_itens" ADD CONSTRAINT "oportunidade_itens_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_itens" ADD CONSTRAINT "oportunidade_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
