import type { ArquivoWaha, ConfigSessaoWaha, EndpointDeMidia, SessaoWaha } from './waha.types';

/**
 * O unico lugar que conhece a API HTTP do WAHA: URL, `X-Api-Key`, endpoints,
 * teto de tempo e o que cada status HTTP significa. Nao sabe de linha,
 * organizacao nem mensagem do CRM — isso e do `WahaProvider`.
 *
 * Endpoints usados (WAHA 2026.x; mesmos que o Deskcomm usa em producao):
 *   GET    /api/sessions/{name}              -> SessaoWaha (404 = nao existe)
 *   POST   /api/sessions                     { name, start, config } (422 = ja existe)
 *   PUT    /api/sessions/{name}              { name, config }  (reinicia a sessao)
 *   POST   /api/sessions/{name}/start        (422 = ja iniciada)
 *   POST   /api/sessions/{name}/restart
 *   POST   /api/sessions/{name}/logout
 *   GET    /api/{name}/auth/qr?format=image  Accept: json -> { mimetype, data }
 *   POST   /api/sendText                     { session, chatId, text }
 *   POST   /api/sendImage|sendFile|sendVoice|sendVideo { session, chatId, file, caption? }
 */

/** Mesmo teto do resto das integracoes: o WAHA que aceita a conexao e nao responde e o caso caro. */
export const TETO_PADRAO_MS = 15_000;
/** Midia tem teto maior: com `convert: true` o WAHA roda ffmpeg antes de responder (medido pelo Deskcomm). */
export const TETO_DE_MIDIA_MS = 30_000;

export type TipoFalhaWaha = 'http' | 'rede' | 'tempo';

/**
 * Falha falando com o WAHA. A mensagem diz a operacao e o status HTTP, e
 * NUNCA o corpo da resposta: ele descreve sessoes cujo conteudo e conversa de
 * cliente, e a mensagem deste erro chega ao log e a tela.
 */
export class WahaErro extends Error {
  constructor(
    readonly operacao: string,
    readonly tipo: TipoFalhaWaha,
    readonly status: number | null,
    detalhe?: string,
  ) {
    super(
      tipo === 'tempo'
        ? `o WhatsApp nao respondeu a tempo (${operacao})`
        : tipo === 'rede'
          ? `nao foi possivel falar com o servidor do WhatsApp (${operacao}${detalhe ? `: ${detalhe}` : ''})`
          : `o servidor do WhatsApp recusou ${operacao} (HTTP ${status})`,
    );
    this.name = 'WahaErro';
  }
}

export class WahaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly tetoMs: number = TETO_PADRAO_MS,
  ) {}

  private async chamar(
    operacao: string,
    caminho: string,
    init: { method?: string; corpo?: unknown; accept?: string } = {},
    tetoMs = this.tetoMs,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'X-Api-Key': this.apiKey, Accept: init.accept ?? 'application/json' };
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
      if (nome === 'TimeoutError' || nome === 'AbortError') throw new WahaErro(operacao, 'tempo', null);
      // `fetch failed` sozinho nao diz nada; o codigo (ECONNREFUSED, ENOTFOUND) vem em `cause`.
      const causa = err instanceof Error ? (err.cause as { code?: string } | undefined)?.code : undefined;
      throw new WahaErro(operacao, 'rede', null, causa ?? (err instanceof Error ? err.message : undefined));
    }
  }

  private static async json(resposta: Response): Promise<unknown> {
    return resposta.json().catch(() => null);
  }

  /** `null` quando a sessao nao existe no WAHA. */
  async obterSessao(nome: string): Promise<SessaoWaha | null> {
    const resposta = await this.chamar('consultar a sessao', `/api/sessions/${encodeURIComponent(nome)}`);
    if (resposta.status === 404) return null;
    if (!resposta.ok) throw new WahaErro('consultar a sessao', 'http', resposta.status);
    const corpo = (await WahaClient.json(resposta)) as SessaoWaha | null;
    if (!corpo || typeof corpo.status !== 'string') throw new WahaErro('consultar a sessao', 'http', resposta.status);
    return corpo;
  }

  /** Cria e ja inicia. Sessao que ja existe (422) nao e erro: quem chama le o estado depois. */
  async criarSessao(nome: string, config: ConfigSessaoWaha): Promise<void> {
    const resposta = await this.chamar('criar a sessao', '/api/sessions', {
      method: 'POST',
      corpo: { name: nome, start: true, config },
    });
    if (resposta.ok || resposta.status === 422) return;
    throw new WahaErro('criar a sessao', 'http', resposta.status);
  }

  /**
   * Substitui a config INTEIRA da sessao — a doc do WAHA e literal: o PUT nao
   * mescla. Por isso quem chama manda sempre a config completa, nunca um pedaco.
   * O WAHA reinicia a sessao para aplicar (sem pedir QR de novo).
   */
  async atualizarSessao(nome: string, config: ConfigSessaoWaha): Promise<void> {
    const resposta = await this.chamar('atualizar a sessao', `/api/sessions/${encodeURIComponent(nome)}`, {
      method: 'PUT',
      corpo: { name: nome, config },
    });
    if (!resposta.ok) throw new WahaErro('atualizar a sessao', 'http', resposta.status);
  }

  async iniciarSessao(nome: string): Promise<void> {
    const resposta = await this.chamar('iniciar a sessao', `/api/sessions/${encodeURIComponent(nome)}/start`, {
      method: 'POST',
      corpo: {},
    });
    if (resposta.ok || resposta.status === 422) return;
    throw new WahaErro('iniciar a sessao', 'http', resposta.status);
  }

  async reiniciarSessao(nome: string): Promise<void> {
    const resposta = await this.chamar('reiniciar a sessao', `/api/sessions/${encodeURIComponent(nome)}/restart`, {
      method: 'POST',
      corpo: {},
    });
    if (!resposta.ok) throw new WahaErro('reiniciar a sessao', 'http', resposta.status);
  }

  /** Desfaz o pareamento. Sessao inexistente (404) ja esta "deslogada". */
  async deslogarSessao(nome: string): Promise<void> {
    const resposta = await this.chamar('desconectar a sessao', `/api/sessions/${encodeURIComponent(nome)}/logout`, {
      method: 'POST',
      corpo: {},
    });
    if (resposta.ok || resposta.status === 404) return;
    throw new WahaErro('desconectar a sessao', 'http', resposta.status);
  }

  /**
   * QR como data URL. Pedido com `Accept: application/json`, o WAHA devolve
   * `{ mimetype, data }` em base64; algumas versoes devolvem a imagem crua
   * mesmo assim — as duas formas viram a mesma data URL aqui.
   */
  async obterQr(nome: string): Promise<string | null> {
    const resposta = await this.chamar('obter o QR', `/api/${encodeURIComponent(nome)}/auth/qr?format=image`);
    if (!resposta.ok) throw new WahaErro('obter o QR', 'http', resposta.status);

    const tipo = resposta.headers.get('content-type') ?? '';
    if (tipo.startsWith('image/')) {
      const base64 = Buffer.from(await resposta.arrayBuffer()).toString('base64');
      return `data:${tipo.split(';')[0]};base64,${base64}`;
    }
    const corpo = (await WahaClient.json(resposta)) as { mimetype?: unknown; data?: unknown } | null;
    if (!corpo || typeof corpo.data !== 'string' || !corpo.data) return null;
    const mime = typeof corpo.mimetype === 'string' && corpo.mimetype ? corpo.mimetype : 'image/png';
    return corpo.data.startsWith('data:') ? corpo.data : `data:${mime};base64,${corpo.data}`;
  }

  /** Devolve o corpo da resposta, de onde `idDaMensagemEnviada` tira o id. */
  async enviarTexto(sessao: string, chatId: string, texto: string): Promise<unknown> {
    const resposta = await this.chamar('enviar a mensagem', '/api/sendText', {
      method: 'POST',
      corpo: { session: sessao, chatId, text: texto },
    });
    if (!resposta.ok) throw new WahaErro('enviar a mensagem', 'http', resposta.status);
    return WahaClient.json(resposta);
  }

  async enviarArquivo(
    endpoint: EndpointDeMidia,
    sessao: string,
    chatId: string,
    arquivo: ArquivoWaha,
    extras: { caption?: string; convert?: boolean } = {},
  ): Promise<unknown> {
    const resposta = await this.chamar(
      'enviar o arquivo',
      `/api/${endpoint}`,
      { method: 'POST', corpo: { session: sessao, chatId, file: arquivo, ...extras } },
      TETO_DE_MIDIA_MS,
    );
    if (!resposta.ok) throw new WahaErro('enviar o arquivo', 'http', resposta.status);
    return WahaClient.json(resposta);
  }
}
