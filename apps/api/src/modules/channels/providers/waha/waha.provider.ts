import { AppError } from '../../../../lib/errors';
import { log } from '../../../../lib/log';
import { obterConfigWaha, obterSegredoWebhookWaha, obterUrlWebhookWaha } from '../../../../config/waha.config';
import type {
  ChannelProvider,
  InputMidia,
  QrOuEstado,
  RequisicaoDeWebhook,
  ResultadoEnvio,
  SessaoResolvida,
  SituacaoSessao,
} from '../channel-provider';
import { WahaClient, WahaErro } from './waha.client';
import { chatIdDoDestino, idDaMensagemEnviada, interpretarEventoWaha, situacaoDaSessaoWaha } from './waha.mapper';
import type { ConfigSessaoWaha, EndpointDeMidia, SessaoWaha } from './waha.types';
import { webhookWahaAutentico } from './waha.webhook';

/** Os eventos que a sessao manda para o CRM. `message.any` fica fora: e o eco do que o proprio CRM enviou. */
const EVENTOS = ['message', 'message.ack', 'session.status'];

const PROVIDER = 'waha';

/**
 * WhatsApp via WAHA — o primeiro `ChannelProvider` real.
 *
 * Uma instancia do WAHA para a instalacao inteira, uma sessao por linha
 * (`ChannelConfig.ponteSessao`), o mesmo desenho que o Deskcomm roda em
 * producao. Toda conversa com o WAHA passa por `WahaClient`; aqui mora a
 * decisao do que fazer com cada estado da sessao e a traducao de erro para o
 * vocabulario do CRM.
 */
export class WahaProvider implements ChannelProvider {
  readonly nome = PROVIDER;
  readonly capacidades = { pareamentoPorQr: true, statusDeEntrega: true };

  /**
   * Sessoes cuja config (webhook) ja foi conferida neste processo. O PUT que
   * corrige a config REINICIA a sessao — sem esta memoria, cada consulta de QR
   * da tela (a cada poucos segundos) poderia reiniciar a sessao e trocar o QR
   * antes de alguem conseguir escanear.
   */
  private readonly convergidas = new Set<string>();

  /** Inicio em andamento por sessao: a tela pede QR em intervalo, e dois pedidos nao devem criar duas vezes. */
  private readonly iniciando = new Map<string, Promise<SituacaoSessao>>();

  configurado(): boolean {
    return obterConfigWaha() !== null;
  }

  private cliente(): WahaClient {
    let cfg;
    try {
      cfg = obterConfigWaha();
    } catch (err) {
      throw new AppError(503, 'CANAL_INDISPONIVEL', err instanceof Error ? err.message : 'WAHA mal configurado');
    }
    if (!cfg) {
      throw new AppError(503, 'CANAL_INDISPONIVEL', 'O WhatsApp nao esta configurado nesta instalacao (WAHA_BASE_URL)');
    }
    return new WahaClient(cfg.url, cfg.apiKey);
  }

  private static nomeDaSessao(sessao: SessaoResolvida): string {
    const nome = sessao.sessaoExterna?.trim();
    if (!nome) throw new AppError(503, 'CANAL_INDISPONIVEL', 'Falta a sessao do WhatsApp desta linha');
    return nome;
  }

  private static configDaSessao(): ConfigSessaoWaha {
    const url = obterUrlWebhookWaha();
    const segredo = obterSegredoWebhookWaha();
    if (!url || !segredo) {
      throw new AppError(
        503,
        'CANAL_INDISPONIVEL',
        'Falta WAHA_WEBHOOK_SECRET (ou PUBLIC_URL/WEB_ORIGIN) na API: sem webhook a sessao nao receberia mensagens',
      );
    }
    return {
      webhooks: [{ url, events: EVENTOS, hmac: { key: segredo } }],
      ignore: { status: true, groups: true, channels: true, broadcast: true },
    };
  }

  private static webhookConfere(sessao: SessaoWaha, url: string): boolean {
    return (sessao.config?.webhooks ?? []).some((w) => w?.url === url);
  }

  /** Erro do WAHA -> erro do CRM, com a frase que o atendente le. */
  private static erroDeEnvio(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof WahaErro) {
      if (err.tipo !== 'http') return new AppError(502, 'CANAL_INACESSIVEL', err.message);
      // 404: sessao nao existe; 422: sessao existe mas nao esta WORKING.
      if (err.status === 404 || err.status === 422) {
        return new AppError(503, 'CANAL_INDISPONIVEL', 'O WhatsApp desta linha nao esta conectado');
      }
      if (err.status === 401 || err.status === 403) {
        return new AppError(503, 'CANAL_INDISPONIVEL', 'O servidor do WhatsApp recusou a chave da API (WAHA_API_KEY)');
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
    const nome = WahaProvider.nomeDaSessao(sessao);
    const chatId = chatIdDoDestino(destino);
    if (!chatId) throw new AppError(400, 'DESTINO_INVALIDO', 'O contato nao tem um numero de WhatsApp valido');

    const inicio = Date.now();
    try {
      const resposta = await this.cliente().enviarTexto(nome, chatId, texto);
      const idExterno = idDaMensagemEnviada(resposta);
      log.info('mensagem', 'texto enviado', WahaProvider.camposDeLog(sessao, { idExterno, duracaoMs: Date.now() - inicio }));
      return { idExterno };
    } catch (err) {
      const erro = WahaProvider.erroDeEnvio(err);
      log.warn('mensagem', 'envio de texto falhou', WahaProvider.camposDeLog(sessao, { codigo: erro.code, motivo: erro.message }));
      throw erro;
    }
  }

  async enviarMidia(sessao: SessaoResolvida, destino: string, midia: InputMidia): Promise<ResultadoEnvio> {
    const nome = WahaProvider.nomeDaSessao(sessao);
    const chatId = chatIdDoDestino(destino);
    if (!chatId) throw new AppError(400, 'DESTINO_INVALIDO', 'O contato nao tem um numero de WhatsApp valido');

    const familia = midia.tipo.split('/')[0];
    const endpoint: EndpointDeMidia =
      familia === 'image' ? 'sendImage' : familia === 'video' ? 'sendVideo' : familia === 'audio' ? 'sendVoice' : 'sendFile';
    // Voz e video: o WhatsApp so toca OGG/Opus e MP4 H.264; `convert` pede ao WAHA a conversao.
    const extras = {
      ...(midia.legenda && endpoint !== 'sendVoice' ? { caption: midia.legenda } : {}),
      ...(endpoint === 'sendVoice' || endpoint === 'sendVideo' ? { convert: true } : {}),
    };

    const inicio = Date.now();
    try {
      const resposta = await this.cliente().enviarArquivo(
        endpoint,
        nome,
        chatId,
        { mimetype: midia.tipo, filename: midia.nome, data: midia.buffer.toString('base64') },
        extras,
      );
      const idExterno = idDaMensagemEnviada(resposta);
      log.info('mensagem', 'arquivo enviado', WahaProvider.camposDeLog(sessao, { idExterno, endpoint, duracaoMs: Date.now() - inicio }));
      return { idExterno };
    } catch (err) {
      const erro = WahaProvider.erroDeEnvio(err);
      log.warn('mensagem', 'envio de arquivo falhou', WahaProvider.camposDeLog(sessao, { endpoint, codigo: erro.code, motivo: erro.message }));
      throw erro;
    }
  }

  // ------------------------------------------------------------------- sessao

  /**
   * Leva a sessao ao estado "de pe": cria (com o webhook de volta) se nao
   * existe, corrige a config uma vez se o webhook estiver diferente, sobe se
   * parada, reinicia se falhou. Nunca desloga: pareamento so se desfaz a pedido.
   */
  private async garantirDePe(sessao: SessaoResolvida): Promise<SituacaoSessao> {
    const nome = WahaProvider.nomeDaSessao(sessao);
    const cliente = this.cliente();
    const config = WahaProvider.configDaSessao();

    let atual = await cliente.obterSessao(nome);
    if (!atual) {
      await cliente.criarSessao(nome, config);
      this.convergidas.add(nome);
      log.info('sessao', 'sessao criada no WAHA', WahaProvider.camposDeLog(sessao));
      atual = await cliente.obterSessao(nome);
    } else if (!this.convergidas.has(nome)) {
      this.convergidas.add(nome);
      if (!WahaProvider.webhookConfere(atual, config.webhooks[0]!.url)) {
        await cliente.atualizarSessao(nome, config);
        log.info('sessao', 'webhook da sessao corrigido (a sessao reinicia)', WahaProvider.camposDeLog(sessao));
        atual = await cliente.obterSessao(nome);
      }
    }

    const status = atual?.status?.toUpperCase();
    if (status === 'STOPPED') {
      await cliente.iniciarSessao(nome);
      log.info('sessao', 'sessao parada foi iniciada', WahaProvider.camposDeLog(sessao));
      atual = await cliente.obterSessao(nome);
    } else if (status === 'FAILED') {
      await cliente.reiniciarSessao(nome);
      log.warn('sessao', 'sessao em FAILED foi reiniciada', WahaProvider.camposDeLog(sessao));
      atual = await cliente.obterSessao(nome);
    }

    return situacaoDaSessaoWaha(atual?.status, atual?.me);
  }

  private garantirDePeUmaVez(sessao: SessaoResolvida): Promise<SituacaoSessao> {
    const chave = sessao.sessaoExterna ?? '';
    const emAndamento = this.iniciando.get(chave);
    if (emAndamento) return emAndamento;
    const promessa = this.garantirDePe(sessao).finally(() => this.iniciando.delete(chave));
    this.iniciando.set(chave, promessa);
    return promessa;
  }

  sessao = {
    iniciar: (sessao: SessaoResolvida): Promise<SituacaoSessao> => this.garantirDePeUmaVez(sessao),

    qr: async (sessao: SessaoResolvida): Promise<QrOuEstado> => {
      if (!sessao.sessaoExterna?.trim()) {
        return { qr: null, conectado: false, motivo: 'a sessao do WhatsApp desta linha ainda nao foi configurada' };
      }
      try {
        const situacao = await this.garantirDePeUmaVez(sessao);
        switch (situacao.estado) {
          case 'CONECTADO':
            return { qr: null, conectado: true, motivo: null };
          case 'AGUARDANDO_QR': {
            const qr = await this.cliente().obterQr(sessao.sessaoExterna.trim());
            return { qr, conectado: false, motivo: qr ? null : 'o QR ainda nao foi gerado' };
          }
          case 'CONECTANDO':
            return { qr: null, conectado: false, motivo: 'a conexao esta iniciando, o QR aparece em instantes' };
          case 'FALHOU':
            return { qr: null, conectado: false, motivo: 'a sessao falhou e esta sendo reiniciada' };
          default:
            return { qr: null, conectado: false, motivo: `a sessao esta ${situacao.detalhe ?? 'em estado desconhecido'}` };
        }
      } catch (err) {
        log.warn('sessao', 'nao foi possivel obter o QR', WahaProvider.camposDeLog(sessao, {
          motivo: err instanceof Error ? err.message : 'erro desconhecido',
        }));
        return { qr: null, conectado: false, motivo: err instanceof Error ? err.message : 'nao foi possivel falar com o WhatsApp' };
      }
    },

    estado: async (sessao: SessaoResolvida): Promise<SituacaoSessao> => {
      const nome = sessao.sessaoExterna?.trim();
      if (!nome) return { estado: 'DESCONHECIDO', detalhe: 'sessao nao informada', telefone: null };
      try {
        const atual = await this.cliente().obterSessao(nome);
        if (!atual) return { estado: 'DESCONECTADO', detalhe: 'sessao ainda nao criada', telefone: null };
        return situacaoDaSessaoWaha(atual.status, atual.me);
      } catch (err) {
        return { estado: 'DESCONHECIDO', detalhe: err instanceof Error ? err.message : 'erro desconhecido', telefone: null };
      }
    },

    desconectar: async (sessao: SessaoResolvida): Promise<void> => {
      const nome = WahaProvider.nomeDaSessao(sessao);
      try {
        await this.cliente().deslogarSessao(nome);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(502, 'DESCONEXAO_RECUSADA', err instanceof Error ? err.message : 'erro desconhecido');
      }
      log.info('sessao', 'sessao desconectada a pedido', WahaProvider.camposDeLog(sessao));
    },

    reiniciar: async (sessao: SessaoResolvida): Promise<void> => {
      const nome = WahaProvider.nomeDaSessao(sessao);
      try {
        await this.cliente().reiniciarSessao(nome);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(502, 'CANAL_INACESSIVEL', err instanceof Error ? err.message : 'erro desconhecido');
      }
      log.info('sessao', 'sessao reiniciada a pedido', WahaProvider.camposDeLog(sessao));
    },
  };

  webhook = {
    autenticar: (req: RequisicaoDeWebhook): boolean => webhookWahaAutentico(req, obterSegredoWebhookWaha()),
    interpretar: (corpo: unknown) => interpretarEventoWaha(corpo),
  };
}
