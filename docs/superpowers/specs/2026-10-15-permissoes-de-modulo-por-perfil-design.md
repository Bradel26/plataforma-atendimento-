# Permissões de módulo por perfil, configuráveis pelo ADMIN — Design

## Contexto

Hoje o acesso a cada módulo (Atendimento, Esteira, CRM, Dashboards,
Monitoramento, Auditoria, Gestão, Campanhas, Relatórios, Chamado de TI) é
decidido por listas de `Role` fixas no código: `perfis: Perfil[]` em cada item
de [nav.ts](../../../apps/web/src/components/layout/nav.ts), espelhado por
`requireRole(...)` em pontos do backend. Mudar quem vê o quê exige editar
código e fazer deploy — foi o que aconteceu ao liberar o SUPORTE para Esteira
e CRM em 2026-10-15 (commit `d6966a8`).

O usuário pediu um painel, dentro de Configurações, onde o ADMIN concede ou
revoga, por **perfil** (não por usuário individual — decisão explícita), quais
módulos aquele perfil enxerga. Escopo confirmado com o usuário: só visibilidade
de **módulo/aba**, não ações internas (quem aprova, quem exclui, quem vê
Oportunidades dentro do CRM — essas continuam hardcoded, como estão hoje).

## 1. Modelo de dados

Tabela nova, por organização (o sistema já é multi-tenant — ver
[tenant.ts](../../../apps/api/src/lib/tenant.ts)):

```prisma
model ModulePermission {
  id            String   @id @default(cuid())
  organizacaoId String
  perfil        Role
  modulo        String
  criadoEm      DateTime @default(now())

  organizacao   Organizacao @relation(fields: [organizacaoId], references: [id], onDelete: Cascade)

  @@unique([organizacaoId, perfil, modulo])
  @@map("module_permissions")
}
```

A **presença** da linha `(organizacaoId, perfil, modulo)` significa "esse
perfil vê esse módulo nessa organização". Ausência = não vê. Não há coluna de
booleano: conceder é inserir a linha, revogar é apagar.

**Módulos editáveis** (chave usada na coluna `modulo`, igual à `rota` de
`nav.ts` sem a barra): `atendimento`, `esteira`, `crm`, `dashboards`,
`monitoramento`, `auditoria`, `gestao`, `campanhas`, `relatorios`,
`chamado-ti`.

**Fora da tabela, fixo no código, sem exceção:**
- `configuracoes` — sempre só ADMIN. Não aparece como coluna no painel. Sem
  isso, um ADMIN poderia se trancar fora do próprio painel de permissões.
- Perfil **ADMIN** — enxerga todos os módulos editáveis sempre, não consulta a
  tabela. Garantia contra lockout total da organização.

### Migration e seed

A migration que cria a tabela também **semeia** uma linha para cada
combinação `(perfil, modulo)` que hoje está liberada em `nav.ts` (exceto
`configuracoes`/ADMIN, que nem entram), para cada organização existente. Isso
ativa a feature sem mudar o acesso de ninguém no dia do deploy — ninguém perde
nem ganha módulo por causa da migration em si.

## 2. Leitura das permissões (serviço central)

Novo arquivo `apps/api/src/lib/modulos.ts`:

```ts
export async function modulosPermitidos(perfil: Role, organizacaoId: string): Promise<Set<string>> {
  if (perfil === 'ADMIN') return new Set(MODULOS_EDITAVEIS); // todos, sempre
  const linhas = await prisma.modulePermission.findMany({
    where: { perfil, organizacaoId },
    select: { modulo: true },
  });
  return new Set(linhas.map((l) => l.modulo));
}

export function requireModulo(modulo: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const permitidos = await modulosPermitidos(req.user.perfil, req.user.org);
    if (!permitidos.has(modulo)) return next(forbidden());
    next();
  };
}
```

Sem cache na primeira versão: é uma consulta indexada (`@@unique`) a uma
tabela pequena, por requisição — mesmo padrão de custo de qualquer outra
política em `politicas.ts`. Cache fica para se virar problema de performance
medido, não especulação.

## 3. Onde o gate passa a valer (backend)

Um `requireModulo('<chave>')` por módulo, no ponto mais alto do grupo de
rotas — o mesmo papel que `requireRole(array fixo)` tem hoje, só que
consultando a tabela em vez do array:

| Módulo | Arquivo | Hoje | Depois |
|---|---|---|---|
| `atendimento` | `conversations.routes.ts` | só `requireAuth` no topo | `+ requireModulo('atendimento')` |
| `auditoria` | `conversations.routes.ts` (sub-rotas `GET /auditoria*`) | `requireRole('ADMIN','SUPERVISOR','GESTOR')` | `requireModulo('auditoria')` |
| `crm` | `contacts.routes.ts`, `accounts.routes.ts` | só `requireAuth` no topo | `+ requireModulo('crm')` |
| `esteira` | `credenciamentos.routes.ts` | `requireRole('ADMIN','SUPERVISOR','GESTOR','COMERCIAL','SUPORTE')` no topo | `requireModulo('esteira')` |
| `dashboards`, `monitoramento`, `gestao`, `campanhas`, `relatorios`, `chamado-ti` | seus respectivos arquivos de rota | `requireRole(array fixo)` onde já existir | `requireModulo('<chave>')` |

As restrições de **ação** dentro de cada módulo (ex.: dentro de
`credenciamentos.routes.ts`, `/painel` e `/gestao` só para
ADMIN/SUPERVISOR/GESTOR; dentro de `accounts.routes.ts`, `DELETE` só ADMIN;
`opportunities.routes.ts` inteiro restrito a perfis comerciais) **não mudam**
— continuam com `requireRole(array fixo)` exatamente como hoje. O
`requireModulo` só substitui o portão de "pode entrar no módulo", nunca os
portões internos de ação.

## 4. API de administração

Nova rota, protegida por `requireRole('ADMIN')` **fixo** (não pode depender do
próprio sistema que ela administra — risco de lockout):

- `GET /api/permissoes-modulo` — devolve a matriz inteira da organização:
  `{ perfil: Role, modulos: string[] }[]`, um item por perfil editável
  (todos exceto ADMIN).
- `PUT /api/permissoes-modulo/:perfil` — corpo `{ modulos: string[] }`,
  substitui o conjunto inteiro de módulos daquele perfil (apaga as linhas que
  saíram, insere as que entraram, numa transação). Valida que `perfil` não é
  `ADMIN` e que todo módulo da lista está em `MODULOS_EDITAVEIS`.

## 5. Painel (frontend)

Nova aba "Permissões" em `/configuracoes`, ao lado de "Usuários"
(`UsuariosTab`). Grade perfil × módulo:
- Linhas: os 5 perfis editáveis (SUPERVISOR, GESTOR, COMERCIAL, SUPORTE,
  AGENTE). Uma linha extra "ADMIN" aparece travada, com todos os módulos
  marcados e desabilitados — visível para não parecer que o ADMIN "não tem
  nada marcado", mas sem interação.
- Colunas: os módulos editáveis, rotulados como no menu (Atendimento, Esteira,
  CRM, Dashboards, Monitoramento, Auditoria, Gestão, Campanhas, Relatórios,
  Chamado de TI). `Configurações` não aparece.
- Checkbox por célula. Salvar dispara `PUT /api/permissoes-modulo/:perfil`
  para o perfil daquela linha, com os módulos marcados.

## 6. Menu lateral (frontend)

`nav.ts` hoje é um array estático consumido direto por `Sidebar`,
`itemDaRota`, `subrotaDaRota`. Estrutura (rota, label, ícone, subrotas)
continua no código — só a lista `perfis: Perfil[]` de cada item deixa de ser
fixa.

Na sessão do usuário (login / bootstrap do app), um novo campo
`modulosPermitidos: string[]` é buscado uma vez (reaproveita o `GET
/api/permissoes-modulo` filtrado para o próprio perfil, ou uma rota
dedicada `GET /api/permissoes-modulo/minhas` mais barata — a decidir no
plano de implementação) e guardado no mesmo lugar que já guarda o usuário
logado. A visibilidade de um item de `NAV` passa a ser calculada como
"ADMIN, ou `item.rota` sem a barra está em `modulosPermitidos`" em vez de
"`perfis.includes(meuPerfil)`". As subrotas (`/jornadas/:id`,
`/oportunidades/:id`) continuam com a mesma regra de hoje (restringem, nunca
ampliam) — isso não muda, é comportamento de ação dentro do CRM, fora de
escopo.

## 7. Testes

- `modulos.test.ts`: ADMIN sempre tem todos os módulos sem consultar a
  tabela; perfil sem linha para um módulo recebe `forbidden` em
  `requireModulo`; perfil com a linha passa.
- Migration/seed: teste (ou script de verificação manual, documentado no
  plano) de que o conjunto semeado bate exatamente com o `nav.ts` anterior à
  mudança, perfil por perfil.
- `nav.test.ts`: adapta os testes existentes para o novo mecanismo de
  resolução de permissão (a regra "subrota restringe, nunca amplia" continua
  valendo e continua testada).
- Rotas administrativas (`GET`/`PUT /api/permissoes-modulo`): não-ADMIN
  recebe 403; ADMIN consegue ler e substituir o conjunto de um perfil;
  `PUT` com `perfil: 'ADMIN'` ou módulo fora da lista editável é rejeitado.

## Fora de escopo (explícito)

- Permissão por usuário individual (só por perfil).
- Qualquer ação interna dos módulos (aprovar, excluir, ver Oportunidades
  etc.) — continua hardcoded.
- Novos perfis/grupos além dos 6 já existentes no enum `Role`.
- Cache de leitura (fica para quando/se virar problema real de performance).
