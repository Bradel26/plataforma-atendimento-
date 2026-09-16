-- Fase 12.1: endurece a identidade de sessao da Ponte no banco.
--
-- `ponte_sessao` passa a ser unica GLOBALMENTE (por canal), nao apenas
-- checada em aplicacao por organizacao. Motivo: `ponte_sessoes_auth`
-- (apps/ponte/src/banco.ts) e uma tabela compartilhada entre TODAS as
-- organizacoes, chaveada so pelo nome da sessao, com
-- `ON CONFLICT (sessao) DO UPDATE` -- duas organizacoes com o mesmo
-- `ponte_sessao` fariam a segunda sobrescrever as credenciais Baileys
-- cifradas da primeira. `NULL` continua permitindo varios registros (indice
-- unico do Postgres nao restringe NULL).
--
-- Verificado antes de criar esta migration (consulta somente-leitura ao
-- banco de desenvolvimento, Fase 12.1): zero colisoes existentes em
-- `ponte_sessao` -- a migration pode ser aplicada sem limpeza de dados.

CREATE UNIQUE INDEX "canais_config_canal_ponte_sessao_key" ON "canais_config"("canal", "ponte_sessao");
