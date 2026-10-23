-- Esteiras TIM e Starlink (parte estrutural).
-- So estrutura: enums, colunas, tabelas, FKs, CHECK da raiz e indices.
-- `credenciamentos.operacao` e `credenciamento_historico.operacao` entram
-- NULLABLE: a etapa de dados (Task 3) preenche e torna NOT NULL, e cria os
-- indices unicos parciais de vinculo depois de arquivar duplicatas.

-- Enums ----------------------------------------------------------------------
CREATE TYPE "Operacao" AS ENUM ('TIM', 'STARLINK');
CREATE TYPE "TipoEtapa" AS ENUM ('NORMAL', 'DESVIO', 'SAIDA');
CREATE TYPE "NivelOperacao" AS ENUM ('SEM_ACESSO', 'LEITURA', 'EDICAO');
CREATE TYPE "ClasseMotivo" AS ENUM ('RECUPERAVEL', 'DEFINITIVO');
CREATE TYPE "TipoHistoricoEsteira" AS ENUM ('MOVIMENTO', 'EXCECAO', 'AUTOMATICO', 'SAIDA', 'REATIVACAO', 'IMPORTACAO', 'CORRECAO');
CREATE TYPE "DepTim" AS ENUM ('TIM', 'PARCEIRO', 'BRADEL');
CREATE TYPE "OrigemTim" AS ENUM ('MANUAL', 'PLANILHA');
CREATE TYPE "StatusItemTim" AS ENUM ('PENDENTE', 'CONCLUIDO');
CREATE TYPE "StatusParceria" AS ENUM ('ATIVO', 'DESISTENTE', 'DESCREDENCIADO');
CREATE TYPE "TipoCaptacao" AS ENUM ('LEAD_INBOUND', 'PROSPECCAO_ATIVA');
CREATE TYPE "VivensisStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');
CREATE TYPE "MotivoPerdaStarlink" AS ENUM ('NAO_RESPONDEU', 'SEM_CONTATO', 'OUTRO_PARCEIRO', 'SEM_ESTRUTURA', 'SEM_INTERESSE', 'SEM_PERFIL', 'CNPJ_IRREGULAR', 'REPROVADO_VIVENSIS', 'OUTRO');
CREATE TYPE "StatusVendedor" AS ENUM ('ATIVO', 'INATIVO');
CREATE TYPE "AcaoRegistroEsteira" AS ENUM ('EXPORTACAO', 'IMPORTACAO');

-- Colunas novas em tabelas existentes -----------------------------------------
ALTER TABLE "contatos" ADD COLUMN "cpf" TEXT;
CREATE INDEX "contatos_organizacao_id_cpf_idx" ON "contatos"("organizacao_id", "cpf");

ALTER TABLE "funis" ADD COLUMN "operacao" "Operacao";
-- Uma esteira por operacao em cada organizacao (o Prisma nao representa indice parcial).
CREATE UNIQUE INDEX "funis_organizacao_operacao_esteira_key"
  ON "funis"("organizacao_id", "operacao") WHERE "tipo" = 'ESTEIRA';

ALTER TABLE "funil_estagios"
  ADD COLUMN "chave" TEXT,
  ADD COLUMN "tipo_etapa" "TipoEtapa" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "dias_parado" INTEGER,
  ADD COLUMN "ativa" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "funil_estagios_funil_id_chave_key" ON "funil_estagios"("funil_id", "chave");

ALTER TABLE "credenciamentos"
  ADD COLUMN "operacao" "Operacao",
  ADD COLUMN "arquivado_em" TIMESTAMP(3),
  ADD COLUMN "motivo_situacao" TEXT,
  ADD COLUMN "classe_motivo" "ClasseMotivo",
  ADD COLUMN "situacao_desde" TIMESTAMP(3),
  ADD COLUMN "estagio_antes_da_saida_id" TEXT,
  ADD COLUMN "ultima_interacao_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Nome acima de 63 caracteres: truncado como o Prisma faz (sufixo preservado).
CREATE INDEX "credenciamentos_organizacao_id_operacao_estagio_id_atualiza_idx"
  ON "credenciamentos"("organizacao_id", "operacao", "estagio_id", "atualizado_em");
CREATE INDEX "credenciamentos_organizacao_id_operacao_responsavel_id_idx"
  ON "credenciamentos"("organizacao_id", "operacao", "responsavel_id");

ALTER TABLE "credenciamentos" ADD CONSTRAINT "credenciamentos_estagio_antes_da_saida_id_fkey"
  FOREIGN KEY ("estagio_antes_da_saida_id") REFERENCES "funil_estagios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credenciamento_historico"
  ADD COLUMN "operacao" "Operacao",
  ADD COLUMN "tipo" "TipoHistoricoEsteira" NOT NULL DEFAULT 'MOVIMENTO',
  ADD COLUMN "motivo" TEXT,
  ADD COLUMN "observacao" TEXT;

-- Campos exclusivos da TIM (1:1) e vendedores do PDV (1:N) ----------------------
CREATE TABLE "credenciamentos_tim" (
    "credenciamento_id" TEXT NOT NULL,
    "origem" "OrigemTim",
    "flag_trafego_pago" BOOLEAN NOT NULL DEFAULT false,
    "status_descritivo" TEXT,
    "dep" "DepTim",
    "data_credenciamento" TIMESTAMP(3),
    "matricula_sappdv" TEXT,
    "promo_status" TEXT,
    "tipo_carteira" TEXT,
    "sistema_tim_vendas" BOOLEAN,
    "sistema_gn" BOOLEAN,
    "sistema_tim_forma_mais" BOOLEAN,
    "sistema_portal_fornecedor" BOOLEAN,
    "sistema_meu_tim" BOOLEAN,
    "compra_chip" "StatusItemTim",
    "treinamento" "StatusItemTim",
    "status_parceria" "StatusParceria",

    CONSTRAINT "credenciamentos_tim_pkey" PRIMARY KEY ("credenciamento_id")
);

CREATE TABLE "pdv_vendedores" (
    "id" TEXT NOT NULL,
    "credenciamento_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "telefone" TEXT,
    "status" "StatusVendedor" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdv_vendedores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pdv_vendedores_credenciamento_id_idx" ON "pdv_vendedores"("credenciamento_id");

-- Campos exclusivos da Starlink (1:1). Boolean NULL = nao respondido. ---------
CREATE TABLE "credenciamentos_starlink" (
    "credenciamento_id" TEXT NOT NULL,
    "tipo_captacao" "TipoCaptacao",
    "primeiro_contato_em" TIMESTAMP(3),
    "cnpj_apto" BOOLEAN,
    "mei" BOOLEAN,
    "alt_cnae" BOOLEAN,
    "vsm" BOOLEAN,
    "treinamento" BOOLEAN,
    "parceiro" BOOLEAN,
    "contrato" BOOLEAN,
    "pronto_venda" BOOLEAN,
    "perdido" BOOLEAN,
    "vivensis_status" "VivensisStatus",
    "motivo_perda" "MotivoPerdaStarlink",

    CONSTRAINT "credenciamentos_starlink_pkey" PRIMARY KEY ("credenciamento_id")
);

-- Notas e auditoria do vinculo ----------------------------------------------------
CREATE TABLE "credenciamento_notas" (
    "id" TEXT NOT NULL,
    "credenciamento_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credenciamento_notas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credenciamento_notas_credenciamento_id_criado_em_idx" ON "credenciamento_notas"("credenciamento_id", "criado_em");

CREATE TABLE "credenciamento_auditoria" (
    "id" TEXT NOT NULL,
    "credenciamento_id" TEXT NOT NULL,
    "operacao" "Operacao" NOT NULL,
    "campo" TEXT NOT NULL,
    "de" JSONB,
    "para" JSONB,
    "usuario_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credenciamento_auditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credenciamento_auditoria_credenciamento_id_criado_em_idx" ON "credenciamento_auditoria"("credenciamento_id", "criado_em");

-- Permissao por operacao e preferencias do usuario ------------------------------
CREATE TABLE "usuarios_operacoes" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "operacao" "Operacao" NOT NULL,
    "nivel" "NivelOperacao" NOT NULL,

    CONSTRAINT "usuarios_operacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usuarios_operacoes_usuario_id_operacao_key" ON "usuarios_operacoes"("usuario_id", "operacao");

CREATE TABLE "preferencias_usuario" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferencias_usuario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preferencias_usuario_usuario_id_chave_key" ON "preferencias_usuario"("usuario_id", "chave");

-- Registro de exportacoes/importacoes (raiz, com organizacao) -------------------
CREATE TABLE "registros_esteira" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "operacao" "Operacao" NOT NULL,
    "acao" "AcaoRegistroEsteira" NOT NULL,
    "usuario_id" TEXT,
    "detalhe" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_esteira_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registros_esteira_organizacao_id_operacao_criado_em_idx" ON "registros_esteira"("organizacao_id", "operacao", "criado_em");

-- Chaves estrangeiras ----------------------------------------------------------------
ALTER TABLE "credenciamentos_tim" ADD CONSTRAINT "credenciamentos_tim_credenciamento_id_fkey"
  FOREIGN KEY ("credenciamento_id") REFERENCES "credenciamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pdv_vendedores" ADD CONSTRAINT "pdv_vendedores_credenciamento_id_fkey"
  FOREIGN KEY ("credenciamento_id") REFERENCES "credenciamentos_tim"("credenciamento_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credenciamentos_starlink" ADD CONSTRAINT "credenciamentos_starlink_credenciamento_id_fkey"
  FOREIGN KEY ("credenciamento_id") REFERENCES "credenciamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credenciamento_notas" ADD CONSTRAINT "credenciamento_notas_credenciamento_id_fkey"
  FOREIGN KEY ("credenciamento_id") REFERENCES "credenciamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credenciamento_auditoria" ADD CONSTRAINT "credenciamento_auditoria_credenciamento_id_fkey"
  FOREIGN KEY ("credenciamento_id") REFERENCES "credenciamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "usuarios_operacoes" ADD CONSTRAINT "usuarios_operacoes_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_usuario_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registros_esteira" ADD CONSTRAINT "registros_esteira_organizacao_id_fkey"
  FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registros_esteira"
  ADD CONSTRAINT "registros_esteira_organizacao_id_nao_vazio"
  CHECK ("organizacao_id" <> '');
