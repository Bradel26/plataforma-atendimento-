# WhatsApp por QR Code com GOWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um terceiro `ChannelProvider` (`gowa`) que conecta WhatsApp por QR Code falando
com um servidor go-whatsapp-web-multidevice (GOWA) auto-hospedado, ativável via
`WHATSAPP_PROVIDER=gowa`, sem tocar no botão "Conectar WhatsApp" que já existe em `/atendimento`.

**Architecture:** Um novo diretório `apps/api/src/modules/channels/providers/gowa/` espelha
arquivo-por-arquivo o `providers/waha/` que já roda em produção: `gowa.types.ts` (formato do que o
GOWA devolve), `gowa.client.ts` (HTTP puro contra o GOWA), `gowa.mapper.ts` (tradução pura
GOWA → vocabulário do CRM), `gowa.webhook.ts` (autenticação do webhook de entrada) e
`gowa.provider.ts` (implementa `ChannelProvider`, junta as três peças acima). Registro em dois
arquivos existentes (`registro.ts`, `whatsapp-provider.factory.ts`), zero rota nova (o webhook
genérico `/api/webhooks/providers/:nome` já serve qualquer provider registrado).

**Tech Stack:** TypeScript, Express, Vitest, `fetch`/`FormData`/`Blob` nativos do Node 20 (mesma
stack do `WahaProvider`, sem biblioteca nova).

**Spec:** [docs/superpowers/specs/2026-09-24-whatsapp-gowa-provider-design.md](../specs/2026-09-24-whatsapp-gowa-provider-design.md)

## Global Constraints

- Fidelidade técnica ao `gowa/client.py` de referência (do `whatsbot-pro-main.zip`): mesmas rotas,
  mesmo formato de payload — mas **só as rotas que o `ChannelProvider` de fato usa** (ver spec,
  seção "Mapeamento de rotas"); `mark_as_read`/`revoke`/`update`/`check_phone`/`avatar` ficam fora.
- GOWA sobe como **recurso Docker separado no Coolify** — nunca subprocesso spawnado pela API.
- Webhook de entrada usa **`?secret=` na URL**, nunca HMAC — o GOWA de referência não assina eventos.
- Nenhuma rota nova, nenhuma mudança no frontend, nenhuma mudança na convenção de nome de sessão
  (`vendedor-xxxxxxxx` / `empresa-xxxxxxxx` seguem valendo, viram o `X-Device-Id`).
- Comentários e nomes de função em português, no mesmo estilo do `providers/waha/*`.
- `GowaClient` não lê `process.env` diretamente — recebe URL por parâmetro (mesmo desenho do
  `WahaClient`), para ficar testável sem mockar env.
- **v1 atende uma linha por instância de GOWA** — o GOWA não devolve, no corpo do webhook, de qual
  linha veio um evento quando várias linhas dividem um processo compartilhado (investigado no
  `whatsbot-pro-main`: só processos dedicados por proxy têm URL de webhook própria por linha; o caso
  comum, sem proxy, não tem como distinguir — ver spec, "Limite conhecido da v1"). A sessão da única
  linha fica fixada em `GOWA_SESSAO` (Task 1), não descoberta por requisição. Multi-linha no mesmo
  GOWA é "Fora de escopo" no spec.
- **Simplificação conhecida, decidida aqui:** `SituacaoSessao.telefone` fica sempre `null` para o
  GOWA, mesmo quando `CONECTADO`. O WAHA consegue o número de graça (`me.id` já vem no `GET
  /api/sessions/{nome}`); o GOWA de referência precisa de uma chamada extra com fallback
  (`get_own_number`, que tenta `/app/status` e depois filtra `/devices`) — exatamente o tipo de rota
  extra que "Fora de escopo" no spec já cortou. Isso não quebra a tela (o campo é opcional em
  `SituacaoSessao`), só deixa de mostrar o número conectado nela. Se isso importar depois, é uma
  task pequena e isolada: `GowaClient.obterNumeroProprio(deviceId)`.

## Review Focus

- **GOWA fora do ar ao pedir QR:** `sessao.qr()` nunca deve lançar — a tela de conectar é o próprio
  lugar de conserto. Testado no Task 5 (`GowaProvider.sessao.qr` engole erro e devolve `motivo`).
- **Device pareado mas com socket caído** (`logged_in=true, connected=false`): não deve emitir QR
  novo (perderia o pareamento à toa) — deve reconectar. Testado no Task 5.
- **Webhook sem `?secret=` ou com segredo errado:** tem que ser recusado (401), nunca aceito
  silenciosamente. Testado no Task 4.
- **Payload de mensagem de grupo (`@g.us`) chegando no webhook:** o atendimento não trata grupo —
  tem que virar `ignorado`, nunca uma conversa fantasma. Testado no Task 3.
- **`WHATSAPP_PROVIDER=gowa` sem `GOWA_BASE_URL` configurada:** tem que falhar com uma mensagem que
  diz qual variável falta, não um erro genérico de rede. Testado no Task 5 (`configurado()`/`cliente()`).

---

### Task 1: Tipos e configuração do GOWA

**Files:**
- Create: `apps/api/src/modules/channels/providers/gowa/gowa.types.ts`
- Create: `apps/api/src/config/gowa.config.ts`

**Interfaces:**
- Produces (usados pelas próximas tasks):
  - `StatusGowa = { is_connected?: unknown; is_logged_in?: unknown; jid?: unknown; device?: unknown; phone?: unknown; id?: unknown; user?: unknown }`
  - `DeviceGowa = { id?: unknown; device?: unknown }`
  - `LoginGowa = { qr_link?: unknown }`
  - `EnvioGowa = { results?: { message_id?: unknown; id?: unknown } | null; message_id?: unknown; id?: unknown }`
  - `EventoGowa = { event?: unknown; payload?: unknown; data?: unknown }`
  - `MensagemGowa` (payload do evento `message`)
  - `AckGowa` (payload do evento `message.ack`)
  - `EndpointDeMidiaGowa = 'image' | 'video' | 'audio' | 'file'`
  - `ArquivoGowa = { buffer: Buffer; nome: string; tipo: string }`
  - `obterConfigGowa(): ConfigGowa | null` — `ConfigGowa = { url: string }`
  - `obterSegredoWebhookGowa(): string | null`
  - `obterSessaoFixaGowa(): string | null` — a `ponteSessao` da única linha desta instalação
    (`GOWA_SESSAO`); usada pelo webhook, que não recebe a sessão no payload (v1 = uma linha por GOWA)

Este task é só scaffolding (tipos e leitura de env, sem lógica de ramificação testável em isolado —
mesmo padrão do `waha.config.ts`, que também não tem teste próprio). É consumido pelos Tasks 2–5.

- [ ] **Step 1: Criar `gowa.types.ts`**

```typescript
/**
 * Formato do que o GOWA (go-whatsapp-web-multidevice) devolve e aceita —
 * tipado so no que o CRM le. Referencia: gowa/client.py do whatsbot-pro-main
 * (go-whatsapp-web-multidevice v8.11.0).
 *
 * A API do GOWA envelopa a maioria das respostas em `{ results: ... }` (as
 * vezes `{ data: ... }`); os tipos abaixo descrevem o CONTEUDO de dentro do
 * envelope — quem desembrulha e o `gowa.client.ts`.
 */

/** `GET /app/status` (com `X-Device-Id`), de dentro do envelope. */
export type StatusGowa = {
  is_connected?: unknown;
  is_logged_in?: unknown;
  /** Um destes traz o JID de quem esta logado — o cliente tenta todos. */
  jid?: unknown;
  device?: unknown;
  phone?: unknown;
  id?: unknown;
  user?: unknown;
};

/** Item de `GET /devices` (lista global, sem `X-Device-Id`). */
export type DeviceGowa = { id?: unknown; device?: unknown };

/** `GET /app/login`, de dentro do envelope. */
export type LoginGowa = { qr_link?: unknown };

/** Resposta de `POST /send/*`, de dentro (ou nao) do envelope. */
export type EnvioGowa = {
  results?: { message_id?: unknown; id?: unknown } | null;
  message_id?: unknown;
  id?: unknown;
};

/** Envelope de todo webhook do GOWA: `event` + `payload` (algumas versoes usam `data`). */
export type EventoGowa = { event?: unknown; payload?: unknown; data?: unknown };

/** `payload` do evento `message`. */
export type MensagemGowa = {
  id?: unknown;
  chat_id?: unknown;
  from?: unknown;
  sender?: unknown;
  from_name?: unknown;
  pushName?: unknown;
  notify?: unknown;
  is_from_me?: unknown;
  body?: unknown;
  content?: unknown;
  text?: unknown;
  timestamp?: unknown;
  /** Presenca de qualquer uma destas chaves == mensagem com anexo (sem baixar o binario). */
  image?: unknown;
  video?: unknown;
  audio?: unknown;
  document?: unknown;
  sticker?: unknown;
};

/** `payload` do evento `message.ack`. */
export type AckGowa = {
  receipt_type?: unknown; // "delivered" | "read" | "read-self"
  ids?: unknown;
  chat_id?: unknown;
  from?: unknown;
};

export type EndpointDeMidiaGowa = 'image' | 'video' | 'audio' | 'file';

export type ArquivoGowa = { buffer: Buffer; nome: string; tipo: string };
```

- [ ] **Step 2: Criar `gowa.config.ts`**

```typescript
/**
 * Configuracao global de conexao com o GOWA (go-whatsapp-web-multidevice).
 *
 * Mesmo desenho do `waha.config.ts`: infraestrutura da instalacao, nunca dado
 * de negocio por organizacao. So a sessao (que vira `X-Device-Id`) varia por
 * linha. Le `process.env` direto, para nao depender da validacao completa de
 * `env.ts` so para montar uma URL.
 */

function lida(nome: string): string | null {
  return process.env[nome]?.trim() || null;
}

export type ConfigGowa = {
  /** Endereco interno do GOWA, sem barra no fim. Ex.: http://gowa:3000 */
  url: string;
};

/** `null` quando `GOWA_BASE_URL` nao foi definida (GOWA fora de uso nesta instalacao). */
export function obterConfigGowa(): ConfigGowa | null {
  const url = lida('GOWA_BASE_URL');
  if (!url) return null;
  return { url: url.replace(/\/+$/, '') };
}

/**
 * Segredo do webhook de ENTRADA (GOWA -> nos), conferido via `?secret=` na
 * URL: o GOWA de referencia nao assina eventos (sem HMAC), mesma situacao do
 * WPPConnect.
 */
export function obterSegredoWebhookGowa(): string | null {
  return lida('GOWA_WEBHOOK_SECRET');
}

/**
 * A `ponteSessao` da UNICA linha desta instalacao de GOWA (v1 = uma linha por
 * instancia — ver spec, "Limite conhecido da v1"). O corpo do webhook do GOWA
 * nao diz de qual linha veio o evento; sem esta variavel, toda mensagem
 * recebida cai como sessao desconhecida e e descartada.
 */
export function obterSessaoFixaGowa(): string | null {
  return lida('GOWA_SESSAO');
}
```

- [ ] **Step 3: Confirmar que compila**

Run: `npm run typecheck -w @plataforma/api`
Expected: sem erros novos (os dois arquivos nao sao importados por ninguem ainda).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/channels/providers/gowa/gowa.types.ts apps/api/src/config/gowa.config.ts
git commit -m "feat(whatsapp): tipos e config do provider GOWA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `GowaClient` — HTTP puro contra o GOWA

**Files:**
- Create: `apps/api/src/modules/channels/providers/gowa/gowa.client.ts`
- Test: `apps/api/src/modules/channels/providers/gowa/gowa.client.test.ts`

**Interfaces:**
- Consumes: `ArquivoGowa`, `EndpointDeMidiaGowa` (Task 1)
- Produces:
  - `class GowaErro extends Error { operacao: string; tipo: 'http'|'rede'|'tempo'; status: number | null; corpoErro: string | null }`
  - `class GowaClient { constructor(baseUrl: string, tetoMs?: number) }`
  - `GowaClient.listarDevices(): Promise<string[]>` — ids/nomes dos devices existentes
  - `GowaClient.criarDevice(deviceId: string): Promise<void>`
  - `GowaClient.obterStatus(deviceId: string): Promise<{ conectado: boolean; logado: boolean } | null>` — `null` quando o GOWA nao respondeu nada aproveitavel
  - `GowaClient.obterQrCode(deviceId: string): Promise<string | null>` — data URL (`data:image/png;base64,...`) ou `null`
  - `GowaClient.logout(deviceId: string): Promise<void>`
  - `GowaClient.reconectar(deviceId: string): Promise<void>`
  - `GowaClient.enviarTexto(deviceId: string, phone: string, texto: string): Promise<unknown>`
  - `GowaClient.enviarArquivo(deviceId: string, endpoint: EndpointDeMidiaGowa, phone: string, arquivo: ArquivoGowa, legenda?: string): Promise<unknown>`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// apps/api/src/modules/channels/providers/gowa/gowa.client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GowaClient, GowaErro } from './gowa.client';

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('GowaClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const cliente = new GowaClient('http://gowa:3000', 50);

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  function chamada(i = 0) {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit & { headers?: Record<string, string> }];
    return { url, init, corpo: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
  }

  it('lista devices sem X-Device-Id e sem confundir "id" com "device"', async () => {
    fetchMock.mockResolvedValue(json(200, { results: [{ id: 'vendedor-1' }, { device: 'vendedor-2' }] }));

    const devices = await cliente.listarDevices();

    expect(devices).toEqual(['vendedor-1', 'vendedor-2']);
    const { url, init } = chamada();
    expect(url).toBe('http://gowa:3000/devices');
    expect(init.headers?.['X-Device-Id']).toBeUndefined();
  });

  it('lista vazia quando o GOWA nao devolve "results"', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await expect(cliente.listarDevices()).resolves.toEqual([]);
  });

  it('cria device mandando device_id no corpo, sem X-Device-Id', async () => {
    fetchMock.mockResolvedValue(json(201, { results: { id: 'vendedor-1' } }));

    await cliente.criarDevice('vendedor-1');

    const { url, init, corpo } = chamada();
    expect(url).toBe('http://gowa:3000/devices');
    expect(init.method).toBe('POST');
    expect(corpo).toEqual({ device_id: 'vendedor-1' });
    expect(init.headers?.['X-Device-Id']).toBeUndefined();
  });

  it('status: separa conectado de logado (nao faz OU entre os dois)', async () => {
    fetchMock.mockResolvedValue(json(200, { results: { is_connected: false, is_logged_in: true } }));

    const status = await cliente.obterStatus('vendedor-1');

    expect(status).toEqual({ conectado: false, logado: true });
    const { url, init } = chamada();
    expect(url).toBe('http://gowa:3000/app/status');
    expect(init.headers?.['X-Device-Id']).toBe('vendedor-1');
  });

  it('status: null quando o GOWA responde erro HTTP (nao lanca)', async () => {
    fetchMock.mockResolvedValue(json(500, { message: 'boom' }));
    await expect(cliente.obterStatus('vendedor-1')).resolves.toBeNull();
  });

  it('QR: baixa o qr_link e devolve data URL', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { results: { qr_link: 'http://gowa:3000/statics/qrcode/abc.png' } }))
      .mockResolvedValueOnce(new Response(Buffer.from('PNGDATA'), { status: 200, headers: { 'Content-Type': 'image/png' } }));

    const qr = await cliente.obterQrCode('vendedor-1');

    expect(qr).toBe(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`);
    expect(chamada(0).url).toBe('http://gowa:3000/app/login');
    expect(chamada(1).url).toBe('http://gowa:3000/statics/qrcode/abc.png');
  });

  it('QR: null quando a resposta nao tem qr_link', async () => {
    fetchMock.mockResolvedValue(json(200, { results: {} }));
    await expect(cliente.obterQrCode('vendedor-1')).resolves.toBeNull();
  });

  it('enviar texto manda phone e message, com X-Device-Id', async () => {
    fetchMock.mockResolvedValue(json(200, { results: { message_id: 'ABC123' } }));

    const resposta = await cliente.enviarTexto('vendedor-1', '5511999990000', 'oi');

    expect(resposta).toEqual({ results: { message_id: 'ABC123' } });
    const { url, init, corpo } = chamada();
    expect(url).toBe('http://gowa:3000/send/message');
    expect(corpo).toEqual({ phone: '5511999990000', message: 'oi' });
    expect(init.headers?.['X-Device-Id']).toBe('vendedor-1');
  });

  it('enviar texto: erro HTTP vira GowaErro com status e detalhe do corpo, sem vazar o corpo inteiro', async () => {
    fetchMock.mockResolvedValue(json(422, { message: 'reachout timelock', code: 'WA_REACHOUT_TIMELOCK' }));

    const erro = await cliente.enviarTexto('vendedor-1', '5511999990000', 'oi').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(GowaErro);
    expect(erro).toMatchObject({ tipo: 'http', status: 422 });
    expect((erro as GowaErro).corpoErro).toBe('reachout timelock');
  });

  it('enviar arquivo: multipart com o campo certo por endpoint e legenda opcional', async () => {
    fetchMock.mockResolvedValue(json(200, { results: { message_id: 'IMG1' } }));

    await cliente.enviarArquivo('vendedor-1', 'image', '5511999990000', {
      buffer: Buffer.from('fake-png'),
      nome: 'foto.png',
      tipo: 'image/png',
    }, 'legenda aqui');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gowa:3000/send/image');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('phone')).toBe('5511999990000');
    expect(form.get('caption')).toBe('legenda aqui');
    expect((form.get('image') as File).name).toBe('foto.png');
  });

  it('timeout vira GowaErro do tipo tempo', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    await expect(cliente.obterStatus('vendedor-1')).resolves.toBeNull();
    await expect(cliente.enviarTexto('vendedor-1', '5511999990000', 'oi')).rejects.toMatchObject({ tipo: 'tempo' });
  });

  it('falha de rede traz o codigo da causa', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
    const erro = await cliente.enviarTexto('vendedor-1', '5511999990000', 'oi').catch((e: unknown) => e);
    expect(erro).toMatchObject({ tipo: 'rede' });
  });

  it('logout e reconectar chamam GET com X-Device-Id e nao lancam em sucesso', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await expect(cliente.logout('vendedor-1')).resolves.toBeUndefined();
    await expect(cliente.reconectar('vendedor-1')).resolves.toBeUndefined();
    expect(chamada(0).url).toBe('http://gowa:3000/app/logout');
    expect(chamada(1).url).toBe('http://gowa:3000/app/reconnect');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.client.test.ts`
Expected: FAIL — `Cannot find module './gowa.client'`

- [ ] **Step 3: Implementar `gowa.client.ts`**

```typescript
import type { ArquivoGowa, DeviceGowa, EndpointDeMidiaGowa, EnvioGowa, LoginGowa, StatusGowa } from './gowa.types';

/**
 * O unico lugar que conhece a API HTTP do GOWA (go-whatsapp-web-multidevice):
 * URL, `X-Device-Id`, endpoints e o envelope `{ results: ... }` das respostas.
 * Nao sabe de linha, organizacao nem mensagem do CRM — isso e do `GowaProvider`.
 *
 * Fiel ao `gowa/client.py` de referencia (whatsbot-pro-main, GOWA v8.11.0), so
 * nas rotas que o `ChannelProvider` de fato usa (ver spec):
 *   GET    /devices                (sem X-Device-Id) -> lista de devices
 *   POST   /devices                (sem X-Device-Id) { device_id }
 *   GET    /app/status             (com X-Device-Id) -> { results: { is_connected, is_logged_in } }
 *   GET    /app/login              (com X-Device-Id) -> { results: { qr_link } }, depois baixa a imagem
 *   GET    /app/logout             (com X-Device-Id)
 *   GET    /app/reconnect          (com X-Device-Id)
 *   POST   /send/message           (com X-Device-Id) { phone, message }
 *   POST   /send/{image,video,audio,file} (com X-Device-Id) multipart
 */

export const TETO_PADRAO_MS = 15_000;
/** Midia tem teto maior — upload multipart demora mais que um POST de JSON. */
export const TETO_DE_MIDIA_MS = 30_000;

export type TipoFalhaGowa = 'http' | 'rede' | 'tempo';

/** Falha falando com o GOWA. A mensagem diz a operacao e o status HTTP, nunca o corpo inteiro. */
export class GowaErro extends Error {
  constructor(
    readonly operacao: string,
    readonly tipo: TipoFalhaGowa,
    readonly status: number | null,
    /** `message`/`error` do corpo de erro do GOWA, quando presente — nunca o corpo inteiro. */
    readonly corpoErro: string | null = null,
  ) {
    super(
      tipo === 'tempo'
        ? `o WhatsApp nao respondeu a tempo (${operacao})`
        : tipo === 'rede'
          ? `nao foi possivel falar com o servidor do WhatsApp (${operacao}${corpoErro ? `: ${corpoErro}` : ''})`
          : `o servidor do WhatsApp recusou ${operacao} (HTTP ${status})${corpoErro ? `: ${corpoErro}` : ''}`,
    );
    this.name = 'GowaErro';
  }
}

/** Extrai o conteudo de dentro do envelope `{ results: ... }` ou `{ data: ... }` do GOWA; senao o corpo cru. */
function resultados(corpo: unknown): unknown {
  if (!corpo || typeof corpo !== 'object') return corpo;
  const r = corpo as { results?: unknown; data?: unknown };
  if (r.results !== undefined) return r.results;
  if (r.data !== undefined) return r.data;
  return corpo;
}

const campoTexto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export class GowaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tetoMs: number = TETO_PADRAO_MS,
  ) {}

  private async chamar(
    operacao: string,
    caminho: string,
    init: { method?: string; corpo?: unknown; deviceId?: string } = {},
    tetoMs = this.tetoMs,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (init.deviceId) headers['X-Device-Id'] = init.deviceId;
    if (init.corpo !== undefined) headers['Content-Type'] = 'application/json';

    try {
      return await fetch(`${this.baseUrl}${caminho}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
        signal: AbortSignal.timeout(tetoMs),
      });
    } catch (err) {
      const nome = err instanceof Error ? err.name : '';
      if (nome === 'TimeoutError' || nome === 'AbortError') throw new GowaErro(operacao, 'tempo', null);
      const causa = err instanceof Error ? (err.cause as { code?: string } | undefined)?.code : undefined;
      throw new GowaErro(operacao, 'rede', null, causa ?? (err instanceof Error ? err.message : undefined));
    }
  }

  private static async corpoDeErro(resposta: Response): Promise<string | null> {
    const corpo = (await resposta.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;
    return campoTexto(corpo?.message) ?? campoTexto(corpo?.error);
  }

  private static async json(resposta: Response): Promise<unknown> {
    return resposta.json().catch(() => null);
  }

  async listarDevices(): Promise<string[]> {
    const resposta = await this.chamar('listar os dispositivos', '/devices');
    if (!resposta.ok) throw new GowaErro('listar os dispositivos', 'http', resposta.status, await GowaClient.corpoDeErro(resposta));
    const lista = resultados(await GowaClient.json(resposta));
    if (!Array.isArray(lista)) return [];
    return lista
      .map((d: DeviceGowa) => campoTexto(d?.id) ?? campoTexto(d?.device))
      .filter((id): id is string => id !== null);
  }

  async criarDevice(deviceId: string): Promise<void> {
    const resposta = await this.chamar('criar o dispositivo', '/devices', {
      method: 'POST',
      corpo: { device_id: deviceId },
    });
    if (!resposta.ok) throw new GowaErro('criar o dispositivo', 'http', resposta.status, await GowaClient.corpoDeErro(resposta));
  }

  /** `null` quando o GOWA nao respondeu nada aproveitavel (fora do ar, device sumiu) — nunca lanca. */
  async obterStatus(deviceId: string): Promise<{ conectado: boolean; logado: boolean } | null> {
    try {
      const resposta = await this.chamar('consultar o status', '/app/status', { deviceId });
      if (!resposta.ok) return null;
      const r = resultados(await GowaClient.json(resposta)) as StatusGowa | null;
      if (!r || typeof r !== 'object') return null;
      return { conectado: Boolean(r.is_connected), logado: Boolean(r.is_logged_in) };
    } catch {
      return null;
    }
  }

  /** Data URL do QR (`data:image/png;base64,...`), ou `null` se o GOWA nao tem QR pra dar agora. */
  async obterQrCode(deviceId: string): Promise<string | null> {
    const resposta = await this.chamar('obter o QR', '/app/login', { deviceId });
    if (!resposta.ok) throw new GowaErro('obter o QR', 'http', resposta.status, await GowaClient.corpoDeErro(resposta));
    const r = resultados(await GowaClient.json(resposta)) as LoginGowa | null;
    const link = campoTexto(r?.qr_link);
    if (!link) return null;

    const caminhoDaImagem = new URL(link, this.baseUrl).pathname + new URL(link, this.baseUrl).search;
    const imagem = await this.chamar('baixar a imagem do QR', caminhoDaImagem, { deviceId });
    if (!imagem.ok) throw new GowaErro('baixar a imagem do QR', 'http', imagem.status);
    const tipo = (imagem.headers.get('content-type') ?? 'image/png').split(';')[0];
    const base64 = Buffer.from(await imagem.arrayBuffer()).toString('base64');
    return `data:${tipo};base64,${base64}`;
  }

  async logout(deviceId: string): Promise<void> {
    const resposta = await this.chamar('desconectar', '/app/logout', { deviceId });
    if (!resposta.ok) throw new GowaErro('desconectar', 'http', resposta.status, await GowaClient.corpoDeErro(resposta));
  }

  async reconectar(deviceId: string): Promise<void> {
    const resposta = await this.chamar('reconectar', '/app/reconnect', { deviceId });
    if (!resposta.ok) throw new GowaErro('reconectar', 'http', resposta.status, await GowaClient.corpoDeErro(resposta));
  }

  async enviarTexto(deviceId: string, phone: string, texto: string): Promise<EnvioGowa> {
    const resposta = await this.chamar('enviar a mensagem', '/send/message', {
      method: 'POST',
      deviceId,
      corpo: { phone, message: texto },
    });
    if (!resposta.ok) throw new GowaErro('enviar a mensagem', 'http', resposta.status, await GowaClient.corpoDeErro(resposta));
    return (await GowaClient.json(resposta)) as EnvioGowa;
  }

  async enviarArquivo(
    deviceId: string,
    endpoint: EndpointDeMidiaGowa,
    phone: string,
    arquivo: ArquivoGowa,
    legenda?: string,
  ): Promise<EnvioGowa> {
    const form = new FormData();
    form.set('phone', phone);
    form.set(endpoint, new File([arquivo.buffer], arquivo.nome, { type: arquivo.tipo }));
    if (legenda) form.set('caption', legenda);
    if (endpoint === 'audio') form.set('ptt', 'true');

    let resposta: Response;
    try {
      resposta = await fetch(`${this.baseUrl}/send/${endpoint}`, {
        method: 'POST',
        headers: { 'X-Device-Id': deviceId },
        body: form,
        signal: AbortSignal.timeout(TETO_DE_MIDIA_MS),
      });
    } catch (err) {
      const nome = err instanceof Error ? err.name : '';
      if (nome === 'TimeoutError' || nome === 'AbortError') throw new GowaErro('enviar o arquivo', 'tempo', null);
      const causa = err instanceof Error ? (err.cause as { code?: string } | undefined)?.code : undefined;
      throw new GowaErro('enviar o arquivo', 'rede', null, causa ?? (err instanceof Error ? err.message : undefined));
    }
    if (!resposta.ok) throw new GowaErro('enviar o arquivo', 'http', resposta.status, await GowaClient.corpoDeErro(resposta));
    return (await GowaClient.json(resposta)) as EnvioGowa;
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.client.test.ts`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/channels/providers/gowa/gowa.client.ts apps/api/src/modules/channels/providers/gowa/gowa.client.test.ts
git commit -m "feat(whatsapp): GowaClient - HTTP puro contra o GOWA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `gowa.mapper.ts` — traducao pura GOWA -> vocabulario do CRM

**Files:**
- Create: `apps/api/src/modules/channels/providers/gowa/gowa.mapper.ts`
- Test: `apps/api/src/modules/channels/providers/gowa/gowa.mapper.test.ts`

**Interfaces:**
- Consumes: `EstadoSessao`, `EventoDeCanal`, `SituacaoSessao`, `StatusDeEntrega` (`channel-provider.ts`);
  `MensagemNormalizada` (`meta.types.ts`); `numeroNormalizado` (`whatsapp.modo.ts`);
  `EventoGowa`, `MensagemGowa`, `AckGowa` (Task 1)
- Produces:
  - `situacaoDaSessaoGowa(status: { conectado: boolean; logado: boolean } | null, numeroProprio: string | null): SituacaoSessao`
  - `interpretarEventoGowa(corpo: unknown, deviceId: string): EventoDeCanal[]`
  - `idDaMensagemEnviada(resposta: unknown): string | null`
  - `numeroDoDestino(destino: string): string | null` — CRM -> `phone` que o `/send/*` do GOWA aceita (digitos, sem `@`)

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// apps/api/src/modules/channels/providers/gowa/gowa.mapper.test.ts
import { describe, expect, it } from 'vitest';
import { idDaMensagemEnviada, interpretarEventoGowa, numeroDoDestino, situacaoDaSessaoGowa } from './gowa.mapper';

describe('situacaoDaSessaoGowa', () => {
  it('nao logado -> AGUARDANDO_QR', () => {
    expect(situacaoDaSessaoGowa({ conectado: false, logado: false }, null).estado).toBe('AGUARDANDO_QR');
  });

  it('logado mas socket caido -> CONECTANDO (nao AGUARDANDO_QR de novo)', () => {
    expect(situacaoDaSessaoGowa({ conectado: false, logado: true }, null).estado).toBe('CONECTANDO');
  });

  it('conectado e logado -> CONECTADO, com o telefone', () => {
    const situacao = situacaoDaSessaoGowa({ conectado: true, logado: true }, '5511999990000');
    expect(situacao.estado).toBe('CONECTADO');
    expect(situacao.telefone).toBe('5511999990000');
  });

  it('status nulo (GOWA fora do ar) -> DESCONHECIDO', () => {
    expect(situacaoDaSessaoGowa(null, null).estado).toBe('DESCONHECIDO');
  });
});

describe('interpretarEventoGowa', () => {
  it('mensagem individual vira mensagem.recebida', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M1', chat_id: '5511999990000@s.whatsapp.net', from_name: 'Cliente', body: 'oi', is_from_me: false } },
      'vendedor-1',
    );
    expect(eventos).toEqual([
      expect.objectContaining({
        tipo: 'mensagem.recebida',
        sessaoExterna: 'vendedor-1',
        mensagem: expect.objectContaining({ conteudo: 'oi', telefone: '5511999990000', idExterno: 'M1' }),
      }),
    ]);
  });

  it('mensagem de grupo (@g.us) e ignorada', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M2', chat_id: '123456-group@g.us', body: 'oi turma', is_from_me: false } },
      'vendedor-1',
    );
    expect(eventos).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });

  it('mensagem propria (is_from_me) vira mensagem.propria', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M3', chat_id: '5511999990000@s.whatsapp.net', body: 'oi', is_from_me: true } },
      'vendedor-1',
    );
    expect(eventos).toEqual([{ tipo: 'mensagem.propria', sessaoExterna: 'vendedor-1', idExterno: 'M3' }]);
  });

  it('anexo sem legenda vira texto descritivo (sem baixar o binario)', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message', payload: { id: 'M4', chat_id: '5511999990000@s.whatsapp.net', image: { mimetype: 'image/jpeg' }, is_from_me: false } },
      'vendedor-1',
    );
    expect(eventos[0]).toMatchObject({ tipo: 'mensagem.recebida', mensagem: { conteudo: '[Imagem recebida]' } });
  });

  it('message.ack "delivered" vira mensagem.status ENTREGUE, um evento por id', () => {
    const eventos = interpretarEventoGowa(
      { event: 'message.ack', payload: { receipt_type: 'delivered', ids: ['A1', 'A2'] } },
      'vendedor-1',
    );
    expect(eventos).toEqual([
      { tipo: 'mensagem.status', sessaoExterna: 'vendedor-1', idExterno: 'A1', status: 'ENTREGUE' },
      { tipo: 'mensagem.status', sessaoExterna: 'vendedor-1', idExterno: 'A2', status: 'ENTREGUE' },
    ]);
  });

  it('message.ack "read" vira mensagem.status LIDA', () => {
    const eventos = interpretarEventoGowa({ event: 'message.ack', payload: { receipt_type: 'read', ids: ['A3'] } }, 'vendedor-1');
    expect(eventos).toEqual([{ tipo: 'mensagem.status', sessaoExterna: 'vendedor-1', idExterno: 'A3', status: 'LIDA' }]);
  });

  it('evento nao tratado (ex.: message.reaction) e ignorado', () => {
    const eventos = interpretarEventoGowa({ event: 'message.reaction', payload: {} }, 'vendedor-1');
    expect(eventos).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });

  it('corpo que nao e objeto e ignorado', () => {
    expect(interpretarEventoGowa(null, 'vendedor-1')).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });
});

describe('idDaMensagemEnviada', () => {
  it('le de results.message_id', () => {
    expect(idDaMensagemEnviada({ results: { message_id: 'X1' } })).toBe('X1');
  });
  it('le de results.id quando nao tem message_id', () => {
    expect(idDaMensagemEnviada({ results: { id: 'X2' } })).toBe('X2');
  });
  it('null quando nao acha nenhum dos dois', () => {
    expect(idDaMensagemEnviada({ results: {} })).toBeNull();
    expect(idDaMensagemEnviada(null)).toBeNull();
  });
});

describe('numeroDoDestino', () => {
  it('numero cru -> so digitos, com DDI', () => {
    expect(numeroDoDestino('(11) 99999-0000')).toBe('5511999990000');
  });
  it('numero invalido -> null (nunca envia pra destino incerto)', () => {
    expect(numeroDoDestino('abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.mapper.test.ts`
Expected: FAIL — `Cannot find module './gowa.mapper'`

- [ ] **Step 3: Implementar `gowa.mapper.ts`**

```typescript
import { numeroNormalizado } from '../../whatsapp.modo';
import type { MensagemNormalizada } from '../../meta.types';
import type { EstadoSessao, EventoDeCanal, SituacaoSessao, StatusDeEntrega } from '../channel-provider';
import type { AckGowa, EventoGowa, EnvioGowa, MensagemGowa } from './gowa.types';

/**
 * Traducao pura GOWA -> CRM: estado de conexao, mensagem e recibo de
 * entrega. Sem banco e sem rede, testada com payload capturado — mesmo
 * papel do `waha.mapper.ts`.
 */

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * GOWA separa "conectado" (socket vivo) de "logado" (sessao pareada) — ao
 * contrario do WAHA, que tem um unico enum. `status: null` (GOWA fora do ar,
 * ou device que nunca respondeu) e sempre DESCONHECIDO: falha de diagnostico
 * nao prova desconexao.
 */
export function situacaoDaSessaoGowa(
  status: { conectado: boolean; logado: boolean } | null,
  numeroProprio: string | null,
): SituacaoSessao {
  let estado: EstadoSessao;
  if (!status) estado = 'DESCONHECIDO';
  else if (!status.logado) estado = 'AGUARDANDO_QR';
  else if (!status.conectado) estado = 'CONECTANDO'; // pareada, socket caiu: reconecta, nao pede QR novo
  else estado = 'CONECTADO';

  return {
    estado,
    detalhe: status ? `conectado=${status.conectado} logado=${status.logado}` : null,
    telefone: estado === 'CONECTADO' ? numeroProprio : null,
  };
}

/** Chats que o CRM nao atende: grupo. GOWA nao manda lista de difusao/canal nos eventos que assinamos. */
function chatForaDoAtendimento(chatId: string): boolean {
  return chatId.endsWith('@g.us');
}

function telefoneDoChatId(chatId: string | null): string | null {
  if (!chatId) return null;
  const semSufixo = chatId.includes('@') ? chatId.slice(0, chatId.indexOf('@')) : chatId;
  return numeroNormalizado(semSufixo.split(':')[0] ?? null);
}

function descricaoDoAnexo(p: MensagemGowa): string | null {
  if (p.image !== undefined) return '[Imagem recebida]';
  if (p.video !== undefined) return '[Video recebido]';
  if (p.audio !== undefined) return '[Audio recebido]';
  if (p.document !== undefined) return '[Arquivo recebido]';
  if (p.sticker !== undefined) return '[Figurinha recebida]';
  return null;
}

function mensagemRecebida(sessaoExterna: string, p: MensagemGowa): EventoDeCanal {
  const idExterno = texto(p.id);
  const chatId = texto(p.chat_id) ?? texto(p.from);
  if (!idExterno || !chatId) return { tipo: 'ignorado', motivo: 'mensagem sem id ou remetente' };
  if (chatForaDoAtendimento(chatId)) return { tipo: 'ignorado', motivo: 'chat fora do atendimento (grupo)' };

  const corpo = texto(p.body) ?? texto(p.content) ?? texto(p.text);
  const anexo = descricaoDoAnexo(p);
  if (!corpo && !anexo) return { tipo: 'ignorado', motivo: 'mensagem sem conteudo' };

  const mensagem: MensagemNormalizada = {
    canal: 'WHATSAPP',
    enderecoExterno: chatId,
    nomeExibicao: texto(p.from_name) ?? texto(p.pushName) ?? texto(p.notify),
    telefone: telefoneDoChatId(chatId),
    idExterno,
    conteudo: corpo ?? anexo ?? '',
    tipoAnexo: 'TEXTO',
    anexoUrl: null,
    anexoIdExterno: null,
    anexoNome: null,
    identificadorDestino: sessaoExterna,
  };
  return { tipo: 'mensagem.recebida', sessaoExterna, mensagem };
}

const STATUS_DO_RECIBO: Record<string, StatusDeEntrega> = {
  delivered: 'ENTREGUE',
  read: 'LIDA',
  'read-self': 'LIDA',
};

/**
 * Evento de webhook do GOWA -> eventos do CRM. So `message` e `message.ack`
 * sao assinados (o resto — reacao, edicao, chamada, presenca — nao vira
 * conversa; ver "Fora de escopo" no spec). `deviceId` e a sessao: o GOWA nao
 * manda a sessao no corpo do webhook, so no `X-Device-Id` da URL que a
 * chamou — resolvido fora, pela rota generica de webhook.
 */
export function interpretarEventoGowa(corpo: unknown, deviceId: string): EventoDeCanal[] {
  if (!corpo || typeof corpo !== 'object') return [{ tipo: 'ignorado', motivo: 'corpo nao e objeto' }];
  const envelope = corpo as EventoGowa;
  const evento = texto(envelope.event);
  if (!evento) return [{ tipo: 'ignorado', motivo: 'evento sem nome' }];

  const payload = (envelope.payload ?? envelope.data ?? {}) as MensagemGowa & AckGowa;

  if (evento === 'message.ack') {
    const status = typeof payload.receipt_type === 'string' ? STATUS_DO_RECIBO[payload.receipt_type] : undefined;
    const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : [];
    if (!status || ids.length === 0) return [{ tipo: 'ignorado', motivo: 'recibo sem tipo reconhecido ou sem ids' }];
    return ids.map((idExterno) => ({ tipo: 'mensagem.status', sessaoExterna: deviceId, idExterno, status }));
  }

  if (evento === 'message') {
    if (payload.is_from_me === true) {
      const idExterno = texto(payload.id);
      return idExterno
        ? [{ tipo: 'mensagem.propria', sessaoExterna: deviceId, idExterno }]
        : [{ tipo: 'ignorado', motivo: 'mensagem propria sem id' }];
    }
    return [mensagemRecebida(deviceId, payload)];
  }

  return [{ tipo: 'ignorado', motivo: `evento ${evento} nao tratado` }];
}

/** Id da mensagem na resposta de envio — `extract_msg_id` do cliente de referencia. */
export function idDaMensagemEnviada(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== 'object') return null;
  const r = resposta as EnvioGowa;
  const dosResultados = texto(r.results?.message_id) ?? texto(r.results?.id);
  if (dosResultados) return dosResultados;
  return texto(r.message_id) ?? texto(r.id);
}

/** Destino do CRM -> `phone` que o `/send/*` do GOWA aceita: so digitos, com DDI. `null` recusa o envio. */
export function numeroDoDestino(destino: string): string | null {
  return numeroNormalizado(destino);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.mapper.test.ts`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/channels/providers/gowa/gowa.mapper.ts apps/api/src/modules/channels/providers/gowa/gowa.mapper.test.ts
git commit -m "feat(whatsapp): mapper GOWA - traducao pura para o vocabulario do CRM

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `gowa.webhook.ts` — autenticacao do webhook de entrada

**Files:**
- Create: `apps/api/src/modules/channels/providers/gowa/gowa.webhook.ts`
- Test: `apps/api/src/modules/channels/providers/gowa/gowa.webhook.test.ts`

**Interfaces:**
- Consumes: `RequisicaoDeWebhook` (`channel-provider.ts`)
- Produces: `webhookGowaAutentico(req: RequisicaoDeWebhook, segredo: string | null): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// apps/api/src/modules/channels/providers/gowa/gowa.webhook.test.ts
import { describe, expect, it } from 'vitest';
import { webhookGowaAutentico } from './gowa.webhook';

function req(query: Record<string, unknown> = {}): Parameters<typeof webhookGowaAutentico>[0] {
  return { corpoBruto: Buffer.from('{}'), header: () => undefined, query };
}

describe('webhookGowaAutentico', () => {
  it('sem segredo configurado, nada passa (fail-closed)', () => {
    expect(webhookGowaAutentico(req({ secret: 'qualquer' }), null)).toBe(false);
  });

  it('secret da URL igual ao configurado: autentica', () => {
    expect(webhookGowaAutentico(req({ secret: 's3gr3d0' }), 's3gr3d0')).toBe(true);
  });

  it('secret da URL diferente: recusa', () => {
    expect(webhookGowaAutentico(req({ secret: 'errado' }), 's3gr3d0')).toBe(false);
  });

  it('sem secret na URL: recusa', () => {
    expect(webhookGowaAutentico(req({}), 's3gr3d0')).toBe(false);
  });

  it('secret nao-string na query: recusa', () => {
    expect(webhookGowaAutentico(req({ secret: ['s3gr3d0'] }), 's3gr3d0')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.webhook.test.ts`
Expected: FAIL — `Cannot find module './gowa.webhook'`

- [ ] **Step 3: Implementar `gowa.webhook.ts`**

```typescript
import { timingSafeEqual } from 'node:crypto';
import type { RequisicaoDeWebhook } from '../channel-provider';

/**
 * Autenticacao do webhook do GOWA — fail-closed, so por `?secret=` na URL.
 *
 * Ao contrario do WAHA, o GOWA de referencia (go-whatsapp-web-multidevice)
 * nao assina eventos (sem HMAC) — mesma situacao do WPPConnect. O segredo na
 * URL e a UNICA prova; sem segredo configurado, nada passa.
 */
export function webhookGowaAutentico(req: RequisicaoDeWebhook, segredo: string | null): boolean {
  if (!segredo) return false;
  const recebido = typeof req.query.secret === 'string' ? req.query.secret : null;
  return recebido !== null && iguais(recebido, segredo);
}

/** Comparacao em tempo constante; tamanhos diferentes ja sao diferentes. */
function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.webhook.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/channels/providers/gowa/gowa.webhook.ts apps/api/src/modules/channels/providers/gowa/gowa.webhook.test.ts
git commit -m "feat(whatsapp): autenticacao do webhook GOWA (?secret=, fail-closed)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `GowaProvider` — implementa `ChannelProvider`

**Files:**
- Create: `apps/api/src/modules/channels/providers/gowa/gowa.provider.ts`
- Test: `apps/api/src/modules/channels/providers/gowa/gowa.provider.test.ts`

**Interfaces:**
- Consumes: `ChannelProvider`, `SessaoResolvida`, `SituacaoSessao`, `QrOuEstado`, `InputMidia`,
  `ResultadoEnvio`, `RequisicaoDeWebhook` (`channel-provider.ts`); `AppError` (`lib/errors.ts`);
  `log` (`lib/log.ts`); `obterConfigGowa`, `obterSegredoWebhookGowa`, `obterSessaoFixaGowa`
  (Task 1); `GowaClient`, `GowaErro` (Task 2); `situacaoDaSessaoGowa`, `interpretarEventoGowa`,
  `idDaMensagemEnviada`, `numeroDoDestino` (Task 3); `webhookGowaAutentico` (Task 4)
- Produces: `class GowaProvider implements ChannelProvider` — registrado no Task 6

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// apps/api/src/modules/channels/providers/gowa/gowa.provider.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessaoResolvida } from '../channel-provider';

/**
 * O provider contra um GOWA falso em memoria: responde pelos mesmos
 * endpoints e envelope `{ results: ... }` do real, guarda devices em memoria.
 * Prova o ciclo inteiro (criar device -> QR -> conectado -> enviar) sem rede.
 * Mesmo desenho do `waha.provider.test.ts`.
 */

const ENV = {
  GOWA_BASE_URL: 'http://gowa:3000',
  GOWA_WEBHOOK_SECRET: 'segredo-do-webhook-bem-longo',
  GOWA_SESSAO: 'vendedor-1a2b3c4d',
} as const;

type DeviceFalso = { id: string; conectado: boolean; logado: boolean; numero: string | null };

function gowaFalso() {
  const devices = new Map<string, DeviceFalso>();
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET';
    const caminho = url.replace(ENV.GOWA_BASE_URL, '');
    const deviceId = (init.headers as Record<string, string> | undefined)?.['X-Device-Id'];
    const corpo = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;

    if (metodo === 'GET' && caminho === '/devices') {
      return json(200, { results: [...devices.values()].map((d) => ({ id: d.id })) });
    }
    if (metodo === 'POST' && caminho === '/devices') {
      devices.set(corpo.device_id, { id: corpo.device_id, conectado: false, logado: false, numero: null });
      return json(201, { results: { id: corpo.device_id } });
    }
    if (metodo === 'GET' && caminho === '/app/status') {
      const d = deviceId ? devices.get(deviceId) : undefined;
      if (!d) return json(404, { message: 'device not found' });
      return json(200, { results: { is_connected: d.conectado, is_logged_in: d.logado } });
    }
    if (metodo === 'GET' && caminho === '/app/login') {
      return json(200, { results: { qr_link: `${ENV.GOWA_BASE_URL}/statics/qrcode/${deviceId}.png` } });
    }
    if (metodo === 'GET' && caminho === `/statics/qrcode/${deviceId}.png`) {
      return new Response(Buffer.from('QRCODE'), { status: 200, headers: { 'Content-Type': 'image/png' } });
    }
    if (metodo === 'GET' && caminho === '/app/logout') {
      const d = deviceId ? devices.get(deviceId) : undefined;
      if (d) Object.assign(d, { conectado: false, logado: false, numero: null });
      return json(200, {});
    }
    if (metodo === 'POST' && caminho === '/send/message') {
      const d = deviceId ? devices.get(deviceId) : undefined;
      if (!d || !d.conectado) return json(422, { message: 'not connected' });
      return json(200, { results: { message_id: `GOWA_${corpo.phone}_1` } });
    }
    return json(404, {});
  });

  return { devices, fetch };
}

const LINHA: SessaoResolvida = { canalConfigId: 'linha-1', sessaoExterna: 'vendedor-1a2b3c4d' };

describe('GowaProvider', () => {
  let gowa: ReturnType<typeof gowaFalso>;
  const originais: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) {
      originais[k] = process.env[k];
      process.env[k] = v;
    }
    gowa = gowaFalso();
    vi.stubGlobal('fetch', gowa.fetch);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of Object.keys(ENV)) {
      if (originais[k] === undefined) delete process.env[k];
      else process.env[k] = originais[k];
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('configurado() e false sem GOWA_BASE_URL', async () => {
    delete process.env.GOWA_BASE_URL;
    const { GowaProvider } = await import('./gowa.provider');
    expect(new GowaProvider().configurado()).toBe(false);
  });

  it('sessao.qr cria o device e devolve QR quando ainda nao logado', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const provider = new GowaProvider();

    const resultado = await provider.sessao.qr(LINHA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.qr).toMatch(/^data:image\/png;base64,/);
    expect(gowa.devices.has('vendedor-1a2b3c4d')).toBe(true);
  });

  it('sessao.qr devolve conectado=true sem QR quando ja conectado', async () => {
    gowa.devices.set('vendedor-1a2b3c4d', { id: 'vendedor-1a2b3c4d', conectado: true, logado: true, numero: '5511999990000' });
    const { GowaProvider } = await import('./gowa.provider');

    const resultado = await new GowaProvider().sessao.qr(LINHA);

    expect(resultado).toEqual({ qr: null, conectado: true, motivo: null });
  });

  it('sessao.qr nunca lanca quando o GOWA esta fora do ar', async () => {
    gowa.fetch.mockImplementation(() => Promise.reject(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })));
    const { GowaProvider } = await import('./gowa.provider');

    const resultado = await new GowaProvider().sessao.qr(LINHA);

    expect(resultado.qr).toBeNull();
    expect(resultado.conectado).toBe(false);
    expect(resultado.motivo).toBeTruthy();
  });

  it('sessao.estado: device pareado com socket caido vira CONECTANDO, nao AGUARDANDO_QR', async () => {
    gowa.devices.set('vendedor-1a2b3c4d', { id: 'vendedor-1a2b3c4d', conectado: false, logado: true, numero: '5511999990000' });
    const { GowaProvider } = await import('./gowa.provider');

    const situacao = await new GowaProvider().sessao.estado(LINHA);

    expect(situacao.estado).toBe('CONECTANDO');
  });

  it('sessao.estado: device que nunca existiu vira DESCONECTADO', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const situacao = await new GowaProvider().sessao.estado(LINHA);
    expect(situacao.estado).toBe('DESCONECTADO');
  });

  it('enviarTexto: linha nao conectada recusa com AppError 503', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    await expect(new GowaProvider().enviarTexto(LINHA, '5511999990000', 'oi')).rejects.toMatchObject({ status: 503 });
  });

  it('enviarTexto: linha conectada envia e devolve idExterno', async () => {
    gowa.devices.set('vendedor-1a2b3c4d', { id: 'vendedor-1a2b3c4d', conectado: true, logado: true, numero: '5511999990000' });
    const { GowaProvider } = await import('./gowa.provider');

    const resultado = await new GowaProvider().enviarTexto(LINHA, '(11) 99999-0000', 'oi');

    expect(resultado.idExterno).toBe('GOWA_5511999990000_1');
  });

  it('enviarTexto: destino sem numero valido recusa com DESTINO_INVALIDO', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    await expect(new GowaProvider().enviarTexto(LINHA, 'abc', 'oi')).rejects.toMatchObject({ code: 'DESTINO_INVALIDO' });
  });

  it('webhook.autenticar delega para webhookGowaAutentico', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const provider = new GowaProvider();
    const reqOk = { corpoBruto: Buffer.from('{}'), header: () => undefined, query: { secret: ENV.GOWA_WEBHOOK_SECRET } };
    const reqRuim = { corpoBruto: Buffer.from('{}'), header: () => undefined, query: {} };
    expect(provider.webhook.autenticar(reqOk)).toBe(true);
    expect(provider.webhook.autenticar(reqRuim)).toBe(false);
  });

  it('webhook.interpretar usa GOWA_SESSAO como sessaoExterna (o GOWA nao manda a sessao no corpo)', async () => {
    const { GowaProvider } = await import('./gowa.provider');
    const eventos = new GowaProvider().webhook.interpretar({ event: 'message', payload: { id: 'M1', chat_id: '5511999990000@s.whatsapp.net', body: 'oi' } });
    expect(eventos[0]).toMatchObject({ tipo: 'mensagem.recebida', sessaoExterna: 'vendedor-1a2b3c4d' });
  });

  it('webhook.interpretar sem GOWA_SESSAO configurada: evento ignorado, nunca atribuido a sessao errada', async () => {
    delete process.env.GOWA_SESSAO;
    const { GowaProvider } = await import('./gowa.provider');
    const eventos = new GowaProvider().webhook.interpretar({ event: 'message', payload: { id: 'M1', chat_id: '5511999990000@s.whatsapp.net', body: 'oi' } });
    expect(eventos).toEqual([expect.objectContaining({ tipo: 'ignorado' })]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.provider.test.ts`
Expected: FAIL — `Cannot find module './gowa.provider'`

- [ ] **Step 3: Implementar `gowa.provider.ts`**

```typescript
import { AppError } from '../../../../lib/errors';
import { log } from '../../../../lib/log';
import { obterConfigGowa, obterSegredoWebhookGowa, obterSessaoFixaGowa } from '../../../../config/gowa.config';
import type {
  ChannelProvider,
  InputMidia,
  QrOuEstado,
  RequisicaoDeWebhook,
  ResultadoEnvio,
  SessaoResolvida,
  SituacaoSessao,
} from '../channel-provider';
import { GowaClient, GowaErro } from './gowa.client';
import { idDaMensagemEnviada, interpretarEventoGowa, numeroDoDestino, situacaoDaSessaoGowa } from './gowa.mapper';
import type { EndpointDeMidiaGowa } from './gowa.types';
import { webhookGowaAutentico } from './gowa.webhook';

const PROVIDER = 'gowa';

/**
 * WhatsApp via GOWA (go-whatsapp-web-multidevice) — terceiro `ChannelProvider`,
 * portado do plugin `gowa` do `whatsbot-pro-main` com fidelidade tecnica ao
 * `gowa/client.py` de referencia (so nas rotas que este contrato usa).
 *
 * Uma unica instancia do GOWA para a instalacao inteira, uma linha por
 * *device* (`X-Device-Id` = `ChannelConfig.ponteSessao`) — multi-device num
 * processo so, diferente do WAHA (uma instancia = a instalacao inteira, mas
 * SEM multi-device por header).
 */
export class GowaProvider implements ChannelProvider {
  readonly nome = PROVIDER;
  readonly capacidades = { pareamentoPorQr: true, statusDeEntrega: true };

  /** Devices ja garantidos neste processo — evita recriar a cada poll do QR. */
  private readonly garantidos = new Set<string>();

  configurado(): boolean {
    return obterConfigGowa() !== null;
  }

  private cliente(): GowaClient {
    const cfg = obterConfigGowa();
    if (!cfg) {
      throw new AppError(503, 'CANAL_INDISPONIVEL', 'O WhatsApp nao esta configurado nesta instalacao (GOWA_BASE_URL)');
    }
    return new GowaClient(cfg.url);
  }

  private static deviceId(sessao: SessaoResolvida): string {
    const id = sessao.sessaoExterna?.trim();
    if (!id) throw new AppError(503, 'CANAL_INDISPONIVEL', 'Falta a sessao do WhatsApp desta linha');
    return id;
  }

  /**
   * GOWA/GowaErro -> erro do CRM, com a frase que o atendente le.
   *
   * Ordem importa: o sinal de "reachout timelock" (bloqueio anti-spam do
   * WhatsApp ao iniciar conversa nova) e checado ANTES do 404/422 generico,
   * porque builds mais antigos do GOWA devolvem esse bloqueio como HTTP 422
   * ou 500 opaco (nao so 429) — sem checar o texto primeiro, cairia no
   * "linha nao conectada" generico e esconderia a causa real.
   */
  private static erroDeEnvio(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof GowaErro) {
      if (err.tipo !== 'http') return new AppError(502, 'CANAL_INACESSIVEL', err.message);
      const pista = `${err.status ?? ''} ${err.corpoErro ?? ''}`.toLowerCase();
      if (err.status === 429 || pista.includes('reachout') || pista.includes('timelock') || pista.includes('463')) {
        return new AppError(502, 'ENVIO_RECUSADO', 'O WhatsApp recusou iniciar esta conversa agora (limite anti-spam). Tente novamente mais tarde.');
      }
      // 404: device nao existe no GOWA; 422: device existe mas nao esta conectado
      // (mesma leitura que o WahaProvider ja faz para a sessao do WAHA).
      if (err.status === 404 || err.status === 422) {
        return new AppError(503, 'CANAL_INDISPONIVEL', 'O WhatsApp desta linha nao esta conectado');
      }
      return new AppError(502, 'ENVIO_RECUSADO', err.message);
    }
    return new AppError(502, 'CANAL_INACESSIVEL', err instanceof Error ? err.message : 'erro desconhecido');
  }

  private static camposDeLog(sessao: SessaoResolvida, extra: Record<string, string | number | null> = {}) {
    return { provider: PROVIDER, canalConfigId: sessao.canalConfigId, sessaoExterna: sessao.sessaoExterna, ...extra };
  }

  // ---------------------------------------------------------------- mensagens

  async enviarTexto(sessao: SessaoResolvida, destino: string, texto: string): Promise<ResultadoEnvio> {
    const deviceId = GowaProvider.deviceId(sessao);
    const phone = numeroDoDestino(destino);
    if (!phone) throw new AppError(400, 'DESTINO_INVALIDO', 'O contato nao tem um numero de WhatsApp valido');

    const inicio = Date.now();
    try {
      const resposta = await this.cliente().enviarTexto(deviceId, phone, texto);
      const idExterno = idDaMensagemEnviada(resposta);
      log.info('mensagem', 'texto enviado', GowaProvider.camposDeLog(sessao, { idExterno, duracaoMs: Date.now() - inicio }));
      return { idExterno };
    } catch (err) {
      const erro = GowaProvider.erroDeEnvio(err);
      log.warn('mensagem', 'envio de texto falhou', GowaProvider.camposDeLog(sessao, { codigo: erro.code, motivo: erro.message }));
      throw erro;
    }
  }

  async enviarMidia(sessao: SessaoResolvida, destino: string, midia: InputMidia): Promise<ResultadoEnvio> {
    const deviceId = GowaProvider.deviceId(sessao);
    const phone = numeroDoDestino(destino);
    if (!phone) throw new AppError(400, 'DESTINO_INVALIDO', 'O contato nao tem um numero de WhatsApp valido');

    const familia = midia.tipo.split('/')[0];
    const endpoint: EndpointDeMidiaGowa = familia === 'image' ? 'image' : familia === 'video' ? 'video' : familia === 'audio' ? 'audio' : 'file';

    const inicio = Date.now();
    try {
      const resposta = await this.cliente().enviarArquivo(
        deviceId,
        endpoint,
        phone,
        { buffer: midia.buffer, nome: midia.nome, tipo: midia.tipo },
        midia.legenda,
      );
      const idExterno = idDaMensagemEnviada(resposta);
      log.info('mensagem', 'arquivo enviado', GowaProvider.camposDeLog(sessao, { idExterno, endpoint, duracaoMs: Date.now() - inicio }));
      return { idExterno };
    } catch (err) {
      const erro = GowaProvider.erroDeEnvio(err);
      log.warn('mensagem', 'envio de arquivo falhou', GowaProvider.camposDeLog(sessao, { endpoint, codigo: erro.code, motivo: erro.message }));
      throw erro;
    }
  }

  // ------------------------------------------------------------------- sessao

  /** Garante que o device existe no GOWA (cria se preciso) — equivalente a `ensure_device` de referencia. */
  private async garantirDevice(sessao: SessaoResolvida, cliente: GowaClient): Promise<string> {
    const deviceId = GowaProvider.deviceId(sessao);
    if (this.garantidos.has(deviceId)) return deviceId;
    const existentes = await cliente.listarDevices();
    if (!existentes.includes(deviceId)) {
      await cliente.criarDevice(deviceId);
      log.info('sessao', 'device criado no GOWA', GowaProvider.camposDeLog(sessao));
    }
    this.garantidos.add(deviceId);
    return deviceId;
  }

  sessao = {
    iniciar: async (sessao: SessaoResolvida): Promise<SituacaoSessao> => {
      const cliente = this.cliente();
      const deviceId = await this.garantirDevice(sessao, cliente);
      const status = await cliente.obterStatus(deviceId);
      return situacaoDaSessaoGowa(status, null);
    },

    qr: async (sessao: SessaoResolvida): Promise<QrOuEstado> => {
      if (!sessao.sessaoExterna?.trim()) {
        return { qr: null, conectado: false, motivo: 'a sessao do WhatsApp desta linha ainda nao foi configurada' };
      }
      try {
        const cliente = this.cliente();
        const deviceId = await this.garantirDevice(sessao, cliente);
        const status = await cliente.obterStatus(deviceId);
        const situacao = situacaoDaSessaoGowa(status, null);

        switch (situacao.estado) {
          case 'CONECTADO':
            return { qr: null, conectado: true, motivo: null };
          case 'CONECTANDO':
            // Pareada, socket caiu: reconecta em vez de pedir QR novo (perderia o pareamento a toa).
            await cliente.reconectar(deviceId);
            return { qr: null, conectado: false, motivo: 'reconectando a sessao ja pareada' };
          case 'AGUARDANDO_QR': {
            const qr = await cliente.obterQrCode(deviceId);
            return { qr, conectado: false, motivo: qr ? null : 'o QR ainda nao foi gerado' };
          }
          default:
            return { qr: null, conectado: false, motivo: 'nao foi possivel falar com o WhatsApp' };
        }
      } catch (err) {
        log.warn('sessao', 'nao foi possivel obter o QR', GowaProvider.camposDeLog(sessao, {
          motivo: err instanceof Error ? err.message : 'erro desconhecido',
        }));
        return { qr: null, conectado: false, motivo: err instanceof Error ? err.message : 'nao foi possivel falar com o WhatsApp' };
      }
    },

    estado: async (sessao: SessaoResolvida): Promise<SituacaoSessao> => {
      const deviceId = sessao.sessaoExterna?.trim();
      if (!deviceId) return { estado: 'DESCONHECIDO', detalhe: 'sessao nao informada', telefone: null };
      try {
        const status = await this.cliente().obterStatus(deviceId);
        if (!status) return { estado: 'DESCONECTADO', detalhe: 'device ainda nao criado ou GOWA fora do ar', telefone: null };
        return situacaoDaSessaoGowa(status, null);
      } catch (err) {
        return { estado: 'DESCONHECIDO', detalhe: err instanceof Error ? err.message : 'erro desconhecido', telefone: null };
      }
    },

    desconectar: async (sessao: SessaoResolvida): Promise<void> => {
      const deviceId = GowaProvider.deviceId(sessao);
      try {
        await this.cliente().logout(deviceId);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(502, 'DESCONEXAO_RECUSADA', err instanceof Error ? err.message : 'erro desconhecido');
      }
      log.info('sessao', 'sessao desconectada a pedido', GowaProvider.camposDeLog(sessao));
    },

    reiniciar: async (sessao: SessaoResolvida): Promise<void> => {
      const deviceId = GowaProvider.deviceId(sessao);
      try {
        await this.cliente().reconectar(deviceId);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(502, 'CANAL_INACESSIVEL', err instanceof Error ? err.message : 'erro desconhecido');
      }
      log.info('sessao', 'sessao reiniciada a pedido', GowaProvider.camposDeLog(sessao));
    },
  };

  webhook = {
    autenticar: (req: RequisicaoDeWebhook): boolean => webhookGowaAutentico(req, obterSegredoWebhookGowa()),
    interpretar: (corpo: unknown) => {
      // O GOWA nao manda a sessao no corpo do webhook, e (v1) so atende uma
      // linha por instancia — ver spec, "Limite conhecido da v1". A sessao
      // vem de GOWA_SESSAO, fixada na instalacao, nunca do payload.
      const sessaoFixa = obterSessaoFixaGowa();
      if (!sessaoFixa) {
        log.warn('webhook', 'GOWA_SESSAO nao configurada: evento descartado (nao ha como saber a organizacao)', { provider: PROVIDER });
        return [{ tipo: 'ignorado' as const, motivo: 'GOWA_SESSAO nao configurada nesta instalacao' }];
      }
      return interpretarEventoGowa(corpo, sessaoFixa);
    },
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run apps/api/src/modules/channels/providers/gowa/gowa.provider.test.ts`
Expected: PASS (12 testes)

- [ ] **Step 5: Rodar a suite inteira do modulo channels, garantir que nada quebrou**

Run: `npx vitest run apps/api/src/modules/channels`
Expected: PASS (todos os arquivos, incluindo os 4 novos)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/channels/providers/gowa/gowa.provider.ts apps/api/src/modules/channels/providers/gowa/gowa.provider.test.ts
git commit -m "feat(whatsapp): GowaProvider - implementa ChannelProvider

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Registrar o provider `gowa`

**Files:**
- Modify: `apps/api/src/modules/channels/providers/registro.ts`
- Modify: `apps/api/src/modules/channels/whatsapp-provider.factory.ts`
- Modify: `apps/api/src/modules/channels/whatsapp-provider.factory.test.ts`

**Interfaces:**
- Consumes: `GowaProvider` (Task 5), `WhatsAppProviderLegado` (`providers/legado.ts`, já existe)
- Produces: `WHATSAPP_PROVIDER=gowa` passa a ser um valor aceito pela instalação inteira

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `apps/api/src/modules/channels/whatsapp-provider.factory.test.ts`, dentro do
`describe('getWhatsAppProvider', ...)`, logo após o teste de `waha`:

```typescript
  it('WHATSAPP_PROVIDER=gowa serve o GowaProvider pelo contrato legado, sem credencial por linha', async () => {
    process.env.WHATSAPP_PROVIDER = 'gowa';
    const { getWhatsAppProvider } = await import('./whatsapp-provider.factory');
    const { WhatsAppProviderLegado } = await import('./providers/legado');

    const provider = getWhatsAppProvider();
    expect(provider).toBeInstanceOf(WhatsAppProviderLegado);
    expect(provider.credenciaisPorLinha).toBe(false);
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run apps/api/src/modules/channels/whatsapp-provider.factory.test.ts`
Expected: FAIL — `WHATSAPP_PROVIDER invalido: "gowa"`

- [ ] **Step 3: Registrar em `registro.ts`**

```typescript
import type { ChannelProvider } from './channel-provider';
import { GowaProvider } from './gowa/gowa.provider';
import { WahaProvider } from './waha/waha.provider';

const PROVIDERS: Record<string, ChannelProvider> = {
  waha: new WahaProvider(),
  gowa: new GowaProvider(),
};

export function obterProvider(nome: string): ChannelProvider | null {
  return PROVIDERS[nome.trim().toLowerCase()] ?? null;
}
```

- [ ] **Step 4: Registrar em `whatsapp-provider.factory.ts`**

```typescript
const FABRICAS: Record<string, () => WhatsAppProvider> = {
  baileys: () => new BaileysProvider(),
  wppconnect: () => new WPPConnectProvider(),
  waha: () => new WhatsAppProviderLegado(obterProvider('waha')!),
  gowa: () => new WhatsAppProviderLegado(obterProvider('gowa')!),
};
```

(Só a linha `waha` original comparada — o resto do arquivo, incluindo os comentários da doc-string,
fica como está.)

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run apps/api/src/modules/channels/whatsapp-provider.factory.test.ts`
Expected: PASS

- [ ] **Step 6: Rodar a suite inteira e o typecheck**

Run: `npx vitest run` e `npm run typecheck -w @plataforma/api`
Expected: PASS em ambos, sem quebrar nenhum teste existente (WAHA/WPPConnect/Baileys inclusos)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/channels/providers/registro.ts apps/api/src/modules/channels/whatsapp-provider.factory.ts apps/api/src/modules/channels/whatsapp-provider.factory.test.ts
git commit -m "feat(whatsapp): registra o provider gowa (WHATSAPP_PROVIDER=gowa)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `GOWA.md` — deploy no Coolify

**Files:**
- Create: `GOWA.md` (raiz do repo)
- Modify: `README.md` (link, mesma linha que já lista DEPLOY/COOLIFY/WPPCONNECT/WAHA — se essa
  linha ainda existir; se tiver sido removida, adiciona uma nova linha equivalente)

**Interfaces:** nenhuma — task de documentação, sem código.

- [ ] **Step 1: Escrever `GOWA.md`**

Mesma estrutura de `WAHA.md` (que ainda existe no repo e serve de referência de formato), adaptada
para o GOWA. Conteúdo mínimo obrigatório — sem placeholder, cada seção com o valor real:

```markdown
# WhatsApp por QR Code com GOWA

O GOWA (go-whatsapp-web-multidevice) é o servidor que mantém a sessão do WhatsApp Web de cada
linha. A plataforma fala com ele pelo `GowaProvider`
(`apps/api/src/modules/channels/providers/gowa/`). Nada fora dessa pasta conhece endpoint ou
formato de evento do GOWA.

## Como as peças conversam

\```
navegador ──► API (atendimento.bradel.com.br)
                │  HTTP interno, rede do Coolify, header X-Device-Id
                ▼
             GOWA  (sem domínio, sem porta publicada; um device por linha)
                │  webhook: <base>/api/webhooks/providers/gowa?secret=...
                ▼
               API ─► registrarMensagemEntrante (o mesmo pipeline do WAHA e do WPPConnect)
\```

- **Uma instância do GOWA por LINHA (v1) — não por instalação.** Diferente do WAHA, o webhook do
  GOWA não diz de qual device veio um evento quando várias linhas dividem o mesmo processo (ver
  spec, "Limite conhecido da v1"). Até isso ser resolvido contra uma instância real, cada linha
  extra pede um recurso Docker próprio, com sua própria `GOWA_SESSAO`.
- **O device nasce no primeiro pedido de QR.** A API cria o device no GOWA (`POST /devices`) na
  hora, se ainda não existir. Mesmo assim usa o header `X-Device-Id` (mesmo nome de sessão que
  WAHA/WPPConnect já usam: `vendedor-xxxxxxxx`/`empresa-xxxxxxxx`) — é o que a API manda; o webhook
  de volta não repete isso, por isso a sessão da linha é fixada em `GOWA_SESSAO`, não descoberta.
- **Risco: WhatsApp não-oficial.** Mesmo aviso do WPPConnect — o número pode ser bloqueado pela
  Meta sem aviso. Sem envio em lote por este canal.

## 1. Criar o recurso do GOWA no Coolify

1. No mesmo **Project** e **Environment** da API: **+ New → Resource → Docker Image**.
2. Imagem: `aldinokemal2104/go-whatsapp-web-multidevice`, com tag fixa (não `latest` — evita trocar
   de versão sozinho num redeploy).
3. **Server/Destination**: o mesmo da API — coloca os dois na mesma rede Docker.
4. **Domains**: **vazio**. **Ports Exposes**: `3000`. **Ports Mappings**: **vazio**.

## 2. Volume (sem isto, todo deploy pede QR de novo)

Em **Storages → Add volume mount**:

| Name | Destination Path | O que guarda |
|---|---|---|
| `gowa-storages` | `/app/storages` | banco (SQLite) e credenciais de cada device pareado |

Confirme o caminho no log de start do container escolhido (a tag `aldinokemal2104/go-whatsapp-web-multidevice`
usa `/app/storages` desde as versões 6.x/7.x/8.x; uma tag muito mais nova ou mais antiga pode mudar
isso — o log de start imprime o diretório de dados no boot).

## 3. Deploy e o endereço interno

1. **Deploy**. No log deve aparecer o servidor ouvindo na porta `3000`.
2. Anote o **nome do container** do GOWA — é o hostname dele na rede interna. Abaixo: `<gowa>`.
3. No recurso da **API**, aba **Terminal**:
   \```bash
   node -e "fetch('http://<gowa>:3000/devices').then(r => console.log('HTTP', r.status)).catch(e => console.log(e.cause?.code ?? e.message))"
   \```
   `HTTP 200` prova a rede. `ENOTFOUND`: nome errado ou redes diferentes. `ECONNREFUSED`: o GOWA
   não subiu.

## 4. Variáveis a colar na API

| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `gowa` |
| `GOWA_BASE_URL` | `http://<gowa>:3000` |
| `GOWA_WEBHOOK_SECRET` | gere com `openssl rand -hex 32` |
| `GOWA_SESSAO` | a `ponteSessao` desta linha (mesmo valor que `ChannelConfig.ponteSessao` grava — copie do banco ou da tela de Canais) |

A API já tem `PUBLIC_URL` (ou `WEB_ORIGIN`) configurada para outras integrações — é o endereço usado
no passo seguinte, nada novo a definir só para o GOWA.

## 5. Registrar o webhook no GOWA

No recurso do **GOWA** no Coolify, em **Environment Variables**:

| Variável | Valor |
|---|---|
| `WHATSAPP_WEBHOOK` | `<PUBLIC_URL da API>/api/webhooks/providers/gowa?secret=<GOWA_WEBHOOK_SECRET>` |

Confirme o nome exato da variável no log de start do container: builds do `go-whatsapp-web-multidevice`
anteriores à 6.x usavam `WHATSAPP_WEBHOOK_URL` (singular, sem lista); a partir da 6.x é `WHATSAPP_WEBHOOK`
(aceita uma ou mais URLs separadas por vírgula). Redeploy do GOWA depois de definir a variável.

## 6. Trocar o motor com segurança

`WHATSAPP_PROVIDER` vale para a instalação inteira. Trocar para `gowa` numa API que já tem linhas
conectadas por outro provider derruba essas linhas — teste primeiro numa API de homologação
(branch do Neon, recurso separado no Coolify), nunca direto em produção. Rollback: volte
`WHATSAPP_PROVIDER` para o valor anterior e redeploy.
```

- [ ] **Step 2: Adicionar o link em `README.md`**

Abrir `README.md`, localizar a linha que lista `DEPLOY.md`/`COOLIFY.md`/`WPPCONNECT.md`/`WAHA.md`
(ou os que ainda existirem — alguns podem ter sido removidos numa limpeza anterior) e adicionar
`[GOWA.md](GOWA.md)` na mesma frase, seguindo o padrão já usado para os outros.

- [ ] **Step 3: Commit**

```bash
git add GOWA.md README.md
git commit -m "docs(whatsapp): GOWA.md - deploy do provider GOWA no Coolify

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
