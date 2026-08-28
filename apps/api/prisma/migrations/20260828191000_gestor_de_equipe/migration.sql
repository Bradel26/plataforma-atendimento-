-- Gestor direto de cada usuário: define a "equipe" do perfil GESTOR.
--
-- Um nível, sem árvore recursiva — equipe de um gestor são os usuários que
-- apontam para ele. Anulável, e sem backfill: ninguém tem gestor até que
-- alguém atribua, e enquanto isso o GESTOR vê apenas os próprios registros.
--
-- ON DELETE SET NULL de propósito: desativar o gestor não pode apagar a equipe
-- dele. A alternativa (CASCADE) transformaria a saída de um gerente na exclusão
-- de todos os vendedores.

ALTER TABLE "usuarios" ADD COLUMN "gestor_id" TEXT;

ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_gestor_id_fkey"
  FOREIGN KEY ("gestor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Organização à frente: toda consulta de equipe já está dentro de uma
-- organização, e o índice só serve se a primeira coluna for a que a extensão do
-- Prisma injeta.
CREATE INDEX "usuarios_organizacao_id_gestor_id_idx" ON "usuarios"("organizacao_id", "gestor_id");
