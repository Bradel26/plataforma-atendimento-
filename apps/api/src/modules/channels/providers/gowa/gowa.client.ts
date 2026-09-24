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
