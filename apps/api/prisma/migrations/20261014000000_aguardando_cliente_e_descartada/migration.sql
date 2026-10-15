-- Aditivo apenas: novos valores de enum, sem DROP, sem ALTER COLUMN, sem
-- migracao de dados. Nenhuma linha existente e reclassificada.
--
-- Postgres nao permite usar um valor de enum recem-adicionado na MESMA
-- transacao em que ele foi adicionado (ADD VALUE so fica "commitado" ao fim
-- da transacao). Como esta migracao nao usa os valores novos em nenhuma
-- outra instrucao, as duas linhas podem conviver no mesmo arquivo com
-- seguranca.
ALTER TYPE "ConversationStatus" ADD VALUE 'AGUARDANDO_CLIENTE';
ALTER TYPE "OportunidadeStatus" ADD VALUE 'DESCARTADA';
