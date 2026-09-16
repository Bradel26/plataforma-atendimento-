-- Aviso em tempo real quando o WhatsApp pessoal de um vendedor cai (ver
-- apps/ponte/src/plataforma.ts:avisarStatus) e persistencia da sessao do
-- Baileys no Postgres em vez de arquivo local (ver apps/ponte/src/autenticacaoPostgres.ts).
ALTER TABLE "canais_config"
  ADD COLUMN "ponte_status" TEXT,
  ADD COLUMN "ponte_status_em" TIMESTAMP(3);

CREATE TABLE "ponte_sessoes_auth" (
  "sessao" TEXT NOT NULL,
  "dados" TEXT NOT NULL,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ponte_sessoes_auth_pkey" PRIMARY KEY ("sessao")
);
