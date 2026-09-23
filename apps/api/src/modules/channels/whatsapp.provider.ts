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

  /**
   * De onde vem a conexao com o servidor do WhatsApp nao oficial.
   *
   * `true` (Baileys): cada linha carrega endereco/token/segredo da ponte na
   * propria `ChannelConfig` — sem eles a linha nao envia nem ativa.
   * `false` (WPPConnect): a conexao e infraestrutura global da API
   * (`wppconnect.config.ts`) e a linha so precisa da sessao
   * (`ponteSessao`). Cobrar `ponteUrl`/`ponteToken` aqui travaria a linha por
   * um campo que este provider nunca le.
   */
  readonly credenciaisPorLinha: boolean;

  /**
   * A infraestrutura global basta para uma linha nova conectar sem ninguem
   * preencher nada — e o que o "Conectar WhatsApp" do self-service consulta.
   * Lanca quando a configuracao esta pela metade (erro de configuracao, nao
   * estado valido).
   */
  infraestruturaGlobalPronta(): boolean;
}
