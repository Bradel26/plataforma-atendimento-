-- CreateEnum
CREATE TYPE "TipoPesquisa" AS ENUM ('CSAT', 'NPS');

-- CreateTable
CREATE TABLE "pesquisas" (
    "id" TEXT NOT NULL,
    "conversa_id" TEXT NOT NULL,
    "tipo" "TipoPesquisa" NOT NULL DEFAULT 'CSAT',
    "nota" INTEGER,
    "comentario" TEXT,
    "token" TEXT NOT NULL,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondido_em" TIMESTAMP(3),

    CONSTRAINT "pesquisas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalas" (
    "id" TEXT NOT NULL,
    "agente_id" TEXT NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presenca_log" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "duracao" INTEGER,

    CONSTRAINT "presenca_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_conversa_id_key" ON "pesquisas"("conversa_id");

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_token_key" ON "pesquisas"("token");

-- CreateIndex
CREATE INDEX "pesquisas_respondido_em_idx" ON "pesquisas"("respondido_em");

-- CreateIndex
CREATE UNIQUE INDEX "escalas_agente_id_dia_semana_key" ON "escalas"("agente_id", "dia_semana");

-- CreateIndex
CREATE INDEX "presenca_log_usuario_id_iniciado_em_idx" ON "presenca_log"("usuario_id", "iniciado_em");

-- CreateIndex
CREATE INDEX "presenca_log_iniciado_em_idx" ON "presenca_log"("iniciado_em");

-- AddForeignKey
ALTER TABLE "pesquisas" ADD CONSTRAINT "pesquisas_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presenca_log" ADD CONSTRAINT "presenca_log_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

