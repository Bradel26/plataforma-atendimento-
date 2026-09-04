-- Vinculos das pessoas da conta e enriquecimento por CNPJ (item 5.2 do plano em
-- ANALISE-CRM.md).
--
-- Vem da tela do Nectar, que lista os contatos relacionados de uma empresa com o
-- codigo de QSA ao lado, e da "varinha de enriquecimento" do Ploomes.

CREATE TYPE "PapelNaConta" AS ENUM (
  'SOCIO',
  'ADMINISTRADOR',
  'DECISOR',
  'TECNICO',
  'FINANCEIRO',
  'COMPRAS',
  'OUTRO'
);

-- Duas colunas, nao uma. `papel_na_conta` e a classificacao da plataforma;
-- `qualificacao_qsa` e o texto da Receita ("49-Socio-Administrador"). Guardar so
-- uma perderia a nossa leitura ou perderia a prova.
ALTER TABLE "contatos"
  ADD COLUMN "papel_na_conta" "PapelNaConta",
  ADD COLUMN "qualificacao_qsa" TEXT;

CREATE INDEX "contatos_papel_idx"
  ON "contatos" ("organizacao_id", "conta_id", "papel_na_conta");

-- Dados da consulta publica em colunas proprias, e nao dentro de `observacoes`:
-- razao social e o nome que sai na nota, e situacao cadastral "BAIXADA" muda uma
-- negociacao. Texto dentro de observacao nao se consulta.
ALTER TABLE "contas"
  ADD COLUMN "razao_social" TEXT,
  ADD COLUMN "situacao_cadastral" TEXT,
  ADD COLUMN "atividade_principal" TEXT,
  ADD COLUMN "enriquecido_em" TIMESTAMP(3);
