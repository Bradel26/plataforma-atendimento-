-- A coluna estagio_desde nasceu com CURRENT_TIMESTAMP, o que faria toda
-- oportunidade existente aparecer com "0 dias na etapa". A ultima atualizacao
-- e a melhor aproximacao que o banco tem de quando o cartao mudou de etapa.
UPDATE "oportunidades" SET "estagio_desde" = "atualizado_em" WHERE "estagio_desde" > "atualizado_em";
