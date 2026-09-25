import type { ChannelProvider } from './channel-provider';
import { GowaProvider } from './gowa/gowa.provider';
import { WahaProvider } from './waha/waha.provider';

/**
 * Onde um provider e achado pelo nome — o unico lugar que liga nome a
 * implementacao. A rota generica de webhook (`/api/webhooks/providers/:nome`)
 * e a fabrica do contrato legado consultam aqui.
 *
 * Instancia unica por provider: nao guardam estado de requisicao, so o que
 * vem do env a cada chamada.
 */
const PROVIDERS: Record<string, ChannelProvider> = {
  waha: new WahaProvider(),
  gowa: new GowaProvider(),
};

/** `null` para nome desconhecido — quem chama decide se isso e 404 ou erro de configuracao. */
export function obterProvider(nome: string): ChannelProvider | null {
  return PROVIDERS[nome.trim().toLowerCase()] ?? null;
}
