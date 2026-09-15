-- Espelho do WhatsApp pessoal: um chat do celular do vendedor que ainda nao
-- virou Conversation formal na plataforma.
CREATE TABLE "previas_chat" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "canal_config_id" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ultima_mensagem" TEXT NOT NULL,
  "ultima_mensagem_em" TIMESTAMP(3) NOT NULL,
  "nao_lidas" INTEGER NOT NULL DEFAULT 0,
  "mensagens" JSONB NOT NULL DEFAULT '[]',
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "previas_chat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "previas_chat_canal_config_id_numero_key" ON "previas_chat"("canal_config_id", "numero");
CREATE INDEX "previas_chat_canal_config_id_ultima_mensagem_em_idx" ON "previas_chat"("canal_config_id", "ultima_mensagem_em");

ALTER TABLE "previas_chat"
  ADD CONSTRAINT "previas_chat_canal_config_id_fkey"
  FOREIGN KEY ("canal_config_id") REFERENCES "canais_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;
