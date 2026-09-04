-- Visoes salvas (item 6.1 do plano em ANALISE-CRM.md): um filtro nomeado, com
-- cor, para reabrir depois em contas, leads e oportunidades.
--
-- Nao guarda uma consulta propria: guarda o MESMO filtro que a tela ja tem
-- (busca, etiqueta, responsavel, conforme a entidade). O formato de "filtro"
-- muda por entidade e por isso e JSONB, validado na camada de servico.
--
-- Compartilhada pela organizacao inteira, como o funil — nao pessoal. Nao
-- existia ate aqui nenhuma tabela com o contorno "so o dono ve" nesta
-- plataforma, e criar essa politica so para este item inventaria uma excecao
-- que ninguem pediu.

CREATE TYPE "EntidadeVisao" AS ENUM ('CONTA', 'LEAD', 'OPORTUNIDADE');

CREATE TABLE "visoes_salvas" (
  "id"              TEXT NOT NULL,
  "organizacao_id"  TEXT NOT NULL DEFAULT '',
  "entidade"        "EntidadeVisao" NOT NULL,
  "nome"            TEXT NOT NULL,
  "cor"             TEXT NOT NULL DEFAULT '#64748b',
  "filtro"          JSONB NOT NULL,
  "criado_por_id"   TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "visoes_salvas_pkey" PRIMARY KEY ("id")
);

-- Tabela raiz: carrega a organizacao e tem o CHECK que impede o default vazio
-- de virar dado real, como as outras.
ALTER TABLE "visoes_salvas"
  ADD CONSTRAINT "visoes_salvas_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');

ALTER TABLE "visoes_salvas"
  ADD CONSTRAINT "visoes_salvas_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull no autor: apagar quem criou a visao nao pode apagar a visao — ela
-- e compartilhada, e continua servindo a organizacao sem autoria nenhuma.
ALTER TABLE "visoes_salvas"
  ADD CONSTRAINT "visoes_salvas_criado_por_id_fkey"
  FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nome unico por entidade dentro da organizacao: duas visoes de LEAD nao podem
-- se chamar igual, mas uma de LEAD e uma de CONTA podem.
CREATE UNIQUE INDEX "visoes_salvas_organizacao_entidade_nome_idx"
  ON "visoes_salvas" ("organizacao_id", "entidade", "nome");

-- A consulta da tela: as visoes de uma entidade, na organizacao.
CREATE INDEX "visoes_salvas_organizacao_entidade_idx"
  ON "visoes_salvas" ("organizacao_id", "entidade");
