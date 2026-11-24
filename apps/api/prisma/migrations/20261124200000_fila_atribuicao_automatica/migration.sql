-- Atribuicao automatica por fila: desligada por padrao. Ligada, a conversa que entra
-- em espera e dada ao agente DISPONIVEL com menos conversas abertas (rodizio no empate).
ALTER TABLE "filas" ADD COLUMN "atribuicao_automatica" BOOLEAN NOT NULL DEFAULT false;
