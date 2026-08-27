-- Ponte com o motor de IA externo (plugin `plataforma` do whatsbot-pro).
--
-- Dois lados: os campos em canais_config guardam para onde entregamos o inbound
-- e com que segredo assinamos; tokens_integracao autentica quem volta com a
-- resposta do agente.

-- CreateEnum
CREATE TYPE "EscopoIntegracao" AS ENUM ('IA');

-- AlterTable
ALTER TABLE "canais_config"
  ADD COLUMN "ia_ativa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ia_url_webhook" TEXT,
  ADD COLUMN "ia_segredo" TEXT;

-- CreateTable
CREATE TABLE "tokens_integracao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "escopo" "EscopoIntegracao" NOT NULL DEFAULT 'IA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por_id" TEXT,
    "ultimo_uso_em" TIMESTAMP(3),
    "revogado_em" TIMESTAMP(3),

    CONSTRAINT "tokens_integracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_integracao_hash_key" ON "tokens_integracao"("hash");

-- CreateIndex
CREATE INDEX "tokens_integracao_ativo_idx" ON "tokens_integracao"("ativo");

-- AddForeignKey
ALTER TABLE "tokens_integracao" ADD CONSTRAINT "tokens_integracao_criado_por_id_fkey"
  FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
