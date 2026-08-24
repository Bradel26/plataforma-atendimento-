-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('EM_ESPERA', 'ATRIBUIDO', 'EM_ATENDIMENTO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CLIENTE', 'AGENTE', 'SISTEMA');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('TEXTO', 'IMAGEM', 'AUDIO', 'VIDEO', 'ARQUIVO');

-- CreateTable
CREATE TABLE "contatos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "canal_origem" "Channel" NOT NULL DEFAULT 'WEBCHAT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas" (
    "id" TEXT NOT NULL,
    "canal" "Channel" NOT NULL DEFAULT 'WEBCHAT',
    "status" "ConversationStatus" NOT NULL DEFAULT 'EM_ESPERA',
    "contato_id" TEXT NOT NULL,
    "fila_id" TEXT,
    "agente_id" TEXT,
    "assunto" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atribuido_em" TIMESTAMP(3),
    "finalizado_em" TIMESTAMP(3),
    "ultima_mensagem_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nao_lidas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" TEXT NOT NULL,
    "conversa_id" TEXT NOT NULL,
    "autor" "MessageAuthor" NOT NULL,
    "autor_id" TEXT,
    "conteudo" TEXT NOT NULL,
    "tipo_anexo" "AttachmentType" NOT NULL DEFAULT 'TEXTO',
    "anexo_url" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contatos_email_idx" ON "contatos"("email");

-- CreateIndex
CREATE INDEX "contatos_telefone_idx" ON "contatos"("telefone");

-- CreateIndex
CREATE INDEX "conversas_status_ultima_mensagem_em_idx" ON "conversas"("status", "ultima_mensagem_em");

-- CreateIndex
CREATE INDEX "conversas_agente_id_status_idx" ON "conversas"("agente_id", "status");

-- CreateIndex
CREATE INDEX "conversas_fila_id_status_idx" ON "conversas"("fila_id", "status");

-- CreateIndex
CREATE INDEX "mensagens_conversa_id_criado_em_idx" ON "mensagens"("conversa_id", "criado_em");

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
