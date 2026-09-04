-- Meta mensal por usuario e por equipe (item 4.1 do plano em ANALISE-CRM.md).
--
-- Vem da tela de Usuarios / Equipes do Nectar, que define meta por nivel e por
-- departamento com rampa mes a mes. Hoje nao existe nada disso no schema: o
-- dashboard mostra o que aconteceu e nao tem contra o que comparar.
--
-- A rampa mensal nao e luxo: quem vende ar-condicionado tem meta de dezembro
-- diferente da de junho, e uma meta anual dividida por doze descreve mal o ano
-- todo — em junho a equipe parece heroica e em dezembro parece fracassada, sem
-- nada ter mudado.

CREATE TYPE "EscopoMeta" AS ENUM ('INDIVIDUAL', 'EQUIPE');

CREATE TABLE "metas" (
  "id"              TEXT NOT NULL,
  "organizacao_id"  TEXT NOT NULL DEFAULT '',
  "usuario_id"      TEXT NOT NULL,
  "escopo"          "EscopoMeta" NOT NULL,
  -- Competencia: sempre o primeiro dia do mes. `DATE` e nao `TIMESTAMP` porque
  -- meta nao tem hora, e uma coluna com hora convidaria a comparacao por
  -- instante — que erra no fim do mes por causa de fuso.
  "mes"             DATE NOT NULL,
  "valor"           DECIMAL(14,2) NOT NULL,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- Tabela raiz: carrega a organizacao e tem o CHECK que impede o default vazio de
-- virar dado real, como as outras.
ALTER TABLE "metas"
  ADD CONSTRAINT "metas_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');

ALTER TABLE "metas"
  ADD CONSTRAINT "metas_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE no usuario: meta de quem saiu da empresa nao tem o que medir. O
-- realizado continua na oportunidade, que e onde o historico de venda mora.
ALTER TABLE "metas"
  ADD CONSTRAINT "metas_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma meta por pessoa, escopo e mes. E o indice unico que impede duas metas
-- concorrentes do mesmo mes — sem ele, dois cliques no botao de salvar
-- deixariam duas linhas e o progresso ficaria contando contra a errada.
CREATE UNIQUE INDEX "metas_unica_idx"
  ON "metas" ("organizacao_id", "usuario_id", "escopo", "mes");

-- A consulta da tela: as metas de um mes, na organizacao.
CREATE INDEX "metas_mes_idx" ON "metas" ("organizacao_id", "mes");
