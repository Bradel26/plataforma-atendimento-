ALTER TABLE "mensagens_rapidas"
  ADD CONSTRAINT "mensagens_rapidas_organizacao_id_nao_vazio"
  CHECK ("organizacao_id" <> '');
