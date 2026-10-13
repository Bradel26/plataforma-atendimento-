CREATE TABLE "contas_operacoes" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "conta_id" TEXT NOT NULL,
  "operacao" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contas_operacoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contas_operacoes_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contas_operacoes_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "contas_operacoes_conta_id_operacao_key" ON "contas_operacoes"("conta_id", "operacao");
CREATE INDEX "contas_operacoes_organizacao_id_operacao_idx" ON "contas_operacoes"("organizacao_id", "operacao");
INSERT INTO "contas_operacoes" ("id", "organizacao_id", "conta_id", "operacao")
SELECT gen_random_uuid()::text, "organizacao_id", "id", upper("segmento")
FROM "contas" WHERE upper("segmento") IN ('TIM', 'STARLINK')
ON CONFLICT ("conta_id", "operacao") DO NOTHING;
