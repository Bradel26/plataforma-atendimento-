ALTER TABLE "series_atividades" ALTER COLUMN "fim_em" DROP NOT NULL;
CREATE UNIQUE INDEX "atividades_serie_id_prazo_key" ON "atividades"("serie_id", "prazo");
