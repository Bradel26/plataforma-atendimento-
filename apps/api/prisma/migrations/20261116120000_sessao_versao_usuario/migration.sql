-- Versao de sessao do usuario: invalida tokens ja emitidos quando o perfil muda,
-- a senha muda ou a conta e desativada (claim `sv` nos JWTs).
--
-- Aditiva e segura: coluna NOT NULL com DEFAULT constante nao reescreve a tabela
-- no PostgreSQL 11+ (so metadado). Usuarios existentes ficam em 0, que e o valor
-- que os tokens legados (sem `sv`) representam — nenhuma sessao aberta cai no deploy.
--
-- ORDEM DE IMPLANTACAO: o entrypoint do container roda `prisma migrate deploy` ANTES
-- de iniciar a API, entao a migration precede o codigo novo. O cliente Prisma novo le
-- `sessao_versao` em toda consulta de usuario; nunca rode a imagem nova contra um
-- banco sem esta migration.
--
-- O ALTER TABLE pede ACCESS EXCLUSIVE na tabela. Se houver uma transacao longa usando
-- `usuarios`, ele ficaria na fila e, enquanto espera, bloquearia TODAS as consultas
-- seguintes (login e requireAuth incluidos). Com o limite abaixo ele desiste em vez de
-- esperar: a migration falha, o container nao sobe e o deploy e repetido sem ter
-- travado a producao.
SET lock_timeout = '10s';

ALTER TABLE "usuarios" ADD COLUMN "sessao_versao" INTEGER NOT NULL DEFAULT 0;

RESET lock_timeout;
