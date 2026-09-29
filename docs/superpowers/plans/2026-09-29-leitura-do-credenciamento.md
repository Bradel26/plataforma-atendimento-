# Leitura do Credenciamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o vocabulário comercial (política de desconto, ganhas/perdidas,
ticket médio, forecast) do bloco "Leitura comercial" — já movido para Área da
Gestão nesta sessão — pelo vocabulário de credenciamento de parceiros, e
adicionar dois baldes de risco novos (aguardando parceiro / aguardando
equipe) baseados na etapa atual da oportunidade.

**Architecture:** Mudança dentro de arquivos que já existem, sem rota nova.
Backend: `comercial.service.ts` ganha `estagioNome` no
`OportunidadeParaRisco` e dois baldes calculados em `montarRisco`, e
`relatorioRisco` passa a selecionar o nome do estágio atual. Frontend:
`ComercialTab.tsx` (já renderizado dentro de `GestaoPage.tsx`) perde o
cartão de política de desconto e tem os textos/tiles dos outros três
cartões trocados — sem endpoint novo, sem componente novo.

**Tech Stack:** Node/Express/Prisma (Postgres/Neon), React, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-leitura-do-credenciamento-design.md`

## Global Constraints

- Comparação de etapa por **nome exato** (`'Pendencia'`, `'Aprovacao'`), não
  por id — acoplamento consciente ao vocabulário do seed (spec, seção 3).
- Nenhuma migration: os dois baldes novos são cálculo puro sobre dado que já
  existe (`estagio.nome`, já carregado via relação `Opportunity.estagio`).
- Não remover nem alterar `GET/PUT /comercial/politica` no backend — só o
  cartão que o consumia no frontend some (spec, seção 2).
- `Ticket médio`, `Valor em aberto` e `Previsão ponderada` somem da tela;
  os campos que os alimentam (`ticketMedio`, `valorEmAberto`,
  `previsaoPonderada`) continuam sendo devolvidos pela API — só a tela
  para de renderizá-los.

## Review Focus

- Estágio com nome diferente de `'Pendencia'`/`'Aprovacao'` (ex.: aberta em
  `'Ativo'`) não pode entrar em nenhum dos dois baldes novos — testado na
  Task 1.
- `risco` pode estar `null` no primeiro render (antes do `Promise.all` da
  Task 3/4 resolver) — o tile novo "Parceiros parados" dentro do cartão de
  indicadores usa `risco?.atrasadas.total`, nunca `risco!`.
- Depois de remover a política de desconto, `Button`, `Input` e `useAuth`
  ficam sem nenhum outro uso no arquivo — se sobrar um import não usado o
  `tsc --noEmit`/lint acusa; a Task 3 remove os três.
- Oportunidade sem nenhuma tarefa aberta E na etapa `'Pendencia'` tem que
  cair em `semProximaAcao` **e** em `aguardandoParceiro` ao mesmo tempo —
  os baldes se sobrepõem de propósito (mesma regra dos baldes existentes),
  coberto pelo teste da Task 1.
- O grid de 6 tiles do cartão de risco não pode ficar apertado em telas
  estreitas — `sm:grid-cols-3 lg:grid-cols-6` (Task 4) segue o mesmo padrão
  responsivo que o grid de 5 já usava.

---

### Task 1: Backend — dois baldes de risco novos (`montarRisco`)

**Files:**
- Modify: `apps/api/src/modules/crm/comercial.service.ts:187-246`
- Test: `apps/api/src/modules/crm/comercial.test.ts:133-192`

**Interfaces:**
- Consumes: nada de tarefa anterior.
- Produces: `OportunidadeParaRisco` ganha `estagioNome: string`;
  `Risco` ganha `aguardandoParceiro: Balde` e `aguardandoEquipe: Balde`.
  `montarRisco(abertas, comTarefaAberta, agora, diasDeAviso?)` continua com a
  mesma assinatura — os baldes novos vêm do campo novo em `abertas`, não de
  parâmetro novo. Task 2 depende desses dois tipos e desse cálculo.

- [x] **Step 1: Escrever o teste que falha**

Em `apps/api/src/modules/crm/comercial.test.ts`, dentro do `describe('montarRisco (1.3)', ...)`, a fixture `abertas` (linhas 138-143) precisa do campo novo — sem ele o `it('conta aguardando parceiro...')` abaixo nem compila. Troque:

```ts
  const abertas = [
    { id: 'a', valor: 100, previsaoFechamento: emDias(-10) }, // atrasada
    { id: 'b', valor: 200, previsaoFechamento: emDias(3) }, // vencendo
    { id: 'c', valor: 400, previsaoFechamento: emDias(30) }, // forecast, longe
    { id: 'd', valor: 800, previsaoFechamento: null }, // sem previsao
  ];
```

por:

```ts
  const abertas = [
    { id: 'a', valor: 100, previsaoFechamento: emDias(-10), estagioNome: 'Qualificacao' }, // atrasada
    { id: 'b', valor: 200, previsaoFechamento: emDias(3), estagioNome: 'Qualificacao' }, // vencendo
    { id: 'c', valor: 400, previsaoFechamento: emDias(30), estagioNome: 'Qualificacao' }, // forecast, longe
    { id: 'd', valor: 800, previsaoFechamento: null, estagioNome: 'Qualificacao' }, // sem previsao
  ];
```

E na linha 175 (`it('previsao exatamente agora nao e atraso', ...)`), troque:

```ts
    const r = montarRisco([{ id: 'x', valor: 10, previsaoFechamento: agora }], new Set(['x']), agora);
```

por:

```ts
    const r = montarRisco([{ id: 'x', valor: 10, previsaoFechamento: agora, estagioNome: 'Qualificacao' }], new Set(['x']), agora);
```

Por fim, adicione este `it` novo logo antes do `});` que fecha o `describe('montarRisco (1.3)', ...)` (depois do `it('sem oportunidade aberta devolve zeros, nao nulos', ...)`, linha 191):

```ts

  it('aguardando parceiro e aguardando equipe usam o nome da etapa atual', () => {
    const comEstagio = [
      { id: 'a', valor: 100, previsaoFechamento: null, estagioNome: 'Pendencia' },
      { id: 'b', valor: 200, previsaoFechamento: null, estagioNome: 'Aprovacao' },
      { id: 'c', valor: 300, previsaoFechamento: null, estagioNome: 'Ativo' },
    ];
    const r = montarRisco(comEstagio, new Set(), agora);
    expect(r.aguardandoParceiro).toEqual({ total: 1, valor: 100 });
    expect(r.aguardandoEquipe).toEqual({ total: 1, valor: 200 });
  });

  it('atrasada e em pendencia entra nos dois baldes ao mesmo tempo', () => {
    // Os baldes se sobrepoem de proposito, igual atrasada+semProximaAcao ja
    // fazia acima — atrasada E aguardando parceiro e a pior combinacao, e
    // teria de aparecer nos dois, nao ser forcada a escolher um.
    const r = montarRisco(
      [{ id: 'a', valor: 100, previsaoFechamento: emDias(-1), estagioNome: 'Pendencia' }],
      new Set(),
      agora,
    );
    expect(r.atrasadas.total).toBe(1);
    expect(r.aguardandoParceiro.total).toBe(1);
  });
```

- [x] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd apps/api && npx vitest run src/modules/crm/comercial.test.ts`
Expected: FAIL — `estagioNome` não existe no tipo `OportunidadeParaRisco`, e `r.aguardandoParceiro`/`r.aguardandoEquipe` são `undefined`.

- [x] **Step 3: Implementar**

Em `apps/api/src/modules/crm/comercial.service.ts`, troque o bloco de tipos (linhas 187-208):

```ts
export type Balde = { total: number; valor: number };

export type Risco = {
  /** Previsao de fechamento no passado e ainda aberta. */
  atrasadas: Balde;
  /** Previsao dentro dos proximos `diasDeAviso` dias. */
  vencendo: Balde;
  /** Previsao no futuro — o que sustenta a previsao ponderada. */
  emForecast: Balde;
  /** Aberta sem previsao de fechamento: nao entra em forecast nenhum. */
  semPrevisao: Balde;
  /** Aberta sem nenhuma tarefa com prazo em aberto. Mesma regra do item 1.1. */
  semProximaAcao: Balde;
  abertas: Balde;
  diasDeAviso: number;
};

export type OportunidadeParaRisco = {
  id: string;
  valor: number;
  previsaoFechamento: Date | null;
};
```

por:

```ts
export type Balde = { total: number; valor: number };

export type Risco = {
  /** Previsao de fechamento no passado e ainda aberta. */
  atrasadas: Balde;
  /** Previsao dentro dos proximos `diasDeAviso` dias. */
  vencendo: Balde;
  /** Previsao no futuro — o que sustenta a previsao ponderada. */
  emForecast: Balde;
  /** Aberta sem previsao de fechamento: nao entra em forecast nenhum. */
  semPrevisao: Balde;
  /** Aberta sem nenhuma tarefa com prazo em aberto. Mesma regra do item 1.1. */
  semProximaAcao: Balde;
  /** Etapa atual = 'Pendencia' (vocabulario do seed do Funil de Vendas). */
  aguardandoParceiro: Balde;
  /** Etapa atual = 'Aprovacao' (vocabulario do seed do Funil de Vendas). */
  aguardandoEquipe: Balde;
  abertas: Balde;
  diasDeAviso: number;
};

export type OportunidadeParaRisco = {
  id: string;
  valor: number;
  previsaoFechamento: Date | null;
  /** Nome da etapa atual — usado so pelos baldes aguardandoParceiro/aguardandoEquipe. */
  estagioNome: string;
};
```

E dentro de `montarRisco` (linhas 235-245), troque o objeto retornado:

```ts
  return {
    atrasadas: balde((o) => o.previsaoFechamento !== null && o.previsaoFechamento < agora),
    vencendo: balde(
      (o) => o.previsaoFechamento !== null && o.previsaoFechamento >= agora && o.previsaoFechamento <= limite,
    ),
    emForecast: balde((o) => o.previsaoFechamento !== null && o.previsaoFechamento >= agora),
    semPrevisao: balde((o) => o.previsaoFechamento === null),
    semProximaAcao: balde((o) => !comTarefaAberta.has(o.id)),
    abertas: balde(() => true),
    diasDeAviso,
  };
```

por:

```ts
  return {
    atrasadas: balde((o) => o.previsaoFechamento !== null && o.previsaoFechamento < agora),
    vencendo: balde(
      (o) => o.previsaoFechamento !== null && o.previsaoFechamento >= agora && o.previsaoFechamento <= limite,
    ),
    emForecast: balde((o) => o.previsaoFechamento !== null && o.previsaoFechamento >= agora),
    semPrevisao: balde((o) => o.previsaoFechamento === null),
    semProximaAcao: balde((o) => !comTarefaAberta.has(o.id)),
    aguardandoParceiro: balde((o) => o.estagioNome === 'Pendencia'),
    aguardandoEquipe: balde((o) => o.estagioNome === 'Aprovacao'),
    abertas: balde(() => true),
    diasDeAviso,
  };
```

- [x] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd apps/api && npx vitest run src/modules/crm/comercial.test.ts`
Expected: PASS (todos os `it` do arquivo, incluindo os dois novos).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/crm/comercial.service.ts apps/api/src/modules/crm/comercial.test.ts
git commit -m "feat(comercial): baldes de risco aguardandoParceiro/aguardandoEquipe por etapa"
```

---

### Task 2: Backend — `relatorioRisco` passa a ler o nome da etapa

**Files:**
- Modify: `apps/api/src/modules/crm/comercial.service.ts:248-263`

**Interfaces:**
- Consumes: `OportunidadeParaRisco.estagioNome` e `montarRisco` da Task 1.
- Produces: `relatorioRisco(diasDeAviso?, funilId?)` continua devolvendo
  `Risco` (agora com os dois campos novos preenchidos de verdade, não só no
  tipo) — é o que a rota `GET /comercial/risco` expõe, consumido pela
  Task 4.

- [x] **Step 1: Implementar**

Em `apps/api/src/modules/crm/comercial.service.ts`, troque `relatorioRisco` (linhas 248-263):

```ts
export async function relatorioRisco(diasDeAviso = 7, funilId?: string) {
  const visivel = await filtroDe(politicaOportunidades);
  const abertas = await prisma.opportunity.findMany({
    where: { AND: [{ status: 'ABERTA', ...(funilId ? { funilId } : {}) }, visivel] },
    select: { id: true, valor: true, previsaoFechamento: true },
  });

  const paraRisco = abertas.map((o) => ({
    id: o.id,
    valor: Number(o.valor),
    previsaoFechamento: o.previsaoFechamento,
  }));
  const tarefas = await tarefasPorOportunidade(paraRisco.map((o) => o.id));

  return montarRisco(paraRisco, new Set(tarefas.keys()), new Date(), diasDeAviso);
}
```

por:

```ts
export async function relatorioRisco(diasDeAviso = 7, funilId?: string) {
  const visivel = await filtroDe(politicaOportunidades);
  const abertas = await prisma.opportunity.findMany({
    where: { AND: [{ status: 'ABERTA', ...(funilId ? { funilId } : {}) }, visivel] },
    select: { id: true, valor: true, previsaoFechamento: true, estagio: { select: { nome: true } } },
  });

  const paraRisco = abertas.map((o) => ({
    id: o.id,
    valor: Number(o.valor),
    previsaoFechamento: o.previsaoFechamento,
    estagioNome: o.estagio.nome,
  }));
  const tarefas = await tarefasPorOportunidade(paraRisco.map((o) => o.id));

  return montarRisco(paraRisco, new Set(tarefas.keys()), new Date(), diasDeAviso);
}
```

- [x] **Step 2: Rodar a suite inteira da API e o typecheck**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run`
Expected: PASS — nenhum teste existente de `comercial`/`opportunities` depende do shape antigo do `select`.

- [x] **Step 3: Commit**

```bash
git add apps/api/src/modules/crm/comercial.service.ts
git commit -m "feat(comercial): relatorioRisco le o nome da etapa atual da oportunidade"
```

---

### Task 3: Frontend — remove o cartão de política de desconto

**Files:**
- Modify: `apps/web/src/pages/crm/ComercialTab.tsx`

**Interfaces:**
- Consumes: nada de tarefa anterior.
- Produces: `ComercialTab` sem estado `teto`/`tetoSalvo`/`salvandoTeto`, sem
  a função `salvarTeto`, sem o `fetch` de `/comercial/politica`. As Tasks 4 e
  5 editam o mesmo arquivo depois desta.

- [x] **Step 1: Remover imports que só serviam a política de desconto**

Troque a linha 2:

```ts
import { Alerta, Button, Card, Field, Input, Select } from '../../components/ui';
```

por:

```ts
import { Alerta, Card, Field, Select } from '../../components/ui';
```

E remova a linha 8 inteira:

```ts
import { useAuth } from '../../features/auth/AuthProvider';
```

- [x] **Step 2: Remover estado e a chamada de `useAuth`**

Troque (linhas 121-133):

```ts
export function ComercialTab() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [funilId, setFunilId] = useState('');
  const [dias, setDias] = useState(90);
  const [funil, setFunil] = useState<{ funil: { nome: string }; estagios: LinhaFunil[] } | null>(null);
  const [risco, setRisco] = useState<Risco | null>(null);
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [perdas, setPerdas] = useState<Perdas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [teto, setTeto] = useState<string>('');
  const [tetoSalvo, setTetoSalvo] = useState<number | null>(null);
  const [salvandoTeto, setSalvandoTeto] = useState(false);
  const { temPerfil } = useAuth();
```

por:

```ts
export function ComercialTab() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [funilId, setFunilId] = useState('');
  const [dias, setDias] = useState(90);
  const [funil, setFunil] = useState<{ funil: { nome: string }; estagios: LinhaFunil[] } | null>(null);
  const [risco, setRisco] = useState<Risco | null>(null);
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [perdas, setPerdas] = useState<Perdas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
```

- [x] **Step 3: Remover o fetch de `/comercial/politica` e a função `salvarTeto`**

Troque (linhas 163-193):

```ts
  useEffect(() => {
    void api
      .get<{ funis: Funil[] }>('/funis?tipo=COMERCIAL')
      .then((f) => setFunis(f.funis))
      .catch(() => undefined);

    void api
      .get<{ descontoMaximoPercentual: number }>('/comercial/politica')
      .then((p) => {
        setTetoSalvo(p.descontoMaximoPercentual);
        setTeto(String(p.descontoMaximoPercentual));
      })
      .catch(() => undefined);
  }, []);

  const salvarTeto = async () => {
    setSalvandoTeto(true);
    setErro(null);
    try {
      const n = Math.min(100, Math.max(0, Math.trunc(Number(teto) || 0)));
      const p = await api.put<{ descontoMaximoPercentual: number }>('/comercial/politica', {
        descontoMaximoPercentual: n,
      });
      setTetoSalvo(p.descontoMaximoPercentual);
      setTeto(String(p.descontoMaximoPercentual));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar a politica de desconto');
    } finally {
      setSalvandoTeto(false);
    }
  };
```

por:

```ts
  useEffect(() => {
    void api
      .get<{ funis: Funil[] }>('/funis?tipo=COMERCIAL')
      .then((f) => setFunis(f.funis))
      .catch(() => undefined);
  }, []);
```

- [x] **Step 4: Remover o cartão da JSX e renomear o cabeçalho**

Troque (linha 197):

```tsx
      <Card titulo="Leitura comercial" descricao={funil ? funil.funil.nome : 'Carregando...'}>
```

por:

```tsx
      <Card titulo="Leitura do Credenciamento" descricao={funil ? funil.funil.nome : 'Carregando...'}>
```

E remova o bloco inteiro (comentário + card condicional):

```tsx
      {/* Politica de desconto (item 2.3). Fica aqui, e nao em Configuracoes,
          porque quem olha conversao e margem e quem decide o teto — e porque a
          alcada e regra comercial, nao ajuste de sistema. */}
      {tetoSalvo !== null && (
        <Card
          titulo="Politica de desconto"
          descricao="Teto que o perfil Comercial concede sem aprovacao. Quem aprova nao passa por teto."
        >
          <div className="grid gap-3 sm:grid-cols-[10rem_auto] sm:items-end">
            <Field label="Desconto maximo (%)" hint="100 = sem restricao">
              <Input
                value={teto}
                onChange={(e) => setTeto(e.target.value)}
                disabled={!temPerfil('ADMIN', 'SUPERVISOR')}
              />
            </Field>
            {temPerfil('ADMIN', 'SUPERVISOR') && (
              <div>
                <Button
                  onClick={() => void salvarTeto()}
                  disabled={salvandoTeto || teto === String(tetoSalvo)}
                >
                  {salvandoTeto ? 'Salvando...' : 'Salvar politica'}
                </Button>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {tetoSalvo === 100
              ? 'Hoje sem restricao: nenhum desconto pede aprovacao.'
              : `Hoje acima de ${tetoSalvo}% a proposta vai para aprovacao e nao pode ser marcada como ganha antes dela.`}{' '}
            Mudar o teto nao mexe nas propostas que ja existem — a regra nova vale na proxima vez que cada uma
            for editada.
          </p>
        </Card>
      )}

```

(o resultado é a `{erro && <Alerta>{erro}</Alerta>}` seguida direto pelo comentário `{/* 1.3 — risco. ... */}`).

- [x] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS — sem import/variável não usada.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/pages/crm/ComercialTab.tsx
git commit -m "refactor(comercial): remove cartao de politica de desconto da Leitura do Credenciamento"
```

---

### Task 4: Frontend — "Jornadas em risco" vira "Credenciamentos em Risco"

**Files:**
- Modify: `apps/web/src/pages/crm/ComercialTab.tsx`

**Interfaces:**
- Consumes: `Risco.aguardandoParceiro`/`Risco.aguardandoEquipe` (Task 1/2,
  já devolvidos pela API — o tipo local `Risco` deste arquivo precisa dos
  mesmos dois campos para o TS aceitar `risco.aguardandoParceiro`).
- Produces: nenhuma interface nova — o `risco` que este task consome
  continua disponível para a Task 5 usar em "Parceiros parados".

- [x] **Step 1: Espelhar os dois campos novos no tipo local `Risco`**

Troque (linhas 44-52):

```ts
type Risco = {
  atrasadas: Balde;
  vencendo: Balde;
  emForecast: Balde;
  semPrevisao: Balde;
  semProximaAcao: Balde;
  abertas: Balde;
  diasDeAviso: number;
};
```

por:

```ts
type Risco = {
  atrasadas: Balde;
  vencendo: Balde;
  emForecast: Balde;
  semPrevisao: Balde;
  semProximaAcao: Balde;
  aguardandoParceiro: Balde;
  aguardandoEquipe: Balde;
  abertas: Balde;
  diasDeAviso: number;
};
```

- [x] **Step 2: Renomear o cartão e os tiles**

Troque o bloco inteiro do cartão de risco:

```tsx
      {/* 1.3 — risco. Primeiro na tela de proposito: e o unico bloco acionavel
          hoje; o resto e leitura. Os baldes se sobrepoem, e o texto diz isso. */}
      {risco && (
        <Card
          titulo="Jornadas em risco"
          descricao={`Foto do momento — ${risco.abertas.total} aberta(s). Um cartao pode entrar em mais de um balde.`}
        >
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              rotulo="Atrasadas"
              valor={risco.atrasadas.total}
              detalhe={moeda(risco.atrasadas.valor)}
              estado={risco.atrasadas.total > 0 ? ESTADO.atencao : undefined}
            />
            <StatTile
              rotulo={`Vencem em ${risco.diasDeAviso}d`}
              valor={risco.vencendo.total}
              detalhe={moeda(risco.vencendo.valor)}
            />
            <StatTile
              rotulo="Em forecast"
              valor={risco.emForecast.total}
              detalhe={moeda(risco.emForecast.valor)}
            />
            <StatTile
              rotulo="Sem previsao"
              valor={risco.semPrevisao.total}
              detalhe={moeda(risco.semPrevisao.valor)}
            />
            <StatTile
              rotulo="Sem proxima acao"
              valor={risco.semProximaAcao.total}
              detalhe={moeda(risco.semProximaAcao.valor)}
              estado={risco.semProximaAcao.total > 0 ? ESTADO.atencao : undefined}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            &quot;Sem proxima acao&quot; usa a mesma regra do cartao do funil: conta apenas tarefa com prazo em
            aberto. Nota sem prazo e registro do que aconteceu, nao proximo passo.
          </p>
        </Card>
      )}
```

por:

```tsx
      {/* 1.3 — risco. Primeiro na tela de proposito: e o unico bloco acionavel
          hoje; o resto e leitura. Os baldes se sobrepoem, e o texto diz isso. */}
      {risco && (
        <Card
          titulo="Credenciamentos em Risco"
          descricao={`Foto do momento — ${risco.abertas.total} aberto(s). Um cartao pode entrar em mais de um balde.`}
        >
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              rotulo="Atrasados"
              valor={risco.atrasadas.total}
              detalhe={moeda(risco.atrasadas.valor)}
              estado={risco.atrasadas.total > 0 ? ESTADO.atencao : undefined}
            />
            <StatTile
              rotulo={`Vencem em ${risco.diasDeAviso}d`}
              valor={risco.vencendo.total}
              detalhe={moeda(risco.vencendo.valor)}
            />
            <StatTile
              rotulo="Sem previsao"
              valor={risco.semPrevisao.total}
              detalhe={moeda(risco.semPrevisao.valor)}
            />
            <StatTile
              rotulo="Sem proxima acao"
              valor={risco.semProximaAcao.total}
              detalhe={moeda(risco.semProximaAcao.valor)}
              estado={risco.semProximaAcao.total > 0 ? ESTADO.atencao : undefined}
            />
            <StatTile
              rotulo="Aguardando parceiro"
              valor={risco.aguardandoParceiro.total}
              detalhe={moeda(risco.aguardandoParceiro.valor)}
            />
            <StatTile
              rotulo="Aguardando equipe"
              valor={risco.aguardandoEquipe.total}
              detalhe={moeda(risco.aguardandoEquipe.valor)}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            &quot;Sem proxima acao&quot; usa a mesma regra do cartao do funil: conta apenas tarefa com prazo em
            aberto. Nota sem prazo e registro do que aconteceu, nao proximo passo. &quot;Aguardando parceiro&quot;
            e &quot;aguardando equipe&quot; contam pela etapa atual (Pendencia e Aprovacao).
          </p>
        </Card>
      )}
```

- [x] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/pages/crm/ComercialTab.tsx
git commit -m "feat(comercial): Credenciamentos em Risco com baldes aguardando parceiro/equipe"
```

---

### Task 5: Frontend — indicadores e "foto do momento" em vocabulário de credenciamento

**Files:**
- Modify: `apps/web/src/pages/crm/ComercialTab.tsx`

**Interfaces:**
- Consumes: `risco` (Task 3/4) para o tile "Parceiros parados".
- Produces: nenhuma interface nova.

- [x] **Step 1: Renomear/remover os tiles do fluxo do período**

Troque:

```tsx
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <StatTile rotulo="Ganhas" valor={ind.atual.ganhas} detalhe={moeda(ind.atual.valorGanho)} />
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.ganhas} /></div>
            </div>
            <div>
              <StatTile rotulo="Perdidas" valor={ind.atual.perdidas} detalhe={moeda(ind.atual.valorPerdido)} />
              {/* Perda subindo e ruim: a cor inverte. */}
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.perdidas} inverter /></div>
            </div>
            <div>
              <StatTile rotulo="Taxa de conversao" valor={pct(ind.atual.taxaConversao)} detalhe="das decididas no periodo" />
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.taxaConversao} /></div>
            </div>
            <div>
              <StatTile
                rotulo="Ticket medio"
                valor={ind.atual.ticketMedio === null ? '—' : moeda(ind.atual.ticketMedio)}
                detalhe="por jornada ganha"
              />
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.ticketMedio} /></div>
            </div>
            <div>
              <StatTile
                rotulo="Ciclo medio"
                valor={ind.atual.cicloMedioDias === null ? '—' : `${ind.atual.cicloMedioDias.toFixed(1)} d`}
                detalhe="abertura ate ganho"
              />
              {/* Ciclo mais longo e pior: inverte tambem. */}
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.cicloMedioDias} inverter /></div>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Foto do momento — sem comparacao com periodo anterior
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile rotulo="Abertas" valor={ind.agora.abertas} />
              <StatTile rotulo="Valor em aberto" valor={moeda(ind.agora.valorEmAberto)} />
              <StatTile
                rotulo="Previsao ponderada"
                valor={moeda(ind.agora.previsaoPonderada)}
                detalhe="valor x probabilidade da etapa"
              />
            </div>
          </div>
```

por:

```tsx
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <StatTile rotulo="Credenciamentos concluidos" valor={ind.atual.ganhas} />
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.ganhas} /></div>
            </div>
            <div>
              <StatTile rotulo="Desistencias" valor={ind.atual.perdidas} />
              {/* Perda subindo e ruim: a cor inverte. */}
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.perdidas} inverter /></div>
            </div>
            <div>
              <StatTile rotulo="Taxa de conversao" valor={pct(ind.atual.taxaConversao)} detalhe="das decididas no periodo" />
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.taxaConversao} /></div>
            </div>
            <div>
              <StatTile
                rotulo="Lead Time medio"
                valor={ind.atual.cicloMedioDias === null ? '—' : `${ind.atual.cicloMedioDias.toFixed(1)} d`}
                detalhe="abertura ate credenciado"
              />
              {/* Ciclo mais longo e pior: inverte tambem. */}
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.cicloMedioDias} inverter /></div>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Foto do momento — sem comparacao com periodo anterior
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile rotulo="Parceiros em andamento" valor={ind.agora.abertas} />
              <StatTile
                rotulo="Parceiros parados"
                valor={risco?.atrasadas.total ?? 0}
                detalhe={`${risco?.diasDeAviso ?? 7} dias de aviso`}
                estado={risco && risco.atrasadas.total > 0 ? ESTADO.atencao : undefined}
              />
            </div>
          </div>
```

Note: `ticketMedio`/`valorGanho`/`valorPerdido`/`valorEmAberto`/`previsaoPonderada`
continuam existindo em `ind`/`Fluxo`/`Indicadores` (tipo local e resposta da
API) — só pararam de ser lidos nesta tela. Não apague os campos do tipo
`Fluxo`/`Indicadores` (linhas 54-71): outra tela ou uma extensão futura pode
querer os mesmos dados, e apagar tipo que a API ainda devolve é trabalho sem
motivo.

- [x] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/pages/crm/ComercialTab.tsx
git commit -m "feat(comercial): indicadores do periodo e foto do momento em vocabulario de credenciamento"
```

---

### Task 6: Frontend — "Perdas por motivo" vira "Motivos de desistência"

**Files:**
- Modify: `apps/web/src/pages/crm/ComercialTab.tsx:420-421`

**Interfaces:**
- Consumes: nada de tarefa anterior.
- Produces: nenhuma.

- [x] **Step 1: Renomear o título do cartão**

Troque:

```tsx
        <Card
          titulo="Perdas por motivo"
          descricao={`${perdas.total} perda(s) na janela — ${moeda(perdas.valor)} deixados na mesa`}
        >
```

por:

```tsx
        <Card
          titulo="Motivos de desistencia"
          descricao={`${perdas.total} perda(s) na janela — ${moeda(perdas.valor)} deixados na mesa`}
        >
```

- [x] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/pages/crm/ComercialTab.tsx
git commit -m "refactor(comercial): renomeia cartao de Perdas por motivo para Motivos de desistencia"
```

---

### Task 7: Verificação final

**Files:** nenhum (só rodar comandos).

- [x] **Step 1: Typecheck completo dos dois workspaces**

Run: `cd apps/api && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: PASS nos dois.

- [x] **Step 2: Suite de testes completa dos dois workspaces**

Run: `cd apps/api && npx vitest run && cd ../web && npx vitest run`
Expected: PASS em todos os arquivos, incluindo os testes novos da Task 1.

- [x] **Step 3: Conferir visualmente**

Abrir `http://localhost:5173/gestao` logado como ADMIN e confirmar: o bloco
"Leitura do Credenciamento" aparece abaixo dos cartões da Esteira, sem
cartão de política de desconto, com "Credenciamentos em Risco" mostrando 6
tiles (incluindo Aguardando parceiro/equipe), e os cartões de indicadores e
motivos de desistência com os nomes novos.
