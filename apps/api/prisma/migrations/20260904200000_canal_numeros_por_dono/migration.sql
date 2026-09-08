-- Numero proprio por vendedor: um canal (ex.: WHATSAPP) passa a admitir mais
-- de uma linha por organizacao. "phone_number_id" (global, ja unico) e quem
-- impede duplicata agora; a antiga trava organizacao+canal so permitia UM
-- numero por empresa inteira.
DROP INDEX "canais_config_organizacao_id_canal_key";

ALTER TABLE "canais_config"
  ADD COLUMN "nome" TEXT,
  ADD COLUMN "dono_id" TEXT;

ALTER TABLE "canais_config"
  ADD CONSTRAINT "canais_config_dono_id_fkey"
  FOREIGN KEY ("dono_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conversa lembra por qual numero entrou, para a resposta sair pelo mesmo
-- numero que recebeu (e, no caso de linha pessoal, pelo dono certo).
ALTER TABLE "conversas"
  ADD COLUMN "canal_config_id" TEXT;

ALTER TABLE "conversas"
  ADD CONSTRAINT "conversas_canal_config_id_fkey"
  FOREIGN KEY ("canal_config_id") REFERENCES "canais_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
