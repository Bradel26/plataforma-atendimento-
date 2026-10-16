-- Calling API e preferencias de gravacao/transcricao pertencem a cada numero
-- WhatsApp. Cada chamada aponta para a linha que a originou ou recebeu.
ALTER TABLE "canais_config"
  ADD COLUMN "whatsapp_calling_habilitado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gravar_chamadas_whatsapp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transcrever_chamadas_whatsapp" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "chamadas"
  ADD COLUMN "canal_config_id" TEXT,
  ADD COLUMN "sdp_remoto" TEXT;

CREATE INDEX "chamadas_organizacao_id_canal_config_id_iniciado_em_idx"
  ON "chamadas"("organizacao_id", "canal_config_id", "iniciado_em");

ALTER TABLE "chamadas"
  ADD CONSTRAINT "chamadas_canal_config_id_fkey"
  FOREIGN KEY ("canal_config_id") REFERENCES "canais_config"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
