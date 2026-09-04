-- WhatsApp nos dois modos: Cloud API oficial e ponte nao oficial.
--
-- A demonstracao do concorrente oferece os dois, e a operacao pequena usa o nao
-- oficial: funciona com qualquer numero, sem WABA e sem custo por mensagem.
--
-- AVISO, registrado tambem no schema, na tela e no SCOPE.md: o modo nao oficial
-- viola os termos de uso do WhatsApp, e o numero pode ser bloqueado sem aviso
-- nem recurso. E decisao de negocio com consequencia real, e quem liga precisa
-- saber que ligou.
CREATE TYPE "ModoWhatsApp" AS ENUM ('OFICIAL', 'NAO_OFICIAL');

-- Coluna ANULAVEL, e sem default.
--
-- Instagram e Facebook nao tem "modo": gravar OFICIAL neles faria a coluna
-- afirmar algo sobre um canal a que a pergunta nao se aplica. E o WhatsApp que
-- ja existe tambem fica nulo — ele foi configurado antes de a pergunta existir,
-- e a rota trata nulo como OFICIAL (o unico modo que havia) sem reescrever o
-- passado.
ALTER TABLE "canais_config"
  ADD COLUMN "modo" "ModoWhatsApp",
  -- Credenciais da ponte, em colunas proprias: os campos da Meta continuam
  -- significando o que significam, e trocar de modo nao perde credencial.
  ADD COLUMN "ponte_url"     TEXT,
  ADD COLUMN "ponte_token"   TEXT,
  ADD COLUMN "ponte_segredo" TEXT,
  ADD COLUMN "ponte_sessao"  TEXT;

-- Modo so faz sentido no WhatsApp.
--
-- O CHECK existe porque a coluna e escrita por rota de configuracao, e um dia
-- alguem vai mandar `modo` no corpo do canal errado. Recusar no banco e o que
-- garante que a leitura ("este canal e oficial?") nunca precise perguntar
-- tambem "e ele e WhatsApp?".
ALTER TABLE "canais_config"
  ADD CONSTRAINT "canal_modo_so_whatsapp"
    CHECK ("modo" IS NULL OR "canal" = 'WHATSAPP');
