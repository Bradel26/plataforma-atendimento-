import type { EstadoDaPonte } from '../whatsapp.modo';
import type { ConfigDaPonte, QrDaPonte } from '../whatsapp.ponte';
import type { WhatsAppProvider } from '../whatsapp.provider';
import type { ChannelProvider, SessaoResolvida, SituacaoSessao } from './channel-provider';

/**
 * Expõe um `ChannelProvider` (contrato novo) como `WhatsAppProvider` (o
 * contrato que `channels.routes.ts`, `outbound.service.ts` e
 * `channels.service.ts` ja consomem).
 *
 * Existe para o WAHA entrar sem reescrever o que funciona: as rotas de QR,
 * estado e desconexao, o self-service "Conectar WhatsApp" e o envio do
 * atendente continuam iguais, e so enxergam outro provider pela fabrica.
 * Quando esses consumidores passarem a falar o contrato novo, este arquivo sai.
 */

/** A linha do CRM -> a sessao que o provider entende. A config chega inteira (ChannelConfig), com `id`. */
function sessaoDa(config: ConfigDaPonte): SessaoResolvida {
  const id = (config as { id?: unknown }).id;
  return { canalConfigId: typeof id === 'string' ? id : null, sessaoExterna: config.ponteSessao ?? null };
}

/**
 * Estado novo -> o vocabulario de tres valores das telas atuais.
 * CONECTANDO vira DESCONHECIDO (e nao DESCONECTADO): a sessao esta subindo,
 * e dizer "desconectado" nesse meio tempo mandaria alguem religar o que ja
 * esta religando.
 */
export function estadoLegado(s: SituacaoSessao): EstadoDaPonte {
  const situacao =
    s.estado === 'CONECTADO'
      ? 'CONECTADO'
      : s.estado === 'AGUARDANDO_QR' || s.estado === 'DESCONECTADO' || s.estado === 'FALHOU'
        ? 'DESCONECTADO'
        : 'DESCONHECIDO';
  return { situacao, detalhe: s.detalhe, telefone: s.telefone };
}

export class WhatsAppProviderLegado implements WhatsAppProvider {
  /** Nenhuma credencial por linha: a conexao com a engine e global, a linha so traz a sessao. */
  readonly credenciaisPorLinha = false;

  constructor(private readonly provider: ChannelProvider) {}

  sendText: WhatsAppProvider['sendText'] = (config, destino, texto) =>
    this.provider.enviarTexto(sessaoDa(config), destino, texto);

  sendMedia: WhatsAppProvider['sendMedia'] = (config, destino, arquivo) =>
    this.provider.enviarMidia(sessaoDa(config), destino, arquivo);

  getQRCode = (config: ConfigDaPonte): Promise<QrDaPonte> => this.provider.sessao.qr(sessaoDa(config));

  getStatus = async (config: ConfigDaPonte): Promise<EstadoDaPonte> =>
    estadoLegado(await this.provider.sessao.estado(sessaoDa(config)));

  disconnect = (config: ConfigDaPonte): Promise<void> => this.provider.sessao.desconectar(sessaoDa(config));

  infraestruturaGlobalPronta = (): boolean => this.provider.configurado();
}
