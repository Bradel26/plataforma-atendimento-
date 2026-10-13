ALTER TABLE "contatos" ADD COLUMN "origem_importacao" TEXT;

CREATE TABLE "mapeamentos_origem_importacao" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "origem" TEXT NOT NULL,
  "operacao" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mapeamentos_origem_importacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mapeamentos_origem_importacao_org_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mapeamentos_origem_importacao_org_nao_vazio" CHECK ("organizacao_id" <> '')
);

CREATE UNIQUE INDEX "mapeamentos_origem_importacao_org_origem_key" ON "mapeamentos_origem_importacao"("organizacao_id", "origem");
CREATE INDEX "mapeamentos_origem_importacao_org_operacao_idx" ON "mapeamentos_origem_importacao"("organizacao_id", "operacao");
