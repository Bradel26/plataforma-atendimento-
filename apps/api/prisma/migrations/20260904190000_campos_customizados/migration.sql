-- Campos customizados (item 6.4 do plano em ANALISE-CRM.md): campo extra que
-- o ADMIN define para conta, lead ou oportunidade — tipo, obrigatorio, secao
-- (agrupamento livre na tela) e valor unico.
--
-- Reusa o enum "EntidadeVisao" (CONTA/LEAD/OPORTUNIDADE) do item 6.1: sao
-- exatamente as mesmas tres entidades, e um segundo enum identico so
-- duplicaria vocabulario.
--
-- "valor_unico" NAO vira constraint do banco. O campo e definido em runtime
-- pelo ADMIN; um indice unico condicional por campo exigiria uma migration a
-- cada campo novo, o oposto do que esta feature promete (campo sem precisar
-- mexer no schema). A checagem fica em codigo, com o indice
-- (campo_customizado_id, valor) abaixo sustentando essa consulta sem varrer a
-- tabela. Risco aceito: janela de corrida sob escrita concorrente no mesmo
-- campo unico. Ver decisao 80 no SCOPE.md.
--
-- "tipo" e "valor_unico" sao imutaveis depois de criado (nao ha rota de
-- edicao para eles) — mudar o tipo com valor ja gravado corromperia dados
-- silenciosamente.

CREATE TYPE "TipoCampoCustomizado" AS ENUM ('TEXTO', 'NUMERO', 'DATA', 'BOOLEANO', 'SELECAO');

CREATE TABLE "campos_customizados" (
  "id"                  TEXT NOT NULL,
  "organizacao_id"      TEXT NOT NULL DEFAULT '',
  "entidade"            "EntidadeVisao" NOT NULL,
  "nome"                TEXT NOT NULL,
  "chave"               TEXT NOT NULL,
  "tipo"                "TipoCampoCustomizado" NOT NULL,
  "opcoes"              TEXT[] NOT NULL DEFAULT '{}',
  "obrigatorio"         BOOLEAN NOT NULL DEFAULT false,
  "valor_unico"         BOOLEAN NOT NULL DEFAULT false,
  "secao"               TEXT,
  "ordem"               INTEGER NOT NULL DEFAULT 0,
  "ativo"               BOOLEAN NOT NULL DEFAULT true,
  "criado_em"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "campos_customizados_pkey" PRIMARY KEY ("id")
);

-- Tabela raiz: carrega a organizacao e tem o CHECK que impede o default vazio
-- de virar dado real, como as outras.
ALTER TABLE "campos_customizados"
  ADD CONSTRAINT "campos_customizados_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');

ALTER TABLE "campos_customizados"
  ADD CONSTRAINT "campos_customizados_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chave unica por entidade dentro da organizacao: um campo de CONTA e um de
-- LEAD podem se chamar igual, mas dois de CONTA nao.
CREATE UNIQUE INDEX "campos_customizados_organizacao_entidade_chave_idx"
  ON "campos_customizados" ("organizacao_id", "entidade", "chave");

CREATE INDEX "campos_customizados_organizacao_entidade_idx"
  ON "campos_customizados" ("organizacao_id", "entidade");

/* ── Valores: uma tabela por entidade, com FK real e CASCADE nos dois lados ── */

CREATE TABLE "valores_campo_customizado_conta" (
  "id"                    TEXT NOT NULL,
  "campo_customizado_id"  TEXT NOT NULL,
  "conta_id"              TEXT NOT NULL,
  "valor"                 TEXT NOT NULL,

  CONSTRAINT "valores_campo_customizado_conta_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "valores_campo_customizado_conta"
  ADD CONSTRAINT "valores_campo_customizado_conta_campo_fkey"
  FOREIGN KEY ("campo_customizado_id") REFERENCES "campos_customizados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "valores_campo_customizado_conta"
  ADD CONSTRAINT "valores_campo_customizado_conta_conta_fkey"
  FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "valores_campo_customizado_conta_campo_conta_idx"
  ON "valores_campo_customizado_conta" ("campo_customizado_id", "conta_id");

CREATE INDEX "valores_campo_customizado_conta_campo_valor_idx"
  ON "valores_campo_customizado_conta" ("campo_customizado_id", "valor");

CREATE TABLE "valores_campo_customizado_lead" (
  "id"                    TEXT NOT NULL,
  "campo_customizado_id"  TEXT NOT NULL,
  "lead_id"               TEXT NOT NULL,
  "valor"                 TEXT NOT NULL,

  CONSTRAINT "valores_campo_customizado_lead_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "valores_campo_customizado_lead"
  ADD CONSTRAINT "valores_campo_customizado_lead_campo_fkey"
  FOREIGN KEY ("campo_customizado_id") REFERENCES "campos_customizados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "valores_campo_customizado_lead"
  ADD CONSTRAINT "valores_campo_customizado_lead_lead_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "valores_campo_customizado_lead_campo_lead_idx"
  ON "valores_campo_customizado_lead" ("campo_customizado_id", "lead_id");

CREATE INDEX "valores_campo_customizado_lead_campo_valor_idx"
  ON "valores_campo_customizado_lead" ("campo_customizado_id", "valor");

CREATE TABLE "valores_campo_customizado_oportunidade" (
  "id"                    TEXT NOT NULL,
  "campo_customizado_id"  TEXT NOT NULL,
  "oportunidade_id"       TEXT NOT NULL,
  "valor"                 TEXT NOT NULL,

  CONSTRAINT "valores_campo_customizado_oportunidade_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "valores_campo_customizado_oportunidade"
  ADD CONSTRAINT "valores_campo_customizado_oportunidade_campo_fkey"
  FOREIGN KEY ("campo_customizado_id") REFERENCES "campos_customizados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "valores_campo_customizado_oportunidade"
  ADD CONSTRAINT "valores_campo_customizado_oportunidade_oportunidade_fkey"
  FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "valores_campo_customizado_oportunidade_campo_oport_idx"
  ON "valores_campo_customizado_oportunidade" ("campo_customizado_id", "oportunidade_id");

CREATE INDEX "valores_campo_customizado_oportunidade_campo_valor_idx"
  ON "valores_campo_customizado_oportunidade" ("campo_customizado_id", "valor");
