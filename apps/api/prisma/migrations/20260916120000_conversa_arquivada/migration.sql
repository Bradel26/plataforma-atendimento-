-- Fase 11.9-B: arquivamento de conversa, separado de "finalizar" (Fase 11.9-A).
--
-- Campo ortogonal ao status: uma conversa arquivada pode estar em qualquer
-- status, inclusive FINALIZADO. So controla se ela aparece nas listas padrao
-- (Minhas/Nao atribuidas/Todas) e nos contadores.

ALTER TABLE "conversas" ADD COLUMN     "arquivada" BOOLEAN NOT NULL DEFAULT false;
