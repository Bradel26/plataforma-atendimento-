-- Continuação das sugestões CRM: recorrência, campanhas de incentivo,
-- operação dupla para contatos e aprovação auditável de remoção.
ALTER TABLE "atividades"
  ADD COLUMN IF NOT EXISTS "concluido_por_id" TEXT,
  ADD COLUMN IF NOT EXISTS "justificativa_conclusao" TEXT,
  ADD COLUMN IF NOT EXISTS "resultado_conclusao" TEXT,
  ADD COLUMN IF NOT EXISTS "serie_id" TEXT;

ALTER TABLE "contatos"
  ADD COLUMN IF NOT EXISTS "excluido_em" TIMESTAMP(3);

ALTER TABLE "contas"
  ADD COLUMN IF NOT EXISTS "nome_fantasia" TEXT,
  ADD COLUMN IF NOT EXISTS "inscricao_estadual" TEXT,
  ADD COLUMN IF NOT EXISTS "cnae_secundario" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "cidade" TEXT,
  ADD COLUMN IF NOT EXISTS "uf" VARCHAR(2),
  ADD COLUMN IF NOT EXISTS "cep" TEXT,
  ADD COLUMN IF NOT EXISTS "logradouro" TEXT,
  ADD COLUMN IF NOT EXISTS "numero" TEXT,
  ADD COLUMN IF NOT EXISTS "complemento" TEXT,
  ADD COLUMN IF NOT EXISTS "bairro" TEXT,
  ADD COLUMN IF NOT EXISTS "responsavel_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "responsavel_cpf" TEXT;

DO $$ BEGIN
  CREATE TYPE "ContactDeletionStatus" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FrequenciaAtividade" AS ENUM ('DIARIA', 'SEMANAL', 'MENSAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PartnerCampaignStatus" AS ENUM ('RASCUNHO', 'AGENDADA', 'VIGENTE', 'ENCERRADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "contatos_operacoes" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "contato_id" TEXT NOT NULL,
  "operacao" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contatos_operacoes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contatos_operacoes_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contatos_operacoes_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "contatos_operacoes_contato_id_operacao_key" ON "contatos_operacoes"("contato_id", "operacao");
CREATE INDEX IF NOT EXISTS "contatos_operacoes_organizacao_id_operacao_idx" ON "contatos_operacoes"("organizacao_id", "operacao");

-- Migra a classificação legada para o vínculo N:N sem remover a coluna antiga.
INSERT INTO "contatos_operacoes" ("id", "organizacao_id", "contato_id", "operacao")
SELECT gen_random_uuid()::text, "organizacao_id", "id", upper("segmento_parceiro")
FROM "contatos" WHERE upper("segmento_parceiro") IN ('TIM', 'STARLINK')
ON CONFLICT ("contato_id", "operacao") DO NOTHING;

CREATE TABLE IF NOT EXISTS "solicitacoes_exclusao_contato" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "contato_id" TEXT NOT NULL,
  "solicitado_por_id" TEXT NOT NULL,
  "aprovado_por_id" TEXT,
  "motivo" TEXT NOT NULL,
  "motivo_decisao" TEXT,
  "status" "ContactDeletionStatus" NOT NULL DEFAULT 'PENDENTE',
  "solicitado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidido_em" TIMESTAMP(3),
  CONSTRAINT "solicitacoes_exclusao_contato_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "solicitacoes_exclusao_contato_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "solicitacoes_exclusao_contato_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "solicitacoes_exclusao_contato_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "solicitacoes_exclusao_contato_aprovado_por_id_fkey" FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "solicitacoes_exclusao_contato_organizacao_id_status_solicitado_em_idx" ON "solicitacoes_exclusao_contato"("organizacao_id", "status", "solicitado_em");

CREATE TABLE IF NOT EXISTS "series_atividades" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "frequencia" "FrequenciaAtividade" NOT NULL,
  "dias_semana" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "inicio_em" TIMESTAMP(3) NOT NULL,
  "fim_em" TIMESTAMP(3) NOT NULL,
  "cancelado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "series_atividades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "series_atividades_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "series_atividades_organizacao_id_fim_em_cancelado_em_idx" ON "series_atividades"("organizacao_id", "fim_em", "cancelado_em");
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_concluido_por_id_fkey" FOREIGN KEY ("concluido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "series_atividades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "campanhas_parceiros" (
  "id" TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "nome" TEXT NOT NULL,
  "operacao" TEXT NOT NULL,
  "descricao" TEXT,
  "produtos_servicos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "incentivos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "criterios" TEXT,
  "materiais" JSONB NOT NULL DEFAULT '[]',
  "status" "PartnerCampaignStatus" NOT NULL DEFAULT 'RASCUNHO',
  "inicio_em" TIMESTAMP(3),
  "fim_em" TIMESTAMP(3),
  "criado_por_id" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campanhas_parceiros_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campanhas_parceiros_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "campanhas_parceiros_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "campanhas_parceiros_organizacao_id_status_operacao_idx" ON "campanhas_parceiros"("organizacao_id", "status", "operacao");
