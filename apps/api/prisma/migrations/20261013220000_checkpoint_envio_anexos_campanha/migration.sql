ALTER TABLE "campanha_itens"
  ADD COLUMN "texto_enviado_em" TIMESTAMP(3),
  ADD COLUMN "anexos_enviados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
