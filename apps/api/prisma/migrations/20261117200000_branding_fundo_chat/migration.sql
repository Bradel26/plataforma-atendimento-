-- Modelo de fundo das conversas (White Label): liso, doodle, menta, azul, pontilhado, diagonal, ondas, grade.
--
-- Aditiva e segura: coluna NOT NULL com DEFAULT constante nao reescreve a tabela no
-- PostgreSQL 11+ (so metadado). Organizacoes existentes ficam em 'liso', que e o fundo
-- usado hoje — nenhuma tela muda ate o administrador escolher outro modelo.
-- O lock_timeout evita travar consultas de `branding` se houver transacao longa.
SET lock_timeout = '10s';

ALTER TABLE "branding" ADD COLUMN "fundo_chat" TEXT NOT NULL DEFAULT 'liso';

RESET lock_timeout;
