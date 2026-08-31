-- Cliente tambem recebe etiqueta.
--
-- Contato ja tinha `tags` desde a Fase 1, cliente nao — e etiquetar contato sem
-- etiquetar a empresa deixa metade da segmentacao de fora: "revenda" e
-- "atacado" descrevem o cliente, nao a pessoa que atende o telefone.
ALTER TABLE "contas" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';

-- Indice GIN: o filtro por tag usa operador de array (`@>`), e sem GIN cada
-- consulta varre a tabela inteira. Com o volume de hoje ninguem notaria; com a
-- base carregada de um cliente Protheus, notaria.
CREATE INDEX "contatos_tags_idx" ON "contatos" USING GIN ("tags");
CREATE INDEX "contas_tags_idx" ON "contas" USING GIN ("tags");
