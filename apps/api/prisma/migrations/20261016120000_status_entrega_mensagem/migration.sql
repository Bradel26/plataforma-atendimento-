DO $$ BEGIN
  CREATE TYPE "StatusDeEntrega" AS ENUM ('PENDENTE', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "mensagens"
  ADD COLUMN IF NOT EXISTS "status" "StatusDeEntrega";
