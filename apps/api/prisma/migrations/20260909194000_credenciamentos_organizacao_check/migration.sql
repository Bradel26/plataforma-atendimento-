-- Tabela raiz: carrega a organizacao e tem o CHECK que impede o default vazio
-- de virar dado real, como as outras (ver 20260904170000_filiais). Faltou na
-- migration original de credenciamentos (20260909193827) — corrigido aqui,
-- sem editar a migration ja aplicada.
ALTER TABLE "credenciamentos"
  ADD CONSTRAINT "credenciamentos_organizacao_id_nao_vazio" CHECK ("organizacao_id" <> '');
