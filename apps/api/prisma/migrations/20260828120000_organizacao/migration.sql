-- Fundacao de organizacao (multi-tenancy): passo 1 de 2.
--
-- Escrita a mao de proposito. O diff do Prisma cria a coluna como NOT NULL de
-- uma vez, o que falha em tabela com linha; a ordem aqui e anulavel -> backfill
-- -> validacao -> obrigatoria, tudo numa transacao. Se qualquer passo falhar,
-- nada e aplicado.
--
-- Esta migration NAO troca unicidade global nem toca na numeracao de protocolo:
-- isso e o passo 2. Ate aqui, a volta e um DROP COLUMN — nenhuma perda.
--
-- Nunca aplicar com --shadow-database-url apontando para banco com dados.

-- ── 1. a tabela e a organizacao inicial ─────────────────────────────────────
--
-- O id e fixo, e nao aleatorio: a migration de arquivos, o seed e os testes
-- precisam se referir a esta organizacao sem consultar o banco, e producao e
-- desenvolvimento tem de concordar sobre qual e ela.
CREATE TABLE "organizacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizacoes_slug_key" ON "organizacoes"("slug");

INSERT INTO "organizacoes" ("id", "nome", "slug", "ativa", "atualizado_em")
VALUES ('00000000-0000-0000-0000-000000000001', 'Bradel', 'bradel', true, CURRENT_TIMESTAMP);

-- ── 2. coluna anulavel em toda tabela raiz ──────────────────────────────────
--
-- Anulavel neste momento e o que permite a aplicacao antiga continuar de pe
-- entre este passo e o proximo.
ALTER TABLE "usuarios" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "tokens_integracao" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "contatos" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "conversas" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "filas" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "canais_config" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "contas" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "leads" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "funis" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "oportunidades" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "produtos" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "catalogos_preco" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "protocolos" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "campanhas" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "bots" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "escalas" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "branding" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "politica_retencao" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "voz_config" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "mensagens" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "chamadas" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "pesquisas" ADD COLUMN "organizacao_id" TEXT;
ALTER TABLE "lgpd_registros" ADD COLUMN "organizacao_id" TEXT;

-- ── 3. backfill: tudo o que existe hoje e da Bradel ─────────────────────────
UPDATE "usuarios" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "tokens_integracao" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "contatos" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "conversas" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "filas" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "canais_config" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "contas" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "leads" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "funis" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "oportunidades" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "produtos" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "catalogos_preco" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "protocolos" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "campanhas" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "bots" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "escalas" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "branding" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "politica_retencao" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "voz_config" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "mensagens" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "chamadas" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "pesquisas" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;
UPDATE "lgpd_registros" SET "organizacao_id" = '00000000-0000-0000-0000-000000000001' WHERE "organizacao_id" IS NULL;

-- ── 4. validacao antes de tornar obrigatoria ────────────────────────────────
--
-- Sem esta checagem, um erro de digitacao no passo 3 apareceria como falha
-- generica de NOT NULL, sem dizer em qual tabela. Aqui ela diz.
DO $$
DECLARE
  t TEXT;
  faltando INT;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuarios', 'tokens_integracao', 'contatos', 'conversas', 'filas', 'canais_config', 'contas', 'leads', 'funis', 'oportunidades', 'produtos', 'catalogos_preco', 'protocolos', 'campanhas', 'bots', 'escalas', 'branding', 'politica_retencao', 'voz_config', 'mensagens', 'chamadas', 'pesquisas', 'lgpd_registros']
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE organizacao_id IS NULL', t) INTO faltando;
    IF faltando > 0 THEN
      RAISE EXCEPTION 'backfill incompleto: % linha(s) sem organizacao em %', faltando, t;
    END IF;
  END LOOP;
END $$;

-- ── 5. obrigatoria ─────────────────────────────────────────────────────────
ALTER TABLE "usuarios" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "tokens_integracao" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "contatos" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "conversas" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "filas" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "canais_config" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "contas" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "funis" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "oportunidades" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "produtos" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "catalogos_preco" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "protocolos" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "campanhas" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "bots" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "escalas" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "branding" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "politica_retencao" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "voz_config" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "mensagens" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "chamadas" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "pesquisas" ALTER COLUMN "organizacao_id" SET NOT NULL;
ALTER TABLE "lgpd_registros" ALTER COLUMN "organizacao_id" SET NOT NULL;

-- ── 6. as tres tabelas de linha unica deixam de ter PK fixa ────────────────
--
-- Elas nasceram com id "default" e comentario "registro unico". Com duas
-- organizacoes o id colidiria; a linha que existe hoje mantem o id que tem, e
-- as proximas recebem uuid.
ALTER TABLE "branding" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "politica_retencao" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "voz_config" ALTER COLUMN "id" DROP DEFAULT;

-- ── 7. chaves estrangeiras ─────────────────────────────────────────────────
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "filas" ADD CONSTRAINT "filas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branding" ADD CONSTRAINT "branding_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contas" ADD CONSTRAINT "contas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "funis" ADD CONSTRAINT "funis_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalogos_preco" ADD CONSTRAINT "catalogos_preco_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canais_config" ADD CONSTRAINT "canais_config_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pesquisas" ADD CONSTRAINT "pesquisas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bots" ADD CONSTRAINT "bots_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "politica_retencao" ADD CONSTRAINT "politica_retencao_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lgpd_registros" ADD CONSTRAINT "lgpd_registros_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voz_config" ADD CONSTRAINT "voz_config_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chamadas" ADD CONSTRAINT "chamadas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tokens_integracao" ADD CONSTRAINT "tokens_integracao_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 8. indices ─────────────────────────────────────────────────────────────
--
-- Todo indice existente e recriado com organizacao_id na frente. Indice que nao
-- comeca pela organizacao nao serve sob multi-tenant: toda consulta filtra por
-- ela primeiro, e o Postgres so aproveita o prefixo do indice.
DROP INDEX "campanhas_status_idx";
DROP INDEX "chamadas_agente_id_iniciado_em_idx";
DROP INDEX "chamadas_iniciado_em_idx";
DROP INDEX "chamadas_status_idx";
DROP INDEX "contas_nome_idx";
DROP INDEX "contatos_email_idx";
DROP INDEX "contatos_telefone_idx";
DROP INDEX "conversas_agente_id_status_idx";
DROP INDEX "conversas_fila_id_status_idx";
DROP INDEX "conversas_status_ultima_mensagem_em_idx";
DROP INDEX "leads_fase_atualizado_em_idx";
DROP INDEX "leads_responsavel_id_fase_idx";
DROP INDEX "lgpd_registros_criado_em_idx";
DROP INDEX "mensagens_conversa_id_criado_em_idx";
DROP INDEX "oportunidades_funil_id_estagio_id_idx";
DROP INDEX "oportunidades_status_atualizado_em_idx";
DROP INDEX "pesquisas_respondido_em_idx";
DROP INDEX "protocolos_responsavel_id_status_idx";
DROP INDEX "protocolos_status_atualizado_em_idx";
DROP INDEX "tokens_integracao_ativo_idx";
DROP INDEX "usuarios_perfil_idx";

CREATE INDEX "bots_organizacao_id_idx" ON "bots"("organizacao_id");
CREATE UNIQUE INDEX "branding_organizacao_id_key" ON "branding"("organizacao_id");
CREATE INDEX "campanhas_organizacao_id_status_idx" ON "campanhas"("organizacao_id", "status");
CREATE INDEX "canais_config_organizacao_id_idx" ON "canais_config"("organizacao_id");
CREATE INDEX "catalogos_preco_organizacao_id_idx" ON "catalogos_preco"("organizacao_id");
CREATE INDEX "chamadas_organizacao_id_iniciado_em_idx" ON "chamadas"("organizacao_id", "iniciado_em");
CREATE INDEX "chamadas_organizacao_id_agente_id_iniciado_em_idx" ON "chamadas"("organizacao_id", "agente_id", "iniciado_em");
CREATE INDEX "chamadas_organizacao_id_status_idx" ON "chamadas"("organizacao_id", "status");
CREATE INDEX "contas_organizacao_id_nome_idx" ON "contas"("organizacao_id", "nome");
CREATE INDEX "contatos_organizacao_id_email_idx" ON "contatos"("organizacao_id", "email");
CREATE INDEX "contatos_organizacao_id_telefone_idx" ON "contatos"("organizacao_id", "telefone");
CREATE INDEX "conversas_organizacao_id_status_ultima_mensagem_em_idx" ON "conversas"("organizacao_id", "status", "ultima_mensagem_em");
CREATE INDEX "conversas_organizacao_id_agente_id_status_idx" ON "conversas"("organizacao_id", "agente_id", "status");
CREATE INDEX "conversas_organizacao_id_fila_id_status_idx" ON "conversas"("organizacao_id", "fila_id", "status");
CREATE INDEX "escalas_organizacao_id_idx" ON "escalas"("organizacao_id");
CREATE INDEX "filas_organizacao_id_idx" ON "filas"("organizacao_id");
CREATE INDEX "funis_organizacao_id_idx" ON "funis"("organizacao_id");
CREATE INDEX "leads_organizacao_id_fase_atualizado_em_idx" ON "leads"("organizacao_id", "fase", "atualizado_em");
CREATE INDEX "leads_organizacao_id_responsavel_id_fase_idx" ON "leads"("organizacao_id", "responsavel_id", "fase");
CREATE INDEX "lgpd_registros_organizacao_id_criado_em_idx" ON "lgpd_registros"("organizacao_id", "criado_em");
CREATE INDEX "mensagens_organizacao_id_conversa_id_criado_em_idx" ON "mensagens"("organizacao_id", "conversa_id", "criado_em");
CREATE INDEX "oportunidades_organizacao_id_status_atualizado_em_idx" ON "oportunidades"("organizacao_id", "status", "atualizado_em");
CREATE INDEX "oportunidades_organizacao_id_funil_id_estagio_id_idx" ON "oportunidades"("organizacao_id", "funil_id", "estagio_id");
CREATE INDEX "pesquisas_organizacao_id_respondido_em_idx" ON "pesquisas"("organizacao_id", "respondido_em");
CREATE UNIQUE INDEX "politica_retencao_organizacao_id_key" ON "politica_retencao"("organizacao_id");
CREATE INDEX "produtos_organizacao_id_idx" ON "produtos"("organizacao_id");
CREATE INDEX "protocolos_organizacao_id_status_atualizado_em_idx" ON "protocolos"("organizacao_id", "status", "atualizado_em");
CREATE INDEX "protocolos_organizacao_id_responsavel_id_status_idx" ON "protocolos"("organizacao_id", "responsavel_id", "status");
CREATE INDEX "tokens_integracao_organizacao_id_ativo_idx" ON "tokens_integracao"("organizacao_id", "ativo");
CREATE INDEX "usuarios_organizacao_id_perfil_idx" ON "usuarios"("organizacao_id", "perfil");
CREATE UNIQUE INDEX "voz_config_organizacao_id_key" ON "voz_config"("organizacao_id");
