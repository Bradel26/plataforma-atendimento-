-- Medidor de consumo de IA (item 6.8 do plano em ANALISE-CRM.md).
--
-- Vem do medidor de credito do Nectar. O proprio plano registra a condicao:
-- "so faz sentido se a IA for ligada de verdade" — e hoje ela NAO esta. Nao ha
-- provedor configurado nesta plataforma, e a coluna `transcricao` de `chamadas`
-- nunca e preenchida.
--
-- A tabela existe de qualquer forma porque medir no momento do uso e caro de
-- acrescentar depois: se a IA entrar e ninguem medir, a primeira fatura e uma
-- surpresa. A tela, enquanto nao houver consumo nem provedor, diz que nada esta
-- ligado — em vez de mostrar "R$ 0,00", que convidaria a acreditar que a IA roda
-- e e de graca.

CREATE TYPE "RecursoIA" AS ENUM (
  'TRANSCRICAO',
  'RESUMO',
  'SUGESTAO_RESPOSTA',
  'CLASSIFICACAO',
  'OUTRO'
);

CREATE TABLE "consumo_ia" (
  "id"             TEXT NOT NULL,
  "organizacao_id" TEXT NOT NULL DEFAULT '',
  "recurso"        "RecursoIA" NOT NULL,
  -- Unidades do provedor: tokens, minutos de audio, imagens. Nao ha unidade
  -- universal, e por isso o rotulo aparece por recurso na tela.
  "unidades"       INTEGER NOT NULL,
  -- Custo com seis casas: preco de token e cotado em fracao pequena, e
  -- arredondar para centavo zeraria o custo de uma chamada curta — o mesmo erro
  -- que a tarifa de voz obrigou a evitar no item 6.6.
  "custo"          DECIMAL(12,6),
  "referencia"     TEXT,
  "criado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consumo_ia_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "consumo_ia"
  ADD CONSTRAINT "consumo_ia_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');

ALTER TABLE "consumo_ia"
  ADD CONSTRAINT "consumo_ia_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unidades negativas nao existem, e um estorno nao e "consumo negativo" — seria
-- outro registro, de outro tipo, no dia em que existir.
ALTER TABLE "consumo_ia"
  ADD CONSTRAINT "consumo_ia_unidades_positivas" CHECK ("unidades" >= 0);

CREATE INDEX "consumo_ia_periodo_idx" ON "consumo_ia" ("organizacao_id", "criado_em");
CREATE INDEX "consumo_ia_recurso_idx" ON "consumo_ia" ("organizacao_id", "recurso", "criado_em");

-- Teto mensal opcional. NULO, e nao zero: zero significaria "nao pode gastar
-- nada", e teto ausente e o padrao de quem nunca configurou.
ALTER TABLE "organizacoes"
  ADD COLUMN "teto_ia_mensal" DECIMAL(12,2);
