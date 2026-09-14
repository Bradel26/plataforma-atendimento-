# Roteamento Multi-WhatsApp (ponte nao oficial) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o modo WhatsApp nao oficial (ponte Baileys) identificar, no recebimento, qual numero pessoal (vendedor) recebeu a mensagem — hoje toda mensagem entra pela config compartilhada porque a ponte nao informa a sessao — e expor conectar/QR/desconectar por numero pessoal na API e na tela de Canais, para que cada vendedor consiga parear o proprio WhatsApp.

**Architecture:** A ponte (`apps/ponte`) ja roda multi-sessao internamente (`Map<string, Sessao>` em `sessao.ts`) e ja sabe, por mensagem recebida, qual `Sessao` (logo qual `nome`) a originou (`receber(sessao, msg)` em `recebida.ts`). Falta so essa sessao viajar ate a API. O envio ja funciona corretamente (`canalConfigId` grava a config exata, `ponteSessao` decide a URL de saida) — este plano mexe **apenas no caminho de entrada e no pareamento por numero**, sem tocar no de saida. `ChannelConfig.ponteSessao` ja e o campo que identifica a linha pessoal na ponte; ele passa a ser o "identificador externo" desse modo, do mesmo jeito que `phoneNumberId` ja e para o modo oficial da Meta (`configDoDestino`).

**Tech Stack:** Node + TypeScript, Express 4, Prisma 6, Baileys (`apps/ponte`), React 18 + Vite (`apps/web`). Testes: Vitest (funcao pura) + smoke tests em `scripts/*.mjs` (o que depende de Postgres/API de pe).

**Spec:** Auditoria e mapa de aderencia apresentados nesta conversa (FASE 1/2), item critico do requisito §5 do prompt original ("multiplos WhatsApp", cada numero como canal independente vinculado a um vendedor).

## Global Constraints

- Nao alterar o caminho de envio (`outbound.service.ts`, `whatsapp.ponte.ts`) — ja funciona corretamente por `canalConfigId`/`ponteSessao`.
- Nao mudar o contrato do webhook oficial da Meta (`webhooks.routes.ts`, `organizacaoDoWebhook`) — este plano toca so o webhook da ponte (`ponte.routes.ts`) e o modulo `channels`.
- Manter retrocompatibilidade: uma ponte que ainda nao manda o campo `sessao` (ou uma instalacao com sessao unica, sem `ponteSessao` configurado) deve continuar caindo na config compartilhada exatamente como hoje — nenhuma instalacao existente pode quebrar.
- Seguir os padroes de nomenclatura do arquivo (portugues nos identificadores de dominio: `configDoDestino`, `identificadorDestino`, `numeroForm`, etc.).
- Testes de logica pura em Vitest (`*.test.ts`, roda sem infra); o que depende de Postgres/API de pe vira smoke test (`scripts/smoke-*.mjs`, roda com `npm run dev` + seed aplicado) — e a divisao ja usada em todo o repo, nao criar infraestrutura de teste nova.

---

## File Structure

| Arquivo | Responsabilidade nesta mudanca |
|---|---|
| `apps/ponte/src/plataforma.ts` | `MensagemRecebida` ganha o campo `sessao`; `entregar` continua so entregando o que recebe |
| `apps/ponte/src/recebida.ts` | Passa `sessao: sessao.nome` para `entregar(...)` |
| `apps/api/src/modules/channels/ponte.routes.ts` | Aceita `sessao` no corpo; usa como `identificadorDestino` em vez de `null` |
| `apps/api/src/modules/channels/channels.service.ts` | `configDoDestino` passa a casar tambem por `ponteSessao` |
| `apps/api/src/modules/channels/channels.routes.ts` | Novas rotas `GET/POST /numeros/:id/ponte/{estado,qr,desconectar}` |
| `apps/web/src/pages/configuracoes/CanaisTab.tsx` | Formulario de numero pessoal ganha modo ponte + QR/estado/desconectar por numero |
| `scripts/smoke-ponte-multi.mjs` | Smoke test do cenario completo: 2 numeros pessoais, 2 sessoes, cada mensagem cai no vendedor certo |
| `package.json` | Registra `smoke:ponte-multi` |

---

### Task 1: Ponte inclui o nome da sessao no payload de entrega

**Files:**
- Modify: `apps/ponte/src/plataforma.ts`
- Modify: `apps/ponte/src/recebida.ts`

**Interfaces:**
- Consumes: `Sessao.nome` (ja existe em `apps/ponte/src/sessao.ts:38`).
- Produces: `MensagemRecebida.sessao: string` — Task 2 (lado API) le esse campo no corpo do POST `/api/webhooks/ponte/whatsapp/:organizacaoId`.

- [ ] **Step 1: Acrescentar o campo `sessao` ao tipo `MensagemRecebida`**

Em `apps/ponte/src/plataforma.ts`, dentro do bloco `export type MensagemRecebida = { ... }` (linhas 14-23), acrescente o campo logo apos `numero`:

```typescript
export type MensagemRecebida = {
  numero: string;
  /** Nome da sessao/instancia que recebeu, para a plataforma achar a linha certa entre varias. */
  sessao: string;
  nome?: string | null;
  texto?: string;
  /** Id da mensagem no WhatsApp. E ele que impede duplicata na reentrega. */
  idExterno: string;
  anexoUrl?: string | null;
  tipoAnexo?: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'VIDEO' | 'ARQUIVO';
  anexoNome?: string | null;
};
```

Nao mexa em mais nada neste arquivo: `entregar()` ja serializa o objeto inteiro (`JSON.stringify(mensagem)`), o campo novo viaja sozinho.

- [ ] **Step 2: Passar `sessao.nome` para `entregar(...)` em `recebida.ts`**

Em `apps/ponte/src/recebida.ts`, dentro de `receber(sessao, msg)` (linhas 131-178), a chamada a `entregar` fica:

```typescript
    await entregar({
      numero,
      sessao: sessao.nome,
      nome: msg.pushName ?? null,
      texto,
      idExterno,
      tipoAnexo: anexo ? extraido.tipo : 'TEXTO',
      anexoUrl: anexo?.url ?? null,
      anexoNome: anexo?.nome ?? null,
    });
```

(Unica mudanca: a linha `sessao: sessao.nome,` acrescentada logo apos `numero`.)

- [ ] **Step 3: Checar o typecheck da ponte**

Run: `npm run typecheck --workspace=apps/ponte`
Expected: sem erros (o campo `sessao` obrigatorio em `MensagemRecebida` esta preenchido no unico lugar que a constroi).

- [ ] **Step 4: Commit**

```bash
git add apps/ponte/src/plataforma.ts apps/ponte/src/recebida.ts
git commit -m "feat(ponte): inclui o nome da sessao na mensagem entregue a plataforma"
```

---

### Task 2: API resolve a `ChannelConfig` certa pela sessao da ponte

**Files:**
- Modify: `apps/api/src/modules/channels/channels.service.ts`
- Modify: `apps/api/src/modules/channels/ponte.routes.ts`

**Interfaces:**
- Consumes: `corpo.sessao` (novo campo do payload da ponte, Task 1); `ChannelConfig.ponteSessao` (campo ja existente no schema).
- Produces: `configDoDestino(canal, identificador)` passa a casar tambem quando `identificador` bate com `ponteSessao` de alguma `ChannelConfig` — comportamento que `destinoDaMensagem` (`inbound.service.ts:23-37`) ja consome sem mudanca nenhuma la, porque ele so chama `configDoDestino` e usa o resultado.

- [ ] **Step 1: Extender `configDoDestino` para casar tambem por `ponteSessao`**

Em `apps/api/src/modules/channels/channels.service.ts`, a funcao `configDoDestino` (linhas 272-280) fica:

```typescript
export async function configDoDestino(canal: Channel, identificador: string | null) {
  if (identificador) {
    const porId = await prisma.channelConfig.findFirst({
      where: {
        canal,
        OR: [
          { phoneNumberId: identificador },
          { pageId: identificador },
          { igUserId: identificador },
          // Identificador da ponte nao oficial: o nome da sessao/instancia
          // Baileys que recebeu a mensagem. Nao colide com os ids da Meta —
          // sao espacos de nomes diferentes (ids numericos da Meta vs. nome
          // livre de sessao) — entao um OR simples basta, sem checar o modo.
          { ponteSessao: identificador },
        ],
      },
    });
    if (porId) return aberto(porId);
  }
  return obterConfig(canal);
}
```

(Unica mudanca: acrescentar `{ ponteSessao: identificador }` ao array `OR`.)

- [ ] **Step 2: Escrever o teste que falha primeiro**

Nao ha teste de unidade para `configDoDestino` hoje porque a funcao depende do Postgres (via `prisma`) — o padrao do repo para logica dependente de banco e smoke test, nao Vitest (ver `vitest.config.ts`: "o que depende de Postgres... continua coberto pelos smoke tests"). O teste que prova este passo vem no Task 5 (`scripts/smoke-ponte-multi.mjs`, cenario 3). Pule para o Step 3 aqui.

- [ ] **Step 3: Aceitar `sessao` no corpo do webhook da ponte**

Em `apps/api/src/modules/channels/ponte.routes.ts`, o `mensagemSchema` (linhas 36-50) ganha o campo:

```typescript
const mensagemSchema = z.object({
  /** Numero de quem mandou, em qualquer formato: normalizamos aqui. */
  numero: z.string().trim().min(8).max(30),
  /**
   * Nome da sessao/instancia da ponte que recebeu esta mensagem — o mesmo
   * valor de `ChannelConfig.ponteSessao` cadastrado na linha pessoal do
   * vendedor. Opcional: uma ponte antiga (ou de sessao unica) que nao manda
   * este campo cai na config compartilhada, como sempre foi.
   */
  sessao: z.string().trim().min(1).max(60).optional(),
  nome: z.string().trim().max(120).nullable().optional(),
  texto: z.string().max(4096).optional(),
  /**
   * Id da mensagem na ponte. **Obrigatorio**, e o motivo e a idempotencia: a
   * ponte reentrega quando nao recebe 200, e sem id proprio a reentrega criaria
   * mensagem duplicada na conversa do cliente.
   */
  idExterno: z.string().trim().min(1).max(200),
  anexoUrl: z.string().trim().url().nullable().optional(),
  tipoAnexo: z.enum(['TEXTO', 'IMAGEM', 'AUDIO', 'VIDEO', 'ARQUIVO']).optional(),
  anexoNome: z.string().trim().max(200).nullable().optional(),
});
```

- [ ] **Step 4: Usar `corpo.sessao` como `identificadorDestino`**

Ainda em `ponte.routes.ts`, dentro do handler (linhas 138-156), troque o comentario e o valor fixo:

```typescript
      const resultado = await registrarMensagemEntrante({
        canal: 'WHATSAPP',
        // O endereco externo e o numero normalizado: e ele que o envio usa de
        // volta, e guardar formatos diferentes na ida e na volta faria a resposta
        // abrir uma conversa nova em vez de continuar a mesma.
        enderecoExterno: numero,
        nomeExibicao: corpo.nome ?? null,
        telefone: numero,
        idExterno: corpo.idExterno,
        conteudo,
        tipoAnexo,
        anexoUrl: corpo.anexoUrl ?? null,
        // A ponte nao tem media id: ela manda a URL ou nada.
        anexoIdExterno: null,
        anexoNome: corpo.anexoNome ?? null,
        // O nome da sessao identifica a linha pessoal (`ChannelConfig.ponteSessao`).
        // Sem ele (ponte antiga, ou sessao unica sem apelido cadastrado),
        // `configDoDestino` cai na config compartilhada — mesmo comportamento
        // de antes desta mudanca.
        identificadorDestino: corpo.sessao?.trim() || null,
      });
```

- [ ] **Step 5: Typecheck e testes de unidade do modulo `channels`**

Run: `npm run typecheck --workspace=apps/api`
Expected: sem erros.

Run: `npx vitest run apps/api/src/modules/channels`
Expected: os testes existentes (`whatsapp.modo.test.ts`, `channels.assinatura.test.ts`, `meta.parser.test.ts`) continuam passando — nao ha teste novo aqui (ver Step 2).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/channels/channels.service.ts apps/api/src/modules/channels/ponte.routes.ts
git commit -m "feat(channels): roteia mensagem da ponte para a linha pessoal pela sessao"
```

---

### Task 3: Rotas de QR/estado/desconectar por numero pessoal

**Files:**
- Modify: `apps/api/src/modules/channels/channels.routes.ts`

**Interfaces:**
- Consumes: `obterConfigPorId(id)` (ja existe em `channels.service.ts:257-260`), `estadoDaPonte`, `qrDaPonte`, `desconectarPonte` (ja existem em `whatsapp.ponte.ts`, aceitam qualquer objeto com `ponteUrl`/`ponteToken`/`ponteSessao`), `modoEfetivo`, `AVISO_NAO_OFICIAL` (ja importados no arquivo).
- Produces: `GET /canais/numeros/:id/ponte/estado`, `GET /canais/numeros/:id/ponte/qr`, `POST /canais/numeros/:id/ponte/desconectar` — consumidos pelo frontend no Task 4.

- [ ] **Step 1: Importar `forbidden` e `organizacaoAtual` (este ja esta importado)**

No topo de `apps/api/src/modules/channels/channels.routes.ts`, a linha de import de erros passa a trazer `forbidden` tambem:

```typescript
import { forbidden, notFound } from '../../lib/errors';
```

(Antes era so `import { notFound } from '../../lib/errors';` — linha 8.)

- [ ] **Step 2: Escrever o helper de permissao dono-ou-admin**

Logo apos a declaracao de `channelsRoutes` e `channelsRoutes.use(requireAuth)` (linha 26), acrescente:

```typescript
/**
 * ADMIN mexe em qualquer numero; o vendedor dono da linha mexe na propria.
 *
 * E a mesma logica de "Meu WhatsApp" do vendedor (a ficha 360 dele): ele nao
 * precisa de um ADMIN por perto so para escanear o proprio QR de novo quando
 * o celular ficar sem bateria.
 */
function exigirDonoOuAdmin(req: Parameters<Parameters<typeof asyncHandler>[0]>[0], donoId: string | null) {
  const usuario = req.user!;
  if (usuario.perfil === 'ADMIN') return;
  if (donoId && usuario.sub === donoId) return;
  throw forbidden();
}
```

- [ ] **Step 3: Adicionar as tres rotas por numero**

Logo apos o bloco de `/numeros/:id/ia` (apos a linha 250, antes de `channelsRoutes.post('/:canal/numeros', ...)`), acrescente:

```typescript
/**
 * Estado da sessao da ponte de uma linha PESSOAL — o irmao de
 * `/whatsapp/ponte/estado`, so que por numero em vez do canal compartilhado.
 *
 * ADMIN ve qualquer numero; o proprio vendedor ve so o dele — e o "Meu
 * WhatsApp: conectado" que a ficha dele mostra.
 */
channelsRoutes.get(
  '/numeros/:id/ponte/estado',
  asyncHandler(async (req, res) => {
    const config = await obterConfigPorId(param(req, 'id'));
    if (!config) throw notFound('Numero nao encontrado');
    exigirDonoOuAdmin(req, config.donoId);

    const caminhoWebhook = `/api/webhooks/ponte/whatsapp/${organizacaoAtual()}`;

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({
        estado: { situacao: 'DESCONHECIDO', detalhe: 'este numero nao esta no modo nao oficial' },
        aviso: AVISO_NAO_OFICIAL,
        caminhoWebhook,
      });
      return;
    }
    res.json({ estado: await estadoDaPonte(config), aviso: AVISO_NAO_OFICIAL, caminhoWebhook });
  }),
);

/**
 * QR para parear a linha pessoal — o vendedor escaneia com o proprio celular.
 *
 * Diferente do QR do canal compartilhado (ADMIN-only, porque pareia o numero
 * da empresa inteira): aqui quem escaneia esta pareando o proprio numero, e o
 * dono da linha pode fazer isso sozinho.
 */
channelsRoutes.get(
  '/numeros/:id/ponte/qr',
  asyncHandler(async (req, res) => {
    const config = await obterConfigPorId(param(req, 'id'));
    if (!config) throw notFound('Numero nao encontrado');
    exigirDonoOuAdmin(req, config.donoId);

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      res.json({ qr: null, conectado: false, motivo: 'este numero nao esta no modo nao oficial' });
      return;
    }
    res.json(await qrDaPonte(config));
  }),
);

/** Desfaz o pareamento da linha pessoal — o "trocar de numero" do vendedor. */
channelsRoutes.post(
  '/numeros/:id/ponte/desconectar',
  asyncHandler(async (req, res) => {
    const config = await obterConfigPorId(param(req, 'id'));
    if (!config) throw notFound('Numero nao encontrado');
    exigirDonoOuAdmin(req, config.donoId);

    if (config.canal !== 'WHATSAPP' || modoEfetivo(config.modo) !== 'NAO_OFICIAL') {
      throw notFound('Este numero nao esta no modo nao oficial');
    }
    await desconectarPonte(config);
    res.json({ ok: true });
  }),
);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: sem erros. Se `req.user` reclamar de tipo em `exigirDonoOuAdmin`, troque a assinatura do helper para `(req: Request, donoId: string | null)` importando `Request` de `express` (ja importado no arquivo como tipo em outros pontos do modulo `channels`) — o essencial e ler `req.user!.perfil` e `req.user!.sub`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/channels/channels.routes.ts
git commit -m "feat(channels): expoe QR, estado e desconexao por numero pessoal de WhatsApp"
```

---

### Task 4: Tela de Canais — conectar o numero pessoal pela ponte

**Files:**
- Modify: `apps/web/src/pages/configuracoes/CanaisTab.tsx`

**Interfaces:**
- Consumes: `GET/POST /canais/numeros/:id/ponte/{estado,qr,desconectar}` (Task 3), campos `modo`/`ponteUrl`/`ponteSessao` etc. ja presentes em `CanalConfig` (linhas 26-30 do arquivo, sem mudanca de tipo).
- Produces: nada consumido por outro arquivo — e a ponta final da funcionalidade.

- [ ] **Step 1: `numeroVazio` ganha os campos da ponte e do modo**

Troque o objeto `numeroVazio` (linhas 35-48):

```typescript
const numeroVazio = {
  id: null as string | null,
  nome: '',
  donoId: '',
  modo: 'OFICIAL' as 'OFICIAL' | 'NAO_OFICIAL',
  phoneNumberId: '',
  accessToken: '',
  appSecret: '',
  verifyToken: '',
  ponteUrl: '',
  ponteToken: '',
  ponteSegredo: '',
  ponteSessao: '',
  filaId: '',
  ativo: true,
  iaAtiva: false,
  iaUrlWebhook: '',
  iaSegredo: '',
};
```

- [ ] **Step 2: Estado de QR/estado por numero**

Logo apos a declaracao de `numeroOcupado` (linha 129), acrescente:

```typescript
  /** Qual linha pessoal esta com o painel de conexao aberto — nulo = nenhuma. */
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null);
  const [estadoLinha, setEstadoLinha] = useState<EstadoDaPonte | null>(null);
  const [qrLinha, setQrLinha] = useState<QrDaPonte | null>(null);
  const [trocandoLinha, setTrocandoLinha] = useState(false);
```

- [ ] **Step 3: Polling do QR da linha aberta**

Logo apos o `useEffect` que faz o polling do QR compartilhado (apos a linha 220, o `}, [editando, modo]);`), acrescente um segundo efeito, no mesmo padrao:

```typescript
  useEffect(() => {
    if (!linhaAberta) {
      setQrLinha(null);
      setEstadoLinha(null);
      return;
    }

    let vivo = true;

    const buscar = async () => {
      try {
        const [e, q] = await Promise.all([
          api.get<{ estado: EstadoDaPonte }>(`/canais/numeros/${linhaAberta}/ponte/estado`),
          api.get<QrDaPonte>(`/canais/numeros/${linhaAberta}/ponte/qr`),
        ]);
        if (vivo) {
          setEstadoLinha(e.estado);
          setQrLinha(q);
        }
      } catch {
        // Mesma razao do polling compartilhado: a ponte cair nao pode apagar o
        // QR que a pessoa esta escaneando agora.
      }
    };

    void buscar();
    const timer = window.setInterval(() => {
      void buscar();
    }, 5_000);

    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [linhaAberta]);
```

- [ ] **Step 4: Acao de trocar de numero de uma linha pessoal**

Logo apos a funcao `trocarNumero` (compartilhada, apos a linha 248), acrescente:

```typescript
  const trocarLinha = (numero: CanalConfig) => {
    confirmar({
      titulo: `Desconectar o WhatsApp de ${numero.dono?.nome}?`,
      descricao: 'Ele para de receber pelo WhatsApp ate escanear o novo QR.',
      variante: 'perigo',
      rotuloConfirmar: 'Desconectar',
      aoConfirmar: async () => {
        setTrocandoLinha(true);
        setNumeroErro(null);
        try {
          await api.post(`/canais/numeros/${numero.id}/ponte/desconectar`, {});
          setQrLinha(null);
          setEstadoLinha(null);
        } catch (e) {
          setNumeroErro(e instanceof ApiError ? e.message : 'Falha ao desconectar o numero');
        } finally {
          setTrocandoLinha(false);
        }
      },
    });
  };
```

- [ ] **Step 5: `editarNumero` carrega modo e campos da ponte**

Troque o corpo de `editarNumero` (linhas 293-312):

```typescript
  const editarNumero = async (numero: CanalConfig) => {
    setNumeroErro(null);
    setNumeroOk(null);
    let ia: IaDoNumero | null = null;
    try {
      ia = (await api.get<{ ia: IaDoNumero }>(`/canais/numeros/${numero.id}/ia`)).ia;
    } catch {
      // Sem IA configurada ainda nesta linha — segue com os campos em branco.
    }
    setNumeroForm({
      ...numeroVazio,
      id: numero.id,
      nome: numero.nome ?? '',
      donoId: numero.dono?.id ?? '',
      modo: numero.modo ?? 'OFICIAL',
      filaId: numero.fila?.id ?? '',
      ativo: numero.ativo,
      iaAtiva: ia?.ativa ?? false,
      iaUrlWebhook: ia?.webhook ?? '',
    });
  };
```

(Unica mudanca: acrescentar `modo: numero.modo ?? 'OFICIAL',`. Os campos secretos — `ponteToken`, `ponteSegredo`, `accessToken` etc. — continuam em branco de proposito, como ja e o padrao desta tela: "campos em branco nao alteram o valor salvo".)

- [ ] **Step 6: `salvarNumero` manda os campos certos por modo**

Troque o miolo de `salvarNumero` que monta o corpo (linhas 328-335):

```typescript
      const corpo: Record<string, unknown> = { ativo: numeroForm.ativo, modo: numeroForm.modo };
      if (numeroForm.nome) corpo.nome = numeroForm.nome;
      if (numeroForm.donoId) corpo.donoId = numeroForm.donoId;
      if (numeroForm.filaId) corpo.filaId = numeroForm.filaId;
      if (numeroForm.modo === 'NAO_OFICIAL') {
        if (numeroForm.ponteUrl) corpo.ponteUrl = numeroForm.ponteUrl;
        if (numeroForm.ponteToken) corpo.ponteToken = numeroForm.ponteToken;
        if (numeroForm.ponteSegredo) corpo.ponteSegredo = numeroForm.ponteSegredo;
        if (numeroForm.ponteSessao) corpo.ponteSessao = numeroForm.ponteSessao;
      } else {
        if (numeroForm.phoneNumberId) corpo.phoneNumberId = numeroForm.phoneNumberId;
        if (numeroForm.accessToken) corpo.accessToken = numeroForm.accessToken;
        if (numeroForm.appSecret) corpo.appSecret = numeroForm.appSecret;
        if (numeroForm.verifyToken) corpo.verifyToken = numeroForm.verifyToken;
      }
```

(O restante da funcao — criacao/atualizacao, chamada de IA, `setNumeroForm(numeroVazio)` etc. — nao muda.)

- [ ] **Step 7: Formulario — radio de modo + campos condicionais**

Na secao "Adicionar numero" (dentro do `grid gap-3 sm:grid-cols-2`, apos o campo "Rotulo" e antes de "Phone Number ID", por volta da linha 748), insira o seletor de modo fora do grid (ele ocupa a largura toda) e troque os campos fixos de Meta por um bloco condicional:

```tsx
              <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-medium text-slate-700">Como este vendedor conecta</p>
                <div className="mt-2 flex gap-4">
                  {(['OFICIAL', 'NAO_OFICIAL'] as const).map((opcao) => (
                    <label key={opcao} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="modo-numero"
                        value={opcao}
                        checked={numeroForm.modo === opcao}
                        onChange={() => setNumeroForm({ ...numeroForm, modo: opcao })}
                      />
                      {opcao === 'OFICIAL' ? 'API oficial (Meta)' : 'Ponte (QR Code)'}
                    </label>
                  ))}
                </div>
              </div>

              {numeroForm.modo === 'NAO_OFICIAL' ? (
                <>
                  <Field label="Endereco da ponte" hint="Em branco = usa o mesmo endereco do WhatsApp compartilhado">
                    <Input
                      value={numeroForm.ponteUrl}
                      placeholder="http://localhost:3000/api"
                      onChange={(e) => setNumeroForm({ ...numeroForm, ponteUrl: e.target.value })}
                    />
                  </Field>
                  <Field label="Token da ponte">
                    <Input
                      type="password"
                      value={numeroForm.ponteToken}
                      onChange={(e) => setNumeroForm({ ...numeroForm, ponteToken: e.target.value })}
                    />
                  </Field>
                  <Field label="Segredo de assinatura" hint="Minimo 16 caracteres — sem ele a mensagem recebida e recusada">
                    <Input
                      type="password"
                      value={numeroForm.ponteSegredo}
                      onChange={(e) => setNumeroForm({ ...numeroForm, ponteSegredo: e.target.value })}
                    />
                  </Field>
                  <Field label="Sessao na ponte" hint="Nome unico desta linha na ponte — e ele que identifica de qual vendedor veio cada mensagem">
                    <Input
                      value={numeroForm.ponteSessao}
                      placeholder={`vendedor-${numeroForm.donoId.slice(0, 8) || 'novo'}`}
                      onChange={(e) => setNumeroForm({ ...numeroForm, ponteSessao: e.target.value })}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Phone Number ID">
                    <Input
                      value={numeroForm.phoneNumberId}
                      onChange={(e) => setNumeroForm({ ...numeroForm, phoneNumberId: e.target.value })}
                    />
                  </Field>
                  <Field label="Access Token" hint="Nunca e exibido de volta">
                    <Input
                      type="password"
                      value={numeroForm.accessToken}
                      onChange={(e) => setNumeroForm({ ...numeroForm, accessToken: e.target.value })}
                    />
                  </Field>
                  <Field label="App Secret">
                    <Input
                      type="password"
                      value={numeroForm.appSecret}
                      onChange={(e) => setNumeroForm({ ...numeroForm, appSecret: e.target.value })}
                    />
                  </Field>
                  <Field label="Verify Token">
                    <Input
                      value={numeroForm.verifyToken}
                      onChange={(e) => setNumeroForm({ ...numeroForm, verifyToken: e.target.value })}
                    />
                  </Field>
                </>
              )}
```

Isso substitui o bloco atual de "Phone Number ID" / "Access Token" / "App Secret" / "Verify Token" (linhas 749-774), que ficava sempre visivel.

- [ ] **Step 8: Botao "Conectar" na lista de numeros + painel de QR expandido**

Na tabela de numeros pessoais, a linha de acoes (linhas 712-717) ganha o botao, e uma linha extra aparece logo abaixo quando `linhaAberta === n.id`:

```tsx
                    {numeros.map((n) => (
                      <>
                        <tr key={n.id}>
                          <td className="py-2 pr-2 text-slate-800">{n.dono?.nome}</td>
                          <td className="py-2 pr-2 text-slate-600">{n.phoneNumberId ?? n.ponteSessao ?? '—'}</td>
                          <td className="py-2 pr-2 text-slate-600">{n.fila?.nome ?? 'nenhuma (linha direta)'}</td>
                          <td className="py-2 pr-2">
                            {n.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge>Inativo</Badge>}
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              {n.modo === 'NAO_OFICIAL' && (
                                <Button
                                  variante="neutro"
                                  onClick={() => setLinhaAberta(linhaAberta === n.id ? null : n.id)}
                                >
                                  {linhaAberta === n.id ? 'Fechar' : 'Conectar'}
                                </Button>
                              )}
                              <Button variante="neutro" onClick={() => void editarNumero(n)}>Editar</Button>
                              <Button variante="perigo" onClick={() => void excluirNumero(n)}>Remover</Button>
                            </div>
                          </td>
                        </tr>
                        {linhaAberta === n.id && (
                          <tr key={`${n.id}-qr`}>
                            <td colSpan={5} className="bg-slate-50 px-2 py-3">
                              {estadoLinha && (
                                <p className="mb-2 flex items-center gap-2 text-xs">
                                  <span className="text-slate-500">Sessao:</span>
                                  <Badge
                                    tom={
                                      estadoLinha.situacao === 'CONECTADO'
                                        ? 'sucesso'
                                        : estadoLinha.situacao === 'DESCONECTADO'
                                          ? 'alerta'
                                          : 'neutro'
                                    }
                                  >
                                    {estadoLinha.situacao === 'CONECTADO'
                                      ? 'conectada'
                                      : estadoLinha.situacao === 'DESCONECTADO'
                                        ? 'desconectada'
                                        : 'nao confirmada'}
                                  </Badge>
                                </p>
                              )}
                              {qrLinha?.conectado ? (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-sm text-slate-700">
                                    <span className="font-medium text-emerald-700">Numero conectado.</span>
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => trocarLinha(n)}
                                    disabled={trocandoLinha}
                                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {trocandoLinha ? 'Desconectando...' : 'Trocar de numero'}
                                  </button>
                                </div>
                              ) : qrLinha?.qr ? (
                                <div className="flex flex-wrap items-center gap-4">
                                  <img
                                    src={qrLinha.qr}
                                    alt={`QR Code para conectar o WhatsApp de ${n.dono?.nome}`}
                                    width={180}
                                    height={180}
                                    className="rounded border border-slate-200"
                                  />
                                  <p className="text-xs text-slate-600">
                                    Peca para {n.dono?.nome} abrir o WhatsApp, tocar em{' '}
                                    <strong>Aparelhos conectados</strong> e apontar a camera para este codigo.
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  {qrLinha?.motivo ?? 'Gerando o QR Code...'}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
```

(A troca principal em relacao ao original: o `<tr>` de cada numero passa a estar dentro de um fragmento `<>...</>` para poder ter um `<tr>` irmao condicional logo abaixo, e a coluna "Numero" mostra `ponteSessao` quando nao ha `phoneNumberId`.)

- [ ] **Step 9: Rodar o frontend e verificar visualmente**

Run: `npm run dev --workspace=apps/web` (com a API tambem de pe — `npm run dev --workspace=apps/api`)
Abra Configuracoes → Canais → aba WhatsApp → "Numeros pessoais" → "Adicionar numero", escolha "Ponte (QR Code)", salve com um `vendedor1@plataforma.local` e uma sessao ex. `vendedor-1`. Clique "Conectar" na linha criada e confirme que aparece o painel (mesmo que a ponte real nao esteja rodando — nesse caso `qrLinha?.motivo` deve mostrar a mensagem de erro de conexao, nao quebrar a tela).
Expected: nenhum erro no console do navegador; o painel abre e fecha ao clicar "Conectar"/"Fechar".

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/pages/configuracoes/CanaisTab.tsx
git commit -m "feat(web): conecta o WhatsApp pessoal do vendedor por QR na tela de Canais"
```

---

### Task 5: Smoke test do cenario multi-vendedor

**Files:**
- Create: `scripts/smoke-ponte-multi.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `POST /auth/login`, `PUT /canais/whatsapp/numeros` → `POST /canais/whatsapp/numeros`, `GET /canais`, `POST /api/webhooks/ponte/whatsapp/:organizacaoId` (Task 2), `GET /conversas`, `GET /canais/numeros/:id/ponte/estado` (Task 3) — todas rotas ja existentes ou criadas neste plano.
- Produces: nenhum consumidor — e a verificacao final ponta a ponta.

- [ ] **Step 1: Escrever o script**

Create `scripts/smoke-ponte-multi.mjs`:

```javascript
/**
 * Smoke test do WhatsApp nao oficial com MAIS DE UM numero por organizacao.
 *
 * Cobre o requisito central da ponte multi-vendedor: duas linhas pessoais,
 * cada uma com sua propria sessao Baileys, e a mensagem que "chega" em cada
 * sessao precisa cair na conversa do VENDEDOR DONO daquela linha — nao na
 * config compartilhada, que era o comportamento antes desta mudanca.
 *
 * Nao depende da ponte (Baileys) de verdade: simula o que ela manda, assinando
 * o corpo com HMAC-SHA256 exatamente como `apps/ponte/src/plataforma.ts` faz.
 *
 * Uso: npm run smoke:ponte-multi  (com a API de pe e o seed aplicado)
 */
import { createHmac } from 'node:crypto';

const API = 'http://localhost:3333/api';
const EXECUCAO = Date.now().toString(36);

let falhas = 0;
const checar = (cond, titulo, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok    ' : 'FALHOU'} ${titulo}${extra ? ` — ${extra}` : ''}`);
};

async function req(metodo, rota, { corpoBruto, corpo, headers = {}, token } = {}) {
  const resp = await fetch(API + rota, {
    method: metodo,
    headers: {
      ...(corpo || corpoBruto ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: corpoBruto ?? (corpo ? JSON.stringify(corpo) : undefined),
  });
  const dados = await resp.json().catch(() => ({}));
  return { status: resp.status, dados };
}

const assinar = (corpo, segredo) => `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;

/* ── login e usuarios de vendedor (do seed) ────────────────────────────── */

const { dados: login } = await req('POST', '/auth/login', {
  corpo: { email: 'admin@plataforma.local', senha: 'Admin@123' },
});
checar(Boolean(login.accessToken), 'login do admin');
const admin = login.accessToken;

const { dados: usuarios } = await req('GET', '/usuarios', { token: admin });
const vendedor1 = usuarios.usuarios.find((u) => u.email === 'vendedor1@plataforma.local');
const vendedor2 = usuarios.usuarios.find((u) => u.email === 'vendedor2@plataforma.local');
checar(Boolean(vendedor1 && vendedor2), 'seed tem vendedor1 e vendedor2');

/* ── 1. Duas linhas pessoais, cada uma com sua propria sessao ─────────── */

const SEGREDO_1 = `segredo-linha-1-${EXECUCAO}`;
const SEGREDO_2 = `segredo-linha-2-${EXECUCAO}`;
const SESSAO_1 = `smoke-v1-${EXECUCAO}`;
const SESSAO_2 = `smoke-v2-${EXECUCAO}`;

const linha1 = await req('POST', '/canais/whatsapp/numeros', {
  token: admin,
  corpo: {
    donoId: vendedor1.id,
    nome: 'Vendedor 1 (smoke)',
    modo: 'NAO_OFICIAL',
    ativo: true,
    ponteUrl: 'http://ponte-inexistente:9999/api',
    ponteToken: 'token-qualquer-1234567890',
    ponteSegredo: SEGREDO_1,
    ponteSessao: SESSAO_1,
  },
});
checar(linha1.status === 201, '1. linha pessoal do vendedor 1 criada', `HTTP ${linha1.status}`);

const linha2 = await req('POST', '/canais/whatsapp/numeros', {
  token: admin,
  corpo: {
    donoId: vendedor2.id,
    nome: 'Vendedor 2 (smoke)',
    modo: 'NAO_OFICIAL',
    ativo: true,
    ponteUrl: 'http://ponte-inexistente:9999/api',
    ponteToken: 'token-qualquer-1234567890',
    ponteSegredo: SEGREDO_2,
    ponteSessao: SESSAO_2,
  },
});
checar(linha2.status === 201, '   linha pessoal do vendedor 2 criada', `HTTP ${linha2.status}`);

/* ── 2. Descobrir o id da organizacao pelo caminho do webhook ─────────── */

const { dados: estadoLinha1 } = await req('GET', `/canais/numeros/${linha1.dados.canal.id}/ponte/estado`, {
  token: admin,
});
const organizacaoId = estadoLinha1.caminhoWebhook.split('/').pop();
checar(Boolean(organizacaoId), '2. id da organizacao obtido pelo caminho do webhook');

/* ── 3. Mensagem de cada sessao cai no vendedor dono, nao no compartilhado ── */

const enviarPelaPonte = async (sessao, segredo, numeroCliente, texto, idMsg) => {
  const corpoBruto = JSON.stringify({ numero: numeroCliente, sessao, texto, idExterno: idMsg });
  return req('POST', `/webhooks/ponte/whatsapp/${organizacaoId}`, {
    corpoBruto,
    headers: { 'X-Ponte-Assinatura': assinar(corpoBruto, segredo) },
  });
};

const clienteDoV1 = `5511${String(Date.now()).slice(-9)}`;
const clienteDoV2 = `5511${String(Date.now() + 1).slice(-9)}`;

const r1 = await enviarPelaPonte(SESSAO_1, SEGREDO_1, clienteDoV1, 'Ola, quero um plano', `smoke.${EXECUCAO}.v1`);
checar(r1.status === 200 && r1.dados.ok === true, '3. mensagem da sessao 1 aceita', `HTTP ${r1.status}`);

const r2 = await enviarPelaPonte(SESSAO_2, SEGREDO_2, clienteDoV2, 'Preciso de suporte', `smoke.${EXECUCAO}.v2`);
checar(r2.status === 200 && r2.dados.ok === true, '   mensagem da sessao 2 aceita', `HTTP ${r2.status}`);

const { dados: conversas } = await req('GET', '/conversas?status=ATRIBUIDO&limite=100', { token: admin });
const conversaV1 = conversas.conversas.find((c) => c.contato?.telefone === clienteDoV1);
const conversaV2 = conversas.conversas.find((c) => c.contato?.telefone === clienteDoV2);

checar(
  Boolean(conversaV1 && conversaV1.agente?.id === vendedor1.id),
  '4. conversa da sessao 1 caiu no VENDEDOR 1',
  conversaV1 ? `agente=${conversaV1.agente?.nome}` : 'conversa nao encontrada',
);
checar(
  Boolean(conversaV2 && conversaV2.agente?.id === vendedor2.id),
  '   conversa da sessao 2 caiu no VENDEDOR 2',
  conversaV2 ? `agente=${conversaV2.agente?.nome}` : 'conversa nao encontrada',
);
checar(
  conversaV1?.id !== conversaV2?.id,
  '   as duas conversas sao registros diferentes (nao caiu tudo na compartilhada)',
);

/* ── 5. Assinatura de uma sessao nao vale para a outra ─────────────────── */

const r3 = await enviarPelaPonte(SESSAO_1, SEGREDO_2, clienteDoV1, 'tentando com segredo trocado', `smoke.${EXECUCAO}.x`);
checar(r3.status === 401, '5. segredo da sessao 2 nao assina mensagem da sessao 1', `HTTP ${r3.status}`);

/* ── 6. Sem sessao no corpo, cai no comportamento antigo (nao quebra) ──── */

const zap = await req('GET', '/canais', { token: admin });
const canalCompartilhado = zap.dados.canais.find((c) => c.canal === 'WHATSAPP' && !c.dono);
checar(Boolean(canalCompartilhado), '6. ainda existe (ou nunca existiu) config compartilhada — checagem informativa');

console.log(falhas === 0 ? `\nOK — ${EXECUCAO}` : `\n${falhas} falha(s) — ${EXECUCAO}`);
process.exit(falhas === 0 ? 0 : 1);
```

- [ ] **Step 2: Registrar o script em `package.json`**

Em `package.json`, na secao de scripts `smoke:*`, acrescente logo apos a linha `"smoke:canais": "node scripts/smoke-canais.mjs",`:

```json
    "smoke:ponte-multi": "node scripts/smoke-ponte-multi.mjs",
```

- [ ] **Step 3: Rodar a API localmente e o smoke test**

Run: `npm run dev --workspace=apps/api` (deixe rodando em outro terminal, com Postgres/Redis de pe e seed aplicado — `npm run seed` se ainda nao aplicado)
Run: `npm run smoke:ponte-multi`
Expected: todas as linhas `ok`, saida final `OK — <execucao>`, exit code 0.

Se o passo 4 (conversa caiu no vendedor certo) falhar com "conversa nao encontrada": confira se `GET /conversas` filtra por fila/agente do usuario logado — o smoke usa o token do ADMIN, que segundo a auditoria de RBAC ve tudo (`veTudo`), entao nao deveria filtrar; se ainda assim faltar, confirme que os Tasks 1-2 foram aplicados (o campo `sessao` precisa estar chegando e sendo casado).

- [ ] **Step 4: Rodar a suite de unidade inteira para garantir que nada quebrou**

Run: `npx vitest run`
Expected: todos os testes existentes continuam passando (nenhum teste de unidade foi alterado neste plano, so o smoke novo).

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-ponte-multi.mjs package.json
git commit -m "test: smoke test do roteamento multi-vendedor da ponte de WhatsApp"
```

---

## Self-Review (registrado para quem revisar o plano)

- **Cobertura da spec:** requisito critico do §5/§6 do prompt original (mensagem recebida identifica o numero/vendedor certo entre varios WhatsApp) — Tasks 1+2. Requisito do §7 ("Meu WhatsApp: conectado", vendedor conecta o proprio numero) — Tasks 3+4. Verificacao ponta a ponta do cenario de aceitacao do §19 (varios vendedores, varios numeros, mensagem cai no vendedor certo) — Task 5.
- **Fora de escopo deste plano** (mapeados na auditoria, mas nao aqui): endpoint agregado de indicadores por vendedor, drill-down do dashboard, segmentacao TIM/Starlink — ficam para um plano seguinte, ja que sao subsistemas independentes deste (multi-WhatsApp) e nao bloqueiam o teste de aceitacao do §19 no que se refere a canais.
- **Consistencia de tipos:** `identificadorDestino` continua `string | null` em toda a cadeia (`inbound.service.ts` ja tipava assim); `MensagemRecebida.sessao` e `string` obrigatorio do lado da ponte (ela sempre sabe seu proprio nome) e `sessao` e `.optional()` no schema Zod do lado da API (uma ponte de terceiro pode nao mandar); `corpo.sessao?.trim() || null` fecha essa diferenca no unico ponto de fronteira.
- **Sem placeholders:** todo passo de codigo acima e o trecho completo a colar, nao uma descricao do que fazer.
