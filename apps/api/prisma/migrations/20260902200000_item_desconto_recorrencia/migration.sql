-- Item da proposta: desconto, acrescimo, recorrencia e custo.
--
-- Item 2.1 do plano em ANALISE-CRM.md. O editor de itens do Nectar tinha
-- Recorrencia, Acrescimo, Desconto, Valor unitario final, Subtotal e Lucro; o
-- nosso tinha quantidade e preco. Sem desconto na linha, a proposta impressa
-- nunca fecha com o que foi negociado, e a margem nao existe.

-- Como o item cobra. UNICO e o padrao porque e o que todos os itens de hoje
-- sao: equipamento vendido uma vez.
CREATE TYPE "Recorrencia" AS ENUM ('UNICO', 'MENSAL');

-- Acrescimo e desconto em VALOR, nao em percentual: quem negocia diz "tira
-- duzentos reais", e guardar 6,6667% para reproduzir R$ 200 de R$ 3.000 perde
-- centavo no arredondamento — a proposta assinada deixaria de fechar.
ALTER TABLE "oportunidade_itens"
  ADD COLUMN "acrescimo" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "desconto" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "recorrencia" "Recorrencia" NOT NULL DEFAULT 'UNICO',
  -- Nulo, e nao zero: zero afirma "nao custa nada" e a tela mostraria 100% de
  -- lucro em todo item antigo. Nulo diz "nao informado", que e a verdade.
  ADD COLUMN "custo_unitario" DECIMAL(14, 2);

ALTER TABLE "oportunidades"
  ADD COLUMN "valor_unico" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "valor_mensal" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "meses_recorrencia" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "valor_informado" DECIMAL(14, 2);

-- Preservacao do que ja existe, e a razao de esta migration nao ser destrutiva.
--
-- Toda oportunidade de hoje tem um `valor` que veio de item ou de digitacao, e
-- nada no banco distingue os dois casos. A regra nova (itens mandam) precisa dos
-- dois numeros separados, entao:
--
--  1. quem TEM item recebe `valor_unico` = soma dos itens. O `valor` gravado
--     pode divergir dessa soma se alguem digitou por cima depois de cadastrar os
--     itens — nesse caso o digitado vai para `valor_informado`, para nao sumir;
--  2. quem NAO tem item tem o `valor` inteiro como digitado: vai para os dois,
--     `valor_unico` e `valor_informado`.
--
-- Em nenhum dos dois casos a coluna `valor` muda. Nenhum relatorio, total de
-- coluna do funil ou previsao ponderada le numero diferente depois desta
-- migration do que lia antes dela.
UPDATE "oportunidades" o
SET "valor_unico" = COALESCE(i.soma, 0),
    "valor_informado" = CASE
      WHEN i.soma IS NULL THEN o."valor"
      WHEN i.soma <> o."valor" THEN o."valor"
      ELSE NULL
    END
FROM (
  SELECT "oportunidade_id", SUM("quantidade" * "preco_unitario") AS soma
  FROM "oportunidade_itens"
  GROUP BY "oportunidade_id"
) i
WHERE i."oportunidade_id" = o."id";

-- As sem item nenhum nao aparecem no FROM acima.
UPDATE "oportunidades"
SET "valor_unico" = "valor",
    "valor_informado" = "valor"
WHERE "id" NOT IN (SELECT DISTINCT "oportunidade_id" FROM "oportunidade_itens");
