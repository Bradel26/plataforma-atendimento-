-- Classificacao da ligacao (item 6.6 do plano em ANALISE-CRM.md).
--
-- Vem das colunas CUSTO e AUDIO da lista de chamadas do Nectar. O custo ja
-- existia no modelo `Call` e nunca aparecia na tela; faltava a outra metade —
-- porque custo sozinho nao responde a pergunta que a gestao faz ao olhar a
-- lista: o que a gente pagou por isso valeu?
--
-- Nulo = ninguem classificou, e isso e diferente de "ruim". Um default de 0 ou
-- de 3 faria a plataforma emitir opiniao no lugar de quem ouviu.
ALTER TABLE "chamadas"
  ADD COLUMN "classificacao" INTEGER,
  ADD COLUMN "classificado_por_id" TEXT,
  ADD COLUMN "classificado_em" TIMESTAMP(3);

-- A faixa e conferida no banco, e nao so no schema da rota: nota fora de 1..5
-- nao tem leitura possivel na tela, e o CHECK e a unica trava que vale tambem
-- para migration de dados e script solto.
ALTER TABLE "chamadas"
  ADD CONSTRAINT "chamadas_classificacao_faixa"
  CHECK ("classificacao" IS NULL OR ("classificacao" >= 1 AND "classificacao" <= 5));

-- SET NULL: a nota sobrevive a saida de quem classificou. Perder a nota junto
-- com o funcionario apagaria a leitura de uma ligacao que continua existindo.
ALTER TABLE "chamadas"
  ADD CONSTRAINT "chamadas_classificado_por_id_fkey"
  FOREIGN KEY ("classificado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
