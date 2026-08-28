-- Fundacao de organizacao (multi-tenancy): passo 2 de 2 — unicidades.
--
-- Aqui a volta deixa de ser gratuita: recriar uma unicidade global sobre dados
-- que passaram a ter repeticao legitima nao e possivel. TIRE UM BACKUP ANTES
-- (no Neon, um branch e instantaneo e copy-on-write).
--
-- Cada troca abaixo remove um impedimento concreto:
--   usuarios.email        a mesma pessoa em duas empresas
--   filas.nome            as duas com uma fila "Comercial"
--   funis.nome            as duas com um funil "Vendas"
--   catalogos_preco.nome  as duas com uma tabela "Padrao"
--   produtos.sku          as duas vendendo o mesmo produto
--   contas.cnpj           as duas com o mesmo cliente
--   canais_config.canal   UM WhatsApp na instalacao inteira
--   protocolos.numero     os numeros de uma consumidos pela outra

-- 1. Contador de protocolo por organizacao, semeado com a numeracao ATUAL.
--
-- Esta ordem e obrigatoria: semear depois de derrubar a sequencia faria a
-- proxima abertura de protocolo repetir um numero ja usado.
ALTER TABLE "organizacoes" ADD COLUMN "proximo_protocolo" INTEGER NOT NULL DEFAULT 1;

UPDATE "organizacoes" o
   SET "proximo_protocolo" = COALESCE(
         (SELECT MAX(p."numero") FROM "protocolos" p WHERE p."organizacao_id" = o."id"),
         0
       ) + 1;

-- 2. Confere que nenhuma organizacao com protocolo ficou com contador atras do
--    maior numero em uso. Sem isto, o erro apareceria como violacao de unicidade
--    no primeiro protocolo aberto depois do deploy.
DO $$
DECLARE
  problema INT;
BEGIN
  SELECT COUNT(*) INTO problema
    FROM "organizacoes" o
    JOIN "protocolos" p ON p."organizacao_id" = o."id"
   GROUP BY o."id", o."proximo_protocolo"
  HAVING MAX(p."numero") >= o."proximo_protocolo"
   LIMIT 1;

  IF COALESCE(problema, 0) > 0 THEN
    RAISE EXCEPTION 'contador de protocolo atras da numeracao em uso';
  END IF;
END $$;

-- 3. A sequencia do Postgres sai de cena: ela e por tabela e nao sabe contar por
--    organizacao.
ALTER TABLE "protocolos" ALTER COLUMN "numero" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "protocolos_numero_seq";

-- O default de `atualizado_em` era meu, do passo 1; o Prisma preenche a coluna
-- por conta dele (@updatedAt). Sai para o schema e o banco nao divergirem.
ALTER TABLE "organizacoes" ALTER COLUMN "atualizado_em" DROP DEFAULT;

-- 4. Unicidades globais saem.
DROP INDEX "canais_config_canal_key";
DROP INDEX "catalogos_preco_nome_key";
DROP INDEX "contas_cnpj_key";
DROP INDEX "filas_nome_key";
DROP INDEX "funis_nome_key";
DROP INDEX "produtos_sku_key";
DROP INDEX "protocolos_numero_key";
DROP INDEX "usuarios_email_key";

-- 5. Unicidades por organizacao entram.
--
-- Excecao proposital: os ids externos da Meta ficam unicos por TIPO DE CANAL, no
-- banco inteiro, e nao por organizacao. Sao ids globais do lado da Meta — dois
-- clientes nao podem cadastrar o mesmo numero — e e essa unicidade que permite ao
-- webhook, cuja URL e compartilhada, descobrir de quem e a mensagem.
--
-- Por tipo de canal, e nao por coluna: o `page_id` repete de proposito, porque o
-- Instagram Direct e atrelado a uma pagina do Facebook — a MESMA organizacao tem
-- o mesmo `page_id` nos canais FACEBOOK e INSTAGRAM. A primeira versao desta
-- migration usava unicidade por coluna e foi recusada pelo dado que ja existia.
CREATE UNIQUE INDEX "canais_config_organizacao_id_canal_key" ON "canais_config"("organizacao_id", "canal");
CREATE UNIQUE INDEX "canais_config_canal_phone_number_id_key" ON "canais_config"("canal", "phone_number_id");
CREATE UNIQUE INDEX "canais_config_canal_page_id_key" ON "canais_config"("canal", "page_id");
CREATE UNIQUE INDEX "canais_config_canal_ig_user_id_key" ON "canais_config"("canal", "ig_user_id");
CREATE UNIQUE INDEX "catalogos_preco_organizacao_id_nome_key" ON "catalogos_preco"("organizacao_id", "nome");
CREATE UNIQUE INDEX "contas_organizacao_id_cnpj_key" ON "contas"("organizacao_id", "cnpj");
CREATE UNIQUE INDEX "filas_organizacao_id_nome_key" ON "filas"("organizacao_id", "nome");
CREATE UNIQUE INDEX "funis_organizacao_id_nome_key" ON "funis"("organizacao_id", "nome");
CREATE UNIQUE INDEX "produtos_organizacao_id_sku_key" ON "produtos"("organizacao_id", "sku");
CREATE UNIQUE INDEX "protocolos_organizacao_id_numero_key" ON "protocolos"("organizacao_id", "numero");
CREATE UNIQUE INDEX "usuarios_organizacao_id_email_key" ON "usuarios"("organizacao_id", "email");
