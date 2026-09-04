-- Condicoes da proposta (item 2.2 do plano em ANALISE-CRM.md).
--
-- O modelo de proposta do Nectar e o CPQ do Ploomes trazem condicao de pagamento
-- e prazo de entrega no corpo do documento. Sem eles a proposta impressa diz o
-- preco e nao diz como se paga — que e a primeira pergunta de quem recebe.
--
-- Texto livre de proposito: "30/60/90 dias" e "entrada de 30% + 3x" sao os dois
-- validos e nao cabem no mesmo campo numerico. Estruturar em parcelas exigiria um
-- modelo de cobranca que a plataforma nao tem, e o que o cliente le e a frase.
ALTER TABLE "oportunidades"
  ADD COLUMN "condicao_pagamento" TEXT,
  ADD COLUMN "prazo_entrega" TEXT;

-- Os dois campos entram na trilha de auditoria (item 3.2): mudar prazo de entrega
-- depois de a proposta sair e exatamente o tipo de alteracao que alguem vai
-- querer rastrear.
ALTER TYPE "CampoAuditado" ADD VALUE 'CONDICAO_PAGAMENTO';
ALTER TYPE "CampoAuditado" ADD VALUE 'PRAZO_ENTREGA';
