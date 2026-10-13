ALTER TABLE "campanhas" ADD COLUMN "assunto" TEXT;
CREATE TABLE "campanha_anexos" (
  "id" TEXT NOT NULL,
  "campanha_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "tamanho" INTEGER NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campanha_anexos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campanha_anexos_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "campanha_anexos_campanha_id_criado_em_idx" ON "campanha_anexos"("campanha_id", "criado_em");
