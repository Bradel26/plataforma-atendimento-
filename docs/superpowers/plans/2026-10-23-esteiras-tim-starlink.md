# Esteiras TIM e Starlink — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a Esteira atual (um Kanban só, operação deduzida pelo nome do funil) em duas esteiras independentes — TIM e Starlink — com campos, etapas e regras dos PDFs, visões Kanban/Funil/Lista, permissão por operação, histórico/auditoria, preferências por usuário, exportação e importação.

**Architecture:** `Operacao` vira dado (enum) em `Funnel` e `Credenciamento`; o `Credenciamento` passa a ser o *vínculo* parceiro×operação, com tabela 1:1 de campos próprios por operação. As regras de cada operação vivem em módulos **puros** (`esteira/tim.ts`, `esteira/starlink.ts`) testados por vitest; o serviço só carrega, chama a regra e grava. A API nova fica em `/api/esteiras/:operacao/...` e devolve também a **estrutura** (etapas, colunas, filtros, motivos) para o front renderizar a partir de uma única fonte.

**Tech Stack:** Express + Prisma 6 (Postgres/Neon, migrations SQL escritas à mão), zod, vitest (só funções puras — o que precisa de banco fica para smoke), React 18 + Tailwind v4 com componentes próprios, `exceljs` (novo, só na API) para XLSX.

**Spec:** `docs/superpowers/specs/2026-10-23-esteiras-tim-starlink-design.md` — leia antes de qualquer tarefa; as seções citadas (ex.: "spec 5.1") são de lá.

## Global Constraints

- Separação por operação **no backend**: toda consulta/escrita/exportação filtra por `operacao` e pelas operações permitidas ao usuário; operação sem acesso → **404**.
- Nenhum dado de parceiro fictício no banco real. Seeds/CLIs criam só **estrutura** (funis, etapas, chaves). Smoke manual em dev: nomes prefixados `[TESTE]`, removidos ao final.
- Migrations: SQL escrito à mão em `apps/api/prisma/migrations/<timestamp>_<nome>/migration.sql`; conferir com `prisma migrate diff` **sem** `--shadow-database-url`; nunca `migrate reset`.
- Toda tabela nova entra em `COM_ORGANIZACAO` (`src/lib/prisma.ts`) **ou** em `FILHAS`/`GLOBAIS` de `src/lib/tenant.schema.test.ts`. Tabela raiz segue o molde de `20261015190000_permissoes_modulo` (`organizacao_id` + FK + `CHECK (organizacao_id <> '')`).
- Tri-estado Starlink = `Boolean?`; **NULL nunca é tratado como NÃO** (proibido `Number(x)`, `!!x` ou `x || false` nesses campos).
- Texto de interface em português **com acentuação correta**; cores só pelos tons remapeados do tema (sem `dark:`), ver aviso no topo de `EsteiraPage.tsx`.
- Testes: `npm test` na raiz (vitest, `apps/*/src/**/*.test.ts`). Typecheck: `npm run typecheck`. Build: `npm run build`.
- Commits pequenos por tarefa; mensagens no estilo do repo (`feat(esteira): …`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Tri-estado NULL vs NÃO** — um campo Starlink em branco (NULL) não pode fechar caminho nem derivar MEI/descarte; `cnpjApto = null` com `mei = true` fica em "Em atendimento", não em "Quer abrir MEI". Teste em Task 5.
2. **Mesmo parceiro nas duas operações** — criar vínculo Starlink para contato com `segmentoParceiro = 'TIM'` deve funcionar; criar o segundo vínculo TIM do mesmo CNPJ deve dar 409. Teste em Task 7 (função pura `chaveDeUnicidade`) e smoke em Task 22.
3. **Usuário só-TIM chamando rota Starlink por id** — `GET /api/esteiras/starlink/vinculos/:id` de um vínculo TIM, ou de usuário sem STARLINK, deve dar 404, inclusive em export e na ficha da empresa. Teste em Task 6 (`resolverAcesso`) e Task 13.
4. **Arraste para trás no Starlink limpa campos acima** — soltar "Pronto p/ venda" em "Em treinamento" zera `parceiro/contrato/prontoVenda` e exige justificativa; sem justificativa nada muda. Teste em Task 5.
5. **Importação reexecutada** — reimportar a mesma planilha atualiza, não duplica; linha com CNPJ já vinculado na outra operação cria o vínculo desta sem tocar a outra. Teste em Task 11.

---

## Estrutura de arquivos

API (`apps/api/src/modules/esteira/` — módulo novo; o antigo `crm/credenciamentos.*` é adaptado e depois enxugado):

| Arquivo | Responsabilidade |
|---|---|
| `catalogo.ts` | Etapas de cada operação (chave, nome, tipo, ordem, papel), motivos de perda, tipos comuns |
| `tim.ts` | Regras puras TIM: `pronto`, avaliação de movimento, efeitos de entrada |
| `starlink.ts` | Regras puras Starlink: derivação "furthest wins", travas, avaliação, patch por coluna |
| `colunas.ts` | Definição das colunas de Lista/exportação/importação por operação |
| `filtros.ts` | Filtros comuns + específicos → `Prisma.CredenciamentoWhereInput` |
| `funil.ts` | Cálculo puro do funil (alcançaram, conversão, saídas, mediana, gargalo) |
| `auditoria.ts` | Diferença de campos → linhas de auditoria |
| `acesso.ts` | Permissão por operação (nível efetivo, middleware, filtro) |
| `vinculos.service.ts` | Criar/obter/mover/editar vínculo, notas, vendedores |
| `consultas.service.ts` | Kanban paginado, Lista paginada, Funil |
| `planilhas.service.ts` | Exportar CSV/XLSX, importar com prévia |
| `estrutura.service.ts` | Sincronizar etapas do catálogo nos funis; renomear etapa/diasParado |
| `esteiras.routes.ts` / `esteiras.schemas.ts` | Rotas `/api/esteiras/:operacao/...` |
| `preferencias.routes.ts` | `/api/preferencias` |

Web (`apps/web/src/pages/esteira/`): `EsteiraPage.tsx` (casca: cabeçalho, filtros, troca de visão), `KanbanView.tsx`, `ListaView.tsx`, `FunilView.tsx`, `DetalheVinculo.tsx` (gaveta), `CamposTim.tsx`, `CamposStarlink.tsx`, `DialogoMovimento.tsx`, `ImportarPlanilha.tsx`, `NovoParceiro.tsx`, `estadoEsteira.ts` (puro: URL ↔ estado, preferências) + `estadoEsteira.test.ts`, `usePreferenciaEsteira.ts`.

---

## Fase A — Fundação

### Task 1: Schema e migration estrutural

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261023120000_esteiras_operacao/migration.sql`
- Modify: `apps/api/src/lib/prisma.ts` (`COM_ORGANIZACAO`), `apps/api/src/lib/tenant.schema.test.ts` (`FILHAS`)

**Interfaces — Produces (nomes Prisma usados por todas as tarefas seguintes):**
- `enum Operacao { TIM STARLINK }`, `enum TipoEtapa { NORMAL DESVIO SAIDA }`, `enum NivelOperacao { LEITURA EDICAO }`, `enum ClasseMotivo { RECUPERAVEL DEFINITIVO }`, `enum TipoHistoricoEsteira { MOVIMENTO EXCECAO AUTOMATICO SAIDA REATIVACAO IMPORTACAO CORRECAO }`, `enum DepTim { TIM PARCEIRO BRADEL }`, `enum OrigemTim { MANUAL PLANILHA }`, `enum StatusItemTim { PENDENTE CONCLUIDO }`, `enum StatusParceria { ATIVO DESISTENTE DESCREDENCIADO }`, `enum TipoCaptacao { LEAD_INBOUND PROSPECCAO_ATIVA }`, `enum VivensisStatus { PENDENTE APROVADO REPROVADO }`, `enum MotivoPerdaStarlink { NAO_RESPONDEU SEM_CONTATO OUTRO_PARCEIRO SEM_ESTRUTURA SEM_INTERESSE SEM_PERFIL CNPJ_IRREGULAR REPROVADO_VIVENSIS OUTRO }`, `enum StatusVendedor { ATIVO INATIVO }`, `enum AcaoRegistroEsteira { EXPORTACAO IMPORTACAO }`.
- `Funnel.operacao Operacao?` (+ índice único parcial `(organizacao_id, operacao) WHERE tipo='ESTEIRA'`).
- `FunnelStage.chave String?` (`@@unique([funilId, chave])`), `tipoEtapa TipoEtapa @default(NORMAL)`, `diasParado Int?`, `ativa Boolean @default(true)`.
- `Credenciamento` + `operacao Operacao`, `arquivadoEm DateTime?`, `motivoSituacao String?`, `classeMotivo ClasseMotivo?`, `situacaoDesde DateTime?`, `estagioAntesDaSaidaId String?` (FK FunnelStage, SetNull), `ultimaInteracaoEm DateTime @default(now())`; relações `tim CredenciamentoTim?`, `starlink CredenciamentoStarlink?`, `notas`, `auditoria`. Índices `(organizacaoId, operacao, estagioId, atualizadoEm)`, `(organizacaoId, operacao, responsavelId)`. Os únicos parciais de vínculo **não** entram aqui — a Task 3 os cria depois de arquivar duplicatas.
- `CredenciamentoHistorico` + `operacao Operacao`, `tipo TipoHistoricoEsteira @default(MOVIMENTO)`, `motivo String?`, `observacao String?`.
- `CredenciamentoTim` (`@@map("credenciamentos_tim")`, PK `credenciamentoId`): campos da spec 4.5 com os nomes `origem, flagTrafegoPago(Boolean @default(false)), statusDescritivo, dep, dataCredenciamento, matriculaSappdv, promoStatus, tipoCarteira, sistemaTimVendas, sistemaGn, sistemaTimFormaMais, sistemaPortalFornecedor, sistemaMeuTim (Boolean?), compraChip, treinamento (StatusItemTim?), statusParceria`; relação `vendedores PdvVendedor[]`.
- `PdvVendedor` (`pdv_vendedores`): `id, credenciamentoId, nome, cpf?, telefone?, status StatusVendedor @default(ATIVO), criadoEm, atualizadoEm`.
- `CredenciamentoStarlink` (`credenciamentos_starlink`, PK `credenciamentoId`): `tipoCaptacao?, primeiroContatoEm DateTime?, cnpjApto, mei, altCnae, vsm, treinamento, parceiro, contrato, prontoVenda, perdido (Boolean?), vivensisStatus?, motivoPerda?`.
- `CredenciamentoNota` (`credenciamento_notas`): `id, credenciamentoId, autorId?, texto, criadoEm`.
- `CredenciamentoAuditoria` (`credenciamento_auditoria`): `id, credenciamentoId, operacao, campo, de Json?, para Json?, usuarioId?, criadoEm`.
- `UsuarioOperacao` (`usuarios_operacoes`): `id, usuarioId, operacao, nivel`, `@@unique([usuarioId, operacao])`.
- `PreferenciaUsuario` (`preferencias_usuario`): `id, usuarioId, chave, valor Json, atualizadoEm`, `@@unique([usuarioId, chave])`.
- `RegistroEsteira` (`registros_esteira`, raiz com `organizacaoId`): `id, operacao, acao AcaoRegistroEsteira, usuarioId?, detalhe Json, criadoEm`.
- `Contact.cpf String?` + `@@index([organizacaoId, cpf])`.
- Grupos de tenant: raiz → `RegistroEsteira`; filhas → `CredenciamentoTim, CredenciamentoStarlink, PdvVendedor, CredenciamentoNota, CredenciamentoAuditoria: 'Credenciamento'`; `UsuarioOperacao, PreferenciaUsuario: 'User'`.

- [ ] **Step 1: Adicionar `RegistroEsteira` ao schema sem tocar `prisma.ts` e rodar o teste de erosão** — `npm test -- tenant.schema` → FAIL citando `RegistroEsteira`.
- [ ] **Step 2: Escrever todo o schema acima**, registrar os grupos de tenant (raiz em `COM_ORGANIZACAO`, filhas em `FILHAS` com comentário dizendo por qual pai chegam).
- [ ] **Step 3: Escrever a migration SQL** — só estrutura nesta tarefa (enums, colunas, tabelas, FKs, CHECK da raiz, índices; o único parcial de `funis` entra aqui, os de vínculo ficam para a Task 3). `credenciamentos.operacao` e `credenciamento_historico.operacao` entram **nullable** aqui; a Task 3 preenche e torna NOT NULL.
- [ ] **Step 4: Conferir** — `cd apps/api && npx prisma validate && npx prisma generate && npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` só pode divergir no `NOT NULL` que a Task 3 adiciona e nos índices parciais (Prisma não os representa). Se o `migrate diff --from-migrations` exigir shadow DB, use `--from-schema-datasource prisma/schema.prisma` contra o banco de dev **depois** de aplicar (Step 5).
- [ ] **Step 5: Aplicar em dev** — `npx prisma migrate deploy` → "applied". `npm test -- tenant.schema` → PASS. `npm run typecheck -w @plataforma/api` → PASS (nada foi removido nem renomeado).
- [ ] **Step 6: Commit** `feat(esteira): schema de operacao, campos TIM/Starlink, permissoes e preferencias`

### Task 2: Catálogo de etapas e papéis

**Files:**
- Create: `apps/api/src/modules/esteira/catalogo.ts`, `apps/api/src/modules/esteira/catalogo.test.ts`
- Modify: `apps/api/src/modules/crm/esteira.ts` (`papelDoEstagio` aceita chave)

**Interfaces — Produces:**
```ts
export type ChaveTim = 'TIM_NEGOCIACAO' | 'TIM_DOCUMENTACAO' | 'TIM_CRED_ANDAMENTO' | 'TIM_CRED_OK' | 'TIM_POS_CRED' | 'TIM_VENDA_LIBERADA' | 'TIM_ACOMPANHAMENTO' | 'TIM_DESISTENCIA' | 'TIM_DESCREDENCIADO';
export type ChaveStarlink = 'SL_AGUARDANDO' | 'SL_EM_ATENDIMENTO' | 'SL_MEI' | 'SL_ALT_CNAE' | 'SL_CREDENCIAMENTO' | 'SL_TREINAMENTO' | 'SL_PARCEIRO' | 'SL_CONTRATO' | 'SL_PRONTO_VENDA' | 'SL_NURTURE' | 'SL_DESCARTADO';
export type ChaveEtapa = ChaveTim | ChaveStarlink;
export type EtapaCatalogo = { chave: ChaveEtapa; nome: string; tipo: 'NORMAL' | 'DESVIO' | 'SAIDA'; ordem: number; papel: PapelDoEstagio | null; trilho: number | null };
export const ETAPAS: Record<Operacao, EtapaCatalogo[]>;
export function etapa(chave: ChaveEtapa): EtapaCatalogo;            // lança se desconhecida
export function papelDaChave(chave: string | null): PapelDoEstagio | null;
export const MOTIVOS_PERDA: Record<MotivoPerdaStarlink, { rotulo: string; classe: 'RECUPERAVEL' | 'DEFINITIVO' }>;
export function operacaoDaUrl(s: string): Operacao | null;           // 'tim'|'starlink' (case-insensitive)
```
`trilho` = posição no trilho principal (1..7 TIM, 1..7 Starlink: Aguardando=1, Em atendimento=2, Credenciamento=3, Treinamento=4, Parceiro=5, Contrato=6, Pronto=7); `null` para DESVIO/SAIDA. `ordem` = ordem de coluna (trilho primeiro, depois desvios, depois saídas). Nomes exibidos exatamente como na spec 5.1/5.2 ("Em negociação", "Em andamento/Doc", "Credenciamento em andamento", "Credenciamento OK", "Pós-credenciamento/Operacional", "Venda liberada", "Acompanhamento", "Desistência", "Descredenciado"; "Aguardando contato", "Em atendimento", "Quer abrir MEI", "Alteração de CNAE", "Em credenciamento", "Em treinamento", "Parceiro", "Contrato assinado", "Pronto p/ venda", "Nurture", "Descartado"). Papéis = tabela da spec 4.7; saídas → `null`.

- [ ] **Step 1: Testes** `catalogo.test.ts`:
  - `papelDaChave('TIM_VENDA_LIBERADA')` e `('TIM_ACOMPANHAMENTO')` → `'ATIVO'`; `('TIM_POS_CRED')` → `'CREDENCIADO'`; `('SL_MEI')` → `'PENDENCIA'`; `('SL_PRONTO_VENDA')` → `'ATIVO'`; `('SL_NURTURE')` e `('TIM_DESISTENCIA')` → `null`.
  - cada operação tem chaves únicas, `ordem` única e trilho 1..7 contínuo.
  - `MOTIVOS_PERDA` tem 4 RECUPERAVEL (`NAO_RESPONDEU, SEM_CONTATO, OUTRO_PARCEIRO, SEM_ESTRUTURA`) e 5 DEFINITIVO.
  - `operacaoDaUrl('TIM')==='TIM'`, `('starlink')==='STARLINK'`, `('x')===null`.
- [ ] **Step 2:** rodar → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `catalogo.ts`; em `crm/esteira.ts`, `papelDoEstagio(nome, chave?)` usa `papelDaChave(chave)` quando `chave` vier e mantém a heurística por nome só como fallback (funis sem chave). Ajustar `esteira.test.ts` se precisar.
- [ ] **Step 4:** `npm test -- catalogo esteira` → PASS.
- [ ] **Step 5: Commit** `feat(esteira): catalogo de etapas por operacao`

### Task 3: Sincronização de etapas + migração de dados

**Files:**
- Create: `apps/api/src/modules/esteira/estrutura.service.ts`, `apps/api/src/modules/esteira/estrutura.test.ts`, `apps/api/src/modules/esteira/migracao.ts`, `apps/api/src/modules/esteira/migracao.test.ts`, `apps/api/src/cli/esteira-estrutura.ts`
- Create: `apps/api/prisma/migrations/20261023130000_esteiras_dados/migration.sql`
- Modify: `apps/api/prisma/seed.ts` (`semearEsteira`), `apps/api/src/cli/seed-esteira-bradel.ts`, `apps/api/package.json` (script `esteira:estrutura`)

**Interfaces:**
- Consumes: `ETAPAS`, `EtapaCatalogo` (Task 2).
- Produces:
```ts
// estrutura.ts (puro, dentro de estrutura.service.ts ou arquivo próprio)
type EtapaExistente = { id: string; nome: string; ordem: number; chave: string | null };
export function planoDeSincronizacao(existentes: EtapaExistente[], catalogo: EtapaCatalogo[]):
  { criar: EtapaCatalogo[]; atualizar: Array<{ id: string; chave: ChaveEtapa; ordem: number; tipo: TipoEtapa }>; desativar: string[] };
export async function sincronizarEstrutura(organizacaoId: string): Promise<{ funisCriados: number; etapasCriadas: number; etapasAtualizadas: number }>;
// migracao.ts (puro)
export function chaveDaEtapaAntiga(operacao: Operacao, nome: string): ChaveEtapa | null;
export function camposStarlinkDaEtapaAntiga(nome: string): Partial<Record<'cnpjApto'|'contrato'|'treinamento'|'prontoVenda', boolean>>;
export function saidaDaExcecaoAntiga(operacao: Operacao, situacao: 'REPROVADO'|'CANCELADO'|'INATIVADO', trilhoAtual: number | null):
  { chave: ChaveEtapa; statusParceria?: StatusParceria; perdido?: true; motivoPerda?: 'OUTRO'; classe?: 'DEFINITIVO' };
```
Regras: `sincronizarEstrutura` garante 1 funil ESTEIRA por operação (`nome` "Credenciamento TIM"/"Credenciamento Starlink", `operacao` preenchida), etapas com chave/ordem/tipo do catálogo; **nunca apaga** etapa — etapa sem chave e sem correspondência vira `ativa=false`. **Renomeação feita pelo ADMIN é preservada** (só grava `nome` ao criar). Reordenar respeitando `@@unique([funilId, ordem])`: mover tudo para `ordem + 1000` na mesma transação antes de gravar a ordem final.

- [ ] **Step 1: Testes** `estrutura.test.ts` / `migracao.test.ts`:
  - funil TIM atual (5 etapas com os nomes antigos de spec 3, já com chaves aplicadas pela migration) → `criar` = `TIM_POS_CRED, TIM_ACOMPANHAMENTO, TIM_DESISTENCIA, TIM_DESCREDENCIADO`; `atualizar` põe `TIM_DOCUMENTACAO` em ordem 2 e `TIM_CRED_ANDAMENTO` em 3.
  - etapa sem chave → aparece em `desativar`.
  - `chaveDaEtapaAntiga('TIM','Apto para venda') === 'TIM_VENDA_LIBERADA'`; `('TIM','Documentação') === 'TIM_DOCUMENTACAO'` (com e sem acento); `('STARLINK','Preencher o VSM') === 'SL_CREDENCIAMENTO'`.
  - `camposStarlinkDaEtapaAntiga('Treinamento realizado')` → `{ contrato: true, treinamento: true }`; `('Preencher o VSM')` → `{ cnpjApto: true }`; `('Pronto para venda')` → `{ prontoVenda: true }`.
  - `saidaDaExcecaoAntiga('TIM','CANCELADO',2)` → `TIM_DESISTENCIA`/`DESISTENTE`; `('TIM','REPROVADO',5)` → `TIM_DESCREDENCIADO`; `('TIM','INATIVADO',1)` → `TIM_DESCREDENCIADO`; `('STARLINK', qualquer, x)` → `SL_DESCARTADO`, `perdido: true`, `motivoPerda: 'OUTRO'`, `classe: 'DEFINITIVO'`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3: Implementar** as funções puras e `sincronizarEstrutura`.
- [ ] **Step 4: Migration de dados (SQL)**, em ordem, tudo idempotente:
  1. `funis.operacao` por nome (`ILIKE 'credenciamento tim'` / `'credenciamento starlink'`); `credenciamentos.operacao` e `credenciamento_historico.operacao` a partir do funil; depois `SET NOT NULL`.
  2. `funnel_stages.chave` para as etapas antigas pelos nomes atuais (mesma tabela de `chaveDaEtapaAntiga`; comparar com `unaccent`-like via `lower(translate(...))` ou listar as variantes com e sem acento).
  3. Inserir `credenciamentos_tim` / `credenciamentos_starlink` (uma linha por credenciamento existente); Starlink: retropreencher campos (spec 7); TIM em "Apto para venda" com `ciclos_parceiro` → `status_parceria='ATIVO'`. Mudar esses registros de etapa fica para a CLI (Step 5), porque as etapas novas só existem depois da sincronização.
  4. Exceções antigas → `motivo_situacao = 'Migrado de: ' || situacao_excecao || coalesce(' — ' || motivo_excecao, '')`; Starlink: `perdido=true, motivo_perda='OUTRO', classe_motivo='DEFINITIVO'`.
  5. Duplicatas por `(organizacao_id, operacao, coalesce(conta_id, contato_id))` com `arquivado_em IS NULL`: manter a mais recente (`atualizado_em`), `arquivado_em = now()` nas demais. **Só então** criar os índices únicos parciais de vínculo: `(organizacao_id, operacao, conta_id) WHERE conta_id IS NOT NULL AND arquivado_em IS NULL` e `(organizacao_id, operacao, contato_id) WHERE conta_id IS NULL AND arquivado_em IS NULL`.
  6. `usuarios_operacoes`: para cada usuário ativo, `EDICAO` nas duas se o perfil tem linha `module_permissions` com `modulo='esteira'` (ou é ADMIN); senão `LEITURA` nas duas se tem `dashboards`, `gestao`, `relatorios` ou `campanhas`.
- [ ] **Step 5: CLI** `src/cli/esteira-estrutura.ts` (`npm run esteira:estrutura -w @plataforma/api -- [orgId|--todas]`): para cada organização, `sincronizarEstrutura`; depois **reposiciona** o que a SQL não conseguia: TIM com chave antiga `TIM_VENDA_LIBERADA` e `CicloParceiro` existente → etapa `TIM_ACOMPANHAMENTO` (histórico `CORRECAO`, motivo "Migração: já tinha ciclo do parceiro"); TIM com exceção migrada → etapa de saída de `saidaDaExcecaoAntiga`; Starlink → `estagioId` = etapa derivada (Task 5 — esta CLI roda depois da Task 5; deixe o hook pronto e complete no Step 3 da Task 5). Exceções migradas: `estagio_antes_da_saida_id` = etapa em que estavam.
- [ ] **Step 6: Seeds** — `semearEsteira` (seed.ts) e `seed-esteira-bradel.ts` passam a chamar `sincronizarEstrutura` (sem nomes antigos, sem parceiros).
- [ ] **Step 7:** `npm test -- estrutura migracao` → PASS; aplicar em dev (`npx prisma migrate deploy`), rodar a CLI, e conferir com SQL: nenhum `credenciamentos.operacao` nulo; nenhuma etapa ativa sem chave nos funis ESTEIRA; contagem de credenciamentos igual à de antes (anotar antes/depois no commit).
- [ ] **Step 8: Commit** `feat(esteira): sincroniza etapas do catalogo e migra dados existentes`

### Task 4: Regras TIM (puras)

**Files:** Create `apps/api/src/modules/esteira/tim.ts`, `apps/api/src/modules/esteira/tim.test.ts`, `apps/api/src/modules/esteira/tipos.ts`

**Interfaces — Produces (`tipos.ts`, usado também pela Task 5):**
```ts
export type Avaliacao =
  | { resultado: 'LIVRE'; tipo: TipoHistoricoEsteira; exigeMotivo?: boolean }
  | { resultado: 'JUSTIFICATIVA'; tipo: 'CORRECAO' | 'REATIVACAO' }       // qualquer EDICAO, com justificativa
  | { resultado: 'EXCECAO'; pendencias: string[] }                        // só quem pode forçar (Task 6), com justificativa
  | { resultado: 'PROIBIDO'; motivo: string };
export type ContextoRegra = { perfil: Role; agora: Date };
```
`tim.ts`:
```ts
export type CamposTim = { /* espelho de CredenciamentoTim sem ids */ };
export function prontoTim(c: Pick<CamposTim,'sistemaTimVendas'|'compraChip'|'treinamento'>): boolean;
export function avaliarMovimentoTim(de: ChaveTim, para: ChaveTim, c: CamposTim, ctx: ContextoRegra & { antesDaSaida: ChaveTim | null }): Avaliacao;
export function efeitosDeEntradaTim(para: ChaveTim, c: CamposTim, agora: Date): Partial<CamposTim>;
export function deveLiberarVenda(etapaAtual: ChaveTim, c: CamposTim): boolean;
export function pendenciasDeCamposTim(antes: CamposTim, depois: CamposTim, vendedoresAtivos: number): string[]; // sistema → Sim sem vendedor ativo
```
Tabela de spec 5.1, sem mudança. Pendências usam o **nome do campo** (`'matriculaSappdv'`, `'sistemaTimVendas'`, `'compraChip'`, `'treinamento'`, `'vendedorAtivo'`).

- [ ] **Step 1: Testes** (um `it` por linha da tabela de spec 5.1), incluindo:
  - `NEGOCIACAO→DOCUMENTACAO` → `LIVRE/MOVIMENTO`; `NEGOCIACAO→CRED_ANDAMENTO` → `EXCECAO` (pulo).
  - `CRED_OK→POS_CRED` sem matrícula → `EXCECAO` com `pendencias: ['matriculaSappdv']`; com matrícula → `LIVRE`.
  - `POS_CRED→VENDA_LIBERADA` com `prontoTim` falso → `EXCECAO` listando os três campos faltantes; verdadeiro → `LIVRE`.
  - `CRED_ANDAMENTO→DOCUMENTACAO` → `JUSTIFICATIVA/CORRECAO`.
  - `DOCUMENTACAO→DESISTENCIA` → `LIVRE/SAIDA` com `exigeMotivo: true`; `CRED_OK→DESISTENCIA` → `PROIBIDO`; `DOCUMENTACAO→DESCREDENCIADO` → `PROIBIDO`; `POS_CRED→DESCREDENCIADO` → `LIVRE/SAIDA`.
  - `DESISTENCIA→(antesDaSaida)` → `LIVRE/REATIVACAO`; `DESISTENCIA→outra` → `EXCECAO`.
  - `DESCREDENCIADO→qualquer`: perfil `ADMIN` → `JUSTIFICATIVA/CORRECAO`; `SUPERVISOR` → `PROIBIDO`.
  - `efeitosDeEntradaTim('TIM_CRED_OK', {dataCredenciamento:null}, agora)` → `{dataCredenciamento: agora}`; não sobrescreve se preenchida. `POS_CRED` → `promoStatus:'promovido', tipoCarteira:'recem-entrada'` só se vazios. `ACOMPANHAMENTO` → `statusParceria:'ATIVO'`; `DESISTENCIA` → `'DESISTENTE'`; `DESCREDENCIADO` → `'DESCREDENCIADO'`; reativação para etapa < 7 → `statusParceria: null`.
  - `deveLiberarVenda('TIM_POS_CRED', pronto)` → true; em outra etapa → false.
  - `pendenciasDeCamposTim` com `sistemaGn` null→true e 0 vendedores ativos → `['vendedorAtivo']`; com 1 → `[]`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test -- esteira/tim` PASS.
- [ ] **Step 5: Commit** `feat(esteira): regras da esteira TIM`

### Task 5: Regras Starlink (puras)

**Files:** Create `apps/api/src/modules/esteira/starlink.ts`, `apps/api/src/modules/esteira/starlink.test.ts`; Modify `apps/api/src/cli/esteira-estrutura.ts` (reposicionamento Starlink pela derivação)

**Interfaces — Produces:**
```ts
export type CamposStarlink = { tipoCaptacao, primeiroContatoEm: Date|null, cnpjApto, mei, altCnae, vsm, treinamento, parceiro, contrato, prontoVenda, perdido: boolean|null, vivensisStatus, motivoPerda };
export function derivarEtapaStarlink(c: CamposStarlink): ChaveStarlink;
export function aplicarTravas(antes: CamposStarlink, patch: Partial<CamposStarlink>): CamposStarlink;
export function avaliarMudancaStarlink(antes: CamposStarlink, depois: CamposStarlink): Avaliacao;
export function patchParaColuna(destino: ChaveStarlink, atual: CamposStarlink, agora: Date, motivo?: MotivoPerdaStarlink): Partial<CamposStarlink>;
export function sugereDescarte(c: CamposStarlink): boolean; // cnpjApto=false, mei!==true, altCnae!==true
```
Derivação = lista ordenada da spec 5.2 (perdido → classe do `motivoPerda` via `MOTIVOS_PERDA`; `perdido` sem motivo conta como DEFINITIVO). Travas = lista da spec 5.2, aplicadas **depois** do patch, nesta ordem: vivensis reprovado → perdido; parceiro SIM → perdido NÃO; altCnae SIM → perdido NÃO; perdido SIM → parceiro NÃO; perdido ≠ SIM → motivo null.
`avaliarMudancaStarlink`: (a) algum campo do trilho indo para `true` sem o pré-requisito da tabela da spec 5.2 → `EXCECAO` com os pré-requisitos faltantes; (b) campo respondido (`true`/`false`) indo para `null`, ou `true` indo para `false`, ou `primeiroContatoEm` limpo → `JUSTIFICATIVA/CORRECAO`; (c) `perdido` `true→não-true` com classe DEFINITIVO → `JUSTIFICATIVA/CORRECAO`; com RECUPERAVEL → `LIVRE/REATIVACAO`; (d) `perdido` indo para `true` → `LIVRE/SAIDA` com `exigeMotivo`; (e) resto → `LIVRE/MOVIMENTO`. Se (a) e (b) ocorrem juntos, vence `EXCECAO`. Desvios (`mei`, `altCnae`) não têm pré-requisito.
`patchParaColuna`: destino no trilho marca o campo do destino (`SL_EM_ATENDIMENTO` → `primeiroContatoEm = agora` se nulo; `SL_CREDENCIAMENTO` → `cnpjApto`; …) e, se o destino está **abaixo** da etapa derivada atual, põe `null` nos campos de trilho acima do destino. `SL_MEI` → `{mei:true, cnpjApto:false}`; `SL_ALT_CNAE` → `{altCnae:true}`; `SL_NURTURE`/`SL_DESCARTADO` → `{perdido:true, motivoPerda: motivo}` (lança se faltar motivo ou se a classe do motivo não bate com a coluna); `SL_AGUARDANDO` → tudo do trilho `null`.

- [ ] **Step 1: Testes**, incluindo os da Review Focus 1 e 4:
  - vazio → `SL_AGUARDANDO`; só `primeiroContatoEm` → `SL_EM_ATENDIMENTO`.
  - `{mei:true, cnpjApto:null}` → `SL_EM_ATENDIMENTO` (NULL não é NÃO); `{mei:true, cnpjApto:false}` → `SL_MEI`; `{altCnae:true, cnpjApto:true}` → `SL_CREDENCIAMENTO`.
  - `{treinamento:true, contrato:true}` → `SL_CONTRATO` (furthest wins).
  - `{perdido:true, motivoPerda:'NAO_RESPONDEU', prontoVenda:true}` → `SL_NURTURE`; `'SEM_PERFIL'` → `SL_DESCARTADO`.
  - travas: `aplicarTravas(x, {vivensisStatus:'REPROVADO'})` → `perdido:true, motivoPerda:'REPROVADO_VIVENSIS'`; `{parceiro:true}` sobre perdido → `perdido:false, motivoPerda:null`; `{altCnae:true}` sobre perdido → `perdido:false`; `{perdido:false}` → `motivoPerda:null`.
  - `avaliarMudancaStarlink`: marcar `treinamento` com `vsm:null` → `EXCECAO` com `pendencias` contendo `'vsm'` e `'vivensisStatus'`; com tudo ok → `LIVRE/MOVIMENTO`; `contrato` sem `parceiro` → `EXCECAO`; `cnpjApto` sem `primeiroContatoEm` → `EXCECAO`; `mei:true` de qualquer etapa → `LIVRE`.
  - `patchParaColuna('SL_TREINAMENTO', emProntoVenda)` → `{treinamento:true, parceiro:null, contrato:null, prontoVenda:null}` e `avaliarMudancaStarlink` sobre o resultado → `JUSTIFICATIVA/CORRECAO`.
  - `patchParaColuna('SL_NURTURE', x, agora, 'SEM_PERFIL')` → lança (classe errada).
- [ ] **Step 2:** FAIL. **Step 3:** implementar; completar na CLI da Task 3 o reposicionamento Starlink (`estagioId` = etapa de `derivarEtapaStarlink`). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(esteira): regras da esteira Starlink`

### Task 6: Permissão por operação

**Files:** Create `apps/api/src/modules/esteira/acesso.ts`, `acesso.test.ts`; Modify `apps/api/src/modules/users/users.routes.ts`, `users.service.ts`, `users.schemas.ts`; Modify `apps/api/src/modules/auth/*` (rota `me`) para devolver operações

**Interfaces — Produces:**
```ts
export type AcessoOperacoes = Partial<Record<Operacao, NivelOperacao>>;
export function nivelEfetivo(perfil: Role, linhas: Array<{ operacao: Operacao; nivel: NivelOperacao }>): AcessoOperacoes; // ADMIN → EDICAO nas duas
export function podeForcar(perfil: Role, nivel: NivelOperacao | undefined): boolean;            // ADMIN|SUPERVISOR|GESTOR e EDICAO
export function resolverAcesso(acesso: AcessoOperacoes, operacao: Operacao, exigido: NivelOperacao): 'OK' | 'NAO_ENCONTRADO' | 'PROIBIDO'; // sem acesso → NAO_ENCONTRADO; LEITURA pedindo EDICAO → PROIBIDO
export async function acessoDoUsuarioAtual(): Promise<AcessoOperacoes>;                         // memoizado por requisição (use `memoizado` de lib/tenant)
export function exigirOperacao(nivel: NivelOperacao): RequestHandler; // lê req.params.operacao via operacaoDaUrl; 404 se inválida/sem acesso; 403 se só LEITURA; põe res.locals.operacao e res.locals.nivel
export async function filtroOperacoesPermitidas(): Promise<Prisma.CredenciamentoWhereInput>;   // { operacao: { in: [...] } }, NADA se nenhuma
```
Endpoints (ADMIN): `GET /api/usuarios/:id/operacoes` → `{ operacoes: AcessoOperacoes }`; `PUT /api/usuarios/:id/operacoes` body `{ TIM?: 'LEITURA'|'EDICAO'|null, STARLINK?: … }` (null remove). A sessão (`/api/auth/me` ou equivalente que o front usa para `useAuth`) passa a incluir `operacoes: AcessoOperacoes`.

- [ ] **Step 1: Testes**: `nivelEfetivo('ADMIN', [])` → ambas EDICAO; `nivelEfetivo('COMERCIAL', [{TIM,LEITURA}])` → `{TIM:'LEITURA'}`; `podeForcar('GESTOR','EDICAO')` true, `('COMERCIAL','EDICAO')` false, `('SUPERVISOR','LEITURA')` false; `resolverAcesso({TIM:'EDICAO'}, 'STARLINK','LEITURA')` → `'NAO_ENCONTRADO'`; `({TIM:'LEITURA'},'TIM','EDICAO')` → `'PROIBIDO'`. Teste do middleware no estilo de `credenciamentos.routes.guard.test.ts` (mock de `prisma.usuarioOperacao.findMany`): `/starlink` para usuário só-TIM chama `next` com erro 404.
- [ ] **Step 2:** FAIL. **Step 3:** implementar + endpoints de usuário + `me`. **Step 4:** PASS + typecheck.
- [ ] **Step 5: Commit** `feat(esteira): permissao por operacao`

---

## Fase B — Serviço e API

### Task 7: Vínculo — criar, obter, mover

**Files:** Create `apps/api/src/modules/esteira/vinculos.service.ts`, `vinculos.test.ts`, `esteiras.routes.ts`, `esteiras.schemas.ts`; Modify `apps/api/src/app.ts` (montar `app.use('/api/esteiras', esteirasRoutes)`), `apps/api/src/modules/crm/credenciamentos.service.ts` (remover a regra de `segmentoParceiro` de `criarCredenciamento`; ela passa a delegar para `criarVinculo`)

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6.
- Produces:
```ts
export function chaveDeUnicidade(v: { operacao: Operacao; contaId: string | null; contatoId: string }): string; // `${operacao}:conta:${contaId}` ou `${operacao}:contato:${contatoId}`
export async function criarVinculo(operacao: Operacao, input: CriarVinculoInput): Promise<VinculoDetalhe>;
export async function obterVinculo(operacao: Operacao, id: string): Promise<VinculoDetalhe>;
export async function moverVinculo(operacao: Operacao, id: string, input: { paraChave: ChaveEtapa; justificativa?: string; motivo?: string; motivoPerda?: MotivoPerdaStarlink }): Promise<VinculoDetalhe>;
export type VinculoResumo = { id; operacao; parceiro: { contatoId; contaId; nome; cnpj; cpf; telefone; cidade; uf }; responsavel; etapa: { chave; nome; tipo; diasParado }; diasNaEtapa; parado: boolean; ultimaInteracaoEm; etiquetas: string[]; destinos: Record<ChaveEtapa, Avaliacao['resultado']> };
export type VinculoDetalhe = VinculoResumo & { campos: CamposTim | CamposStarlink; vendedores?: PdvVendedor[]; notas; historico; auditoria; situacao: 'EM_ANDAMENTO'|'DESISTENTE'|'DESCREDENCIADO'|'NURTURE'|'DESCARTADO'; motivoSituacao; prontoTim?: boolean; avisos: string[] };
```
Rotas: `POST /api/esteiras/:operacao/vinculos` (EDICAO), `GET /api/esteiras/:operacao/vinculos/:id` (LEITURA), `POST /api/esteiras/:operacao/vinculos/:id/mover` (EDICAO). Todas com `requireAuth`, `requireModulo('esteira')`, `exigirOperacao(...)`. Vínculo de outra operação ou fora da carteira (`politicaCredenciamentos`) → 404.
Erros de `moverVinculo` (via `AppError`, `details`): sem justificativa quando `JUSTIFICATIVA`/`EXCECAO` → **409** `code:'EXIGE_JUSTIFICATIVA'`, `details:{ resultado, pendencias }`; `EXCECAO` e `!podeForcar` → **403** `code:'EXCECAO_NAO_AUTORIZADA'`, `details:{ pendencias }`; `PROIBIDO` → **400** `code:'TRANSICAO_PROIBIDA'`; saída sem motivo → **400** `code:'EXIGE_MOTIVO'`. (`AppError` aceita `code` custom — adicionar fábricas em `lib/errors.ts` se preciso.)
Gravação (uma transação): TIM — etapa nova + `efeitosDeEntradaTim` + `estagioAntesDaSaidaId` ao sair; Starlink — `patchParaColuna` → `aplicarTravas` → `avaliarMudancaStarlink` → etapa = `derivarEtapaStarlink`; ambos: `estagioDesde`, `ultimaInteracaoEm`, `situacaoDesde`/`motivoSituacao`/`classeMotivo`, histórico (`tipo` da avaliação, ou `EXCECAO` quando forçado; `motivo` = justificativa/motivo), auditoria dos campos alterados (Task 8 fornece `diferencas`; nesta tarefa grave só histórico e deixe o ponto de chamada). Depois da transação: TIM — se `deveLiberarVenda`, mover sozinho para `TIM_VENDA_LIBERADA` com histórico `AUTOMATICO`; iniciar `CicloParceiro` ao entrar em `TIM_ACOMPANHAMENTO` ou `SL_PRONTO_VENDA` (ajustar `iniciarCiclos` em `cicloParceiro.service.ts` para decidir por `papelDaChave`/chave em vez do nome, e pré-marcar etapas de implantação: TIM → `TREINAMENTO` e `LIBERACAO_ACESSO`; Starlink → `TREINAMENTO`).
`moverVinculo` recusa `paraChave` que não pertence ao catálogo da `operacao` da rota (400 `TRANSICAO_PROIBIDA`) — é a trava contra mover entre fluxos. `avisos` inclui `'DADOS_PENDENTES'` quando a etapa atual está além de um gate cujos campos estão vazios (registros migrados — spec 7) e, no Starlink, `'SUGERE_DESCARTE'` quando `sugereDescarte`.
`criarVinculo`: acha/cria parceiro (CNPJ → `Account`; senão contato por CPF/telefone) — reaproveite as funções de contato/conta existentes; checa unicidade (409 `'Este parceiro já está nesta esteira'`); cria vínculo na 1ª etapa do trilho + linha 1:1 da operação + `ContactOperation`/`AccountOperation` upsert; histórico de entrada. `destinos` calcula, para cada coluna, o resultado da avaliação (TIM: `avaliarMovimentoTim`; Starlink: `avaliarMudancaStarlink(antes, aplicarTravas(antes, patchParaColuna(...)))`, saídas como `LIVRE`).

- [ ] **Step 1: Testes puros** em `vinculos.test.ts`: `chaveDeUnicidade` (conta vence contato; operações diferentes → chaves diferentes); e a função pura `situacaoDaEtapa(tipo, chave): VinculoDetalhe['situacao']` (`TIM_DESISTENCIA`→`DESISTENTE`, `SL_NURTURE`→`NURTURE`, `NORMAL`/`DESVIO`→`EM_ANDAMENTO`) e `errosDeMovimento(avaliacao, { justificativa, perfil, nivel, motivo })` → `null | { status, code }` cobrindo os quatro erros acima.
- [ ] **Step 2:** FAIL. **Step 3:** implementar serviço + rotas + ajuste do `iniciarCiclos`. **Step 4:** `npm test` + `npm run typecheck` PASS.
- [ ] **Step 5: Commit** `feat(esteira): criar, obter e mover vinculo por operacao`

### Task 8: Campos, vendedores, notas e auditoria

**Files:** Create `apps/api/src/modules/esteira/auditoria.ts`, `auditoria.test.ts`; Modify `vinculos.service.ts`, `esteiras.routes.ts`, `esteiras.schemas.ts`

**Interfaces — Produces:**
```ts
export function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>): Array<{ campo: string; de: unknown; para: unknown }>; // Date comparada por getTime; null vs undefined = sem mudança
export async function editarCampos(operacao: Operacao, id: string, input: { campos: Partial<CamposTim> | Partial<CamposStarlink>; responsavelId?: string | null; observacoes?: string | null; justificativa?: string }): Promise<VinculoDetalhe>;
export async function adicionarNota(operacao: Operacao, id: string, texto: string): Promise<VinculoDetalhe>;
export async function salvarVendedor(operacao: 'TIM', id: string, v: { id?: string; nome: string; cpf?: string|null; telefone?: string|null; status: StatusVendedor }): Promise<VinculoDetalhe>;
```
Rotas: `PATCH /vinculos/:id` (EDICAO), `POST /vinculos/:id/notas` (EDICAO), `PUT /vinculos/:id/vendedores` e `DELETE /vinculos/:id/vendedores/:vendedorId` (EDICAO; só TIM — Starlink → 404).
Regras: TIM — `pendenciasDeCamposTim` não vazia → mesmo fluxo de erro da Task 7 (exceção autorizada); `matriculaSappdv` só editável a partir de `TIM_CRED_OK`; depois de gravar, checar `deveLiberarVenda` (mesmo caminho automático da Task 7); `prontoTim` deixou de ser verdadeiro em etapa ≥ 6 → aviso em `avisos`, sem mover. Starlink — `aplicarTravas` → `avaliarMudancaStarlink` → etapa derivada; mudar etapa por edição grava histórico igual a mover; `perdido`, `altCnae`, `vivensisStatus` exigem EDICAO (já garantido pela rota). Nota: grava `CredenciamentoNota`, `ultimaInteracaoEm`, e no Starlink carimba `primeiroContatoEm` se nulo (vai a "Em atendimento"). Toda mudança de campo, responsável, observação, vendedor → `CredenciamentoAuditoria` (uma linha por campo, com `operacao`).

- [ ] **Step 1: Testes** `diferencas`: datas iguais em instâncias diferentes → sem diferença; `null`→`false` → diferença; chave ausente no `depois` → ignorada.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + typecheck.
- [ ] **Step 5: Commit** `feat(esteira): edicao de campos, vendedores PDV, notas e auditoria`

### Task 9: Consultas — estrutura, filtros, Kanban e Lista

**Files:** Create `apps/api/src/modules/esteira/colunas.ts`, `filtros.ts`, `filtros.test.ts`, `consultas.service.ts`; Modify `esteiras.routes.ts`, `esteiras.schemas.ts`

**Interfaces — Produces:**
```ts
// colunas.ts
export type ColunaEsteira = { chave: string; rotulo: string; tipo: 'texto'|'data'|'booleano3'|'enum'|'numero'; opcoes?: Array<{ valor: string; rotulo: string }>; editavel: boolean; padrao: boolean; ordenavel: boolean };
export const COLUNAS: Record<Operacao, ColunaEsteira[]>;  // comuns (parceiro, cnpj, cpf, telefone, cidade, uf, responsavel, etapa, situacao, diasNaEtapa, ultimaInteracaoEm, criadoEm) + específicas da spec 4.5/4.6
export function valorDaColuna(v: VinculoDetalhe | VinculoLinha, chave: string): string | number | boolean | null;
// filtros.ts
export type FiltrosEsteira = { busca?: string; responsavelIds?: string[]; ufs?: string[]; cidades?: string[]; etapas?: ChaveEtapa[]; situacoes?: VinculoDetalhe['situacao'][]; periodoCampo?: 'criadoEm'|'estagioDesde'; desde?: Date; ate?: Date; paradoHaMaisDe?: number; origem?: string[];
  tim?: { dep?: DepTim[]; trafegoPago?: boolean; vendaLiberada?: boolean }; starlink?: { tipoCaptacao?: TipoCaptacao[]; vivensis?: VivensisStatus[]; vsm?: 'SIM'|'NAO'|'VAZIO' } };
export function whereDosFiltros(operacao: Operacao, f: FiltrosEsteira, agora: Date): Prisma.CredenciamentoWhereInput;
export function parseFiltros(query: Record<string, unknown>): FiltrosEsteira; // zod; listas vêm como CSV na query string
```
`busca` casa nome do contato/conta, `cnpj` e `cpf` (só dígitos), telefone, cidade. `paradoHaMaisDe` → `estagioDesde < agora - n dias`. `vendaLiberada` → as três condições de `prontoTim` no `where`. Sempre: `{ operacao }`, `arquivadoEm: null`, `politicaCredenciamentos`, `filtroOperacoesPermitidas`.
Rotas (LEITURA):
- `GET /api/esteiras/:operacao/estrutura` → `{ operacao, etapas: Array<EtapaCatalogo & { id; nome; diasParado; ativa }>, colunas: ColunaEsteira[], motivosPerda, filtrosEspecificos, nivel, podeForcar }`.
- `GET /kanban?…filtros&porColuna=50` → `{ colunas: Array<{ chave; total; itens: VinculoResumo[]; proximoCursor: string|null }> }`; `GET /kanban/coluna/:chave?cursor=…` → mais itens de uma coluna. Ordenação dentro da coluna: `estagioDesde asc` (mais antigo primeiro), cursor = `estagioDesde|id`.
- `GET /lista?…filtros&pagina=1&tamanho=50&ordenarPor=<chave da coluna ordenável>&direcao=asc|desc` → `{ total, pagina, linhas: VinculoLinha[] }` (`VinculoLinha` = `VinculoResumo` + valores de todas as colunas, sem `destinos`).
`parado` = `diasNaEtapa >= (etapa.diasParado ?? 7)`. **[decisão: padrão 7 dias quando a etapa não define]**

- [ ] **Step 1: Testes** `filtros.test.ts`: `whereDosFiltros('TIM', {})` contém `operacao:'TIM'` e `arquivadoEm:null`; `busca:'12.345.678/0001-90'` gera condição com `'12345678000190'`; `paradoHaMaisDe: 5` com `agora` fixo gera `estagioDesde.lt` = agora − 5 dias; `starlink.vsm:'VAZIO'` gera `vsm: null` (não `false`); `parseFiltros({ ufs: 'GO,TO' })` → `['GO','TO']`; `tim` em filtros da Starlink é ignorado.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + typecheck.
- [ ] **Step 5: Commit** `feat(esteira): estrutura, filtros, kanban paginado e lista`

### Task 10: Funil

**Files:** Create `apps/api/src/modules/esteira/funil.ts`, `funil.test.ts`; Modify `consultas.service.ts`, `esteiras.routes.ts`

**Interfaces — Produces:**
```ts
export type EntradaFunil = { trilhoMaximo: number; saiuNoTrilho: number | null; diasPorTrilho: Record<number, number> };
export type EtapaFunil = { trilho: number; chave: ChaveEtapa; nome: string; alcancaram: number; conversaoParaProxima: number | null; saidas: number; medianaDias: number | null; gargalo: boolean };
export function calcularFunil(entradas: EntradaFunil[], etapasTrilho: Array<{ trilho: number; chave: ChaveEtapa; nome: string }>): EtapaFunil[];
export async function funilDaOperacao(operacao: Operacao, filtros: FiltrosEsteira, periodo: { desde: Date; ate: Date }): Promise<{ periodo; total: number; etapas: EtapaFunil[] }>;
```
Coorte = vínculos com `criadoEm` no período (mais os filtros). `trilhoMaximo` = maior `trilho` entre as etapas de destino no histórico e a etapa atual (vale para TIM e Starlink — o histórico Starlink é gravado a cada mudança de etapa derivada). `saiuNoTrilho` = trilho da etapa de onde saiu para uma SAIDA. `diasPorTrilho` = soma de `segundosNoEstagio`/86400 por trilho. `conversaoParaProxima = alcancaram[n+1]/alcancaram[n]` (null na última ou quando `alcancaram[n]=0`). `gargalo` = etapa com menor conversão (empate: maior mediana); só uma marcada.
Rota (LEITURA): `GET /api/esteiras/:operacao/funil?…filtros&desde&ate&compararDesde&compararAte` → `{ atual, comparado? }`.

- [ ] **Step 1: Testes** `calcularFunil`: 10 entradas, 6 chegam ao trilho 3, 3 ao 4 → `alcancaram` `[10,…,6,3]`, conversão 3→4 = 0.5; saída marcada no trilho certo; mediana de `[1,3,10]` = 3; sem entradas → todas as etapas com 0 e conversões `null`, nenhum gargalo.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(esteira): funil por operacao com comparacao de periodos`

### Task 11: Exportação e importação (CSV/XLSX)

**Files:** Create `apps/api/src/modules/esteira/planilhas.service.ts`, `planilhas.test.ts`; Modify `esteiras.routes.ts`; Modify `apps/api/package.json` (dependência `exceljs`)

**Interfaces — Produces:**
```ts
export function linhasDeExportacao(linhas: VinculoLinha[], colunas: ColunaEsteira[]): Array<Record<string, string>>; // booleano3 → 'Sim'|'Não'|'' ; datas dd/mm/aaaa
export function mapearCabecalhos(cabecalhos: string[], colunas: ColunaEsteira[]): Record<string, string | null>;       // por rótulo ou chave, sem acento/caixa
export type LinhaImportada = { linha: number; erros: string[]; parceiro: { cnpj?; cpf?; telefone?; nome; cidade?; uf? }; etapa?: ChaveEtapa; responsavelEmail?: string; campos: Partial<CamposTim> | Partial<CamposStarlink> };
export function validarLinha(operacao: Operacao, bruta: Record<string, string>, mapa: Record<string, string | null>): LinhaImportada;
export async function exportar(operacao: Operacao, filtros: FiltrosEsteira, colunas: string[], formato: 'csv' | 'xlsx'): Promise<{ arquivo: Buffer; nome: string; tipo: string }>;
export async function importar(operacao: Operacao, arquivo: { buffer: Buffer; nome: string }, mapa: Record<string, string | null> | null, previa: boolean): Promise<{ cabecalhos: string[]; mapa; total: number; validas: number; criadas: number; atualizadas: number; erros: Array<{ linha: number; erros: string[] }> }>;
```
Exportação: `GET /api/esteiras/:operacao/exportar?formato=csv|xlsx&colunas=a,b,…&…filtros` (LEITURA, e só perfis que já exportam hoje — **não** SUPORTE nem AGENTE, como em `modules/dados`). Usa a mesma consulta da Lista sem paginação, mesmas permissões; grava `RegistroEsteira { acao: EXPORTACAO, detalhe: { filtros, colunas, quantidade, formato } }`. CSV via `gerarCsv` de `modules/dados/csv.ts`; XLSX via `exceljs`.
Importação: `POST /api/esteiras/:operacao/importar` multipart (`arquivo`, `mapa` JSON opcional, `previa` boolean) — EDICAO + ADMIN/SUPERVISOR. CSV via `lerCsv`; XLSX: primeira planilha, primeira linha = cabeçalho. Por linha válida: acha/cria parceiro (CNPJ > CPF > telefone), cria ou **atualiza** o vínculo desta operação (idempotente; nunca toca o vínculo da outra), grava campos; etapa: TIM = coluna "Etapa" (nome ou chave), Starlink = campos (a coluna "Etapa", se vier, vira `patchParaColuna`); **sem gates**; histórico `IMPORTACAO`. Grava `RegistroEsteira { acao: IMPORTACAO }`. Limite 5 MB / 10 mil linhas.

- [ ] **Step 1: Testes** `planilhas.test.ts`: `linhasDeExportacao` com `vsm:null` → `''`, `false` → `'Não'`; `mapearCabecalhos(['CNPJ','Matrícula SAPPDV','xpto'])` (TIM) → `cnpj`, `matriculaSappdv`, `null`; `validarLinha` sem CNPJ/CPF/telefone → erro "Informe CNPJ, CPF ou telefone"; UF inválida → erro; `dep:'parceiro'` → `'PARCEIRO'`; linha Starlink com coluna `dep` → ignorada (campo de outra operação).
- [ ] **Step 2:** FAIL. **Step 3:** `npm install exceljs -w @plataforma/api`; implementar. **Step 4:** PASS + typecheck.
- [ ] **Step 5: Commit** `feat(esteira): exportacao e importacao CSV/XLSX por operacao`

### Task 12: Preferências e configuração das etapas

**Files:** Create `apps/api/src/modules/esteira/preferencias.routes.ts`; Modify `estrutura.service.ts`, `esteiras.routes.ts`, `app.ts`

**Interfaces — Produces:**
- `GET /api/preferencias?prefixo=esteira:` → `{ preferencias: Record<string, unknown> }` (só do usuário atual); `PUT /api/preferencias/:chave` body `{ valor }` → 204. Chave: `/^[a-z0-9:_-]{1,80}$/i`; `valor` serializado ≤ 32 KB (413 acima).
- `PATCH /api/esteiras/:operacao/etapas/:chave` (ADMIN) body `{ nome?: string (1–60); diasParado?: number|null (1–365) }` → etapa atualizada. Não permite mudar ordem/tipo/chave nem apagar.
- [ ] **Step 1: Teste** do validador de chave/tamanho (função pura `validarPreferencia(chave, valor)` → `null | mensagem`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(esteira): preferencias do usuario e configuracao de etapas`

### Task 13: Telas dependentes no backend

**Files:** Modify `apps/api/src/modules/crm/credenciamentos.indicadores.ts`, `credenciamentos.routes.ts`, `credenciamentos.service.ts`, `apps/api/src/modules/campaigns/publico.service.ts`, `apps/api/src/modules/crm/ficha.service.ts`, `apps/api/src/modules/crm/assistente.service.ts`, `apps/api/src/modules/crm/cicloParceiro.service.ts`

**Requisitos:**
- Toda consulta a `credenciamento` nesses arquivos ganha `filtroOperacoesPermitidas()` e `arquivadoEm: null`; papel da etapa sempre por `papelDaChave(estagio.chave)` (selecionar `chave` junto).
- `painelOperacoes`/`gestaoOperacao`/`desempenhoOperacional`: agrupar por `operacao` (não pelo nome do funil); `tempoPorEtapa` agrupa por `(operacao, chave)` — corrige a mistura atual; "pendentes"/"ativos" pelos papéis da spec 4.7; saídas fora das duas contagens.
- `publico.service.ts`: `ATIVOS`/`PENDENTES` por papel via chave; usuário sem a operação não monta público com ela.
- `ficha.service.ts` / `CredenciamentosDaEmpresa`: vínculos e linha do tempo com `operacao` em cada item, só operações permitidas.
- `assistente.service.ts`: mesma filtragem.
- Rotas antigas `/api/credenciamentos` `GET /`, `GET /kanban`, `POST /`, `PATCH /:id`, `POST /importar-contatos-classificados`: remover depois que a Task 21 migrar o front (deixe marcadas com `@deprecated` aqui e apague na Task 21). `GET /funis` passa a devolver só as operações permitidas, com `operacao`.
- [ ] **Step 1: Teste** puro novo em `credenciamentos.indicadores` (extrair `agruparTempoPorEtapa(registros: Array<{operacao; chave; segundos}>)`) provando que `TIM_CRED_OK` e uma etapa Starlink de mesmo nome não se misturam.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test` + typecheck PASS.
- [ ] **Step 5: Commit** `fix(esteira): indicadores, campanhas, ficha e assistente respeitam operacao`

---

## Fase C — Front

### Task 14: Casca da página, estado na URL e preferências

**Files:** Create `apps/web/src/pages/esteira/estadoEsteira.ts`, `estadoEsteira.test.ts`, `usePreferenciaEsteira.ts`, `BarraDeFiltros.tsx`; Modify `apps/web/src/pages/esteira/EsteiraPage.tsx` (vira casca), `apps/web/src/App.tsx` (rotas `/esteira` e `/esteira/:operacao`), `apps/web/src/components/layout/nav.ts` e `Sidebar.tsx` (menu aparece se `operacoes` da sessão não for vazio), `apps/web/src/lib/types.ts` (tipos da API: `EstruturaEsteira`, `VinculoResumo`, `VinculoDetalhe`, `VinculoLinha`, `EtapaFunil`, `FiltrosEsteira`, `Avaliacao`), `apps/web/src/features/auth/*` (sessão com `operacoes`)

**Interfaces — Produces:**
```ts
export type Visao = 'kanban' | 'funil' | 'lista';
export type PreferenciaEsteira = { visao: Visao; filtros: FiltrosEsteira; lista: { colunas: string[]; larguras: Record<string, number>; ordenacao: { chave: string; direcao: 'asc'|'desc' } | null }; kanban: { recolhidas: string[]; densidade: 'compacta'|'detalhada'; camposOcultos: Array<'responsavel'|'cidade'|'etiquetas'|'ultimaInteracao'> }; favoritos: Array<{ nome: string; filtros: FiltrosEsteira }> };
export function preferenciaPadrao(estrutura: EstruturaEsteira): PreferenciaEsteira; // visao 'kanban'; colunas = as com padrao=true; desvios e saídas recolhidos
export function normalizarPreferencia(valor: unknown, estrutura: EstruturaEsteira): PreferenciaEsteira; // tolera lixo/versões antigas; descarta colunas e etapas que não existem
export function estadoDaUrl(search: string): { visao?: Visao; filtros?: Partial<FiltrosEsteira> };
export function urlDoEstado(visao: Visao, filtros: FiltrosEsteira): string;           // só filtros não vazios
export function queryDosFiltros(f: FiltrosEsteira): URLSearchParams;                    // formato aceito por parseFiltros (Task 9)
export function usePreferenciaEsteira(operacao: Operacao, estrutura: EstruturaEsteira | null): { pref: PreferenciaEsteira | null; atualizar: (p: Partial<PreferenciaEsteira>) => void }; // GET uma vez; PUT com debounce 800 ms
```
Comportamento: `/esteira` → redireciona para `/esteira/<ultimaOperacao ou primeira permitida>`; operação sem acesso → primeira permitida. Precedência: URL > preferência > padrão. Trocar visão mantém filtros (mesmo estado); trocar operação carrega a preferência daquela operação e grava `esteira:ultimaOperacao`. Cabeçalho: `Operação: [TIM] [STARLINK]` (só permitidas) e `Visualização: [Kanban] [Funil] [Lista]` com `Segmentado` de `components/ui/Pagina.tsx`. `BarraDeFiltros`: filtros comuns + específicos vindos de `estrutura.filtrosEspecificos`, favoritos (salvar/aplicar/apagar), "Limpar".
- [ ] **Step 1: Testes** `estadoEsteira.test.ts`: `urlDoEstado('lista', {ufs:['GO']})` → contém `visao=lista` e `ufs=GO`; ida e volta `estadoDaUrl(urlDoEstado(x))` preserva `x`; `normalizarPreferencia({visao:'xpto', lista:{colunas:['naoExiste','cnpj']}}, estrutura)` → `visao:'kanban'`, colunas `['cnpj']`; `normalizarPreferencia(null, e)` = `preferenciaPadrao(e)`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npm test -- estadoEsteira` PASS; `npm run typecheck -w @plataforma/web` PASS.
- [ ] **Step 5: Commit** `feat(web): esteira por operacao com estado na URL e preferencias salvas`

### Task 15: Kanban

**Files:** Create `apps/web/src/pages/esteira/KanbanView.tsx`, `CartaoVinculo.tsx`, `DialogoMovimento.tsx`; Modify `EsteiraPage.tsx`

**Requisitos (spec 6.1):** colunas na `ordem` da estrutura; desvios/saídas recolhíveis (estado em `pref.kanban.recolhidas`), contagem por coluna (`total`), "Carregar mais" via `/kanban/coluna/:chave`; densidade compacta/detalhada e menu "Exibir no cartão" que oculta informações secundárias (`pref.kanban.camposOcultos`); cartão com nome, cidade/UF, responsável, etiquetas, última interação e selo "Parado há X dias" quando `parado`. Arraste HTML5 nativo (manter o atual): durante o arraste, colunas cujo `destinos[chave]` é `PROIBIDO` ficam desabilitadas; `LIVRE` move direto; `JUSTIFICATIVA`/`EXCECAO` (esta só se `estrutura.podeForcar`, senão desabilitada com tooltip das pendências) abrem `DialogoMovimento` (justificativa obrigatória, lista de pendências); saídas abrem o diálogo pedindo motivo (Starlink: select de `motivosPerda` filtrado pela classe da coluna; TIM: texto). Resposta 409/403/400 da API (Task 7) também cai no diálogo — a UI nunca é a única barreira. Clique no cartão abre a gaveta (Task 16). Mobile: rolagem horizontal com `scroll-snap` por coluna.
- [ ] **Step 1:** implementar; `npm run typecheck -w @plataforma/web` PASS.
- [ ] **Step 2: Verificar no app** (skill `run` ou `npm run dev:web` com API local): arrastar livre, arrastar com gate (diálogo), destino proibido desabilitado, recolher coluna e recarregar a página (continua recolhida). Registrar o que foi visto no commit.
- [ ] **Step 3: Commit** `feat(web): kanban da esteira com regras de movimento`

### Task 16: Gaveta do vínculo

**Files:** Create `apps/web/src/pages/esteira/DetalheVinculo.tsx`, `CamposTim.tsx`, `CamposStarlink.tsx`, `BotaoTriEstado.tsx`; remover `DetalheCredenciamento`/`FormExcecao` de `EsteiraPage.tsx`

**Requisitos:** usa `Gaveta`. Abas: Dados (cadastro central só leitura com link para a ficha; responsável; observações), Operação (campos da operação), Notas, Histórico (tipo, de→para, usuário, data, motivo/justificativa), Auditoria. "Mover para…" (select com os mesmos `destinos`/diálogo da Task 15 — caminho de teclado/toque). TIM: campos da spec 4.5 agrupados por etapa (Negociação: origem, tráfego pago, status descritivo, dep; Credenciamento: data, matrícula, promo status; PDV: tipo de carteira, 5 sistemas, compra de chip, treinamento, lista de vendedores com adicionar/editar/inativar), selo "Venda liberada: Sim/Não". Starlink: `BotaoTriEstado` (SIM/NÃO; clicar no ativo volta a vazio) para cada tri-estado, `vivensisStatus`, `tipoCaptacao`, motivo de perda; etiqueta da etapa derivada atualiza após salvar; quando `avisos` traz `SUGERE_DESCARTE`, mostrar ação "Descartar por CNPJ irregular". Erros 409/403 de edição abrem o `DialogoMovimento`. Leitura (`nivel = LEITURA`) → tudo desabilitado. Somente campos com `editavel` liberados.
- [ ] **Step 1:** implementar; typecheck PASS.
- [ ] **Step 2: Verificar no app**: marcar `treinamento` sem VSM (pede exceção), clicar duas vezes no SIM (volta a vazio), adicionar vendedor e ligar sistema, nota aparece no histórico/auditoria.
- [ ] **Step 3: Commit** `feat(web): gaveta do vinculo com campos por operacao`

### Task 17: Lista

**Files:** Create `apps/web/src/pages/esteira/ListaView.tsx`, `SeletorDeColunas.tsx`; Modify `apps/web/src/components/ui/Table.tsx` (props opcionais `larguras`, `aoRedimensionar(chave, px)`, `aoReordenar(chaves)` — sem quebrar usos atuais)

**Requisitos (spec 6.3):** `/lista` paginada (50), ordenação por clique no cabeçalho, seletor de colunas (mostrar/ocultar/ordem), largura por arraste na borda do cabeçalho, tudo salvo em `pref.lista`; edição rápida inline para colunas `editavel` (texto/enum/booleano3) chamando `PATCH /vinculos/:id` com tratamento dos erros da Task 7; seleção em lote; botões "Exportar CSV" / "Exportar XLSX" (usam filtros + colunas visíveis + seleção se houver; reaproveitar o padrão de `baixarCsv` de `lib/api.ts` para baixar blob); linha abre a gaveta; mobile = cartões (comportamento atual do `Table`).
- [ ] **Step 1:** implementar; typecheck PASS; `npm test` (Table não deve quebrar outros testes).
- [ ] **Step 2: Verificar no app**: esconder coluna, redimensionar, recarregar (mantido); exportar com filtro de UF e conferir que o arquivo só traz aquela UF.
- [ ] **Step 3: Commit** `feat(web): lista da esteira com colunas configuraveis e exportacao`

### Task 18: Funil

**Files:** Create `apps/web/src/pages/esteira/FunilView.tsx`

**Requisitos (spec 6.2):** barras horizontais por etapa do trilho (reusar `BarList`/`StatTile` de `components/viz/` se servirem), número que alcançou, % de conversão entre etapas, saídas por etapa, mediana de dias, gargalo destacado; seletor de período (padrão últimos 90 dias **[decisão]**) e "Comparar com" período anterior (colunas lado a lado); clique numa etapa → troca para Lista com `etapas=[chave]` mantendo os demais filtros. Carregar o skill `dataviz` antes de escrever o gráfico.
- [ ] **Step 1:** implementar; typecheck PASS.
- [ ] **Step 2: Verificar no app** com dados `[TESTE]`: números batem com a Lista filtrada pela mesma coorte.
- [ ] **Step 3: Commit** `feat(web): funil da esteira por operacao`

### Task 19: Novo parceiro, importação e "adicionar à operação"

**Files:** Create `apps/web/src/pages/esteira/NovoParceiro.tsx` (substitui o atual), `ImportarPlanilha.tsx`; Modify `apps/web/src/pages/crm/ficha/CredenciamentosDaEmpresa.tsx`, `apps/web/src/pages/crm/EnviarParaCredenciamento.tsx`

**Requisitos:** Novo parceiro na operação ativa: busca por CNPJ/CPF/telefone (mostra se já existe e em quais operações), cria vínculo via `POST /vinculos`; 409 mostra "já está nesta esteira" com link para abrir o card. Importar (ADMIN/SUPERVISOR com EDICAO): upload CSV/XLSX → prévia (`previa=true`) com mapa de colunas editável (select por cabeçalho com as `colunas` da estrutura) e erros por linha → confirmar → resumo (criadas/atualizadas/erros). Ficha da empresa: lista vínculos por operação (só permitidas) e botão "Adicionar à TIM/Starlink" quando não houver. `EnviarParaCredenciamento` passa a escolher a operação livremente (sem a trava de `segmentoParceiro`). Remover o fluxo antigo "importar contatos classificados" da EsteiraPage.
- [ ] **Step 1:** implementar; typecheck PASS.
- [ ] **Step 2: Verificar no app**: importar planilha `[TESTE]` de 3 linhas duas vezes (segunda atualiza, não duplica); mesmo CNPJ adicionado à outra operação aparece nas duas esteiras.
- [ ] **Step 3: Commit** `feat(web): cadastro manual e importacao por planilha na esteira`

### Task 20: Configurações — operações por usuário e etapas

**Files:** Modify `apps/web/src/pages/configuracoes/UsuariosTab.tsx`; Create `apps/web/src/pages/configuracoes/EsteirasTab.tsx`; Modify `ConfiguracoesPage.tsx`

**Requisitos:** no editar usuário (ADMIN): duas linhas TIM/Starlink com `Sem acesso | Leitura | Edição` (`GET/PUT /api/usuarios/:id/operacoes`). Aba "Esteiras" (ADMIN): por operação, lista das etapas (ordem fixa, tipo como etiqueta) com nome editável e "dias para considerar parado" (`PATCH /etapas/:chave`).
- [ ] **Step 1:** implementar; typecheck PASS.
- [ ] **Step 2: Verificar no app**: tirar Starlink de um usuário de teste → menu só mostra TIM; `/esteira/starlink` redireciona; renomear etapa reflete no Kanban.
- [ ] **Step 3: Commit** `feat(web): configuracao de operacoes por usuario e etapas das esteiras`

### Task 21: Telas dependentes no front e limpeza

**Files:** Modify `apps/web/src/pages/dashboard/PainelOperacoes.tsx`, `GestaoPage.tsx`, `DesempenhoPage.tsx`, `crm/AcompanhamentosTab.tsx`, `crm/ficha/CicloDoParceiro.tsx`, `campanhas/MontarPublico.tsx`, `apps/web/src/lib/types.ts`; Modify `tests/e2e/esteira.spec.ts`; Delete rotas `@deprecated` da Task 13 em `credenciamentos.routes.ts`/`.service.ts`/`.schemas.ts` e `segmentoParceiro` como trava

**Requisitos:** telas usam `operacao` (rótulo "TIM"/"Starlink"), nomes de etapa vindos da API, consolidados rotulados "TIM + Starlink"; seletores de operação só com as permitidas. `rg "situacaoExcecao|SITUACOES_EXCECAO|/credenciamentos/kanban|importar-contatos-classificados" apps/` não encontra uso ativo (só migration/legado documentado). E2E `esteira.spec.ts` reescrito para: abrir `/esteira/tim`, criar `[TESTE]` parceiro, mover para a 2ª etapa, abrir gaveta, ver histórico; trocar para Lista e para Funil mantendo filtro.
- [ ] **Step 1:** implementar; `npm test`, `npm run typecheck`, `npm run build` PASS.
- [ ] **Step 2: Commit** `refactor(esteira): telas dependentes por operacao e remocao da API antiga`

### Task 22: Verificação final e smoke

**Files:** Create `scripts/smoke-esteiras.mjs`; Modify `package.json` (script `smoke:esteiras`)

**Requisitos:** smoke contra API local, **opt-in** (exige `SMOKE_ESTEIRAS=1`), cria tudo com prefixo `[TESTE]` e apaga no `finally`. Roteiro: login admin; criar parceiro CNPJ X na TIM; criar o mesmo na Starlink (201); repetir TIM (409); mover TIM pulando etapa sem justificativa (409 `EXIGE_JUSTIFICATIVA`) e com justificativa como ADMIN (200, histórico `EXCECAO`); Starlink marcar `treinamento` sem VSM (409); usuário de teste só-TIM: `GET /esteiras/starlink/vinculos/<id>` → 404 e export Starlink → 404; exportar TIM CSV filtrado e conferir linhas; importar a mesma planilha 2× (2ª só atualiza).
- [ ] **Step 1:** escrever o smoke; rodar `SMOKE_ESTEIRAS=1 npm run smoke:esteiras` com a API local → todas as checagens OK e base limpa (`select count(*) from contatos where nome like '[TESTE]%'` = 0).
- [ ] **Step 2:** `npm test && npm run typecheck && npm run build` → tudo PASS; colar a saída no resumo final.
- [ ] **Step 3: Commit** `test(esteira): smoke das esteiras TIM e Starlink`

---

## Notas de implantação (para o PR)

1. `prisma migrate deploy` (as duas migrations da Fase A).
2. `npm run esteira:estrutura -w @plataforma/api -- --todas` (idempotente; pode rodar de novo).
3. Conferir: nenhum `credenciamentos.operacao` nulo; usuários com o acesso esperado em `usuarios_operacoes`.
4. Produção não tem cadastros reais da esteira (spec 7) — a carga real é feita depois pela importação.
