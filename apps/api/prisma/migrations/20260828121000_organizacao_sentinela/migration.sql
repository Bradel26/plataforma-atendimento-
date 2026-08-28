-- Fundacao de organizacao: o sentinela que troca verificacao humana por
-- verificacao do banco.
--
-- O campo `organizacaoId` ganhou `@default("")` no schema por um motivo de
-- ergonomia: com ele, o TypeScript deixa de exigir a organizacao em cada uma
-- das 41 chamadas de criacao, e a extensao do Prisma preenche em tempo de
-- execucao a partir do contexto da requisicao.
--
-- Sozinho, isso seria trocar um risco por outro: se a extensao fosse
-- contornada, a linha entraria com string vazia e ficaria orfa em silencio.
-- O CHECK abaixo e a rede: string vazia e recusada PELO BANCO, com o nome da
-- constraint na mensagem. O caminho de falha deixa de ser silencioso e passa a
-- ser alto.

ALTER TABLE "usuarios" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "tokens_integracao" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "contatos" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "conversas" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "filas" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "canais_config" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "contas" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "leads" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "funis" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "oportunidades" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "produtos" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "catalogos_preco" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "protocolos" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "campanhas" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "bots" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "escalas" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "branding" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "politica_retencao" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "voz_config" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "mensagens" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "chamadas" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "pesquisas" ALTER COLUMN "organizacao_id" SET DEFAULT '';
ALTER TABLE "lgpd_registros" ALTER COLUMN "organizacao_id" SET DEFAULT '';

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "tokens_integracao" ADD CONSTRAINT "tokens_integracao_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "filas" ADD CONSTRAINT "filas_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "canais_config" ADD CONSTRAINT "canais_config_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "contas" ADD CONSTRAINT "contas_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "funis" ADD CONSTRAINT "funis_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "catalogos_preco" ADD CONSTRAINT "catalogos_preco_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "bots" ADD CONSTRAINT "bots_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "branding" ADD CONSTRAINT "branding_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "politica_retencao" ADD CONSTRAINT "politica_retencao_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "voz_config" ADD CONSTRAINT "voz_config_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "chamadas" ADD CONSTRAINT "chamadas_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "pesquisas" ADD CONSTRAINT "pesquisas_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
ALTER TABLE "lgpd_registros" ADD CONSTRAINT "lgpd_registros_organizacao_preenchida"
  CHECK ("organizacao_id" <> '');
