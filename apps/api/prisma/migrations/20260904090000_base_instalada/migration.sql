-- Base instalada (item 5.1 do plano em ANALISE-CRM.md).
--
-- Vem do treinamento de produto Philco: a Bradel vende e instala
-- ar-condicionado, e a garantia funciona em camadas com prazos diferentes
-- (legal, contratual, compressor), sendo que a contratual so vale com
-- instalador credenciado Philco e nota fiscal apresentada. Hoje isso vive em
-- planilha; sem isso no CRM, pos-venda, renovacao e atendimento de garantia
-- nao tem em que se apoiar.
--
-- Duas tabelas: o equipamento entregue (raiz, pendurado na conta) e o
-- componente de garantia (filho, um por tipo de garantia daquele
-- equipamento) — porque o mesmo produto vence em datas diferentes por
-- componente, e misturar tudo numa linha so obrigaria a repetir o produto
-- inteiro para cada prazo.

CREATE TYPE "TipoGarantia" AS ENUM ('LEGAL', 'CONTRATUAL', 'COMPRESSOR', 'OUTRA');

CREATE TABLE "produtos_do_cliente" (
  "id"                      TEXT NOT NULL,
  "organizacao_id"          TEXT NOT NULL DEFAULT '',
  "conta_id"                TEXT NOT NULL,
  "modelo"                  TEXT NOT NULL,
  "numero_serie"            TEXT,
  "data_instalacao"         TIMESTAMP(3),
  "instalador_nome"         TEXT,
  "instalador_credenciado"  BOOLEAN,
  "nota_fiscal_numero"      TEXT,
  "observacoes"             TEXT,
  "criado_em"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "produtos_do_cliente_pkey" PRIMARY KEY ("id")
);

-- Tabela raiz: carrega a organizacao e tem o CHECK que impede o default vazio
-- de virar dado real, como as outras.
ALTER TABLE "produtos_do_cliente"
  ADD CONSTRAINT "produtos_do_cliente_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');

ALTER TABLE "produtos_do_cliente"
  ADD CONSTRAINT "produtos_do_cliente_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE na conta: se a conta e apagada, o equipamento dela nao tem mais dono
-- a que pertencer. Nao ha hoje exclusao de conta pela UI fora de ADMIN, e
-- mesmo ali e caso raro — mas a mesma regra ja vale para contatos, leads e
-- oportunidades da conta.
ALTER TABLE "produtos_do_cliente"
  ADD CONSTRAINT "produtos_do_cliente_conta_id_fkey"
  FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "produtos_do_cliente_organizacao_conta_idx"
  ON "produtos_do_cliente" ("organizacao_id", "conta_id");

-- Busca por numero de serie na hora do atendimento de garantia.
CREATE INDEX "produtos_do_cliente_numero_serie_idx" ON "produtos_do_cliente" ("numero_serie");

CREATE TABLE "componentes_garantia" (
  "id"                    TEXT NOT NULL,
  "produto_do_cliente_id" TEXT NOT NULL,
  "tipo"                  "TipoGarantia" NOT NULL,
  "nome"                  TEXT,
  "prazo_dias"            INTEGER NOT NULL,
  "data_inicio"           TIMESTAMP(3),
  "observacao"            TEXT,
  "criado_em"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "componentes_garantia_pkey" PRIMARY KEY ("id")
);

-- Filha: sem organizacao propria, chega sempre pelo produto do cliente.
ALTER TABLE "componentes_garantia"
  ADD CONSTRAINT "componentes_garantia_produto_do_cliente_id_fkey"
  FOREIGN KEY ("produto_do_cliente_id") REFERENCES "produtos_do_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "componentes_garantia_produto_do_cliente_idx"
  ON "componentes_garantia" ("produto_do_cliente_id");
