-- Esteiras TIM e Starlink (parte de dados), spec 7. Aditiva e idempotente:
-- nao apaga nada, cada passo so toca o que ainda nao foi migrado.
--
-- As tabelas de nomes antigos abaixo espelham `src/modules/esteira/migracao.ts`
-- (`NOMES_ANTIGOS`, `CAMPOS_STARLINK_ANTIGOS`); `migracao.test.ts` confere.
-- Nomes sao comparados sem acento e sem caixa (translate, sem depender de unaccent).
--
-- O que esta SQL NAO faz (fica para `npm run esteira:estrutura`): criar as
-- etapas novas (TIM_POS_CRED, saidas...), reordenar e mover cards de etapa.

-- 1. Operacao dos funis, dos credenciamentos e do historico ------------------------
-- Ultima vez que o nome do funil decide a operacao. Um funil por operacao por
-- organizacao (indice parcial `funis_organizacao_operacao_esteira_key`).
UPDATE "funis" f
SET "operacao" = alvo."operacao"
FROM (
  SELECT DISTINCT ON ("organizacao_id", op."operacao") fu."id", op."operacao"
  FROM "funis" fu
  JOIN (VALUES ('credenciamento tim', 'TIM'::"Operacao"),
               ('credenciamento starlink', 'STARLINK'::"Operacao")) AS op("nome", "operacao")
    ON lower(trim(fu."nome")) = op."nome"
  WHERE fu."tipo" = 'ESTEIRA'
  ORDER BY "organizacao_id", op."operacao", fu."criado_em", fu."id"
) alvo
WHERE f."id" = alvo."id"
  AND f."operacao" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "funis" o
    WHERE o."organizacao_id" = f."organizacao_id" AND o."tipo" = 'ESTEIRA' AND o."operacao" = alvo."operacao"
  );

UPDATE "credenciamentos" c
SET "operacao" = f."operacao"
FROM "funis" f
WHERE c."funil_id" = f."id" AND c."operacao" IS NULL AND f."operacao" IS NOT NULL;

UPDATE "credenciamento_historico" h
SET "operacao" = c."operacao"
FROM "credenciamentos" c
WHERE h."credenciamento_id" = c."id" AND h."operacao" IS NULL AND c."operacao" IS NOT NULL;

-- Credenciamento em funil fora do padrao nao tem como ganhar operacao: falha
-- com mensagem clara em vez do erro generico do SET NOT NULL.
DO $$
DECLARE
  pendentes TEXT;
BEGIN
  SELECT string_agg(DISTINCT '"' || f."nome" || '"', ', ') INTO pendentes
  FROM "credenciamentos" c
  JOIN "funis" f ON f."id" = c."funil_id"
  WHERE c."operacao" IS NULL;
  IF pendentes IS NOT NULL THEN
    RAISE EXCEPTION 'Credenciamentos sem operacao nos funis %. Renomeie o funil para "Credenciamento TIM" ou "Credenciamento Starlink" (um de cada por organizacao) e aplique de novo.', pendentes;
  END IF;
END $$;

ALTER TABLE "credenciamentos" ALTER COLUMN "operacao" SET NOT NULL;
ALTER TABLE "credenciamento_historico" ALTER COLUMN "operacao" SET NOT NULL;

-- 2. Chave das etapas antigas (mesma tabela de `NOMES_ANTIGOS`) ------------------------
-- "Treinamento realizado" (Starlink) nao tem equivalente: fica sem chave e a
-- sincronizacao a desativa. Uma etapa por chave por funil (indice unico).
UPDATE "funil_estagios" e
SET "chave" = alvo."chave"
FROM (
  SELECT DISTINCT ON (fe."funil_id", m."chave") fe."id", m."chave"
  FROM "funil_estagios" fe
  JOIN "funis" f ON f."id" = fe."funil_id" AND f."tipo" = 'ESTEIRA'
  JOIN (VALUES
    ('TIM'::"Operacao", 'em negociacao', 'TIM_NEGOCIACAO'),
    ('TIM'::"Operacao", 'documentacao', 'TIM_DOCUMENTACAO'),
    ('TIM'::"Operacao", 'credenciamento em andamento', 'TIM_CRED_ANDAMENTO'),
    ('TIM'::"Operacao", 'credenciamento ok', 'TIM_CRED_OK'),
    ('TIM'::"Operacao", 'apto para venda', 'TIM_VENDA_LIBERADA'),
    ('STARLINK'::"Operacao", 'preencher o vsm', 'SL_CREDENCIAMENTO'),
    ('STARLINK'::"Operacao", 'contrato assinado', 'SL_CONTRATO'),
    ('STARLINK'::"Operacao", 'pronto para venda', 'SL_PRONTO_VENDA')
  ) AS m("operacao", "nome", "chave")
    ON m."operacao" = f."operacao"
   AND m."nome" = regexp_replace(lower(trim(translate(fe."nome", 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC'))), '\s+', ' ', 'g')
  WHERE fe."chave" IS NULL
  ORDER BY fe."funil_id", m."chave", fe."ordem"
) alvo
WHERE e."id" = alvo."id"
  AND NOT EXISTS (SELECT 1 FROM "funil_estagios" o WHERE o."funil_id" = e."funil_id" AND o."chave" = alvo."chave");

-- 3. Linha 1:1 de campos exclusivos para cada credenciamento existente ---------------
INSERT INTO "credenciamentos_tim" ("credenciamento_id")
SELECT c."id" FROM "credenciamentos" c WHERE c."operacao" = 'TIM'
ON CONFLICT ("credenciamento_id") DO NOTHING;

-- TIM em "Apto para venda" com ciclo do parceiro ja estava ativo (spec 7). A
-- mudanca para TIM_ACOMPANHAMENTO e da CLI, porque a etapa ainda nao existe.
UPDATE "credenciamentos_tim" t
SET "status_parceria" = 'ATIVO'
FROM "credenciamentos" c
JOIN "funil_estagios" e ON e."id" = c."estagio_id"
WHERE t."credenciamento_id" = c."id"
  AND t."status_parceria" IS NULL
  AND c."situacao_excecao" IS NULL
  AND e."chave" = 'TIM_VENDA_LIBERADA'
  AND EXISTS (SELECT 1 FROM "ciclos_parceiro" cp WHERE cp."credenciamento_id" = c."id");

-- Starlink: retropreenche os campos pela etapa antiga para a etapa derivada
-- bater com os fatos (mesma tabela de `CAMPOS_STARLINK_ANTIGOS`). NULL = nao
-- respondido; nunca grava false.
INSERT INTO "credenciamentos_starlink" ("credenciamento_id", "cnpj_apto", "contrato", "treinamento", "pronto_venda")
SELECT c."id", m."cnpj_apto", m."contrato", m."treinamento", m."pronto_venda"
FROM "credenciamentos" c
JOIN "funil_estagios" e ON e."id" = c."estagio_id"
LEFT JOIN (VALUES
  -- (nome, cnpj_apto, contrato, treinamento, pronto_venda); cada coluna tem um
  -- true, entao o Postgres resolve todas como BOOLEAN sem cast.
  ('preencher o vsm', true, NULL, NULL, NULL),
  ('contrato assinado', NULL, true, NULL, NULL),
  ('treinamento realizado', NULL, true, true, NULL),
  ('pronto para venda', NULL, NULL, NULL, true)
) AS m("nome", "cnpj_apto", "contrato", "treinamento", "pronto_venda")
  ON m."nome" = regexp_replace(lower(trim(translate(e."nome", 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC'))), '\s+', ' ', 'g')
WHERE c."operacao" = 'STARLINK'
ON CONFLICT ("credenciamento_id") DO NOTHING;

-- 4. Situacao de excecao antiga -> texto em motivo_situacao -------------------------
-- A etapa de saida (Desistencia/Descredenciado/Descartado) e aplicada pela CLI.
UPDATE "credenciamentos"
SET "motivo_situacao" = 'Migrado de: ' || "situacao_excecao"::TEXT || coalesce(' — ' || "motivo_excecao", ''),
    "situacao_desde" = coalesce("situacao_desde", "fechado_em", "atualizado_em")
WHERE "situacao_excecao" IS NOT NULL AND "motivo_situacao" IS NULL;

UPDATE "credenciamentos_starlink" s
SET "perdido" = true, "motivo_perda" = 'OUTRO'
FROM "credenciamentos" c
WHERE s."credenciamento_id" = c."id"
  AND c."situacao_excecao" IS NOT NULL
  AND s."perdido" IS NULL;

UPDATE "credenciamentos"
SET "classe_motivo" = 'DEFINITIVO'
WHERE "operacao" = 'STARLINK' AND "situacao_excecao" IS NOT NULL AND "classe_motivo" IS NULL;

-- 5. Um vinculo ativo por parceiro por operacao (spec 4.2) ----------------------------
-- Duplicatas: fica ativo o processo vivo (sem situacao de excecao) e, entre
-- iguais, o mais recente; os demais sao arquivados (nunca apagados).
-- A particao e a mesma dos indices: conta quando houver, senao contato.
UPDATE "credenciamentos" c
SET "arquivado_em" = now()
FROM (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "organizacao_id", "operacao", coalesce("conta_id", "contato_id")
           ORDER BY ("situacao_excecao" IS NULL) DESC, "atualizado_em" DESC, "criado_em" DESC, "id" DESC
         ) AS n
  FROM "credenciamentos"
  WHERE "arquivado_em" IS NULL
) r
WHERE c."id" = r."id" AND r.n > 1;

-- Indices parciais: o Prisma nao os representa (ver comentario em `Credenciamento`).
CREATE UNIQUE INDEX IF NOT EXISTS "credenciamentos_vinculo_conta_key"
  ON "credenciamentos"("organizacao_id", "operacao", "conta_id")
  WHERE "conta_id" IS NOT NULL AND "arquivado_em" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "credenciamentos_vinculo_contato_key"
  ON "credenciamentos"("organizacao_id", "operacao", "contato_id")
  WHERE "conta_id" IS NULL AND "arquivado_em" IS NULL;

-- 6. Permissao por operacao: nada a gravar. Sem linha em usuarios_operacoes =
-- acesso as duas operacoes (spec 4.9).
