import {
  desconectarWpp,
  enviarArquivoWpp,
  enviarTextoWpp,
  estadoWpp,
  qrWpp,
} from '../wppconnect.client';
import { obterConfigWppConnect } from '../../../config/wppconnect.config';
import type { WhatsAppProvider } from '../whatsapp.provider';

/**
 * Driver do WhatsApp nao oficial via WPPConnect Server (substituto do
 * `BaileysProvider` nesta migracao — ver `wppconnect.client.ts` para o HTTP).
 */
export class WPPConnectProvider implements WhatsAppProvider {
  sendText: WhatsAppProvider['sendText'] = (config, destino, texto) =>
    enviarTextoWpp(config, destino, texto);

  sendMedia: WhatsAppProvider['sendMedia'] = (config, destino, arquivo) =>
    enviarArquivoWpp(config, destino, arquivo);

  getQRCode: WhatsAppProvider['getQRCode'] = (config) => qrWpp(config);

  getStatus: WhatsAppProvider['getStatus'] = (config) => estadoWpp(config);

  disconnect: WhatsAppProvider['disconnect'] = (config) => desconectarWpp(config);

  readonly credenciaisPorLinha = false;

  infraestruturaGlobalPronta: WhatsAppProvider['infraestruturaGlobalPronta'] = () => obterConfigWppConnect() !== null;
}
