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
