-- CreateTable
CREATE TABLE "propostas_geradas" (
    "id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propostas_geradas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "propostas_geradas_oportunidade_id_criado_em_idx" ON "propostas_geradas"("oportunidade_id", "criado_em");

-- AddForeignKey
ALTER TABLE "propostas_geradas" ADD CONSTRAINT "propostas_geradas_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas_geradas" ADD CONSTRAINT "propostas_geradas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
