ALTER TABLE "oportunidades" ADD COLUMN "qualificacao" JSONB;
ALTER TABLE "atividades" ADD COLUMN "automacao_chave" TEXT;
ALTER TABLE "atividades" ADD COLUMN "cancelado_em" TIMESTAMP(3);
CREATE UNIQUE INDEX "atividades_automacao_chave_key" ON "atividades"("automacao_chave");
ALTER TABLE "funis" ADD COLUMN "reativacao_dias" INTEGER DEFAULT 30;
ALTER TABLE "funil_estagios" ADD COLUMN "roteiro_vendas" TEXT;
ALTER TABLE "funil_estagios" ADD COLUMN "perguntas_gpct" JSONB;

CREATE TABLE "oportunidade_analises_ia" (
  "id" TEXT NOT NULL,
  "oportunidade_id" TEXT NOT NULL,
  "motor" TEXT NOT NULL,
  "versao" TEXT NOT NULL,
  "resultado" JSONB NOT NULL,
  "unidades" INTEGER,
  "custo" DECIMAL(12,6),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oportunidade_analises_ia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "oportunidade_analises_ia_oportunidade_id_criado_em_idx" ON "oportunidade_analises_ia"("oportunidade_id", "criado_em");
ALTER TABLE "oportunidade_analises_ia" ADD CONSTRAINT "oportunidade_analises_ia_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
