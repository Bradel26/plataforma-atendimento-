-- Check-in e check-out de visita (item 6.7 do plano em ANALISE-CRM.md).
--
-- Aparece nos tres CRMs avaliados (Nectar, HotSales, Ploomes) e, como o proprio
-- plano registra, vale mais para o tecnico de campo que para o vendedor: quem
-- instala ar-condicionado precisa provar que esteve no lugar.
--
-- Os campos ficam na ATIVIDADE porque uma visita e uma atividade. Um modelo
-- separado obrigaria a manter os dois em sincronia e permitiria visita sem
-- tarefa — que e a forma de o registro desaparecer da agenda de quem vai.
ALTER TABLE "atividades"
  ADD COLUMN "checkin_em"   TIMESTAMP(3),
  ADD COLUMN "checkin_lat"  DOUBLE PRECISION,
  ADD COLUMN "checkin_lng"  DOUBLE PRECISION,
  ADD COLUMN "checkout_em"  TIMESTAMP(3),
  ADD COLUMN "checkout_lat" DOUBLE PRECISION,
  ADD COLUMN "checkout_lng" DOUBLE PRECISION;

-- Check-out sem check-in nao existe: a saida so tem sentido depois da chegada, e
-- uma visita com so o check-out preenchido produziria duracao negativa ou nula
-- em qualquer relatorio futuro.
ALTER TABLE "atividades"
  ADD CONSTRAINT "atividades_checkout_exige_checkin"
  CHECK ("checkout_em" IS NULL OR "checkin_em" IS NOT NULL);

-- E a saida nao pode ser antes da chegada.
ALTER TABLE "atividades"
  ADD CONSTRAINT "atividades_checkout_depois_do_checkin"
  CHECK ("checkout_em" IS NULL OR "checkout_em" >= "checkin_em");

-- A consulta nova: "que visitas estao em andamento agora?"
CREATE INDEX "atividades_visita_em_andamento_idx"
  ON "atividades" ("organizacao_id", "checkin_em", "checkout_em");
