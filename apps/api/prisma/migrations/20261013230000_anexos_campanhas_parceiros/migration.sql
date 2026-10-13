CREATE TABLE "campanhas_parceiros_anexos" (
  "id" TEXT NOT NULL,
  "campanha_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "tamanho" INTEGER NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campanhas_parceiros_anexos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campanhas_parceiros_anexos_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas_parceiros"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "campanhas_parceiros_anexos_campanha_id_criado_em_idx" ON "campanhas_parceiros_anexos"("campanha_id", "criado_em");
