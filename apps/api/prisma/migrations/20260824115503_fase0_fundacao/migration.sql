-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'AGENTE');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('OFFLINE', 'DISPONIVEL', 'EM_ATENDIMENTO', 'PAUSA');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "Role" NOT NULL DEFAULT 'AGENTE',
    "status" "AgentStatus" NOT NULL DEFAULT 'OFFLINE',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "canal_padrao" "Channel" NOT NULL DEFAULT 'WEBCHAT',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filas_agentes" (
    "id" TEXT NOT NULL,
    "fila_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filas_agentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "app_name" TEXT NOT NULL DEFAULT 'Plataforma de Atendimento',
    "logo_url" TEXT,
    "cor_primaria" TEXT NOT NULL DEFAULT '#2563eb',
    "cor_secundaria" TEXT NOT NULL DEFAULT '#0f172a',
    "cor_destaque" TEXT NOT NULL DEFAULT '#16a34a',
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_perfil_idx" ON "usuarios"("perfil");

-- CreateIndex
CREATE UNIQUE INDEX "filas_nome_key" ON "filas"("nome");

-- CreateIndex
CREATE INDEX "filas_agentes_usuario_id_idx" ON "filas_agentes"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "filas_agentes_fila_id_usuario_id_key" ON "filas_agentes"("fila_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "filas_agentes" ADD CONSTRAINT "filas_agentes_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filas_agentes" ADD CONSTRAINT "filas_agentes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
