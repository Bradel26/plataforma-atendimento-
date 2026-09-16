import type { ConfigDaPonte, QrDaPonte } from './whatsapp.ponte';
import type { EstadoDaPonte } from './whatsapp.modo';

/**
 * Abstracao do "driver" de WhatsApp nao oficial.
 *
 * Reflete exatamente as cinco operacoes que ja existem em `whatsapp.ponte.ts`
 * (o unico driver hoje). O objetivo desta interface e permitir que quem chama
 * pare de saber que existe uma "ponte" por tras — nao adicionar operacoes que
 * ainda nao sao usadas por ninguem.
 *
 * `BaileysProvider` e a unica implementacao por enquanto; nada ainda consome
 * esta interface (ver FASE 1 do plano de migracao).
 */
export interface WhatsAppProvider {
  sendText(config: ConfigDaPonte, destino: string, texto: string): Promise<{ idExterno: string | null }>;

  sendMedia(
    config: ConfigDaPonte,
    destino: string,
    arquivo: { buffer: Buffer; nome: string; tipo: string; legenda?: string },
  ): Promise<{ idExterno: string | null }>;

  getQRCode(config: ConfigDaPonte): Promise<QrDaPonte>;

  getStatus(config: ConfigDaPonte): Promise<EstadoDaPonte>;

  disconnect(config: ConfigDaPonte): Promise<void>;
}
