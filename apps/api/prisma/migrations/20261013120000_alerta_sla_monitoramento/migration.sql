ALTER TABLE "organizacoes"
  ADD COLUMN "alerta_resposta_minutos" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "critico_resposta_minutos" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "organizacoes"
  ADD CONSTRAINT "organizacoes_sla_resposta_limites_check"
  CHECK (
    "alerta_resposta_minutos" BETWEEN 1 AND 240
    AND "critico_resposta_minutos" BETWEEN 2 AND 240
    AND "critico_resposta_minutos" > "alerta_resposta_minutos"
  );
