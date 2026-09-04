-- Assistente da ligacao (item E.2 em ANALISE-CRM.md): transcricao, resumo,
-- sentimento e proximas acoes, pendurados na chamada.
--
-- A plataforma nao transcreve nem interpreta: nao ha provedor generativo aqui.
-- Quem analisa e um motor externo, que posta o resultado pela ponte de
-- integracao — a mesma arquitetura do agente de IA que responde conversa.

-- Nulo NAO e NEUTRO, e essa e a decisao central do item.
--
-- Nulo significa "ninguem analisou esta chamada". Dobrar as nao analisadas em
-- "neutras" faria a gestao ler um mar de neutralidade que na verdade e ausencia
-- de analise — e concluir que o atendimento e morno quando o que existe e uma
-- fila sem transcricao. Por isso a coluna e anulavel e nao tem default.
CREATE TYPE "SentimentoDaLigacao" AS ENUM ('POSITIVO', 'NEUTRO', 'NEGATIVO');

ALTER TABLE "chamadas"
  ADD COLUMN "resumo"        TEXT,
  ADD COLUMN "sentimento"    "SentimentoDaLigacao",
  ADD COLUMN "analisado_por" TEXT,
  ADD COLUMN "analisado_em"  TIMESTAMP(3);

-- Proximas acoes, em tabela propria porque a demonstracao as mostrava
-- EXECUTAVEIS: sugestao que nao pode virar tarefa e enfeite. Cada linha tem um
-- destino (a atividade que nasceu dela) e um estado (descartada, com autor).
--
-- Filha de "chamadas": nao tem organizacao_id porque toda leitura passa pela
-- chamada, que a extensao de multi-tenant filtra. Mesmo caminho da trilha de
-- auditoria da oportunidade.
CREATE TABLE "acoes_sugeridas_da_chamada" (
  "id"                 TEXT NOT NULL,
  "chamada_id"         TEXT NOT NULL,
  "texto"              TEXT NOT NULL,
  -- A ordem do motor e informacao: motor bom sugere o mais urgente primeiro.
  "ordem"              INTEGER NOT NULL DEFAULT 0,
  "criado_em"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atividade_id"       TEXT,
  "descartado_em"      TIMESTAMP(3),
  "descartado_por_id"  TEXT,

  CONSTRAINT "acoes_sugeridas_da_chamada_pkey" PRIMARY KEY ("id"),

  -- Uma sugestao nao pode estar descartada E virada em tarefa: os dois estados
  -- se excluem, e permitir ambos deixaria a tela sem resposta para "o que
  -- aconteceu com isso?".
  CONSTRAINT "acao_sugerida_estado_unico"
    CHECK ("atividade_id" IS NULL OR "descartado_em" IS NULL),

  -- Descarte sem autor nao se discute, pelo mesmo motivo da nota da chamada
  -- (item 6.6): "essa sugestao era ruim" precisa de quem disse.
  CONSTRAINT "acao_sugerida_descarte_com_autor"
    CHECK (("descartado_em" IS NULL) = ("descartado_por_id" IS NULL))
);

-- A chamada morre com as sugestoes dela; a atividade e o usuario sobrevivem.
-- Apagar a atividade nao apaga o registro de que a sugestao existiu — mas a
-- sugestao volta a "pendente", que e a verdade: a tarefa nao esta mais lá.
ALTER TABLE "acoes_sugeridas_da_chamada"
  ADD CONSTRAINT "acoes_sugeridas_da_chamada_chamada_id_fkey"
    FOREIGN KEY ("chamada_id") REFERENCES "chamadas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "acoes_sugeridas_da_chamada_atividade_id_fkey"
    FOREIGN KEY ("atividade_id") REFERENCES "atividades"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "acoes_sugeridas_da_chamada_descartado_por_id_fkey"
    FOREIGN KEY ("descartado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uma sugestao gera no maximo uma tarefa: clicar duas vezes nao pode criar duas
-- atividades identicas na agenda de alguem.
CREATE UNIQUE INDEX "acoes_sugeridas_da_chamada_atividade_id_key"
  ON "acoes_sugeridas_da_chamada" ("atividade_id");

CREATE INDEX "acoes_sugeridas_da_chamada_chamada_id_ordem_idx"
  ON "acoes_sugeridas_da_chamada" ("chamada_id", "ordem");
