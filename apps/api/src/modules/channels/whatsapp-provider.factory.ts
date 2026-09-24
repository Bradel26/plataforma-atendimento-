import { BaileysProvider } from './providers/baileys.provider';
import { WPPConnectProvider } from './providers/wppconnect.provider';
import { WhatsAppProviderLegado } from './providers/legado';
import { obterProvider } from './providers/registro';
import type { WhatsAppProvider } from './whatsapp.provider';

/**
 * Escolhe qual `WhatsAppProvider` o modo nao oficial usa, para toda a
 * instalacao — o unico lugar onde essa decisao existe (nenhuma rota ou
 * service deve ler `WHATSAPP_PROVIDER` ou decidir entre Baileys/WPPConnect
 * por conta propria).
 *
 * A escolha e global, nao por canal: a sessao continua vindo de
 * `ChannelConfig.ponteSessao`, dinamica, dentro do contrato `WhatsAppProvider`
 * que ja recebe a config inteira em cada chamada (`sendText(config, ...)` e
 * afins) — nada aqui inventa uma forma nova de identificar sessao.
 */

const FABRICAS: Record<string, () => WhatsAppProvider> = {
  baileys: () => new BaileysProvider(),
  wppconnect: () => new WPPConnectProvider(),
  // Contrato novo (`ChannelProvider`), servido as rotas atuais pelo adaptador legado.
  waha: () => new WhatsAppProviderLegado(obterProvider('waha')!),
  gowa: () => new WhatsAppProviderLegado(obterProvider('gowa')!),
};

/**
 * `null` quando a variavel nao foi definida — mantido assim (e nao um valor
 * padrao aqui) para a variavel ausente poder significar "Baileys" sem se
 * confundir com alguem tendo digitado "baileys" errado.
 */
function nomeConfigurado(): string | null {
  return process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() || null;
}

/**
 * Sem `WHATSAPP_PROVIDER`: mantem o comportamento anterior a esta migracao
 * (Baileys), para nenhuma instalacao existente quebrar so por atualizar o
 * codigo. Com valor que nao seja `baileys` nem `wppconnect`: falha cedo, no
 * boot — e sempre erro de configuracao (nome digitado errado), e cair de
 * volta num padrao silencioso mandaria mensagem pelo provider errado sem
 * ninguem perceber.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  const nome = nomeConfigurado() ?? 'baileys';
  const fabrica = FABRICAS[nome];
  if (!fabrica) {
    throw new Error(
      `WHATSAPP_PROVIDER invalido: "${nome}". Valores aceitos: ${Object.keys(FABRICAS).join(', ')}.`,
    );
  }
  return fabrica();
}
