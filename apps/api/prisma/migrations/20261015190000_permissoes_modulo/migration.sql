-- Permissoes de modulo configuraveis por perfil (ADMIN em Configuracoes).
-- Seed com o mapeamento atual de nav.ts para nao mudar acesso de ninguem.

CREATE TABLE "module_permissions" (
    "id" TEXT NOT NULL,
    "organizacao_id" TEXT NOT NULL DEFAULT '',
    "perfil" "Role" NOT NULL,
    "modulo" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "module_permissions_organizacao_id_perfil_modulo_key" ON "module_permissions"("organizacao_id", "perfil", "modulo");

ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_organizacao_id_fkey"
FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "module_permissions"
  ADD CONSTRAINT "module_permissions_organizacao_id_nao_vazio"
  CHECK ("organizacao_id" <> '');

-- Seed: mapeamento atual de apps/web/src/components/layout/nav.ts (2026-10-15),
-- sem ADMIN (sempre tem tudo) e sem 'configuracoes' (sempre so ADMIN).
INSERT INTO "module_permissions" ("id", "organizacao_id", "perfil", "modulo")
VALUES
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'monitoramento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'auditoria'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'gestao'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'campanhas'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'relatorios'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'dashboards'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPERVISOR', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'monitoramento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'auditoria'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'campanhas'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'relatorios'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'dashboards'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GESTOR', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'campanhas'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'COMERCIAL', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'esteira'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SUPORTE', 'chamado-ti'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'AGENTE', 'atendimento'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'AGENTE', 'crm'),
  (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'AGENTE', 'chamado-ti')
ON CONFLICT ("organizacao_id", "perfil", "modulo") DO NOTHING;
