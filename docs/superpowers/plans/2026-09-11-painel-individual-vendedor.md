# Painel Individual do Vendedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba nova em Dashboards/CRM onde ADMIN/SUPERVISOR (qualquer vendedor),
GESTOR (só da própria equipe) e o próprio vendedor (para si) escolhem uma pessoa e um
mês e veem, num só lugar, clientes atendidos, conversas, TME/TMA, oportunidades,
propostas, vendas, conversão, meta/realizado e status do WhatsApp — hoje espalhados em
três telas diferentes (Monitoramento, Produtividade, Metas).

**Architecture:** Um novo módulo `apps/api/src/modules/metrics/vendedores.*` compõe (via
`Promise.all`) consultas novas e pequenas mais duas reaproveitadas do que já existe
(`mediaSegundos` estendido, o mesmo padrão de query de `metas.service.ts`), atrás de duas
rotas nova (`GET /vendedores`, `GET /vendedores/:id/resumo`) protegidas pelo mesmo
`contextoVisibilidade()` que o resto da plataforma usa. "Propostas" não é hoje
rastreável (o PDF é gerado sob demanda, sem registro) — este plano acrescenta uma
tabela nova e só-acréscimo (`PropostaGerada`) e um ponto de gravação na rota existente
de PDF. O frontend entra como uma aba nova dentro de `CrmPage.tsx` (que já tem toda a
infraestrutura de abas/URL/perfis que `MetasTab`/`ProdutividadeTab` usam), e não dentro
de `DashboardsPage.tsx` — decisão tomada durante este plano: `DashboardsPage.tsx` não
tem hoje nenhuma infraestrutura de abas, e construir uma do zero ali duplicaria a que
`CrmPage.tsx` já tem e já usa para os outros painéis de gestão (Metas, Produtividade,
Leitura comercial). A spec menciona Dashboards como local sugerido; este plano reusa o
padrão existente em vez de criar um novo.

**Tech Stack:** Node + TypeScript, Express 4, Prisma 6 (Postgres/Neon), Zod, Vitest;
React 18 + Vite, Tailwind. Testes: Vitest para lógica pura; smoke test
(`scripts/smoke-*.mjs`) para o que depende de Postgres — mesma divisão do resto do repo
(ver `vitest.config.ts`).

**Spec:** `docs/superpowers/specs/2026-09-11-painel-individual-vendedor-design.md`

## Global Constraints

- Reaproveitar `lib/visibilidade.ts` (`contextoVisibilidade()`) para RBAC — não inventar
  um novo conceito de escopo.
- "Conversas abertas"/"encerradas" de um vendedor nunca incluem `EM_ESPERA` (essas não
  têm `agenteId`, por definição de `politicaConversas` em `lib/politicas.ts`).
- "Vendas"/"conversão" contam por `Opportunity.responsavelId`, com `fechadoEm` no
  período — mesma convenção de `metas.service.ts:realizadoPorResponsavel`, para os
  números não discordarem entre painéis.
- "Propostas" conta por `PropostaGerada` associada a uma `Opportunity` cujo
  `responsavelId` é o vendedor-alvo, `criadoEm` no período — mesma convenção de
  atribuição (dono da oportunidade, não quem clicou o botão).
- Sem ping ao vivo da ponte WhatsApp no resumo — só a flag `ativo`/`modo` do banco
  (`ChannelConfig`). O painel de QR ao vivo já existe em Canais.
- Sem drill-down clicável nesta v1.
- Não tocar `metas.service.ts:listarMetas` nem seu comportamento de escopo — fora de
  escopo deste plano (comportamento pré-existente e independente).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `apps/api/prisma/schema.prisma` | Modelo `PropostaGerada` + relações em `Opportunity`/`User` |
| `apps/api/src/modules/crm/opportunities.routes.ts` | Grava `PropostaGerada` ao gerar o PDF |
| `apps/api/src/modules/metrics/metrics.service.ts` | `mediaSegundos` ganha filtro opcional por `agenteId` |
| `apps/api/src/modules/metrics/vendedores.ts` | Cálculo puro: `conversao(ganhas, perdidas)` |
| `apps/api/src/modules/metrics/vendedores.ts` (test) | `vendedores.test.ts` |
| `apps/api/src/modules/metrics/vendedores.service.ts` | `listarVendedoresVisiveis`, `podeVerVendedor`, `resumoDoVendedor` |
| `apps/api/src/modules/metrics/vendedores.routes.ts` | `GET /vendedores`, `GET /vendedores/:id/resumo` |
| `apps/api/src/app.ts` | Monta `vendedoresRoutes` em `/api/vendedores` |
| `scripts/smoke-resumo-vendedor.mjs` | Smoke test do fluxo completo |
| `package.json` | Registra `smoke:resumo-vendedor` |
| `apps/web/src/lib/types.ts` | Tipos `VendedorOpcao`, `ResumoVendedor` |
| `apps/web/src/pages/crm/PainelVendedorTab.tsx` | Nova aba: seletor de vendedor + mês + grade de `StatTile` |
| `apps/web/src/pages/crm/CrmPage.tsx` | Registra a aba nova em `ABAS` e no render |

---

### Task 1: Tabela `PropostaGerada` e rastreio da geração do PDF

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/crm/opportunities.service.ts`
- Modify: `apps/api/src/modules/crm/opportunities.routes.ts`

**Interfaces:**
- Produces: `registrarPropostaGerada(oportunidadeId: string, autorId: string | undefined): Promise<void>` — usado por Task 5's `resumoDoVendedor` indiretamente (via contagem na tabela, não chamada direta).
- Produces: modelo Prisma `PropostaGerada { id, oportunidadeId, autorId, criadoEm }`, consumido pela query de contagem em Task 5.

- [ ] **Step 1: Adicionar o modelo `PropostaGerada` ao schema**

Em `apps/api/prisma/schema.prisma`, logo após o fechamento do modelo `OpportunityAudit`
(depois da linha `@@map("oportunidade_auditoria")` e do `}` que a segue, antes do
comentário `/// De quem e a meta (item 4.1).`), acrescente:

```prisma
/// Rastreio de quando uma proposta em PDF foi gerada (item §16 do painel do vendedor).
///
/// A proposta em si nunca foi um registro — e um PDF montado sob demanda a partir da
/// oportunidade (`GET /oportunidades/:id/proposta.pdf`). Sem esta tabela, "quantas
/// propostas o vendedor enviou no mes" nao tem como ser respondido: nao ha coluna,
/// evento ou trilha que registre a acao de gerar o PDF hoje.
model PropostaGerada {
  id             String   @id @default(uuid())
  oportunidadeId String   @map("oportunidade_id")
  /// Quem clicou em gerar. Nulo se a autenticacao um dia permitir geracao anonima
  /// (nao permite hoje, mas SetNull evita que apagar o usuario apague o evento).
  autorId        String?  @map("autor_id")
  criadoEm       DateTime @default(now()) @map("criado_em")

  oportunidade Opportunity @relation(fields: [oportunidadeId], references: [id], onDelete: Cascade)
  autor        User?       @relation(fields: [autorId], references: [id], onDelete: SetNull)

  @@index([oportunidadeId, criadoEm])
  @@map("propostas_geradas")
}
```

- [ ] **Step 2: Relação inversa em `Opportunity`**

Em `apps/api/prisma/schema.prisma`, no modelo `Opportunity`, a linha:

```prisma
  camposCustomizados ValorCampoCustomizadoOportunidade[]
```

fica:

```prisma
  camposCustomizados ValorCampoCustomizadoOportunidade[]
  propostasGeradas   PropostaGerada[]
```

- [ ] **Step 3: Relação inversa em `User`**

No modelo `User`, a linha:

```prisma
  canaisProprios        ChannelConfig[]
```

fica:

```prisma
  canaisProprios        ChannelConfig[]
  propostasGeradas      PropostaGerada[]
```

- [ ] **Step 4: Gerar e aplicar a migration**

Run: `npm run db:migrate -w @plataforma/api -- --name propostas_geradas`
Expected: Prisma cria `apps/api/prisma/migrations/<timestamp>_propostas_geradas/` com um
`CREATE TABLE "propostas_geradas" (...)`, aplica no banco de dev (Neon) sem pedir para
resetar nada (é tabela nova, sem dado a migrar), e regenera o client. Se pedir para
resetar o banco, **pare e não confirme** — nenhuma migration deste plano deveria exigir
isso; investigue a causa antes de prosseguir.

- [ ] **Step 5: Função que grava o evento**

Em `apps/api/src/modules/crm/opportunities.service.ts`, ao final do arquivo, acrescente:

```ts
/**
 * Registra que o PDF da proposta foi gerado (item §16 do painel do vendedor).
 *
 * Sem verificar se a oportunidade existe: a rota que chama isto ja carregou a
 * oportunidade com sucesso (`dadosDaProposta` teria lancado 404 antes) — verificar de
 * novo aqui seria uma segunda consulta so para confirmar o que a primeira ja provou.
 */
export async function registrarPropostaGerada(oportunidadeId: string, autorId: string | undefined) {
  await prisma.propostaGerada.create({
    data: { oportunidadeId, autorId: autorId ?? null },
  });
}
```

- [ ] **Step 6: Chamar a partir da rota do PDF**

Em `apps/api/src/modules/crm/opportunities.routes.ts`, o import de `opportunities.service`
ganha `registrarPropostaGerada`:

```ts
import {
  atualizarOportunidade,
  auditoriaDaOportunidade,
  dadosDaProposta,
  criarFunil,
  criarOportunidade,
  decidirDesconto,
  definirItens,
  definirTarefaDaEtapa,
  fecharOportunidade,
  funilKanban,
  listarFunis,
  listarOportunidades,
  obterOportunidade,
  registrarPropostaGerada,
} from './opportunities.service';
```

E o handler de `/:id/proposta.pdf` fica:

```ts
opportunitiesRoutes.get(
  '/:id/proposta.pdf',
  asyncHandler(async (req, res) => {
    const branding = await getBranding();
    const proposta = await dadosDaProposta(param(req, 'id'), branding.appName);
    const pdf = await gerarPropostaPdf(proposta, branding.corPrimaria);
    await registrarPropostaGerada(param(req, 'id'), req.user?.sub);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposta-${proposta.numero}.pdf"`);
    res.send(pdf);
  }),
);
```

(Única mudança: a linha `await registrarPropostaGerada(...)` acrescentada depois de
`gerarPropostaPdf` e antes dos headers de resposta — se a geração do PDF falhar, nada é
gravado; se a gravação falhar, o PDF já foi gerado com sucesso e o erro sobe como 500,
que é o comportamento correto: melhor falhar visivelmente do que servir um PDF sem
registrar.)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/crm/opportunities.service.ts apps/api/src/modules/crm/opportunities.routes.ts
git commit -m "feat(crm): rastreia geracao de proposta em PDF (propostas_geradas)"
```

---

### Task 2: `mediaSegundos` ganha filtro opcional por agente

**Files:**
- Modify: `apps/api/src/modules/metrics/metrics.service.ts`

**Interfaces:**
- Consumes: nenhuma nova (mesma assinatura, parâmetro extra opcional).
- Produces: `mediaSegundos(campoInicio, campoFim, tabela, desde, agenteId?)` — consumido
  por Task 5's `resumoDoVendedor`.

- [ ] **Step 1: Estender a função**

Em `apps/api/src/modules/metrics/metrics.service.ts`, a função `mediaSegundos` (linhas
7-21) fica:

```ts
/** Media de segundos entre dois instantes, calculada no banco. */
async function mediaSegundos(
  campoInicio: string,
  campoFim: string,
  tabela: string,
  desde: Date,
  agenteId?: string,
): Promise<number | null> {
  const filtroAgente = agenteId ? ` AND "agente_id" = $2` : '';
  const linhas = await prisma.$queryRawUnsafe<Array<{ media: number | null }>>(
    `SELECT AVG(EXTRACT(EPOCH FROM ("${campoFim}" - "${campoInicio}")))::float AS media
     FROM "${tabela}"
     WHERE "${campoFim}" IS NOT NULL AND "${campoInicio}" IS NOT NULL AND "${campoInicio}" >= $1${filtroAgente}`,
    ...(agenteId ? [desde, agenteId] : [desde]),
  );
  const media = linhas[0]?.media;
  return media === null || media === undefined ? null : Math.round(media);
}
```

(Única mudança: o parâmetro `agenteId?: string`, a cláusula `filtroAgente` montada
condicionalmente, e os parâmetros passados como array condicional. As duas chamadas
existentes dentro de `indicadores()` continuam sem o quinto argumento — comportamento
inalterado, coberto pelos testes/smokes já existentes desse endpoint.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte de unidade para confirmar que nada quebrou**

Run: `npx vitest run apps/api/src/modules/metrics`
Expected: os testes existentes (`assuntos.test.ts`) continuam passando — sem teste novo
aqui (mudança em query raw, coberta pelo smoke test da Task 6).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/metrics/metrics.service.ts
git commit -m "feat(metrics): mediaSegundos aceita filtro opcional por agente"
```

---

### Task 3: Cálculo puro de conversão

**Files:**
- Create: `apps/api/src/modules/metrics/vendedores.ts`
- Create: `apps/api/src/modules/metrics/vendedores.test.ts`

**Interfaces:**
- Produces: `conversao(ganhas: number, perdidas: number): number | null` — consumido por
  `vendedores.service.ts` (Task 4).

- [ ] **Step 1: Escrever o teste que falha primeiro**

Create `apps/api/src/modules/metrics/vendedores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { conversao } from './vendedores';

describe('conversao', () => {
  it('ganhas sobre ganhas mais perdidas', () => {
    expect(conversao(3, 1)).toBe(0.75);
  });

  it('100% quando so ha ganhas', () => {
    expect(conversao(2, 0)).toBe(1);
  });

  it('0% quando so ha perdidas', () => {
    expect(conversao(0, 4)).toBe(0);
  });

  it('nula quando nao ha nenhum fechamento no periodo', () => {
    expect(conversao(0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run apps/api/src/modules/metrics/vendedores.test.ts`
Expected: FAIL — `Cannot find module './vendedores'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementação mínima**

Create `apps/api/src/modules/metrics/vendedores.ts`:

```ts
/**
 * Aritmetica pura do painel do vendedor (item §16 do modelo de CRM auditado).
 *
 * Consulta fina, agregacao pura — mesmo padrao de `crm/metas.ts`.
 */

/**
 * Conversao = ganhas / (ganhas + perdidas), so entre oportunidades que tiveram
 * desfecho no periodo. Nula quando nao houve nenhum fechamento: zero por cento
 * afirmaria que o vendedor perdeu tudo que fechou, e aqui nao fechou nada para medir.
 */
export function conversao(ganhas: number, perdidas: number): number | null {
  const total = ganhas + perdidas;
  return total === 0 ? null : ganhas / total;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run apps/api/src/modules/metrics/vendedores.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/metrics/vendedores.ts apps/api/src/modules/metrics/vendedores.test.ts
git commit -m "feat(metrics): calculo puro de conversao do painel do vendedor"
```

---

### Task 4: Serviço agregador — lista de vendedores visíveis e resumo

**Files:**
- Create: `apps/api/src/modules/metrics/vendedores.service.ts`

**Interfaces:**
- Consumes: `contextoVisibilidade()` (`../../lib/visibilidade`), `conversao()` (Task 3),
  `mediaSegundos` — **não exportado hoje**; ver Step 1 abaixo para a mudança de
  visibilidade necessária —, `competencia`/`proximoMes` (`../crm/metas`).
- Produces: `listarVendedoresVisiveis(): Promise<Array<{id: string; nome: string}>>`,
  `podeVerVendedor(vendedorId: string): Promise<boolean>`,
  `resumoDoVendedor(vendedorId: string, mes: Date): Promise<ResumoVendedor>` (tipo
  definido neste arquivo) — todos consumidos por `vendedores.routes.ts` (Task 5).

- [ ] **Step 1: Exportar `mediaSegundos` de `metrics.service.ts`**

Em `apps/api/src/modules/metrics/metrics.service.ts`, a declaração da função (já
modificada na Task 2) ganha `export`:

```ts
/** Media de segundos entre dois instantes, calculada no banco. */
export async function mediaSegundos(
```

(Única mudança: a palavra `export` antes de `async function mediaSegundos`. Era privada
do módulo porque só `indicadores()` a usava; agora `vendedores.service.ts`, no mesmo
diretório `metrics/`, também precisa dela.)

- [ ] **Step 2: Escrever o serviço**

Create `apps/api/src/modules/metrics/vendedores.service.ts`:

```ts
import { prisma } from '../../lib/prisma';
import { contextoVisibilidade } from '../../lib/visibilidade';
import { notFound } from '../../lib/errors';
import { competencia, proximoMes } from '../crm/metas';
import { conversao } from './vendedores';
import { mediaSegundos } from './metrics.service';

/**
 * Resumo combinado do painel individual do vendedor (item §16 do modelo de CRM
 * auditado). Compoe consultas que ja existem em outros modulos (metas, conversas,
 * metricas) em vez de duplicar a regra de cada uma — ver a spec para o porque de cada
 * escolha de atribuicao (responsavelId vs agenteId, o que conta como "aberta", etc).
 */
export type ResumoVendedor = {
  vendedor: { id: string; nome: string };
  mes: string;
  clientesAtendidos: number;
  conversas: { total: number; abertas: number; encerradas: number };
  tempos: { tmeSegundos: number | null; tmaSegundos: number | null };
  oportunidades: { abertas: number; ganhas: number; perdidas: number };
  propostas: number;
  vendas: { quantidade: number; valor: number };
  conversao: number | null;
  meta: { valor: number; definida: boolean };
  whatsapp: Array<{ id: string; nome: string | null; ativo: boolean; modo: string | null }>;
};

/** Ids de vendedor que o requisitante pode escolher no seletor. */
async function idsVisiveis(): Promise<string[] | null> {
  const ctx = await contextoVisibilidade();
  if (ctx.veTudo) return null; // null = sem filtro, todo mundo
  if (ctx.veEquipe) return ctx.equipeIds;
  return [ctx.usuarioId];
}

/**
 * Lista { id, nome } dos vendedores visiveis. ADMIN/SUPERVISOR veem todos os usuarios
 * ativos; GESTOR ve a propria equipe (`equipeIds`); os demais, so a si mesmos.
 *
 * Existe porque `GET /usuarios` exige ADMIN/SUPERVISOR e nao serve GESTOR — criar este
 * endpoint pequeno e escopado e mais simples e mais seguro do que afrouxar aquela rota.
 */
export async function listarVendedoresVisiveis() {
  const ids = await idsVisiveis();
  return prisma.user.findMany({
    where: { ativo: true, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  });
}

/** Se o requisitante pode ver o resumo do vendedor `vendedorId`. */
export async function podeVerVendedor(vendedorId: string): Promise<boolean> {
  const ids = await idsVisiveis();
  return ids === null || ids.includes(vendedorId);
}

export async function resumoDoVendedor(vendedorId: string, mes: Date): Promise<ResumoVendedor> {
  const inicio = competencia(mes);
  const fim = proximoMes(inicio);
  const periodo = { criadoEm: { gte: inicio, lt: fim } };

  const [
    vendedor,
    clientesAtendidosGrupos,
    conversasPorStatus,
    tme,
    tma,
    oportunidadesPorStatus,
    propostas,
    metaRegistrada,
    canais,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: vendedorId }, select: { id: true, nome: true } }),
    prisma.conversation.groupBy({
      by: ['contatoId'],
      where: { agenteId: vendedorId, ...periodo },
    }),
    prisma.conversation.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { agenteId: vendedorId, ...periodo },
    }),
    mediaSegundos('criado_em', 'atribuido_em', 'conversas', inicio, vendedorId),
    mediaSegundos('atribuido_em', 'finalizado_em', 'conversas', inicio, vendedorId),
    prisma.opportunity.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { valor: true },
      where: {
        responsavelId: vendedorId,
        OR: [{ status: 'ABERTA' }, { fechadoEm: { gte: inicio, lt: fim } }],
      },
    }),
    prisma.propostaGerada.count({
      where: { oportunidade: { responsavelId: vendedorId }, criadoEm: { gte: inicio, lt: fim } },
    }),
    prisma.meta.findFirst({ where: { usuarioId: vendedorId, escopo: 'INDIVIDUAL', mes: inicio } }),
    prisma.channelConfig.findMany({
      where: { donoId: vendedorId },
      select: { id: true, nome: true, ativo: true, modo: true },
    }),
  ]);

  if (!vendedor) throw notFound('Vendedor nao encontrado');

  const contarStatus = (grupos: Array<{ status: string; _count: { _all: number } }>, status: string) =>
    grupos.find((g) => g.status === status)?._count._all ?? 0;

  const abertas = contarStatus(conversasPorStatus, 'ATRIBUIDO') + contarStatus(conversasPorStatus, 'EM_ATENDIMENTO');
  const encerradas = contarStatus(conversasPorStatus, 'FINALIZADO');
  const totalConversas = conversasPorStatus.reduce((acc, g) => acc + g._count._all, 0);

  const oportunidadesAbertas = oportunidadesPorStatus.find((g) => g.status === 'ABERTA');
  const oportunidadesGanhas = oportunidadesPorStatus.find((g) => g.status === 'GANHA');
  const oportunidadesPerdidas = oportunidadesPorStatus.find((g) => g.status === 'PERDIDA');
  const ganhas = oportunidadesGanhas?._count._all ?? 0;
  const perdidas = oportunidadesPerdidas?._count._all ?? 0;

  return {
    vendedor,
    mes: inicio.toISOString().slice(0, 10),
    clientesAtendidos: clientesAtendidosGrupos.length,
    conversas: { total: totalConversas, abertas, encerradas },
    tempos: { tmeSegundos: tme, tmaSegundos: tma },
    oportunidades: { abertas: oportunidadesAbertas?._count._all ?? 0, ganhas, perdidas },
    propostas,
    vendas: { quantidade: ganhas, valor: Number(oportunidadesGanhas?._sum.valor ?? 0) },
    conversao: conversao(ganhas, perdidas),
    meta: { valor: metaRegistrada ? Number(metaRegistrada.valor) : 0, definida: metaRegistrada !== null },
    whatsapp: canais,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: sem erros. Se `prisma.propostaGerada` não existir no client gerado, rode
`npm run db:generate -w @plataforma/api` (a Task 1 já deveria ter gerado o client — este
passo é só se algo ficou desatualizado).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/metrics/vendedores.service.ts apps/api/src/modules/metrics/metrics.service.ts
git commit -m "feat(metrics): servico agregador do painel individual do vendedor"
```

---

### Task 5: Rotas `GET /vendedores` e `GET /vendedores/:id/resumo`

**Files:**
- Create: `apps/api/src/modules/metrics/vendedores.routes.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `listarVendedoresVisiveis`, `podeVerVendedor`, `resumoDoVendedor` (Task 4).
- Produces: rotas HTTP consumidas pelo frontend (Task 7).

- [ ] **Step 1: Escrever as rotas**

Create `apps/api/src/modules/metrics/vendedores.routes.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../http/async-handler';
import { requireAuth } from '../../http/middleware/auth';
import { validateQuery } from '../../http/middleware/validate';
import { param } from '../../http/params';
import { forbidden } from '../../lib/errors';
import { listarVendedoresVisiveis, podeVerVendedor, resumoDoVendedor } from './vendedores.service';

/**
 * Painel individual do vendedor (item §16 do modelo de CRM auditado).
 *
 * Sem `requireRole`: a visibilidade e por ESCOPO (equipe do gestor, ou so a propria
 * pessoa), nao por perfil — um AGENTE de atendimento tambem pode ver o proprio resumo,
 * ainda que ele nao tenha oportunidade nenhuma (os numeros aparecem como zero, o que e
 * verdade, e nao um erro).
 */
export const vendedoresRoutes = Router();

vendedoresRoutes.use(requireAuth);

vendedoresRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ vendedores: await listarVendedoresVisiveis() });
  }),
);

const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mes no formato AAAA-MM')
  .transform((v) => new Date(`${v}-01T00:00:00Z`))
  .optional();

vendedoresRoutes.get(
  '/:id/resumo',
  validateQuery(z.object({ mes: mesSchema })),
  asyncHandler(async (req, res) => {
    const vendedorId = param(req, 'id');
    if (!(await podeVerVendedor(vendedorId))) throw forbidden();
    res.json(await resumoDoVendedor(vendedorId, res.locals.query.mes ?? new Date()));
  }),
);
```

- [ ] **Step 2: Montar em `app.ts`**

Em `apps/api/src/app.ts`, o import de `metricsRoutes` (linha 24) ganha uma linha:

```ts
import { metricsRoutes } from './modules/metrics/metrics.routes';
import { vendedoresRoutes } from './modules/metrics/vendedores.routes';
```

E logo após `app.use('/api/metricas', metricsRoutes);` (linha 142), acrescente:

```ts
app.use('/api/vendedores', vendedoresRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/metrics/vendedores.routes.ts apps/api/src/app.ts
git commit -m "feat(metrics): rotas do painel individual do vendedor"
```

---

### Task 6: Smoke test do fluxo completo

**Files:**
- Create: `scripts/smoke-resumo-vendedor.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `POST /auth/login`, `GET /usuarios`, `PATCH /usuarios/:id` (define
  `gestorId`), `POST /oportunidades`, `PATCH /oportunidades/:id` (fecha a oportunidade),
  `GET /oportunidades/:id/proposta.pdf`, `GET /vendedores`, `GET /vendedores/:id/resumo`
  — todas rotas já existentes ou criadas neste plano.
- Produces: nenhum consumidor — é a verificação final ponta a ponta.

- [ ] **Step 1: Escrever o script**

Create `scripts/smoke-resumo-vendedor.mjs`:

```javascript
/**
 * Smoke test do painel individual do vendedor (item §16 do modelo de CRM auditado).
 *
 * Cria uma oportunidade ganha e uma perdida para o vendedor1, gera uma proposta em
 * PDF, e confere que /vendedores/:id/resumo reflete os numeros certos — e que um
 * GESTOR de fora da equipe do vendedor recebe 403.
 *
 * Uso: npm run smoke:resumo-vendedor  (com a API de pe e o seed aplicado)
 */
const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};

async function req(metodo, rota, { corpo, token } = {}) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resp.json().catch(() => ({}));
  return { status: resp.status, dados };
}

/* ── login e usuarios do seed ──────────────────────────────────────────── */

const { dados: login } = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
checar(Boolean(login.accessToken), 'login do admin');
const admin = login.accessToken;

const { dados: usuarios } = await req('GET', '/usuarios', { token: admin });
const vendedor1 = usuarios.usuarios.find((u) => u.email === 'vendedor1@plataforma.local');
const gestor = usuarios.usuarios.find((u) => u.email === 'gestor@plataforma.local');
const comercial = usuarios.usuarios.find((u) => u.email === 'comercial@plataforma.local');
checar(Boolean(vendedor1 && gestor && comercial), 'seed tem vendedor1, gestor e comercial');

const { dados: loginGestor } = await req('POST', '/auth/login', {
  corpo: { email: 'gestor@plataforma.local', senha: 'Gestor@123' },
});
const tokenGestor = loginGestor.accessToken;

/* ── 1. vendedor1 NAO esta na equipe do gestor (so comercial esta, pelo seed) ── */

const semAcesso = await req('GET', `/vendedores/${vendedor1.id}/resumo`, { token: tokenGestor });
checar(semAcesso.status === 403, '1. gestor sem vendedor1 na equipe recebe 403', `HTTP ${semAcesso.status}`);

/* ── 2. Coloca vendedor1 na equipe do gestor e confirma acesso ────────── */

await req('PATCH', `/usuarios/${vendedor1.id}`, { token: admin, corpo: { gestorId: gestor.id } });
const comAcesso = await req('GET', `/vendedores/${vendedor1.id}/resumo`, { token: tokenGestor });
checar(comAcesso.status === 200, '2. gestor com vendedor1 na equipe recebe 200', `HTTP ${comAcesso.status}`);

const listaDoGestor = await req('GET', '/vendedores', { token: tokenGestor });
checar(
  listaDoGestor.dados.vendedores.some((v) => v.id === vendedor1.id),
  '   vendedor1 aparece na lista de vendedores do gestor',
);

/* ── 3. Duas oportunidades do vendedor1: uma ganha, uma perdida, no mes corrente ── */

const mesCorrente = new Date().toISOString().slice(0, 7);
const { dados: funis } = await req('GET', '/funis', { token: admin });
const funilId = funis.funis[0].id;

// Conta propria do teste, e nao uma existente: um banco de dev recem-semeado nao tem
// nenhuma conta, e depender de uma que ja exista faria o smoke passar ou falhar
// conforme o que mais alguem cadastrou antes, sem relacao com este teste.
const { dados: novaConta } = await req('POST', '/contas', {
  token: admin,
  corpo: { nome: `Conta smoke ${EXECUCAO}` },
});
const contaId = novaConta.conta.id;
checar(Boolean(contaId), '3. conta de teste criada');

const criarOportunidade = async (titulo, valor) => {
  const { dados } = await req('POST', '/oportunidades', {
    token: admin,
    corpo: { titulo, contaId, funilId, responsavelId: vendedor1.id, valor },
  });
  return dados.oportunidade;
};

const ganha = await criarOportunidade(`Smoke ganha ${EXECUCAO}`, 1000);
const perdida = await criarOportunidade(`Smoke perdida ${EXECUCAO}`, 500);
checar(Boolean(ganha?.id && perdida?.id), '   duas oportunidades criadas para vendedor1');

await req('POST', `/oportunidades/${ganha.id}/fechar`, { token: admin, corpo: { status: 'GANHA' } });
await req('POST', `/oportunidades/${perdida.id}/fechar`, {
  token: admin,
  corpo: { status: 'PERDIDA', motivoPerda: 'OUTRO' },
});

/* ── 4. Gera uma proposta para a oportunidade ganha ────────────────────── */

const pdf = await fetch(`${API}/oportunidades/${ganha.id}/proposta.pdf`, {
  headers: { Authorization: `Bearer ${admin}` },
});
checar(pdf.status === 200, '4. proposta em PDF gerada', `HTTP ${pdf.status}`);

/* ── 5. O resumo do vendedor reflete os numeros ────────────────────────── */

const { dados: resumo } = await req('GET', `/vendedores/${vendedor1.id}/resumo?mes=${mesCorrente}`, {
  token: admin,
});
checar(resumo.oportunidades?.ganhas >= 1, '5. oportunidades ganhas contabilizadas', `ganhas=${resumo.oportunidades?.ganhas}`);
checar(resumo.oportunidades?.perdidas >= 1, '   oportunidades perdidas contabilizadas', `perdidas=${resumo.oportunidades?.perdidas}`);
checar(resumo.propostas >= 1, '   proposta gerada contabilizada', `propostas=${resumo.propostas}`);
checar(resumo.vendas?.valor >= 1000, '   valor de venda contabilizado', `valor=${resumo.vendas?.valor}`);
checar(resumo.conversao !== null, '   conversao calculada (nao nula, ha fechamento no periodo)');
checar(Array.isArray(resumo.whatsapp), '   status de whatsapp presente (lista, mesmo que vazia)');

console.log(falhas === 0 ? `\nOK — ${EXECUCAO}` : `\n${falhas} falha(s) — ${EXECUCAO}`);
process.exit(falhas === 0 ? 0 : 1);
```

- [ ] **Step 2: Registrar o script em `package.json`**

Em `package.json`, na seção de scripts `smoke:*`, acrescente logo após a linha
`"smoke:ponte-multi": "node scripts/smoke-ponte-multi.mjs",`:

```json
    "smoke:resumo-vendedor": "node scripts/smoke-resumo-vendedor.mjs",
```

- [ ] **Step 3: Rodar a API localmente e o smoke test**

Run: `npm run dev --workspace=apps/api` (deixe rodando em outro terminal, com o Postgres
de dev acessível e seed aplicado)
Run: `npm run smoke:resumo-vendedor`
Expected: todas as linhas `ok`, saída final `OK — <execucao>`, exit code 0.

- [ ] **Step 4: Rodar a suíte de unidade inteira**

Run: `npx vitest run`
Expected: todos os testes existentes continuam passando, mais os 4 novos de
`vendedores.test.ts` (Task 3).

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-resumo-vendedor.mjs package.json
git commit -m "test: smoke test do painel individual do vendedor"
```

---

### Task 7: Tipos e aba no frontend

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/pages/crm/PainelVendedorTab.tsx`
- Modify: `apps/web/src/pages/crm/CrmPage.tsx`

**Interfaces:**
- Consumes: `GET /vendedores`, `GET /vendedores/:id/resumo?mes=` (Task 5).
- Produces: nada consumido por outro arquivo — é a ponta final da funcionalidade.

- [ ] **Step 1: Tipos novos**

Em `apps/web/src/lib/types.ts`, ao final do arquivo, acrescente:

```ts
export type VendedorOpcao = { id: string; nome: string };

export type ResumoVendedor = {
  vendedor: { id: string; nome: string };
  mes: string;
  clientesAtendidos: number;
  conversas: { total: number; abertas: number; encerradas: number };
  tempos: { tmeSegundos: number | null; tmaSegundos: number | null };
  oportunidades: { abertas: number; ganhas: number; perdidas: number };
  propostas: number;
  vendas: { quantidade: number; valor: number };
  conversao: number | null;
  meta: { valor: number; definida: boolean };
  whatsapp: Array<{ id: string; nome: string | null; ativo: boolean; modo: string | null }>;
};
```

- [ ] **Step 2: Escrever a aba**

Create `apps/web/src/pages/crm/PainelVendedorTab.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { StatTile } from '../../components/viz/StatTile';
import { duracao } from '../../lib/viz';
import { ApiError, api } from '../../lib/api';
import { moeda, type ResumoVendedor, type VendedorOpcao } from '../../lib/types';

const mesCorrente = () => new Date().toISOString().slice(0, 7);

/**
 * Painel individual do vendedor (item §16 do modelo de CRM auditado): so numeros
 * agregados nesta v1, sem drill-down — quem quiser a lista, abre Conversas ou
 * Oportunidades e filtra por essa pessoa, que ja existem para isso.
 */
export function PainelVendedorTab() {
  const [vendedores, setVendedores] = useState<VendedorOpcao[] | null>(null);
  const [vendedorId, setVendedorId] = useState('');
  const [mes, setMes] = useState(mesCorrente());
  const [resumo, setResumo] = useState<ResumoVendedor | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ vendedores: VendedorOpcao[] }>('/vendedores')
      .then(({ vendedores: lista }) => {
        setVendedores(lista);
        // Sem selecao explicita, comeca no primeiro — quem so ve a si mesmo (a lista
        // tem um item so) ja abre direto no proprio resumo, sem precisar escolher.
        if (lista.length > 0) setVendedorId((atual) => atual || lista[0].id);
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar vendedores'));
  }, []);

  const carregarResumo = useCallback(async () => {
    if (!vendedorId) return;
    try {
      setResumo(await api.get<ResumoVendedor>(`/vendedores/${vendedorId}/resumo?mes=${mes}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o resumo');
    }
  }, [vendedorId, mes]);

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  if (vendedores === null) return <p className="text-sm text-slate-500">Carregando...</p>;

  if (vendedores.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum vendedor visivel"
        descricao="Nao ha, dentro do que voce pode ver, nenhum vendedor cadastrado."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card titulo="Painel do vendedor" descricao="Indicadores combinados de um vendedor, por mes">
        <div className="flex flex-wrap gap-3">
          <Field label="Vendedor">
            <Select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="w-64">
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mes">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="max-w-[180px]" />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      {resumo && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile rotulo="Clientes atendidos" valor={resumo.clientesAtendidos} />
            <StatTile rotulo="Conversas" valor={resumo.conversas.total} detalhe={`${resumo.conversas.abertas} aberta(s)`} />
            <StatTile rotulo="TME" valor={duracao(resumo.tempos.tmeSegundos)} detalhe="tempo medio de espera" />
            <StatTile rotulo="TMA" valor={duracao(resumo.tempos.tmaSegundos)} detalhe="tempo medio de atendimento" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile rotulo="Oportunidades abertas" valor={resumo.oportunidades.abertas} />
            <StatTile rotulo="Propostas" valor={resumo.propostas} detalhe="geradas no periodo" />
            <StatTile rotulo="Vendas" valor={resumo.vendas.quantidade} detalhe={moeda(resumo.vendas.valor)} />
            <StatTile
              rotulo="Conversao"
              valor={resumo.conversao === null ? '—' : `${Math.round(resumo.conversao * 100)}%`}
              detalhe="ganhas sobre fechadas"
            />
          </div>

          <Card
            titulo="Meta do mes"
            descricao={resumo.meta.definida ? undefined : 'Ninguem definiu uma meta para esta pessoa neste mes'}
          >
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Meta</dt>
                <dd className="text-slate-800">{moeda(resumo.meta.valor)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Realizado</dt>
                <dd className="text-slate-800">{moeda(resumo.vendas.valor)}</dd>
              </div>
            </dl>
          </Card>

          <Card titulo="WhatsApp" descricao="Numeros cadastrados como linha pessoal desta pessoa">
            {resumo.whatsapp.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum numero pessoal cadastrado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {resumo.whatsapp.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="text-slate-700">{c.nome ?? 'Sem rotulo'}</span>
                    <Badge tom={c.ativo ? 'sucesso' : 'neutro'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Registrar a aba em `CrmPage.tsx`**

Em `apps/web/src/pages/crm/CrmPage.tsx`, o import ganha uma linha, logo após
`import { ProdutosTab } from './ProdutosTab';`:

```ts
import { PainelVendedorTab } from './PainelVendedorTab';
```

O array `ABAS` ganha uma entrada, logo após a de `produtividade`:

```ts
  // Mesmo corte de leitura de metas e produtividade: e painel de gestao. COMERCIAL
  // entra tambem porque, ao contrario das outras tres, esta aba serve para a propria
  // pessoa ver o proprio resumo — nao so para quem gerencia.
  { id: 'painel-vendedor', label: 'Painel do vendedor', perfis: ['ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL'], grupo: 'mais' },
```

E o render, logo após `{aba === 'produtividade' && <ProdutividadeTab />}`:

```tsx
      {aba === 'painel-vendedor' && <PainelVendedorTab />}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace=apps/web`
Expected: sem erros.

- [ ] **Step 5: Rodar o frontend e verificar visualmente**

Run: `npm run dev --workspace=apps/web` (com a API tambem de pe)
Abra CRM → "Mais" → "Painel do vendedor", escolha um vendedor e um mes, confirme que os
`StatTile`s aparecem sem erro no console. Entre como `comercial@plataforma.local` e
confirme que a aba mostra so o proprio resumo (lista de vendedores com um item so).
Expected: sem erro no console do navegador; os numeros mudam ao trocar de vendedor/mes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/pages/crm/PainelVendedorTab.tsx apps/web/src/pages/crm/CrmPage.tsx
git commit -m "feat(web): painel individual do vendedor na aba do CRM"
```

---

## Self-Review (registrado para quem revisar o plano)

- **Cobertura da spec:** endpoints (`GET /vendedores`, `GET /vendedores/:id/resumo`) —
  Task 5; rastreio de propostas — Task 1; extensão de `mediaSegundos` — Task 2; cálculo
  puro de conversão — Task 3; composição do resumo — Task 4; smoke ponta a ponta com o
  caso de 403 — Task 6; frontend — Task 7. Todas as seções da spec têm uma task.
- **Desvio da spec, registrado:** a spec sugeria a aba dentro de `DashboardsPage.tsx`;
  este plano usa `CrmPage.tsx` porque já tem a infraestrutura de abas/URL/perfis que
  `MetasTab`/`ProdutividadeTab` usam — construir uma nova em `DashboardsPage.tsx`
  duplicaria essa infraestrutura sem necessidade.
- **Consistência de tipos:** `ResumoVendedor` (backend, `vendedores.service.ts`) e
  `ResumoVendedor` (frontend, `lib/types.ts`) têm os mesmos campos, mesmos nomes,
  mesmos tipos (`conversao: number | null`, `meta: {valor, definida}`, etc.) — conferido
  campo a campo entre Task 4 e Task 7.
- **Sem placeholders:** todo passo de código acima é o trecho completo a colar.
