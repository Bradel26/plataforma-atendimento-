-- CreateEnum
CREATE TYPE "TipoAtividade" AS ENUM ('NOTA', 'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'PROPOSTA');

-- AlterTable
ALTER TABLE "oportunidades" ADD COLUMN     "estagio_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAtividade" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "prazo" TIMESTAMP(3),
    "concluido_em" TIMESTAMP(3),
    "responsavel_id" TEXT,
    "criado_por_id" TEXT,
    "contato_id" TEXT,
    "conta_id" TEXT,
    "oportunidade_id" TEXT,
    "protocolo_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidade_historico_estagio" (
    "id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "de_estagio_id" TEXT,
    "para_estagio_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "segundos_no_estagio" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oportunidade_historico_estagio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atividades_contato_id_criado_em_idx" ON "atividades"("contato_id", "criado_em");

-- CreateIndex
CREATE INDEX "atividades_conta_id_criado_em_idx" ON "atividades"("conta_id", "criado_em");

-- CreateIndex
CREATE INDEX "atividades_oportunidade_id_criado_em_idx" ON "atividades"("oportunidade_id", "criado_em");

-- CreateIndex
CREATE INDEX "atividades_responsavel_id_prazo_idx" ON "atividades"("responsavel_id", "prazo");

-- CreateIndex
CREATE INDEX "atividades_prazo_idx" ON "atividades"("prazo");

-- CreateIndex
CREATE INDEX "oportunidade_historico_estagio_oportunidade_id_criado_em_idx" ON "oportunidade_historico_estagio"("oportunidade_id", "criado_em");

-- CreateIndex
CREATE INDEX "oportunidade_historico_estagio_para_estagio_id_criado_em_idx" ON "oportunidade_historico_estagio"("para_estagio_id", "criado_em");

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_protocolo_id_fkey" FOREIGN KEY ("protocolo_id") REFERENCES "protocolos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_historico_estagio" ADD CONSTRAINT "oportunidade_historico_estagio_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_historico_estagio" ADD CONSTRAINT "oportunidade_historico_estagio_de_estagio_id_fkey" FOREIGN KEY ("de_estagio_id") REFERENCES "funil_estagios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_historico_estagio" ADD CONSTRAINT "oportunidade_historico_estagio_para_estagio_id_fkey" FOREIGN KEY ("para_estagio_id") REFERENCES "funil_estagios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade_historico_estagio" ADD CONSTRAINT "oportunidade_historico_estagio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
