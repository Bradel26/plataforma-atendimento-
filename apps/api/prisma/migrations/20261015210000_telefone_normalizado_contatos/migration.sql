ALTER TABLE "contatos"
  ADD COLUMN "telefone_normalizado" TEXT;

UPDATE "contatos"
SET "telefone_normalizado" = CASE
  WHEN length(regexp_replace(COALESCE("telefone", ''), '\D', '', 'g')) BETWEEN 10 AND 11
    THEN '55' || regexp_replace("telefone", '\D', '', 'g')
  WHEN length(regexp_replace(COALESCE("telefone", ''), '\D', '', 'g')) BETWEEN 12 AND 15
    THEN regexp_replace("telefone", '\D', '', 'g')
  ELSE NULL
END;

CREATE INDEX "contatos_organizacao_id_telefone_normalizado_idx"
  ON "contatos"("organizacao_id", "telefone_normalizado");

CREATE FUNCTION "atualizar_telefone_normalizado_contato"()
RETURNS TRIGGER AS $$
DECLARE
  digitos TEXT;
BEGIN
  digitos := regexp_replace(COALESCE(NEW."telefone", ''), '\D', '', 'g');
  NEW."telefone_normalizado" := CASE
    WHEN length(digitos) BETWEEN 10 AND 11 THEN '55' || digitos
    WHEN length(digitos) BETWEEN 12 AND 15 THEN digitos
    ELSE NULL
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "contatos_telefone_normalizado_trigger"
BEFORE INSERT OR UPDATE OF "telefone" ON "contatos"
FOR EACH ROW
EXECUTE FUNCTION "atualizar_telefone_normalizado_contato"();
