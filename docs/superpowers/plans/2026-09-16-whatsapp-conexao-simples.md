# Fase 13.5 — Simplificação da Conexão do WhatsApp Pessoal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o consultor conectar o próprio WhatsApp (linha pessoal) com um único clique — sem que um ADMIN precise pré-cadastrar a linha e sem nenhum campo técnico (URL/token/segredo/sessão) visível para ele — reaproveitando 100% da arquitetura de Ponte/Baileys/ChannelConfig já existente.

**Architecture:** A única peça que falta é self-service de *criação* da linha pessoal: hoje `GET /canais/numeros/meu` só lê uma linha que um ADMIN já criou manualmente via `CanaisTab`. Este plano adiciona um único endpoint novo (`POST /canais/whatsapp/pessoal/conectar`) que cria-ou-recupera a linha pessoal do usuário logado, herdando automaticamente a configuração da Ponte da linha compartilhada (mecanismo `herdarCredenciaisDaPonte`/`gerarNomeSessao` que já existe em `channels.service.ts`). Todo o resto — QR, status, desconectar, Socket.IO, isolamento por dono/organização — é 100% reaproveitado dos endpoints `/canais/numeros/:id/ponte/*` que já existem. O frontend ganha apenas os estados que faltavam (conectar do zero, erro amigável, sucesso, desconectar) dentro do widget que **já existe** em `AtendimentoPage.tsx`.

**Tech Stack:** Node/Express/Prisma (apps/api), React/TypeScript (apps/web), Vitest.

**Spec:** Fase 13.5 (mensagem do usuário nesta conversa — sem arquivo de spec separado; os requisitos completos estão citados nas seções abaixo).

## Global Constraints

- Não criar tabelas novas (`WhatsAppConnection`/`WhatsAppNumber`/etc.) — usar `ChannelConfig` como está.
- Não expor `ponteUrl`, `ponteToken`, `ponteSegredo`, `ponteSessao` em nenhuma resposta nova voltada ao usuário comum.
- Não remover nem alterar o comportamento de `CanaisTab.tsx` (tela do ADMIN para a linha compartilhada) — ela continua existindo como "configuração avançada".
- Respeitar a constraint `@@unique([canal, ponteSessao])` — toda criação de linha pessoal deve continuar passando por `criarNumero`/`prepararGravacao`, nunca por um `prisma.channelConfig.create` direto.
- Erros voltados ao usuário comum devem ser frases em PT-BR humanas (convenção já usada em todo `channels.service.ts` via `badRequest(...)`) — nunca código HTTP cru, nome de classe de erro, ou string tipo `ECONNREFUSED`/`Baileys`/`Ponte`.
- Não fazer merge nem deploy ao final — apenas implementar, testar e reportar (autorização de publicação é separada).

---

## Task 1: Backend — criar/recuperar a linha pessoal automaticamente

**Files:**
- Modify: `apps/api/src/modules/channels/channels.service.ts`
- Test: `apps/api/src/modules/channels/channels.service.test.ts`

**Interfaces:**
- Consumes: `minhaLinhaWhatsapp(usuarioId: string)` (já existe, linha 403 do arquivo atual — devolve `{ id, ponteSessao, modo, ativo } | null`), `criarNumero(canal, input)` (já existe), `badRequest` de `../../lib/errors`, `modoEfetivo` de `./whatsapp.modo`.
- Produces: `conectarMinhaLinhaWhatsapp(usuarioId: string): Promise<{ id: string; ponteSessao: string | null; modo: string | null; ativo: boolean }>` — usada pela Task 2.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `apps/api/src/modules/channels/channels.service.test.ts` (dentro do bloco que já mocka `prisma`, dado que ele reaproveita `channelConfigFindFirst`/`channelConfigCreate`/`channelConfigFindMany`/`userFindUnique` já declarados no topo do arquivo):

```ts
describe('conectarMinhaLinhaWhatsapp — self-service da linha pessoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('linha pessoal ja existe: devolve ela sem criar de novo', async () => {
    channelConfigFindFirst.mockResolvedValueOnce(
      linhaCrua({ id: 'linha-existente', donoId: 'user-1', dono: { id: 'user-1', nome: 'Vendedor 1' } }),
    );

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const resultado = await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-1'), {
      id: 'user-1',
      perfil: 'COMERCIAL',
    });

    expect(resultado).toMatchObject({ id: 'linha-existente' });
    expect(channelConfigCreate).not.toHaveBeenCalled();
  });

  it('sem linha pessoal e com a linha compartilhada em modo NAO_OFICIAL: cria automaticamente', async () => {
    channelConfigFindFirst
      .mockResolvedValueOnce(null) // minhaLinhaWhatsapp: nao existe ainda
      .mockResolvedValueOnce(linhaCrua({ id: 'compartilhada', donoId: null, dono: null, modo: 'NAO_OFICIAL' })) // linha compartilhada
      .mockResolvedValueOnce(null); // checagem de colisao de sessao dentro de prepararGravacao
    userFindUnique.mockResolvedValue({ id: 'user-9' });
    channelConfigCreate.mockResolvedValue({ id: 'nova-linha' });
    channelConfigFindMany.mockResolvedValue([
      linhaCrua({ id: 'nova-linha', donoId: 'user-9', dono: { id: 'user-9', nome: 'Vendedor 9' }, ponteSessao: 'vendedor-user-9' }),
    ]);
    channelConfigFindFirst.mockResolvedValueOnce(
      linhaCrua({ id: 'nova-linha', donoId: 'user-9', ponteSessao: 'vendedor-user-9' }),
    ); // minhaLinhaWhatsapp apos criar

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const resultado = await comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-9'), {
      id: 'user-9',
      perfil: 'COMERCIAL',
    });

    expect(channelConfigCreate).toHaveBeenCalledTimes(1);
    const dados = channelConfigCreate.mock.calls[0]?.[0]?.data;
    expect(dados.donoId).toBe('user-9');
    expect(dados.modo).toBe('NAO_OFICIAL');
    expect(dados.ponteSessao).toBe('vendedor-user-9'); // herdado/gerado, nunca pedido ao usuario
    expect(resultado.id).toBe('nova-linha');
  });

  it('sem linha compartilhada configurada: erro amigavel, sem termos tecnicos', async () => {
    channelConfigFindFirst
      .mockResolvedValueOnce(null) // minhaLinhaWhatsapp: nao existe
      .mockResolvedValueOnce(null); // sem linha compartilhada nenhuma

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    await expect(
      comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-1'), { id: 'user-1', perfil: 'COMERCIAL' }),
    ).rejects.toMatchObject({ status: 400 });

    expect(channelConfigCreate).not.toHaveBeenCalled();
  });

  it('linha compartilhada existe mas esta em modo OFICIAL: mesmo erro amigavel', async () => {
    channelConfigFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linhaCrua({ id: 'compartilhada', donoId: null, dono: null, modo: 'OFICIAL' }));

    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    await expect(
      comOrganizacao('org-1', () => conectarMinhaLinhaWhatsapp('user-1'), { id: 'user-1', perfil: 'COMERCIAL' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && npx vitest run src/modules/channels/channels.service.test.ts -t conectarMinhaLinhaWhatsapp`
Expected: FAIL com `conectarMinhaLinhaWhatsapp is not a function` (ou erro de import).

- [ ] **Step 3: Implementar `conectarMinhaLinhaWhatsapp`**

Em `apps/api/src/modules/channels/channels.service.ts`, adicionar o import de `modoEfetivo` no topo (junto dos outros imports do módulo):

```ts
import { modoEfetivo } from './whatsapp.modo';
```

E adicionar a função logo depois de `minhaLinhaWhatsapp` (depois da linha `export async function minhaLinhaWhatsapp(...) { ... }`):

```ts
/**
 * Self-service: cria a linha pessoal de WhatsApp do usuario logado na hora em
 * que ele pede para conectar — sem exigir que um ADMIN cadastre a linha antes
 * pela tela de Canais. Reconexao (linha ja existente) devolve a mesma linha
 * em vez de criar outra, para nao violar `@@unique([canal, ponteSessao])`.
 *
 * A criacao em si passa por `criarNumero`, que ja faz tudo que uma linha
 * pessoal de WhatsApp precisa sem o usuario informar nada: herda
 * endereco/token/segredo da linha compartilhada (`herdarCredenciaisDaPonte`)
 * e gera o nome de sessao (`gerarNomeSessao`). O unico caso que este self-
 * service recusa antes de chamar `criarNumero` e quando nao ha o que herdar —
 * a organizacao nunca configurou (ou nao ativou) o modo nao oficial, e ai a
 * mensagem tem de apontar para o ADMIN em vez de estourar o erro tecnico que
 * `prepararGravacao` daria (falar de "token da ponte" para o vendedor).
 */
export async function conectarMinhaLinhaWhatsapp(usuarioId: string) {
  const existente = await minhaLinhaWhatsapp(usuarioId);
  if (existente) return existente;

  const compartilhada = await prisma.channelConfig.findFirst({ where: { canal: 'WHATSAPP', donoId: null } });
  if (!compartilhada || modoEfetivo(compartilhada.modo) !== 'NAO_OFICIAL') {
    throw badRequest(
      'A conexao direta do WhatsApp ainda nao foi habilitada pelo administrador da sua organizacao. Peca para um administrador configurar o WhatsApp da empresa antes de conectar sua linha pessoal.',
    );
  }

  await criarNumero('WHATSAPP', { donoId: usuarioId, modo: 'NAO_OFICIAL', ativo: true });

  const criada = await minhaLinhaWhatsapp(usuarioId);
  if (!criada) throw notFound('Linha pessoal nao encontrada logo apos a criacao');
  return criada;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/api && npx vitest run src/modules/channels/channels.service.test.ts -t conectarMinhaLinhaWhatsapp`
Expected: PASS (4 testes).

- [ ] **Step 5: Rodar a suíte inteira do arquivo para checar regressão**

Run: `cd apps/api && npx vitest run src/modules/channels/channels.service.test.ts`
Expected: PASS (todos os testes existentes continuam passando).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/channels/channels.service.ts apps/api/src/modules/channels/channels.service.test.ts
git commit -m "feat(canais): self-service cria a linha pessoal de WhatsApp automaticamente"
```

---

## Task 2: Backend — endpoint self-service `POST /canais/whatsapp/pessoal/conectar`

**Files:**
- Modify: `apps/api/src/modules/channels/channels.routes.ts`
- Test: `apps/api/src/modules/channels/channels.routes.provider.test.ts`

**Interfaces:**
- Consumes: `conectarMinhaLinhaWhatsapp(usuarioId)` da Task 1.
- Produces: rota `POST /whatsapp/pessoal/conectar` (montada sob o prefixo do `channelsRoutes`, ou seja `/canais/whatsapp/pessoal/conectar`), autenticada por `requireAuth` (já aplicado a todo o router), sem exigir role — qualquer usuário autenticado conecta a própria linha. Corpo de resposta: `{ numero: { id, ponteSessao, modo, ativo } }` (o mesmo shape que `/numeros/meu` já devolve — nenhum campo técnico novo).

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/api/src/modules/channels/channels.routes.provider.test.ts`, adicionar `conectarMinhaLinhaWhatsapp: vi.fn()` ao `vi.mock('./channels.service', ...)` já existente (junto de `minhaLinhaWhatsapp: vi.fn()`):

```ts
vi.mock('./channels.service', () => ({
  CANAIS_EXTERNOS: ['WHATSAPP', 'INSTAGRAM', 'FACEBOOK'],
  atualizarNumero: vi.fn(),
  criarNumero: vi.fn(),
  excluirNumero: vi.fn(),
  listarCanais: vi.fn(),
  minhaLinhaWhatsapp: vi.fn(),
  conectarMinhaLinhaWhatsapp: vi.fn(),
  obterConfig: vi.fn(async () => configFalsa),
  obterConfigPorId: vi.fn(async () => configFalsa),
  salvarCanal: vi.fn(),
}));
```

E adicionar, no final do arquivo (dentro ou depois do `describe` existente), um novo bloco:

```ts
describe('POST /whatsapp/pessoal/conectar — self-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria/recupera a linha do usuario autenticado e devolve so o essencial', async () => {
    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    vi.mocked(conectarMinhaLinhaWhatsapp).mockResolvedValue({
      id: 'linha-1',
      ponteSessao: 'vendedor-user-1',
      modo: 'NAO_OFICIAL',
      ativo: true,
    });

    const handler = handlerDe('/whatsapp/pessoal/conectar', 'post');
    const res = fakeRes();
    const req = fakeReq();
    req.user!.sub = 'user-1';

    await rodar(handler, req, res);
    await vi.waitFor(() => expect(res.json).toHaveBeenCalled());

    expect(conectarMinhaLinhaWhatsapp).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      numero: { id: 'linha-1', ponteSessao: 'vendedor-user-1', modo: 'NAO_OFICIAL', ativo: true },
    });
    const corpo = vi.mocked(res.json).mock.calls[0]?.[0];
    expect(corpo.numero).not.toHaveProperty('ponteUrl');
    expect(corpo.numero).not.toHaveProperty('ponteToken');
    expect(corpo.numero).not.toHaveProperty('ponteSegredo');
  });

  it('erro amigavel do service (ex.: WhatsApp da empresa nao configurado) sobe sem alteracao', async () => {
    const { conectarMinhaLinhaWhatsapp } = await import('./channels.service');
    const erroAmigavel = Object.assign(new Error('A conexao direta do WhatsApp ainda nao foi habilitada pelo administrador da sua organizacao.'), {
      status: 400,
      code: 'BAD_REQUEST',
    });
    vi.mocked(conectarMinhaLinhaWhatsapp).mockRejectedValue(erroAmigavel);

    const handler = handlerDe('/whatsapp/pessoal/conectar', 'post');
    const res = fakeRes();

    await expect(
      comOrganizacao('org-1', () => new Promise<void>((resolve, reject) => handler(fakeReq(), res, (e) => (e ? reject(e) : resolve())))),
    ).rejects.toMatchObject({ status: 400 });

    expect(res.json).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && npx vitest run src/modules/channels/channels.routes.provider.test.ts -t "self-service"`
Expected: FAIL com `rota /whatsapp/pessoal/conectar nao encontrada`.

- [ ] **Step 3: Implementar a rota**

Em `apps/api/src/modules/channels/channels.routes.ts`:

1. Adicionar `conectarMinhaLinhaWhatsapp` ao import de `./channels.service` (linha ~12-23):

```ts
import {
  CANAIS_EXTERNOS,
  atualizarNumero,
  conectarMinhaLinhaWhatsapp,
  criarNumero,
  excluirNumero,
  listarCanais,
  minhaLinhaWhatsapp,
  obterConfig,
  obterConfigPorId,
  salvarCanal,
  type CanalExterno,
} from './channels.service';
```

2. Adicionar a rota logo depois de `GET /numeros/meu` (depois do bloco que termina em `res.json({ numero });\n  }),\n);` por volta da linha 285):

```ts
/**
 * Self-service: cria (ou recupera, se ja existir) a propria linha pessoal e
 * devolve so o essencial para a tela seguir para o QR — nunca ponteUrl,
 * ponteToken ou ponteSegredo. E o "Conectar WhatsApp" de um clique so: o
 * usuario nao escolhe sessao nem preenche nada da ponte.
 */
channelsRoutes.post(
  '/whatsapp/pessoal/conectar',
  asyncHandler(async (req, res) => {
    const numero = await conectarMinhaLinhaWhatsapp(req.user!.sub);
    res.status(201).json({ numero });
  }),
);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/api && npx vitest run src/modules/channels/channels.routes.provider.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os novos).

- [ ] **Step 5: Rodar a suíte completa do módulo channels**

Run: `cd apps/api && npx vitest run src/modules/channels`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/channels/channels.routes.ts apps/api/src/modules/channels/channels.routes.provider.test.ts
git commit -m "feat(canais): rota self-service POST /whatsapp/pessoal/conectar"
```

---

## Task 3: Frontend — "Conectar WhatsApp" de um clique em `AtendimentoPage`

**Files:**
- Modify: `apps/web/src/pages/AtendimentoPage.tsx`

**Interfaces:**
- Consumes: `POST /canais/whatsapp/pessoal/conectar` (Task 2, devolve `{ numero: MinhaLinhaWhatsapp }`), `POST /canais/numeros/:id/ponte/desconectar` (já existe), `api.post<T>(path, body?)` e `ApiError` de `../lib/api`, `Alerta`, `Card`, `Badge`, `Button` de `../components/ui`.
- Produces: nenhuma interface nova para outros arquivos — mudança contida neste componente de página.

Este componente já tem: `minhaLinha`, `minhaLinhaConectada`, `mostrarConectar`, `qrConectar`, o polling de QR/estado (efeitos existentes, não mexer), e a renderização condicional que mostra o card de "Conecte seu WhatsApp" quando `precisaConectarWhatsapp` é verdadeiro. O que falta: (1) tratar o caso em que a linha pessoal ainda **não existe** (hoje ela só aparece se um ADMIN já cadastrou manualmente), (2) mostrar erro amigável com "Tentar novamente", (3) uma confirmação visual de "WhatsApp conectado", e (4) um jeito de desconectar sem precisar ir em Configurações.

**Requisito de UX/layout (obrigatório, não é só "esconder campo técnico"):** o card de conexão precisa ser visualmente proeminente e usar os componentes de design já existentes no projeto (`Card`, `Badge`, `Button`, `Alerta`, em `apps/web/src/components/ui/index.tsx`) em vez de `<button>`/`<div>` crus. Cada estado (não conectado / conectando / QR / conectado / erro) precisa de um `Badge` de status claro (🔴/🟡/🟢/⚠️), um título, uma descrição curta e a ação correspondente — nada de formulário técnico, nada de ponte/sessão/token na tela. O botão "Conectar WhatsApp" deve ser o elemento mais evidente do estado "não conectado" (usar `<Button>`, não texto sublinhado). O QR deve ser o elemento central e maior da tela ao conectar, com no máximo 4 instruções curtas ao redor. O layout deve caber em telas estreitas (mobile/tablet) sem cortar o QR — usar `max-w-sm`/`mx-auto` como no restante do app, não uma largura fixa maior que isso.

- [ ] **Step 1: Adicionar o estado novo**

Em `apps/web/src/pages/AtendimentoPage.tsx`, logo depois da declaração existente (linha 74-77):

```ts
  const [minhaLinha, setMinhaLinha] = useState<MinhaLinhaWhatsapp | null>(null);
  const [minhaLinhaConectada, setMinhaLinhaConectada] = useState(false);
  const [mostrarConectar, setMostrarConectar] = useState(false);
  const [qrConectar, setQrConectar] = useState<QrDaPonte | null>(null);
```

adicionar:

```ts
  /**
   * `carregandoMinhaLinha` evita mostrar "Conectar WhatsApp" por um instante
   * antes do GET /numeros/meu responder — sem isso a tela piscaria o botao de
   * conectar mesmo para quem ja esta conectado, ate a primeira resposta chegar.
   */
  const [carregandoMinhaLinha, setCarregandoMinhaLinha] = useState(true);
  const [conectandoLinha, setConectandoLinha] = useState(false);
  const [erroConectar, setErroConectar] = useState<string | null>(null);
  const [mostrarSucessoConexao, setMostrarSucessoConexao] = useState(false);
```

- [ ] **Step 2: Marcar o fim do carregamento inicial**

Substituir o efeito existente (linhas 79-84):

```ts
  useEffect(() => {
    void api
      .get<{ numero: MinhaLinhaWhatsapp | null }>('/canais/numeros/meu')
      .then(({ numero }) => setMinhaLinha(numero))
      .catch(() => undefined);
  }, []);
```

por:

```ts
  useEffect(() => {
    void api
      .get<{ numero: MinhaLinhaWhatsapp | null }>('/canais/numeros/meu')
      .then(({ numero }) => setMinhaLinha(numero))
      .catch(() => undefined)
      .finally(() => setCarregandoMinhaLinha(false));
  }, []);
```

- [ ] **Step 3: Ampliar `precisaConectarWhatsapp` para cobrir "ainda nao tem linha nenhuma"**

Substituir a linha existente:

```ts
  const precisaConectarWhatsapp = Boolean(minhaLinha && minhaLinha.modo === 'NAO_OFICIAL' && !minhaLinhaConectada);
```

por:

```ts
  const semLinhaPessoal = !carregandoMinhaLinha && !minhaLinha;
  const precisaConectarWhatsapp =
    semLinhaPessoal || Boolean(minhaLinha && minhaLinha.modo === 'NAO_OFICIAL' && !minhaLinhaConectada);
```

- [ ] **Step 4: Handlers de conectar/desconectar**

Adicionar, próximo aos outros `useCallback` do componente (qualquer ponto antes do `return`):

```ts
  /**
   * "Conectar WhatsApp" de um clique: se a linha pessoal ainda nao existe, cria
   * na hora (self-service — Fase 13.5); se ja existe, so abre o QR. O usuario
   * nunca ve a diferenca entre os dois casos.
   */
  const conectarWhatsapp = useCallback(async () => {
    setErroConectar(null);
    if (minhaLinha) {
      setMostrarConectar(true);
      return;
    }
    setConectandoLinha(true);
    try {
      const { numero } = await api.post<{ numero: MinhaLinhaWhatsapp }>('/canais/whatsapp/pessoal/conectar');
      setMinhaLinha(numero);
      setMostrarConectar(true);
    } catch (erro) {
      setErroConectar(
        erro instanceof ApiError ? erro.message : 'Nao foi possivel conectar o WhatsApp. Verifique sua internet e tente novamente.',
      );
    } finally {
      setConectandoLinha(false);
    }
  }, [minhaLinha]);

  const desconectarWhatsapp = useCallback(async () => {
    if (!minhaLinha) return;
    if (!window.confirm('Desconectar seu WhatsApp? Voce vai precisar escanear o QR Code de novo para reconectar.')) return;
    try {
      await api.post(`/canais/numeros/${minhaLinha.id}/ponte/desconectar`);
      setMinhaLinhaConectada(false);
      setMostrarConectar(false);
      setQrConectar(null);
    } catch (erro) {
      setErroConectar(
        erro instanceof ApiError ? erro.message : 'Nao foi possivel desconectar agora. Tente novamente.',
      );
    }
  }, [minhaLinha]);
```

- [ ] **Step 5: Toast de sucesso ao conectar**

Adicionar um novo efeito logo depois do efeito existente que fecha o QR ao conectar (`if (minhaLinhaConectada) setMostrarConectar(false);`):

```ts
  useEffect(() => {
    if (!minhaLinhaConectada) return;
    setMostrarSucessoConexao(true);
    const tempo = setTimeout(() => setMostrarSucessoConexao(false), 4000);
    return () => clearTimeout(tempo);
  }, [minhaLinhaConectada]);
```

- [ ] **Step 6a: Importar os componentes de design usados no card**

No topo do arquivo, o import atual (linha 3) é:

```ts
import { Alerta, Input } from '../components/ui';
```

Trocar por:

```ts
import { Alerta, Badge, Button, Card, Input } from '../components/ui';
```

`Card`, `Badge` e `Button` já existem em `apps/web/src/components/ui/index.tsx` (usados em todo o resto do app — `Card` é uma section com header/corpo, `Badge` tem os tons `sucesso`/`alerta`/`erro`/`neutro`/`marca`, `Button` tem as variantes `primario`/`neutro`/`perigo` e os tamanhos `padrao`/`sm`). Não criar nenhum componente novo — reaproveitar estes.

- [ ] **Step 6b: Atualizar a renderização do card de conexão**

Substituir o bloco JSX existente:

```tsx
          ) : precisaConectarWhatsapp ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-slate-700">Conecte seu WhatsApp para comecar a atender</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Sua linha pessoal de WhatsApp ainda nao esta pareada. Conecte para receber as conversas dos seus
                clientes aqui.
              </p>

              {!mostrarConectar ? (
                <button
                  type="button"
                  onClick={() => setMostrarConectar(true)}
                  className="mt-4 rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Conectar
                </button>
              ) : (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                  {qrConectar?.qr ? (
                    <div className="flex flex-col items-center gap-3">
                      <img src={qrConectar.qr} alt="QR Code do WhatsApp" className="h-48 w-48 rounded border border-slate-200" />
                      <p className="max-w-xs text-xs text-slate-600">
                        Abra o WhatsApp no seu celular, toque em <strong>Aparelhos conectados</strong> e depois em{' '}
                        <strong>Conectar aparelho</strong> apontando a camera para este codigo.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {qrConectar?.motivo ?? 'Gerando o QR Code...'}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-slate-700">Selecione uma conversa</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                As conversas chegam em tempo real pelo Webchat. Abra o widget em{' '}
                <a href="/webchat" target="_blank" rel="noreferrer" className="text-[var(--brand-primary)] underline">
                  /webchat
                </a>{' '}
                para simular um cliente.
              </p>
            </div>
          )}
```

por (card de status proeminente, usando `Card`/`Badge`/`Button` do design system — nunca `<button>`/`<div>` crus para a ação principal):

```tsx
          ) : precisaConectarWhatsapp ? (
            <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-8">
              <div className="w-full max-w-sm">
                <Card>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Badge tom={erroConectar ? 'erro' : mostrarConectar ? 'alerta' : 'erro'}>
                      {erroConectar ? '⚠️ Erro' : mostrarConectar ? '🟡 Conectando' : '🔴 Nao conectado'}
                    </Badge>

                    {!mostrarConectar ? (
                      <>
                        <h2 className="text-base font-semibold text-slate-800">Conecte seu WhatsApp ao Atendimento</h2>
                        <p className="text-xs text-slate-500">
                          Receba e responda as mensagens dos seus clientes diretamente por aqui.
                        </p>
                        {erroConectar && (
                          <div className="w-full">
                            <Alerta>{erroConectar}</Alerta>
                          </div>
                        )}
                        <Button
                          type="button"
                          onClick={() => void conectarWhatsapp()}
                          disabled={conectandoLinha}
                          className="mt-1 w-full"
                        >
                          {conectandoLinha ? 'Conectando...' : erroConectar ? 'Tentar novamente' : 'Conectar WhatsApp'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <h2 className="text-base font-semibold text-slate-800">Escaneie o QR Code pelo WhatsApp</h2>
                        {qrConectar?.qr ? (
                          <>
                            <img
                              src={qrConectar.qr}
                              alt="QR Code do WhatsApp"
                              className="h-56 w-56 rounded-lg border border-slate-200"
                            />
                            <ol className="w-full space-y-1 text-left text-xs text-slate-600">
                              <li>1. Abra o WhatsApp no seu celular</li>
                              <li>
                                2. Toque em <strong>Aparelhos conectados</strong>
                              </li>
                              <li>
                                3. Toque em <strong>Conectar aparelho</strong>
                              </li>
                              <li>4. Aponte a camera para o codigo acima</li>
                            </ol>
                            <p className="text-xs text-slate-400">Aguardando conexao...</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">{qrConectar?.motivo ?? 'Gerando o QR Code...'}</p>
                        )}
                        <Button
                          type="button"
                          variante="neutro"
                          onClick={() => setMostrarConectar(false)}
                          className="mt-1 w-full"
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-slate-700">Selecione uma conversa</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                As conversas chegam em tempo real pelo Webchat. Abra o widget em{' '}
                <a href="/webchat" target="_blank" rel="noreferrer" className="text-[var(--brand-primary)] underline">
                  /webchat
                </a>{' '}
                para simular um cliente.
              </p>

              {minhaLinha && minhaLinhaConectada && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  {mostrarSucessoConexao && <Alerta tipo="sucesso">WhatsApp conectado</Alerta>}
                  <Badge tom="sucesso">🟢 WhatsApp conectado</Badge>
                  <Button type="button" variante="neutro" tamanho="sm" onClick={() => void desconectarWhatsapp()}>
                    Desconectar
                  </Button>
                </div>
              )}
            </div>
          )}
```

Notas de design (por que ficou assim, para o revisor conferir contra o critério de aceitação do usuário):
- O `Badge` de status (🔴/🟡/🟢/⚠️) é sempre o primeiro elemento do card — hierarquia visual pedida: status antes de tudo.
- O botão "Conectar WhatsApp" usa `<Button>` (estilo primário do design system, o mesmo usado em todo o resto do app) e ocupa a largura do card (`w-full`) — é o elemento mais evidente do estado "não conectado", não um link discreto.
- No estado de QR, a imagem é o maior elemento do card (`h-56 w-56`, meaningfully maior que o resto do texto) e as instruções são uma lista curta de 4 passos — nada de parágrafo longo competindo visualmente.
- O card inteiro fica dentro de `max-w-sm` (384px) com `mx-auto`/centralização flex — funciona tanto em desktop (centralizado no painel do meio) quanto em mobile/tablet (a largura do card nunca excede a tela, e o `overflow-y-auto` do container evita cortar o QR em telas baixas).
- O estado conectado usa `Badge tom="sucesso"` (🟢) em vez de texto solto colorido, e o "Desconectar" é um `<Button variante="neutro" tamanho="sm">` em vez de um link sublinhado — mais fácil de notar e mais consistente com o resto do app (compare com os botões de "Trocar de número" em `CanaisTab.tsx`).

- [ ] **Step 7: Typecheck do frontend**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erros novos relacionados a `AtendimentoPage.tsx`.

- [ ] **Step 8: Teste manual local (dev server)**

Run: `cd apps/web && npm run dev` (e a API local apontada para o `.env` de dev — ver [[docker-sem-wsl2]] / memória do usuário sobre Neon+Upstash em vez de Docker).

Roteiro:
1. Logar como um usuário COMERCIAL sem linha pessoal cadastrada, abrir `/atendimento`.
2. Confirmar que aparece "Conecte seu WhatsApp para comecar a atender" com botão "Conectar WhatsApp" (não "Conectar" genérico).
3. Clicar — se a linha compartilhada da organização de teste não estiver em modo NAO_OFICIAL, confirmar que aparece a mensagem amigável (não um erro técnico) e o botão vira "Tentar novamente".
4. Configurar a linha compartilhada em modo NAO_OFICIAL com uma Ponte de teste (ou mock), repetir o clique, confirmar que o QR aparece.
5. Simular a Ponte reportando `CONECTADO` (via `POST /api/webhooks/ponte/status/:organizacaoId` ou o smoke script existente) e confirmar que aparece o toast "WhatsApp conectado" e a tela volta para "Selecione uma conversa" com o indicador verde e o link "Desconectar".
6. Clicar "Desconectar", confirmar o diálogo, e confirmar que a tela volta ao estado "Conecte seu WhatsApp".
7. Redimensionar a janela (ou usar o modo responsivo do DevTools) para largura de tablet (~768px) e de celular (~375px) e confirmar: o card não estoura a largura da tela, o QR continua nítido e centralizado, e o botão "Conectar WhatsApp"/Badge de status continuam sendo os elementos mais evidentes da tela (não competem com texto técnico).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/AtendimentoPage.tsx
git commit -m "feat(atendimento): conectar/desconectar WhatsApp pessoal em um clique, sem termos tecnicos"
```

---

## Task 4: Verificação final e relatório

**Files:** nenhum arquivo novo — apenas comandos de verificação.

- [ ] **Step 1: Suíte completa da API**

Run: `cd apps/api && npx vitest run`
Expected: PASS, incluindo os testes novos das Tasks 1 e 2 e nenhuma regressão nos existentes (`channels.*.test.ts`, `inbound.service.*.test.ts`, `outbound.service.test.ts`, `whatsapp.modo.test.ts`, `providers/baileys.provider.test.ts`).

- [ ] **Step 2: Typecheck da API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Typecheck do Web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Build da API**

Run: `cd apps/api && npm run build`
Expected: build concluído sem erros.

- [ ] **Step 5: Build do Web**

Run: `cd apps/web && npm run build`
Expected: build concluído sem erros.

- [ ] **Step 6: Conferir git status e diff final**

Run: `git status && git diff --stat main...HEAD`
Expected: apenas os 4 arquivos das Tasks 1–3 modificados (2 de produção + 2 de teste no backend, 1 de produção no frontend), nenhum arquivo de infraestrutura tocado.

- [ ] **Step 7: Escrever o relatório final (FASE 13.5 — RELATÓRIO)**

Usar o formato de 15 seções pedido pelo usuário (Diagnóstico, Problemas de UX, Arquitetura, Backend, Frontend, Sessão, Segurança, Linha pessoal, Linha compartilhada, Testes, Typecheck, Build, Git, Pendências, Teste manual recomendado), citando os resultados reais dos Steps 1–6 — **não fazer merge nem deploy**, aguardar autorização.
