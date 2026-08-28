-- Responsável próprio para contato e cliente.
--
-- Os dois anuláveis, e **sem backfill de propósito**: tudo fica NULL, e NULL é
-- carteira aberta para os perfis de gestão e comerciais. No dia do deploy
-- ninguém perde tela. Para AGENTE muda de verdade — contato sem responsável
-- passa a exigir vínculo operacional (conversa ou protocolo que ele atenda) —
-- e é essa a intenção: NULL não pode significar "visível para todos".
--
-- SET NULL nas duas: desativar um vendedor devolve a carteira dele para o
-- estado "sem responsável", que é visível e adotável. CASCADE apagaria clientes.

ALTER TABLE "contatos" ADD COLUMN "responsavel_id" TEXT;
ALTER TABLE "contas" ADD COLUMN "responsavel_id" TEXT;

ALTER TABLE "contatos"
  ADD CONSTRAINT "contatos_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contas"
  ADD CONSTRAINT "contas_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "contatos_organizacao_id_responsavel_id_idx" ON "contatos"("organizacao_id", "responsavel_id");
CREATE INDEX "contas_organizacao_id_responsavel_id_idx" ON "contas"("organizacao_id", "responsavel_id");
