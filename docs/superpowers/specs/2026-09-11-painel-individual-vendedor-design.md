# Painel individual do vendedor — Design

Data: 2026-09-11. Segue de uma auditoria de aderência ao modelo de CRM comercial +
central de atendimento (conversa desta data), item §16 ("gestor seleciona vendedor →
vê indicadores individuais completos"). Confirmado como lacuna real: os dados existem,
mas espalhados em `MonitoramentoPage.tsx` (status/conversas/protocolos em tempo real),
`ProdutividadeTab.tsx` (atividades) e `MetasTab.tsx` (meta/realizado) — sem uma view
única combinando clientes atendidos, conversas, oportunidades, propostas, vendas,
conversão, tempo de resposta/atendimento e status do WhatsApp por vendedor.

## Objetivo

Uma nova aba "Por vendedor" em Dashboards onde ADMIN/SUPERVISOR (qualquer vendedor) ou
GESTOR (só da própria equipe) — e o próprio vendedor, para si mesmo — escolhem uma
pessoa e um mês, e veem os indicadores combinados num só lugar. Só números agregados
nesta v1, sem drill-down clicável (as telas de Conversas/Oportunidades já existem para
quem quiser a lista).

## Fora de escopo (YAGNI, v1)

- Drill-down clicável (abrir lista ao clicar num número).
- Ping ao vivo da ponte WhatsApp (Baileys) para o status de conexão — usa a flag
  `ativo`/`modo` do banco, que já existe. A tela de Canais já tem o painel de QR/estado
  ao vivo; duplicar isso aqui só para o resumo adicionaria uma chamada de rede lenta a
  um agregador que deve responder rápido.
- Qualquer alteração em `metas.service.ts:listarMetas` — hoje ela não filtra por escopo
  do requisitante (retorna metas individuais da organização inteira para
  ADMIN/SUPERVISOR/GESTOR igualmente). É um comportamento pré-existente e separado
  desta feature; não será tocado aqui.

## Lacuna de dados descoberta: "propostas" não é rastreável hoje

A "proposta" é só um PDF gerado sob demanda a partir de uma oportunidade
(`GET /oportunidades/:id/proposta.pdf` → `proposta.pdf.ts`/`proposta.ts`), sem nenhuma
gravação de quando ou quantas vezes isso aconteceu. Decisão (aprovada): adicionar
rastreio real, não um proxy.

**Novo modelo Prisma, só-acréscimo:**

```prisma
model PropostaGerada {
  id             String   @id @default(uuid())
  oportunidadeId String   @map("oportunidade_id")
  autorId        String?  @map("autor_id")
  criadoEm       DateTime @default(now()) @map("criado_em")

  oportunidade Opportunity @relation(fields: [oportunidadeId], references: [id], onDelete: Cascade)
  autor        User?       @relation(fields: [autorId], references: [id], onDelete: SetNull)

  @@index([oportunidadeId, criadoEm])
  @@map("propostas_geradas")
}
```

Gravada dentro do handler de `GET /oportunidades/:id/proposta.pdf` (não em
`gerarPropostaPdf`/`montarProposta`, que são funções puras de montagem — a gravação é
efeito colateral de rota, não de cálculo). Contagem de "propostas" no resumo do
vendedor: `count()` de `PropostaGerada` cuja `oportunidade.responsavelId` é o vendedor-
alvo e `criadoEm` cai no período — mesma convenção de atribuição que "vendas"/meta usam
(dono da oportunidade, não quem clicou o botão), para os números não discordarem entre
si num relatório que os mostra lado a lado.

Escolha deliberada: **não** reaproveitar `OpportunityAudit`/`CampoAuditado` para este
evento. Aquela trilha existe para diffs de campo (`de`/`para` tipados por campo) e uma
linha "PROPOSTA_GERADA" com `de: null, para: null` seria um evento disfarçado de diff,
quebrando a leitura de quem já consome essa trilha (a timeline da ficha da
oportunidade). Uma tabela pequena e de propósito único é mais barata de entender do que
uma exceção dentro de uma tabela que já tem contrato.

## Endpoints novos

Novo módulo `apps/api/src/modules/metrics/vendedores.routes.ts` +
`vendedores.service.ts` (fica em `metrics/` por ser leitura agregada de indicadores,
mesma vizinhança de `metrics.routes.ts`; não cria um módulo novo no nível de
`modules/`).

### `GET /vendedores`

Lista `{ id, nome }` dos vendedores que o requisitante pode escolher no seletor.
- ADMIN/SUPERVISOR: todos os usuários ativos.
- GESTOR: `equipeIds` (a própria equipe, `lib/visibilidade.ts`).
- Outros perfis: só a si mesmo (o vendedor vendo o próprio resumo não precisa de
  seletor, mas a resposta é consistente).

Existe porque `GET /usuarios` (em `users.routes.ts`) exige `ADMIN`/`SUPERVISOR` e não
serve GESTOR — criar esse endpoint pequeno e escopado é mais simples e mais seguro do
que afrouxar `requireRole` de `/usuarios`.

### `GET /vendedores/:id/resumo?mes=YYYY-MM`

Retorna o payload combinado do vendedor `:id` no mês informado (default: mês
corrente). 403 se o requisitante não pode ver esse vendedor (mesma regra de
`GET /vendedores`, aplicada ao id pedido).

```ts
type ResumoVendedor = {
  vendedor: { id: string; nome: string };
  mes: string; // "YYYY-MM-01" (competência, mesmo formato de metas.ts)
  clientesAtendidos: number;        // contatos distintos com conversa no periodo
  conversas: {
    total: number;
    abertas: number;                // ATRIBUIDO | EM_ATENDIMENTO, com agenteId = vendedor
    encerradas: number;              // FINALIZADO, com agenteId = vendedor
  };
  tempos: { tmeSegundos: number | null; tmaSegundos: number | null };
  oportunidades: { abertas: number; ganhas: number; perdidas: number };
  propostas: number;
  vendas: { quantidade: number; valor: number };
  conversao: number | null;          // ganhas / (ganhas + perdidas), null se 0+0
  meta: { valor: number; definida: boolean } | null;
  whatsapp: Array<{ id: string; nome: string | null; ativo: boolean; modo: 'OFICIAL' | 'NAO_OFICIAL' | null }>;
};
```

## Serviço: composição, não duplicação

`resumoDoVendedor(vendedorId: string, mes: Date)` roda em paralelo
(`Promise.all`) as seguintes fontes:

1. **Meta/realizado** — chama `listarMetas(mes)` (já existe, `crm/metas.service.ts`) e
   extrai a linha do `vendedorId` de `individuais`/`semMeta`. Sem duplicar a regra de
   "o que conta como realizado".
2. **Oportunidades/vendas/conversão** — consulta nova e direta:
   `prisma.opportunity.groupBy({ by: ['status'], where: { responsavelId: vendedorId,
   OR: [{status: 'ABERTA'}, {fechadoEm: {gte, lt}}] }, _count, _sum: {valor} })`, mais
   preciso: abertas = status ABERTA (sem filtro de data, é o funil corrente); ganhas/
   perdidas = status in (GANHA, PERDIDA) E `fechadoEm` no período. `conversao` calculada
   em `metas.ts` (função pura testável) a partir de `{ganhas, perdidas}`.
3. **Propostas** — `prisma.propostaGerada.count({ where: { oportunidade: {
   responsavelId: vendedorId }, criadoEm: {gte, lt} } })`.
4. **Conversas/clientes atendidos** — consulta nova em `Conversation` filtrando
   `agenteId: vendedorId` e `criadoEm`/`ultimaMensagemEm` no período; `abertas`/
   `encerradas` são contagens por `status` dentro desse mesmo filtro (nunca incluem
   `EM_ESPERA`, que por definição não tem `agenteId`). `clientesAtendidos` via
   `groupBy(['contatoId'])` (contagem de grupos, não soma).
5. **TME/TMA** — estende `mediaSegundos` (`metrics/metrics.service.ts`) com um
   parâmetro opcional `agenteId?: string`, adicionando `AND "agente_id" = $2` (via
   parâmetro, não interpolação) só quando informado. Chamadas existentes (`indicadores()`)
   continuam passando sem o parâmetro — comportamento inalterado.
6. **WhatsApp** — `prisma.channelConfig.findMany({ where: { donoId: vendedorId },
   select: {id, nome, ativo, modo} })`. Sem chamada à ponte.

## RBAC — reuso, não reinvenção

Um helper `podeVerVendedor(vendedorAlvoId: string): Promise<boolean>` em
`vendedores.service.ts`, usando `contextoVisibilidade()` (`lib/visibilidade.ts`):
`ctx.veTudo || ctx.equipeIds.includes(vendedorAlvoId)`. Aplicado nas duas rotas. Não
introduz um novo conceito de escopo — é a leitura direta do que `equipeIds` já
significa em todo o resto da plataforma.

## Frontend

`apps/web/src/pages/DashboardsPage.tsx` ganha uma segunda aba (o arquivo já não usa
abas hoje — vira um componente de abas simples, tipo o padrão já usado em
`crm/*Tab.tsx` sendo importadas por uma página-container de CRM). Aba nova:
`PorVendedorTab.tsx`:

- `Select` de vendedor, populado por `GET /vendedores` (vazio → `EmptyState`, já que um
  ADMIN sem vendedores cadastrados ainda é estado válido).
- `Input type="month"`.
- Grade de `StatTile` (componente já existente, mesmo de `MonitoramentoPage`/
  `DashboardsPage`) para cada métrica do payload.
- Lista simples dos números de WhatsApp do vendedor com uma `Badge` de ativo/inativo
  (mesmo vocabulário visual de `CanaisTab.tsx`).

## Testes

- **Vitest**: a função pura de conversão (`ganhas / (ganhas + perdidas)`, tratando
  divisão por zero) fica em `metas.ts` ou um novo `vendedores.ts` de puro cálculo,
  testável sem banco — mesmo padrão de `metas.test.ts`.
- **Smoke test** (`scripts/smoke-resumo-vendedor.mjs`): cria vendedor, oportunidade
  ganha, uma perdida, gera uma proposta, confere que `/vendedores/:id/resumo` reflete
  os números certos, e que um GESTOR de outra equipe recebe 403.

## Migração

Uma migration Prisma nova e aditiva (`propostas_geradas`), sem alterar tabelas
existentes. Sem dado a migrar (tabela nova, vazia).
