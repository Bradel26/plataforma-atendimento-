-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO', 'FECHADO');

-- CreateEnum
CREATE TYPE "TicketPrioridade" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');

-- CreateTable
CREATE TABLE "protocolos" (
    "numero" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ABERTO',
    "prioridade" "TicketPrioridade" NOT NULL DEFAULT 'NORMAL',
    "contato_id" TEXT,
    "conta_id" TEXT,
    "conversa_id" TEXT,
    "responsavel_id" TEXT,
    "fila_id" TEXT,
    "prazo_sla" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "resolvido_em" TIMESTAMP(3),
    "fechado_em" TIMESTAMP(3),

    CONSTRAINT "protocolos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocolo_comentarios" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "conteudo" TEXT NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocolo_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocolo_anexos" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tipo" TEXT,
    "tamanho" INTEGER,
    "autor_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocolo_anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocolo_agendamentos" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "responsavel_id" TEXT,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocolo_agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protocolos_numero_key" ON "protocolos"("numero");

-- CreateIndex
CREATE INDEX "protocolos_status_atualizado_em_idx" ON "protocolos"("status", "atualizado_em");

-- CreateIndex
CREATE INDEX "protocolos_responsavel_id_status_idx" ON "protocolos"("responsavel_id", "status");

-- CreateIndex
CREATE INDEX "protocolo_comentarios_ticket_id_criado_em_idx" ON "protocolo_comentarios"("ticket_id", "criado_em");

-- CreateIndex
CREATE INDEX "protocolo_agendamentos_inicio_idx" ON "protocolo_agendamentos"("inicio");

-- AddForeignKey
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_comentarios" ADD CONSTRAINT "protocolo_comentarios_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "protocolos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_comentarios" ADD CONSTRAINT "protocolo_comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_anexos" ADD CONSTRAINT "protocolo_anexos_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "protocolos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_anexos" ADD CONSTRAINT "protocolo_anexos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_agendamentos" ADD CONSTRAINT "protocolo_agendamentos_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "protocolos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_agendamentos" ADD CONSTRAINT "protocolo_agendamentos_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
