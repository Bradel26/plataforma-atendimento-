-- CreateEnum
CREATE TYPE "CallDirecao" AS ENUM ('ENTRANTE', 'SAINTE');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('INICIANDO', 'CHAMANDO', 'EM_ANDAMENTO', 'COMPLETADA', 'NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA');

-- CreateTable
CREATE TABLE "voz_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "provedor" TEXT NOT NULL DEFAULT 'twilio',
    "conta_sid" TEXT,
    "auth_token" TEXT,
    "numero_padrao" TEXT,
    "url_webhook" TEXT,
    "fila_id" TEXT,
    "guardar_gravacao" BOOLEAN NOT NULL DEFAULT true,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voz_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamadas" (
    "id" TEXT NOT NULL,
    "id_externo" TEXT NOT NULL,
    "direcao" "CallDirecao" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'INICIANDO',
    "numero_origem" TEXT NOT NULL,
    "numero_destino" TEXT NOT NULL,
    "contato_id" TEXT,
    "conversa_id" TEXT,
    "agente_id" TEXT,
    "fila_id" TEXT,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendido_em" TIMESTAMP(3),
    "encerrado_em" TIMESTAMP(3),
    "duracao" INTEGER,
    "gravacao_url" TEXT,
    "gravacao_duracao" INTEGER,
    "transcricao" TEXT,
    "custo" DECIMAL(10,4),
    "motivo_falha" TEXT,

    CONSTRAINT "chamadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chamadas_id_externo_key" ON "chamadas"("id_externo");

-- CreateIndex
CREATE INDEX "chamadas_iniciado_em_idx" ON "chamadas"("iniciado_em");

-- CreateIndex
CREATE INDEX "chamadas_agente_id_iniciado_em_idx" ON "chamadas"("agente_id", "iniciado_em");

-- CreateIndex
CREATE INDEX "chamadas_status_idx" ON "chamadas"("status");

-- AddForeignKey
ALTER TABLE "voz_config" ADD CONSTRAINT "voz_config_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamadas" ADD CONSTRAINT "chamadas_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamadas" ADD CONSTRAINT "chamadas_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamadas" ADD CONSTRAINT "chamadas_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamadas" ADD CONSTRAINT "chamadas_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

