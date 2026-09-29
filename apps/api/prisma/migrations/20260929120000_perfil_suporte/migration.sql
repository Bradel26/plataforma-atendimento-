-- Perfil SUPORTE.
--
-- So acrescenta valor ao enum: nenhum usuario existente muda de perfil, e nada
-- que ja funcionava passa a se comportar diferente. A volta seria trabalhosa
-- (Postgres nao remove valor de enum), mas nada aqui e destrutivo.
--
-- Nunca aplicar com --shadow-database-url apontando para banco com dados.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPORTE' BEFORE 'AGENTE';
