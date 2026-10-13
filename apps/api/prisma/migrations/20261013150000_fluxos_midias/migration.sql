CREATE TABLE "midias_fluxo" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "fluxo_id" TEXT,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "tamanho" INTEGER NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "midias_fluxo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "midias_fluxo_organizacao_id_fkey" FOREIGN KEY ("organizacao_id")
    REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "midias_fluxo_fluxo_id_fkey" FOREIGN KEY ("fluxo_id")
    REFERENCES "fluxos"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "midias_fluxo_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '')
);

CREATE UNIQUE INDEX "midias_fluxo_url_key" ON "midias_fluxo"("url");
CREATE INDEX "midias_fluxo_organizacao_id_fluxo_id_idx" ON "midias_fluxo"("organizacao_id", "fluxo_id");
