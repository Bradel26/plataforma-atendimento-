-- Alcada de desconto (item 2.3 do plano em ANALISE-CRM.md).
--
-- Vem do banner "Regras de negociacao" do HotSales: desconto acima do teto do
-- vendedor nao e recusado, vai para aprovacao. Recusar seria pior — a negociacao
-- para, e o vendedor passa a registrar a venda por fora do sistema.

CREATE TYPE "AprovacaoDesconto" AS ENUM ('NAO_REQUER', 'PENDENTE', 'APROVADA', 'REPROVADA');

-- Cem por padrao, ou seja SEM restricao.
--
-- Um padrao restritivo faria esta migration transformar em "pendente de
-- aprovacao" toda proposta existente com desconto, e a regra nova apareceria como
-- se a plataforma tivesse quebrado. Restringir e uma decisao que a empresa toma
-- na tela de configuracao, nao um efeito colateral de deploy.
ALTER TABLE "organizacoes"
  ADD COLUMN "desconto_maximo_percentual" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "oportunidades"
  ADD COLUMN "aprovacao_desconto" "AprovacaoDesconto" NOT NULL DEFAULT 'NAO_REQUER',
  ADD COLUMN "aprovado_por_id" TEXT,
  ADD COLUMN "aprovado_em" TIMESTAMP(3);

ALTER TABLE "oportunidades"
  ADD CONSTRAINT "oportunidades_aprovado_por_id_fkey"
  FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indice para a fila de aprovacao: "o que esta esperando minha liberacao" e a
-- unica consulta nova, e ela filtra por organizacao e situacao.
CREATE INDEX "oportunidades_aprovacao_idx"
  ON "oportunidades" ("organizacao_id", "aprovacao_desconto");

-- Nao ha UPDATE de dados aqui, e a ausencia e deliberada: toda oportunidade
-- existente fica em NAO_REQUER. Recalcular a alcada retroativamente marcaria
-- como pendente proposta que ja foi negociada e fechada meses atras, e ninguem
-- teria contexto para aprovar.
