-- Indice em organizacao_id para filtros de isolamento de tenant conforme convencao do projeto.
-- Todo modelo com organizacaoId precisa de indice que comeca por esse campo para que o
-- Postgres aproveite o prefixo em qualquer consulta que filtre por organizacao.
CREATE INDEX "previas_chat_organizacao_id_canal_config_id_numero_idx" ON "previas_chat"("organizacao_id", "canal_config_id", "numero");
