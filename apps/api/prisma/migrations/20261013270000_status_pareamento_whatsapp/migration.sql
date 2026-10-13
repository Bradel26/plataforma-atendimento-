ALTER TABLE "channel_configs"
ADD COLUMN "ponte_conectado_em" TIMESTAMP(3);

-- Conexoes que ja estao ativas passam a contar como pareadas anteriormente.
UPDATE "channel_configs"
SET "ponte_conectado_em" = COALESCE("ponte_status_em", "atualizado_em")
WHERE "ponte_status" = 'CONECTADO';

-- Sem historico anterior ao status atual, nao podemos afirmar que linhas
-- desconectadas ja chegaram a parear. Elas aguardam nova confirmacao.
UPDATE "channel_configs"
SET "ponte_status" = 'AGUARDANDO_QR'
WHERE "ponte_status" = 'DESCONECTADO' AND "ponte_conectado_em" IS NULL;
