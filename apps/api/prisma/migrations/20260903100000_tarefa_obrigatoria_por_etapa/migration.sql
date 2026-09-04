-- Tarefa obrigatoria por etapa (item 3.1 do plano em ANALISE-CRM.md).
--
-- Vem do "processo de vendas" do Nectar: a etapa pode exigir que algo seja feito
-- antes de o negocio avancar. Sem isso o funil registra por onde o negocio passou
-- e nada sobre o que foi feito la.

-- TAREFA faltava no enum: a tarefa que a etapa exige nao e nota (nota e registro
-- do que ja aconteceu) nem reuniao nem visita. `ADD VALUE` nao reescreve linha
-- nenhuma, e o valor novo nao e usado nesta migration — o que e o que permite
-- roda-lo dentro da transacao do `migrate deploy`.
ALTER TYPE "TipoAtividade" ADD VALUE 'TAREFA';

-- Nulo = etapa sem exigencia, e todas as etapas existentes ficam assim.
--
-- A ausencia de UPDATE e deliberada, pelo mesmo motivo da alcada de desconto:
-- ligar a exigencia em massa travaria de uma vez todo cartao que hoje esta no
-- meio do funil, e o vendedor descobriria isso ao tentar mover o cartao.
ALTER TABLE "funil_estagios"
  ADD COLUMN "tarefa_obrigatoria" TEXT;

ALTER TABLE "atividades"
  ADD COLUMN "obrigatoria" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "estagio_id" TEXT;

-- SET NULL, e nao CASCADE: apagar uma etapa do funil nao pode apagar o registro
-- do que foi feito nela. A atividade sobrevive como historico e deixa de barrar
-- qualquer coisa — o que e o comportamento certo, ja que a etapa nao existe mais.
ALTER TABLE "atividades"
  ADD CONSTRAINT "atividades_estagio_id_fkey"
  FOREIGN KEY ("estagio_id") REFERENCES "funil_estagios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A pergunta que o bloqueio faz a cada movimento de cartao.
CREATE INDEX "atividades_obrigatoria_idx"
  ON "atividades" ("organizacao_id", "oportunidade_id", "obrigatoria", "concluido_em");
