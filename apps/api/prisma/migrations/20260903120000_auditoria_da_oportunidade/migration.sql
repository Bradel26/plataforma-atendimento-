-- Trilha de auditoria da oportunidade (item 3.2 do plano em ANALISE-CRM.md).
--
-- Vem da aba Feedbacks e do relatorio Auditoria do Nectar: quem editou o que, e
-- quando. Hoje a oportunidade guarda o estado atual e a mudanca de etapa, e nada
-- sobre "o valor caiu de 40 para 28 mil, e quem baixou foi quem".

CREATE TYPE "CampoAuditado" AS ENUM (
  'TITULO',
  'VALOR_INFORMADO',
  'MESES_RECORRENCIA',
  'RESPONSAVEL',
  'PREVISAO_FECHAMENTO',
  'ITENS',
  'STATUS',
  'APROVACAO_DESCONTO'
);

-- Sem `organizacao_id`, como as outras tabelas filhas da oportunidade
-- (`oportunidade_itens`, `oportunidade_historico_estagio`): o acesso passa
-- sempre pela oportunidade, que e filtrada. A leitura confere a oportunidade
-- ANTES de ler a trilha, porque a extensao de multi-tenant filtra a operacao
-- consultada e nao o que vem por relacao.
--
-- `de`/`para` sao JSONB, e nao texto: `RESPONSAVEL` guarda `{id, nome}`, e so o
-- id deixaria a trilha ilegivel depois de o usuario ser removido — que e
-- justamente quando alguem vai querer ler.
CREATE TABLE "oportunidade_auditoria" (
  "id"              TEXT NOT NULL,
  "oportunidade_id" TEXT NOT NULL,
  "campo"           "CampoAuditado" NOT NULL,
  "de"              JSONB,
  "para"            JSONB,
  "autor_id"        TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oportunidade_auditoria_pkey" PRIMARY KEY ("id")
);

-- CASCADE na oportunidade: a trilha e da oportunidade, e sem ela nao documenta
-- nada. SET NULL no autor, pelo motivo oposto: a trilha tem de sobreviver a
-- saida de quem fez a mudanca, senao a auditoria desaparece junto com o
-- funcionario que ela documenta.
ALTER TABLE "oportunidade_auditoria"
  ADD CONSTRAINT "oportunidade_auditoria_oportunidade_id_fkey"
  FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oportunidade_auditoria"
  ADD CONSTRAINT "oportunidade_auditoria_autor_id_fkey"
  FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A unica consulta: a trilha de UMA oportunidade, do mais recente ao mais antigo.
CREATE INDEX "oportunidade_auditoria_idx"
  ON "oportunidade_auditoria" ("oportunidade_id", "criado_em");

-- Nao ha carga retroativa, e a ausencia e deliberada: inventar linhas de "criada
-- em" para as 83 oportunidades existentes produziria uma trilha que afirma
-- autoria que ninguem registrou. A trilha comeca vazia e diz a verdade.
