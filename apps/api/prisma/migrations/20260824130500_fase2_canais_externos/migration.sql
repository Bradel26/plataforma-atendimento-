-- AlterTable
ALTER TABLE "conversas" ADD COLUMN     "endereco_externo" TEXT;

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "id_externo" TEXT;

-- CreateTable
CREATE TABLE "canais_config" (
    "id" TEXT NOT NULL,
    "canal" "Channel" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "phone_number_id" TEXT,
    "waba_id" TEXT,
    "page_id" TEXT,
    "ig_user_id" TEXT,
    "access_token" TEXT,
    "app_secret" TEXT,
    "verify_token" TEXT,
    "fila_id" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canais_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canais_config_canal_key" ON "canais_config"("canal");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_id_externo_key" ON "mensagens"("id_externo");

-- AddForeignKey
ALTER TABLE "canais_config" ADD CONSTRAINT "canais_config_fila_id_fkey" FOREIGN KEY ("fila_id") REFERENCES "filas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

