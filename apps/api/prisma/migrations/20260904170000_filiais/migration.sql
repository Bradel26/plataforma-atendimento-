-- Filiais (item 6.5 do plano em ANALISE-CRM.md): unidade fisica da
-- organizacao, usada para classificar contas e pessoas.
--
-- So classificacao, sem efeito em visibilidade. O levantamento feito antes de
-- modelar (checar como `lib/politicas.ts` e `lib/visibilidade.ts` se
-- comportam com hierarquia) achou que filial, se virasse gate de visibilidade,
-- entraria como fator obrigatorio dentro de cada politica (contas, contatos,
-- leads, oportunidades) — mudanca grande em codigo de seguranca sem requisito
-- de produto confirmado (nenhum documento detalha o item alem do nome da
-- linha do backlog, nem confirma que a Bradel ja segrega quem-ve-o-que por
-- unidade). Por isso o campo fica de fora de `politicas.ts`: existe para
-- agrupar contas e pessoas, e um gate real chega depois, se for pedido.
--
-- Sem hierarquia entre filiais (matriz com filiais-filhas): "hierarquia de
-- empresa" nunca foi detalhado alem do nome do item, e uma lista plana por
-- organizacao cobre o caso de uso conhecido.

CREATE TABLE "filiais" (
  "id"              TEXT NOT NULL,
  "organizacao_id"  TEXT NOT NULL DEFAULT '',
  "nome"            TEXT NOT NULL,
  "cidade"          TEXT,
  "uf"              CHAR(2),
  "ativa"           BOOLEAN NOT NULL DEFAULT true,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "filiais_pkey" PRIMARY KEY ("id")
);

-- Tabela raiz: carrega a organizacao e tem o CHECK que impede o default vazio
-- de virar dado real, como as outras.
ALTER TABLE "filiais"
  ADD CONSTRAINT "filiais_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');

ALTER TABLE "filiais"
  ADD CONSTRAINT "filiais_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nome unico por organizacao.
CREATE UNIQUE INDEX "filiais_organizacao_nome_idx" ON "filiais" ("organizacao_id", "nome");

CREATE INDEX "filiais_organizacao_idx" ON "filiais" ("organizacao_id");

-- Classificacao de contas e pessoas por filial. Nulo = sem filial atribuida,
-- o padrao de quem nunca foi classificado — nao vira "filial zero" nenhuma.
ALTER TABLE "usuarios" ADD COLUMN "filial_id" TEXT;
ALTER TABLE "contas" ADD COLUMN "filial_id" TEXT;

-- SetNull: apagar a filial nao pode apagar a pessoa nem a conta.
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_filial_id_fkey"
  FOREIGN KEY ("filial_id") REFERENCES "filiais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contas"
  ADD CONSTRAINT "contas_filial_id_fkey"
  FOREIGN KEY ("filial_id") REFERENCES "filiais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "usuarios_organizacao_id_filial_id_idx" ON "usuarios" ("organizacao_id", "filial_id");
CREATE INDEX "contas_organizacao_id_filial_id_idx" ON "contas" ("organizacao_id", "filial_id");
