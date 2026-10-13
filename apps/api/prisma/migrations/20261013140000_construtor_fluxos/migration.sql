CREATE TYPE "EstadoExecucaoFluxo" AS ENUM (
  'AGUARDANDO_RESPOSTA',
  'AGUARDANDO_TIMEOUT',
  'ENCERRADA'
);

CREATE TABLE "fluxos" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "nome" TEXT NOT NULL,
  "rascunho" JSONB NOT NULL DEFAULT '{}',
  "publicado" JSONB,
  "versao" INTEGER NOT NULL DEFAULT 0,
  "ativo" BOOLEAN NOT NULL DEFAULT false,
  "publicado_em" TIMESTAMP(3),
  "canal_config_id" TEXT,
  "canal_config_rascunho_id" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fluxos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fluxos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id")
    REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fluxos_canal_config_id_fkey" FOREIGN KEY ("canal_config_id")
    REFERENCES "canais_config"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fluxos_canal_config_rascunho_id_fkey" FOREIGN KEY ("canal_config_rascunho_id")
    REFERENCES "canais_config"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fluxos_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '')
);

CREATE UNIQUE INDEX "fluxos_canal_config_id_key" ON "fluxos"("canal_config_id");
CREATE INDEX "fluxos_organizacao_id_ativo_idx" ON "fluxos"("organizacao_id", "ativo");
CREATE INDEX "fluxos_organizacao_id_canal_config_rascunho_id_idx"
  ON "fluxos"("organizacao_id", "canal_config_rascunho_id");

CREATE TABLE "execucoes_fluxo" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "conversa_id" TEXT NOT NULL,
  "fluxo_id" TEXT,
  "versao" INTEGER NOT NULL,
  "grafo" JSONB NOT NULL,
  "no_atual_id" TEXT NOT NULL,
  "estado" "EstadoExecucaoFluxo" NOT NULL DEFAULT 'AGUARDANDO_RESPOSTA',
  "expira_em" TIMESTAMP(3),
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "encerrada_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "execucoes_fluxo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "execucoes_fluxo_organizacao_id_fkey" FOREIGN KEY ("organizacao_id")
    REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "execucoes_fluxo_conversa_id_fkey" FOREIGN KEY ("conversa_id")
    REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "execucoes_fluxo_fluxo_id_fkey" FOREIGN KEY ("fluxo_id")
    REFERENCES "fluxos"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "execucoes_fluxo_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '')
);

CREATE UNIQUE INDEX "execucoes_fluxo_conversa_id_key" ON "execucoes_fluxo"("conversa_id");
CREATE INDEX "execucoes_fluxo_organizacao_id_estado_expira_em_idx"
  ON "execucoes_fluxo"("organizacao_id", "estado", "expira_em");