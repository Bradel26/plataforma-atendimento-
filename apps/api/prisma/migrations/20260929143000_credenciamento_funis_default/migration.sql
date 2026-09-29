-- Seed idempotente dos funis esperados pela operacao de credenciamento.
-- O deploy executa migrate deploy, mas nao roda prisma db seed. Sem estes
-- registros, o Dashboard esconde os paineis e a Sidebar esconde a rota Esteira.
-- Atualizar os estagios no lugar preserva os IDs referenciados pelo historico.

INSERT INTO "funis" ("id", "organizacao_id", "nome", "tipo", "ativo")
VALUES
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Funil de Vendas', 'COMERCIAL', true),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Credenciamento TIM', 'ESTEIRA', true),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Credenciamento Starlink', 'ESTEIRA', true)
ON CONFLICT ("organizacao_id", "nome") DO NOTHING;

WITH estagios("funil", "nome", "ordem", "probabilidade") AS (
  VALUES
    ('Funil de Vendas', 'Novo cadastro', 1, 10),
    ('Funil de Vendas', 'Pendencia', 2, 25),
    ('Funil de Vendas', 'Aprovacao', 3, 50),
    ('Funil de Vendas', 'Credenciado', 4, 75),
    ('Funil de Vendas', 'Ativo', 5, 90),
    ('Credenciamento TIM', 'Novo cadastro', 1, 0),
    ('Credenciamento TIM', 'Pendencia', 2, 0),
    ('Credenciamento TIM', 'Aprovacao', 3, 0),
    ('Credenciamento TIM', 'Credenciado', 4, 0),
    ('Credenciamento TIM', 'Ativo', 5, 0),
    ('Credenciamento Starlink', 'Novo cadastro', 1, 0),
    ('Credenciamento Starlink', 'Pendencia', 2, 0),
    ('Credenciamento Starlink', 'Aprovacao', 3, 0),
    ('Credenciamento Starlink', 'Credenciado', 4, 0),
    ('Credenciamento Starlink', 'Ativo', 5, 0)
)
INSERT INTO "funil_estagios" ("id", "funil_id", "nome", "ordem", "probabilidade")
SELECT gen_random_uuid()::text, f."id", e."nome", e."ordem", e."probabilidade"
FROM estagios e
JOIN "funis" f
  ON f."organizacao_id" = '00000000-0000-0000-0000-000000000001'
 AND f."nome" = e."funil"
ON CONFLICT ("funil_id", "ordem") DO UPDATE
SET "nome" = EXCLUDED."nome",
    "probabilidade" = EXCLUDED."probabilidade";
