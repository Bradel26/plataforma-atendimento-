import { numeroNormalizado } from './whatsapp.modo';
import type { MensagemNormalizada } from './meta.types';

/**
 * Normaliza o evento bruto que o WPPConnect Server manda no webhook
 * (`{ event, session, ...mensagem }`, achatado — ver `wppconnect.webhook.routes.ts`)
 * para o mesmo formato que `registrarMensagemEntrante` ja consome de todo
 * canal (Meta, Ponte Baileys). Pura — nenhuma chamada a banco — para ser
 * testada sem Prisma, e devolve `null` para tudo que deve ser descartado
 * silenciosamente (evento que nao interessa, eco da propria conta, grupo,
 * payload sem os campos minimos).
 *
 * Contrato confirmado por captura real (ETAPA 4.1), nao por suposicao:
 *   - `id` e uma STRING ja serializada (`"false_<chatId>_<msgId>"`), nunca um
 *     objeto com `_serialized` (esse formato aparece no `onack`, nao no
 *     `onmessage`).
 *   - `from`/`chatId` do remetente podem vir em formato `@lid` (identidade
 *     opaca de privacidade do WhatsApp) em vez de `@c.us` — e preservado
 *     verbatim, nunca reconstruido como telefone.
 */
export function normalizarEventoWpp(bruto: unknown): MensagemNormalizada | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const evento = bruto as Record<string, unknown>;

  if (evento.event !== 'onmessage') return null;
  if (evento.fromMe === true) return null;
  if (evento.isGroupMsg === true) return null;

  const idExterno = typeof evento.id === 'string' ? evento.id.trim() : '';
  if (!idExterno) return null;

  // Preferencia por `chatId`; `from` e o mesmo dado no payload real observado,
  // mas o contrato pede essa ordem explicitamente — e o de-para nunca inventa
  // um endereco quando os dois faltam.
  const enderecoExterno =
    (typeof evento.chatId === 'string' && evento.chatId.trim()) ||
    (typeof evento.from === 'string' && evento.from.trim()) ||
    '';
  if (!enderecoExterno) return null;

  const conteudo =
    (typeof evento.body === 'string' && evento.body.trim()) ||
    (typeof evento.content === 'string' && evento.content.trim()) ||
    '';
  if (!conteudo) return null;

  const sender =
    evento.sender && typeof evento.sender === 'object' ? (evento.sender as Record<string, unknown>) : {};

  const nomeExibicao =
    (typeof sender.pushname === 'string' && sender.pushname.trim()) ||
    (typeof evento.notifyName === 'string' && evento.notifyName.trim()) ||
    (typeof sender.formattedName === 'string' && sender.formattedName.trim()) ||
    null;

  /*
   * `sender.formattedName` NAO e um telefone garantido — e um nome formatado
   * que o WhatsApp mostra, e para um contato `@lid` pode nao corresponder a
   * nenhum numero de verdade. So vira `telefone` (auxiliar, nullable) quando
   * valida como telefone (`numeroNormalizado`); o identificador PRINCIPAL da
   * conversa continua sendo `enderecoExterno` (o `@lid`/`@c.us` acima),
   * nunca este campo.
   */
  const telefone =
    typeof sender.formattedName === 'string' ? numeroNormalizado(sender.formattedName) : null;

  const sessao = typeof evento.session === 'string' && evento.session.trim() ? evento.session.trim() : null;

  return {
    canal: 'WHATSAPP',
    enderecoExterno,
    nomeExibicao,
    telefone,
    idExterno,
    conteudo,
    tipoAnexo: 'TEXTO',
    // ETAPA 5 cobre so texto (o payload real capturado e "type":"chat"); midia
    // fica para uma proxima fase, e nao inventamos anexo aqui.
    anexoUrl: null,
    anexoIdExterno: null,
    anexoNome: null,
    identificadorDestino: sessao,
  };
}
