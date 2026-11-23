-- Remove o perfil AGENTE: o atendimento e feito por SUPORTE e COMERCIAL, cada um
-- pela propria carteira e pelo proprio numero. Escrita a mao porque o Postgres
-- nao tem DROP VALUE para enum — o tipo e recriado.
--
-- Quem era AGENTE vira SUPORTE (o mais proximo: atende cliente, sem dados
-- de import/export). Se alguem vendia, o admin ajusta para COMERCIAL depois.

-- Registro de quem era AGENTE antes da troca. Nao da para saber, olhando so o
-- banco depois, quem foi movido; com isso o admin reclassifica (ex.: para
-- COMERCIAL) e, se preciso, desfaz. Pode ser apagada quando nao for mais util.
CREATE TABLE "_backup_perfil_agente_20261123" AS
  SELECT "id", "organizacao_id", "nome", "email", "perfil"::text AS "perfil_anterior", now() AS "registrado_em"
  FROM "usuarios" WHERE "perfil" = 'AGENTE';

-- `sessao_versao` + 1 invalida os tokens ja emitidos (claim `sv`): quem era AGENTE tem
-- JWT com o perfil antigo e, sem isso, receberia erro estranho em vez de entrar de
-- novo com o perfil atual. Com a versao nova a API responde 401 e o front pede login.
UPDATE "usuarios" SET "perfil" = 'SUPORTE', "sessao_versao" = "sessao_versao" + 1 WHERE "perfil" = 'AGENTE';
DELETE FROM "module_permissions" WHERE "perfil" = 'AGENTE';

-- O DEFAULT referencia o tipo antigo e precisa sair antes da troca.
ALTER TABLE "usuarios" ALTER COLUMN "perfil" DROP DEFAULT;

ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE');

ALTER TABLE "usuarios" ALTER COLUMN "perfil" TYPE "Role" USING ("perfil"::text::"Role");
ALTER TABLE "module_permissions" ALTER COLUMN "perfil" TYPE "Role" USING ("perfil"::text::"Role");

DROP TYPE "Role_old";
