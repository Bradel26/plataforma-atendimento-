-- Resumos de 2 em 2 horas por conversa (ficha do CRM). Gerados sob demanda e guardados.
CREATE TABLE "resumos_conversa" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "conversa_id" TEXT NOT NULL,
    "janela_inicio" TIMESTAMP(3) NOT NULL,
    "janela_fim" TIMESTAMP(3) NOT NULL,
    "texto" TEXT NOT NULL,
    "mensagens" INTEGER NOT NULL,
    "motor" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumos_conversa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resumos_conversa_conversa_id_janela_inicio_key" ON "resumos_conversa"("conversa_id", "janela_inicio");
CREATE INDEX "resumos_conversa_organizacao_id_conversa_id_idx" ON "resumos_conversa"("organizacao_id", "conversa_id");

ALTER TABLE "resumos_conversa" ADD CONSTRAINT "resumos_conversa_conversa_id_fkey"
FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resumos_conversa" ADD CONSTRAINT "resumos_conversa_organizacao_id_fkey"
FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resumos_conversa"
  ADD CONSTRAINT "resumos_conversa_organizacao_id_nao_vazio"
  CHECK ("organizacao_id" <> '');
