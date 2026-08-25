-- CreateEnum
CREATE TYPE "AcaoLgpd" AS ENUM ('EXPURGO', 'ANONIMIZACAO', 'EXPORTACAO');

-- AlterTable
ALTER TABLE "contatos" ADD COLUMN     "anonimizado_em" TIMESTAMP(3),
ADD COLUMN     "consentimento_em" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "politica_retencao" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "dias_conversas" INTEGER NOT NULL DEFAULT 90,
    "dias_protocolos" INTEGER NOT NULL DEFAULT 365,
    "dias_presenca" INTEGER NOT NULL DEFAULT 365,
    "ultimo_expurgo_em" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "politica_retencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgpd_registros" (
    "id" TEXT NOT NULL,
    "acao" "AcaoLgpd" NOT NULL,
    "autor_id" TEXT,
    "contato_id" TEXT,
    "detalhe" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lgpd_registros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lgpd_registros_criado_em_idx" ON "lgpd_registros"("criado_em");

-- AddForeignKey
ALTER TABLE "lgpd_registros" ADD CONSTRAINT "lgpd_registros_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

