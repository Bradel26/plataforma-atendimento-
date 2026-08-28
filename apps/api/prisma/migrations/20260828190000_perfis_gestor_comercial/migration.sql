-- Perfis GESTOR e COMERCIAL.
--
-- Só acrescenta valor ao enum: nenhum usuário existente muda de perfil, e nada
-- que já funcionava passa a se comportar diferente. A volta seria trabalhosa
-- (Postgres não remove valor de enum), mas nada aqui é destrutivo.
--
-- Posicionados ANTES de AGENTE para a ordem do banco casar com a do
-- schema.prisma — fora de ordem, o `migrate diff` acusaria desvio a cada
-- comparação futura.
--
-- Nunca aplicar com --shadow-database-url apontando para banco com dados.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GESTOR' BEFORE 'AGENTE';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COMERCIAL' BEFORE 'AGENTE';
