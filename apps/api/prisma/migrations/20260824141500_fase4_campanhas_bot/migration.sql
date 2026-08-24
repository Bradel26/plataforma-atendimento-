-- CreateEnum
CREATE TYPE "CampanhaStatus" AS ENUM ('RASCUNHO', 'ATIVA', 'PAUSADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "CampanhaItemStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU', 'RESPONDIDO', 'IGNORADO');

-- CreateEnum
CREATE TYPE "BotAcao" AS ENUM ('RESPONDER', 'TRANSFERIR', 'ENCERRAR');

-- AlterEnum
ALTER TYPE "MessageAuthor" ADD VALUE 'BOT';

-- CreateTable
CREATE TABLE "campanhas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "canal" "Channel" NOT NULL DEFAULT 'WHATSAPP',
    "mensagem" TEXT NOT NULL,
    "status" "CampanhaStatus" NOT NULL DEFAULT 'RASCUNHO',
    "fila_id" TEXT,
    "criado_por_id" TEXT,
    "agendada_para" TIMESTAMP(3),
    "iniciada_em" TIMESTAMP(3),
    "concluida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanha_itens" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "contato_id" TEXT NOT NULL,
    "status" "CampanhaItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "conversa_id" TEXT,
    "enviado_em" TIMESTAMP(3),
    "respondido_em" TIMESTAMP(3),

    CONSTRAINT "campanha_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "canal" "Channel",
    "mensagem_boas_vindas" TEXT NOT NULL,
    "fallback" TEXT NOT NULL,
    "limite_sem_resposta" INTEGER NOT NULL DEFAULT 2,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_passos" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "gatilhos" TEXT[],
    "resposta" TEXT NOT NULL,
    "acao" "BotAcao" NOT NULL DEFAULT 'RESPONDER',
    "fila_id" TEXT,

    CONSTRAINT "bot_passos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanhas_status_idx" ON "campanhas"("status");

-- CreateIndex
CREATE INDEX "campanha_itens_campanha_id_status_idx" ON "campanha_itens"("campanha_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campanha_itens_campanha_id_contato_id_key" ON "campanha_itens"("campanha_id", "contato_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_passos_bot_id_ordem_key" ON "bot_passos"("bot_id", "ordem");

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_itens" ADD CONSTRAINT "campanha_itens_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_itens" ADD CONSTRAINT "campanha_itens_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_passos" ADD CONSTRAINT "bot_passos_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_passos" ADD CONSTRAINT "bot_passos_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

