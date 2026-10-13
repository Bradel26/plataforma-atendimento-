CREATE TABLE "mensagens_rapidas" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "titulo" TEXT NOT NULL,
    "atalho" TEXT,
    "conteudo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'Geral',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_por_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mensagens_rapidas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mensagens_rapidas_organizacao_id_atalho_key" ON "mensagens_rapidas"("organizacao_id", "atalho");
CREATE INDEX "mensagens_rapidas_organizacao_id_ativo_categoria_idx" ON "mensagens_rapidas"("organizacao_id", "ativo", "categoria");

ALTER TABLE "mensagens_rapidas" ADD CONSTRAINT "mensagens_rapidas_organizacao_id_fkey"
FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
