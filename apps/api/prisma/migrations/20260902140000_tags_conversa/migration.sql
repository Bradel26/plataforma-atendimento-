-- Etiqueta em conversa (item 5.2 das pendencias).
--
-- Contato e conta ja tinham etiqueta desde 31/08. As duas descrevem *quem* e a
-- conversa descreve *sobre o que* — e era essa dimensao que faltava para
-- responder "quantos atendimentos foram sobre boleto neste mes".
--
-- `assunto` continua existindo e continua sendo texto livre. Ele nao substitui
-- a etiqueta porque texto livre nao agrupa: "boleto", "Boleto em atraso" e "2a
-- via do boleto" sao a mesma coisa para quem le e tres linhas num relatorio.
ALTER TABLE "conversas" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';

-- Indice GIN, pelo mesmo motivo de contatos e contas: o filtro por etiqueta usa
-- operador de array e sem GIN varre a tabela inteira. Aqui pesa mais do que nos
-- outros dois — conversa e a tabela que cresce todo dia, uma linha por
-- atendimento, enquanto contato cresce uma vez por pessoa.
CREATE INDEX "conversas_tags_idx" ON "conversas" USING GIN ("tags");
