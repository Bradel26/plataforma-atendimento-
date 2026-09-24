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
import { GowaClient, GowaErro, type StatusResultadoGowa } from './gowa.client';
import { idDaMensagemEnviada, interpretarEventoGowa, numeroDoDestino, situacaoDaSessaoGowa } from './gowa.mapper';
import type { EndpointDeMidiaGowa } from './gowa.types';
import { webhookGowaAutentico } from './gowa.webhook';

const PROVIDER = 'gowa';

/**
 * WhatsApp via GOWA (go-whatsapp-web-multidevice) — terceiro `ChannelProvider`,
 * portado do plugin `gowa` do `whatsbot-pro-main` com fidelidade tecnica ao
 * `gowa/client.py` de referencia (so nas rotas que este contrato usa).
 *
 * **v1: uma instalacao inteira atende UMA UNICA linha** (ver spec, "Limite
 * conhecido da v1") — `GOWA_SESSAO` fixa qual, e e a mesma sessao que o
 * webhook usa (nao ha como o corpo do webhook dizer de qual device veio um
 * evento). Nao e "uma instancia do GOWA por linha, adicione outro container
 * para a proxima": e uma instalacao inteira da API por linha, porque
 * `GOWA_BASE_URL`/`GOWA_SESSAO`/`WHATSAPP_PROVIDER` sao globais ao processo.
 * `sessaoPermitida()` e o guarda que impede qualquer outra sessao de criar
 * device ou mandar mensagem por aqui — sem ele, o autoatendimento de
 * "Conectar WhatsApp" pariria uma segunda linha cujas mensagens o webhook
 * atribuiria, silenciosamente, a organizacao dona de `GOWA_SESSAO`.
 */
export class GowaProvider implements ChannelProvider {
  readonly nome = PROVIDER;
  readonly capacidades = { pareamentoPorQr: true, statusDeEntrega: true };

  /** Devices ja garantidos neste processo — evita recriar a cada poll do QR. */
  private readonly garantidos = new Set<string>();

  /** Sem `GOWA_SESSAO` esta instalacao nao sabe qual e a sua unica linha permitida — nao pode operar. */
  configurado(): boolean {
    return obterConfigGowa() !== null && obterSessaoFixaGowa() !== null;
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
   * So a linha fixada em `GOWA_SESSAO` pode usar esta instalacao (ver doc da
   * classe). Toda acao que cria device ou move mensagem checa isto primeiro.
   */
  private static sessaoPermitida(sessao: SessaoResolvida): boolean {
    const fixa = obterSessaoFixaGowa();
    return !!fixa && !!sessao.sessaoExterna && sessao.sessaoExterna === fixa;
  }

  private static motivoSessaoNaoPermitida(sessao: SessaoResolvida): string {
    const fixa = obterSessaoFixaGowa();
    if (!fixa) return 'esta instalacao do GOWA nao tem GOWA_SESSAO configurada';
    return `esta instalacao do GOWA so atende a linha "${fixa}"; a linha pedida ("${sessao.sessaoExterna ?? 'sem sessao'}") precisa de outra instalacao`;
  }

  private static erroSessaoNaoPermitida(sessao: SessaoResolvida): AppError {
    return new AppError(503, 'CANAL_INDISPONIVEL', GowaProvider.motivoSessaoNaoPermitida(sessao));
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
      // `\b463\b`, nao `includes('463')`: o corpo de erro do GOWA costuma trazer o
      // proprio numero de telefone, e um numero como 5511946312345 contem "463" sem
      // ser o bloqueio anti-spam — a fronteira de palavra evita casar dentro de uma
      // sequencia maior de digitos.
      if (err.status === 429 || pista.includes('reachout') || pista.includes('timelock') || /\b463\b/.test(pista)) {
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
    if (!GowaProvider.sessaoPermitida(sessao)) throw GowaProvider.erroSessaoNaoPermitida(sessao);
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
    if (!GowaProvider.sessaoPermitida(sessao)) throw GowaProvider.erroSessaoNaoPermitida(sessao);
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

  /**
   * O device pode sumir do GOWA sem a API saber (redeploy sem o volume
   * documentado, reset do SQLite interno — ver `GOWA.md`). Quando o status
   * vem `'inexistente'` para um device que a gente achava garantido, tira do
   * cache: o proximo `garantirDevice` recria em vez de ficar preso achando
   * que o device ainda existe.
   */
  private esquecerSeSumiu(deviceId: string, status: StatusResultadoGowa): void {
    if (status.tipo === 'inexistente' && this.garantidos.has(deviceId)) {
      this.garantidos.delete(deviceId);
      log.warn('sessao', 'device sumiu do GOWA, sera recriado no proximo pedido', { provider: PROVIDER, sessaoExterna: deviceId });
    }
  }

  sessao = {
    iniciar: async (sessao: SessaoResolvida): Promise<SituacaoSessao> => {
      if (!GowaProvider.sessaoPermitida(sessao)) {
        return { estado: 'DESCONHECIDO', detalhe: GowaProvider.motivoSessaoNaoPermitida(sessao), telefone: null };
      }
      if (!obterSegredoWebhookGowa()) {
        return { estado: 'DESCONHECIDO', detalhe: 'falta GOWA_WEBHOOK_SECRET nesta instalacao: a sessao nao receberia mensagens', telefone: null };
      }
      const cliente = this.cliente();
      const deviceId = await this.garantirDevice(sessao, cliente);
      const status = await cliente.obterStatus(deviceId);
      this.esquecerSeSumiu(deviceId, status);
      return situacaoDaSessaoGowa(status, null);
    },

    qr: async (sessao: SessaoResolvida): Promise<QrOuEstado> => {
      if (!sessao.sessaoExterna?.trim()) {
        return { qr: null, conectado: false, motivo: 'a sessao do WhatsApp desta linha ainda nao foi configurada' };
      }
      if (!GowaProvider.sessaoPermitida(sessao)) {
        return { qr: null, conectado: false, motivo: GowaProvider.motivoSessaoNaoPermitida(sessao) };
      }
      if (!obterSegredoWebhookGowa()) {
        return { qr: null, conectado: false, motivo: 'falta GOWA_WEBHOOK_SECRET nesta instalacao: a sessao nao receberia mensagens' };
      }
      try {
        const cliente = this.cliente();
        const deviceId = await this.garantirDevice(sessao, cliente);
        const status = await cliente.obterStatus(deviceId);
        this.esquecerSeSumiu(deviceId, status);
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
          case 'DESCONECTADO':
            // O device sumiu do GOWA (ja tirado do cache acima) — o proximo pedido recria.
            return { qr: null, conectado: false, motivo: 'o dispositivo do WhatsApp sumiu do servidor; tentando recriar' };
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
        this.esquecerSeSumiu(deviceId, status);
        return situacaoDaSessaoGowa(status, null);
      } catch (err) {
        return { estado: 'DESCONHECIDO', detalhe: err instanceof Error ? err.message : 'erro desconhecido', telefone: null };
      }
    },

    desconectar: async (sessao: SessaoResolvida): Promise<void> => {
      if (!GowaProvider.sessaoPermitida(sessao)) throw GowaProvider.erroSessaoNaoPermitida(sessao);
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
      if (!GowaProvider.sessaoPermitida(sessao)) throw GowaProvider.erroSessaoNaoPermitida(sessao);
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
