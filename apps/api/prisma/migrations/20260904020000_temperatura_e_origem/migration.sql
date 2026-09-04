-- Temperatura e origem na oportunidade (item esquecido do plano em ANALISE-CRM.md).
--
-- Vem da demonstracao: o cartao do funil mostra temperatura e canal de origem, e
-- o vendedor varre o quadro sem abrir cartao nenhum.
--
-- Tres degraus de temperatura, e nao cinco: a diferenca entre "morno" e
-- "morno-quente" nao e uma informacao que alguem mantenha honesta num funil de
-- cem cartoes, e escala fina vira ruido — todo mundo marca o meio.
CREATE TYPE "Temperatura" AS ENUM ('FRIA', 'MORNA', 'QUENTE');

-- As duas colunas sao NULAS por padrao, e isso importa:
--
-- * temperatura nula = ninguem leu ainda. Um default "MORNA" faria as 83
--   oportunidades existentes nascerem com uma leitura que ninguem fez;
-- * origem nula = nao registrada. Um default "WEBCHAT" atribuiria a todas elas
--   uma procedencia inventada, e o relatorio por origem passaria a mentir com
--   aparencia de completo.
ALTER TABLE "oportunidades"
  ADD COLUMN "temperatura"  "Temperatura",
  ADD COLUMN "canal_origem" "Channel";

-- A pergunta que o cartao colorido provoca: "o que esta frio no funil?"
CREATE INDEX "oportunidades_temperatura_idx"
  ON "oportunidades" ("organizacao_id", "temperatura");

-- Origem entra na trilha de auditoria (item 3.2); temperatura NAO.
--
-- Origem e fato sobre a procedencia do negocio: mudar isso em silencio
-- reescreveria de onde a venda veio, que e a base de qualquer decisao de
-- investimento em canal. Temperatura e leitura subjetiva que muda toda semana —
-- auditar cada mudanca encheria a trilha e esconderia as linhas que importam.
ALTER TYPE "CampoAuditado" ADD VALUE 'ORIGEM';
