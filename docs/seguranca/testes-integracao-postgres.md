# Testes de integração com PostgreSQL real

**Estado: EXECUTADOS em 2026-11-16** contra um PostgreSQL 16.15 descartável, local (`127.0.0.1:55432`), banco `plataforma_teste`, credencial temporária. Nunca houve conexão com o Neon nem com outro banco compartilhado. Logs em `docs/seguranca/evidencias/` (índice no fim).

## Resultado (CONFIRMED_BY_EXECUTION — ambiente: PostgreSQL 16.15 local, descartável, Windows)

| Verificação | Resultado |
|---|---|
| 84 migrations aplicadas do zero | OK, incluindo `20261116120000_sessao_versao_usuario` |
| `prisma validate` e `prisma migrate status` | schema válido; "Database schema is up to date" |
| Drift entre migrations e `schema.prisma` | **Há drift preexistente em 3 tabelas** (`branding`, `mapeamentos_origem_importacao`, `solicitacoes_exclusao_contato`). **`usuarios` não aparece**; o `schema.prisma` difere do HEAD só pela coluna nova (6 linhas). O drift não é desta entrega (ver "Achado preexistente"). |
| Testes de integração, 2ª execução | **14 de 14 passaram** |
| Controle negativo (advisory lock removido de propósito) | **2 falharam**: os dois admins passaram e a organização ficou com **0 admins** (`expected 0 to be >= 1`). Com o lock, 14/14. O defeito é real no Postgres e o lock o corrige. |
| Migration sobre tabela **populada** (25 usuários) | só a migration nova aplicou; 25 de 25 em `sessao_versao = 0`, 0 nulos; coluna `NOT NULL DEFAULT 0` |
| **Código antigo** (cliente Prisma gerado do HEAD, sem a coluna) contra o banco com a coluna nova | INSERT, SELECT, UPDATE, upsert, findMany e DELETE funcionam; o INSERT grava `sessao_versao = 0` pelo default |
| **`prisma migrate deploy` da imagem antiga** (83 migrations) contra o banco que já tem a nova | "No pending migrations to apply", saída 0 (não falha por migration desconhecida) |
| **Código novo sem a migration** | falha com `P2022: The column usuarios.sessao_versao does not exist` — a razão de a ordem migration → código importar |

## Defeito de produção encontrado por estes testes

Na **1ª execução, 3 dos 14 testes falharam**: `validarSessao` devolvia 503 com "Consulta ao banco sem organização ativa". Causa: `consultarNoBanco` devolvia de dentro de `comOrganizacao` uma **promessa preguiçosa do Prisma** (só executa no primeiro `.then`), que era aguardada **fora** do `AsyncLocalStorage` — a consulta saía sem organização e a extensão de isolamento a recusava. **Em produção, toda requisição autenticada responderia 503.** Os testes de unidade (Prisma simulado) não podiam ver isso. Corrigido (`await` dentro do callback, `lib/sessao.ts`) e coberto por `lib/sessao.consulta.test.ts`, um teste de unidade com um `prisma` preguiçoso que **falha sem a correção** (verificado por mutação). Log da falha preservado em `evidencias/02-...-FALHOU.log`.

## Achado preexistente (fora desta entrega)

`prisma migrate diff` mostra que o banco construído pelas migrations difere do `schema.prisma` em 3 tabelas: default de `branding.app_name` e nomes de FKs/índices de `mapeamentos_origem_importacao` e `solicitacoes_exclusao_contato`. Isso já existia no HEAD. Efeito: `prisma migrate dev` tentará gerar uma migration para isso. `migrate deploy` não é afetado. Recomendo tratar à parte.

## O que os testes provam

Arquivo: `apps/api/src/integracao/sessao-e-admins.integracao.test.ts`.

| Teste | Prova |
|---|---|
| Migration | `usuarios.sessao_versao` é `NOT NULL` com default `0`; usuário novo nasce com versão 0 |
| `pg_advisory_xact_lock` | a segunda transação da **mesma** organização espera a primeira; organizações diferentes **não** se bloqueiam |
| Corrida entre administradores (15 rodadas) | dois ADMIN rebaixados juntos: exatamente um passa, o outro recebe 409, sobra 1 ADMIN |
| Mistura PATCH / desativar / excluir em 3 ADMIN | ao menos 1 ADMIN sobra |
| Incremento atômico | 40 incrementos concorrentes no SQL = versão 40; 10 trocas de senha pelo serviço = versão 10; só mudar o nome não sobe a versão |
| Isolamento por organização | o último ADMIN de cada organização é protegido só pelos dela; usuário de outra organização dá 404; mesmo e-mail em duas organizações tem versões independentes; `validarSessao` (consulta real) respeita a organização do token |
| Ponta a ponta | mudança de perfil derruba token com `sv` antigo e token legado, e aceita o novo; desativar e excluir derrubam a sessão |

## Segurança: só banco local e descartável

- `apps/api/src/lib/banco-teste.ts` recusa tudo que não for `127.0.0.1`/`localhost`/`::1`, com nome de banco contendo `teste|test|tmp|descart`, sem sinais de serviço compartilhado (`neon`, `supabase`, `upstash`, `bradel`…) e sem `?host=`. 9 testes de unidade, na suíte padrão.
- `tests/setup-integracao.ts` falha **alto** se `TEST_DATABASE_URL` não passar na guarda e **sobrescreve** `DATABASE_URL`/`DIRECT_URL`. Confirmado na execução: o Prisma carregou o `.env`, mas o destino impresso foi `127.0.0.1:55432/plataforma_teste`.
- Os testes ficam **fora** de `npm test` e têm configuração própria (`vitest.integracao.config.ts`).

## Como repetir (máquina com Postgres descartável)

1. Postgres **local e descartável**, em UTF8 (as migrations têm caracteres UTF-8; no Windows o `initdb` padrão cria WIN1252 e a 1ª migration falha). Com Docker: `docker run --rm -d --name pg-teste -p 127.0.0.1:55432:5432 -e POSTGRES_USER=teste -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=plataforma_teste postgres:16-alpine`.
2. `$env:TEST_DATABASE_URL = 'postgresql://teste:teste@127.0.0.1:55432/plataforma_teste'`
3. `npm run test:integracao:preparar`
4. `npm run test:integracao`
5. Encerrar o banco ao final.

Nesta sessão o banco veio de `embedded-postgres@16.15.0-beta.19`, instalado fora do repositório. Origem e integridade: `evidencias/00-origem-e-integridade.md` (cadeia npm íntegra; binários **sem assinatura Authenticode** e não comparados com o distribuidor oficial — aceitável só para este uso).

## Índice de evidências (`docs/seguranca/evidencias/`)

`00-origem-e-integridade.md`, `00-servidor-postgres.log`, `01-migrate-deploy.log` (a tentativa anterior em WIN1252 falhou na 1ª migration e foi sobrescrita; a causa está registrada aqui), `02-testes-integracao-1a-execucao-FALHOU.log`, `03-testes-integracao-2a-execucao.log`, `04-controle-negativo-sem-lock.log`, `05-migrate-status.log`, `06-migrate-diff.log`, `08-migrate-deploy-antigo-contra-banco-novo.log`, `09-codigo-antigo-contra-banco-novo.log`, `10-codigo-novo-contra-banco-sem-migration.log`, `11-migration-sobre-tabela-populada.log`.
