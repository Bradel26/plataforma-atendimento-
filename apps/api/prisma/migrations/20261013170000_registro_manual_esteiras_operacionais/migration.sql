CREATE TYPE "CanalInteracaoManual" AS ENUM ('TELEFONE', 'VISITA', 'OUTRO');

ALTER TABLE "atividades"
  ADD COLUMN "canal_manual" "CanalInteracaoManual",
  ADD COLUMN "ocorrido_em" TIMESTAMP(3),
  ADD COLUMN "resultado" TEXT,
  ADD COLUMN "registro_pai_id" TEXT;

CREATE UNIQUE INDEX "atividades_registro_pai_id_key" ON "atividades"("registro_pai_id");
ALTER TABLE "atividades"
  ADD CONSTRAINT "atividades_registro_pai_id_fkey"
  FOREIGN KEY ("registro_pai_id") REFERENCES "atividades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Atualiza os nomes sem recriar funis nem trocar os IDs dos estágios TIM.
UPDATE "funil_estagios" e
SET "nome" = CASE e."ordem"
  WHEN 1 THEN 'Em negociação'
  WHEN 2 THEN 'Credenciamento em andamento'
  WHEN 3 THEN 'Documentação'
  WHEN 4 THEN 'Credenciamento OK'
  WHEN 5 THEN 'Apto para venda'
END
FROM "funis" f
WHERE e."funil_id" = f."id"
  AND f."tipo" = 'ESTEIRA'
  AND lower(f."nome") = lower('Credenciamento TIM')
  AND e."ordem" BETWEEN 1 AND 5;

-- Starlink tem quatro etapas. O antigo quinto estágio (Ativo) é consolidado no
-- quarto (Pronto para venda), preservando os credenciamentos e seus registros.
DO $$
DECLARE
  f RECORD;
  antigo_quinto TEXT;
  quarto TEXT;
BEGIN
  FOR f IN
    SELECT "id" FROM "funis"
    WHERE "tipo" = 'ESTEIRA' AND lower("nome") = lower('Credenciamento Starlink')
  LOOP
    SELECT "id" INTO quarto FROM "funil_estagios" WHERE "funil_id" = f."id" AND "ordem" = 4;
    SELECT "id" INTO antigo_quinto FROM "funil_estagios" WHERE "funil_id" = f."id" AND "ordem" = 5;
    IF quarto IS NOT NULL AND antigo_quinto IS NOT NULL THEN
      UPDATE "credenciamentos" SET "estagio_id" = quarto WHERE "estagio_id" = antigo_quinto;
      UPDATE "oportunidades" SET "estagio_id" = quarto WHERE "estagio_id" = antigo_quinto;
      UPDATE "atividades" SET "estagio_id" = quarto WHERE "estagio_id" = antigo_quinto;
      UPDATE "credenciamento_historico" SET
        "de_estagio_id" = CASE WHEN "de_estagio_id" = antigo_quinto THEN quarto ELSE "de_estagio_id" END,
        "para_estagio_id" = CASE WHEN "para_estagio_id" = antigo_quinto THEN quarto ELSE "para_estagio_id" END
      WHERE "de_estagio_id" = antigo_quinto OR "para_estagio_id" = antigo_quinto;
      UPDATE "oportunidade_historico_estagio" SET
        "de_estagio_id" = CASE WHEN "de_estagio_id" = antigo_quinto THEN quarto ELSE "de_estagio_id" END,
        "para_estagio_id" = CASE WHEN "para_estagio_id" = antigo_quinto THEN quarto ELSE "para_estagio_id" END
      WHERE "de_estagio_id" = antigo_quinto OR "para_estagio_id" = antigo_quinto;
      DELETE FROM "funil_estagios" WHERE "id" = antigo_quinto;
    END IF;
  END LOOP;
END $$;

UPDATE "funil_estagios" e
SET "nome" = CASE e."ordem"
  WHEN 1 THEN 'Preencher o VSM'
  WHEN 2 THEN 'Contrato assinado'
  WHEN 3 THEN 'Treinamento realizado'
  WHEN 4 THEN 'Pronto para venda'
END
FROM "funis" f
WHERE e."funil_id" = f."id"
  AND f."tipo" = 'ESTEIRA'
  AND lower(f."nome") = lower('Credenciamento Starlink')
  AND e."ordem" BETWEEN 1 AND 4;
