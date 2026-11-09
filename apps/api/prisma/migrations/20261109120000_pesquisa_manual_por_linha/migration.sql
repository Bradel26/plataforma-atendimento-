-- Pesquisa de satisfacao por linha: so libera o botao manual do atendente.
ALTER TABLE "canais_config" ADD COLUMN "pesquisa_habilitada" BOOLEAN NOT NULL DEFAULT false;
