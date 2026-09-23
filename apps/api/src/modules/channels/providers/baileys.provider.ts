import {
  desconectarPonte,
  enviarArquivoPelaPonte,
  enviarTextoPelaPonte,
  estadoDaPonte,
  qrDaPonte,
} from '../whatsapp.ponte';
import { obterConfigGlobalPonte } from '../../../config/ponte.config';
import type { WhatsAppProvider } from '../whatsapp.provider';

/**
 * Implementacao de `WhatsAppProvider` para o modo nao oficial (Baileys, via a
 * ponte externa).
 *
 * Nao reimplementa nada: cada metodo delega diretamente para a funcao
 * equivalente em `whatsapp.ponte.ts`, que continua sendo o unico lugar que
 * conhece HTTP, HMAC e o formato de resposta da ponte.
 */
export class BaileysProvider implements WhatsAppProvider {
  sendText: WhatsAppProvider['sendText'] = (config, destino, texto) =>
    enviarTextoPelaPonte(config, destino, texto);

  sendMedia: WhatsAppProvider['sendMedia'] = (config, destino, arquivo) =>
    enviarArquivoPelaPonte(config, destino, arquivo);

  getQRCode: WhatsAppProvider['getQRCode'] = (config) => qrDaPonte(config);

  getStatus: WhatsAppProvider['getStatus'] = (config) => estadoDaPonte(config);

  disconnect: WhatsAppProvider['disconnect'] = (config) => desconectarPonte(config);

  readonly credenciaisPorLinha = true;

  infraestruturaGlobalPronta: WhatsAppProvider['infraestruturaGlobalPronta'] = () => obterConfigGlobalPonte() !== null;
}
