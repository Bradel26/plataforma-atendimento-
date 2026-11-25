import { numeroNormalizado } from './whatsapp.modo';
import { enderecoNaoEPessoa, pareceBase64DeMidia } from '../../lib/textoDeMidia';
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
/** `type` do whatsapp-web.js -> tipo de anexo da plataforma. Lista fechada. */
const TIPO_ANEXO_POR_TIPO_WPP: Record<string, MensagemNormalizada['tipoAnexo']> = {
  ptt: 'AUDIO',
  audio: 'AUDIO',
  image: 'IMAGEM',
  sticker: 'IMAGEM',
  video: 'VIDEO',
  document: 'ARQUIVO',
};

const ROTULO_ANEXO: Record<MensagemNormalizada['tipoAnexo'], string> = {
  TEXTO: '',
  AUDIO: '[áudio recebido]',
  IMAGEM: '[imagem recebida]',
  VIDEO: '[vídeo recebido]',
  ARQUIVO: '[arquivo recebido]',
};

function conteudoDaMidia(bruto: unknown): { base64: string; mimetype: string } | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const m = bruto as Record<string, unknown>;
  if (typeof m.base64 !== 'string' || !m.base64) return null;
  if (typeof m.mimetype !== 'string' || !m.mimetype.trim()) return null;
  return { base64: m.base64, mimetype: m.mimetype.trim() };
}

function nomeDaMidia(bruto: unknown): string | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const nome = (bruto as { nome?: unknown }).nome;
  return typeof nome === 'string' && nome.trim() ? nome.trim().slice(0, 200) : null;
}

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
  // Status (stories), listas de transmissao e canais nao sao conversa com uma pessoa.
  if (enderecoNaoEPessoa(enderecoExterno)) return null;

  const legendaBruta =
    (typeof evento.body === 'string' && evento.body.trim()) ||
    (typeof evento.content === 'string' && evento.content.trim()) ||
    '';
  // Em midia, o `body` do WhatsApp Web e a miniatura em base64, nao uma legenda.
  const legenda = pareceBase64DeMidia(legendaBruta) ? '' : legendaBruta;
  // Mensagem de midia (audio, foto, video, documento) nao tem texto: o corpo e a
  // legenda, quase sempre vazia. Sem isto ela era descartada. So os tipos da
  // tabela abaixo entram; e2e_notification, protocol, call_log etc. continuam
  // ignorados quando nao tem texto.
  const tipoAnexo = typeof evento.type === 'string' ? TIPO_ANEXO_POR_TIPO_WPP[evento.type] : undefined;
  if (!legenda && !tipoAnexo) return null;
  const conteudo = legenda || (tipoAnexo ? ROTULO_ANEXO[tipoAnexo] : '');

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
  // `formattedName` costuma ser o nome salvo no WhatsApp, nao o telefone.
  // Quando o identificador e um JID comum (`@c.us`), o numero e confiavel e
  // permite reencontrar o mesmo contato entre caixas/linhas diferentes. LID
  // continua opaco: nunca tentamos tratar seus digitos como telefone.
  const telefoneDoJid = enderecoExterno.toLowerCase().endsWith('@c.us')
    ? numeroNormalizado(enderecoExterno.slice(0, -'@c.us'.length))
    : null;
  // O conector whatsapp-web.js resolve o telefone real de um `@lid` dentro do
  // proprio WhatsApp (getContactLidAndPhone) e o manda em `telefoneContato`;
  // e a fonte mais confiavel, entao vem antes do `formattedName`.
  const telefone =
    (typeof evento.telefoneContato === 'string' ? numeroNormalizado(evento.telefoneContato) : null) ??
    (typeof sender.formattedName === 'string' ? numeroNormalizado(sender.formattedName) : null) ??
    telefoneDoJid;

  const sessao = typeof evento.session === 'string' && evento.session.trim() ? evento.session.trim() : null;

  return {
    canal: 'WHATSAPP',
    enderecoExterno,
    nomeExibicao,
    telefone,
    idExterno,
    conteudo,
    tipoAnexo: tipoAnexo ?? 'TEXTO',
    // O conector whatsapp-web.js baixa a midia e manda o binario em `midia`
    // (base64 + mimetype). Nao ha URL nem media id.
    anexoUrl: null,
    anexoIdExterno: null,
    anexoNome: tipoAnexo ? nomeDaMidia(evento.midia) : null,
    // So mensagem de midia leva a chave: o resultado de texto fica identico ao de antes.
    ...(tipoAnexo ? { anexoConteudo: conteudoDaMidia(evento.midia) } : {}),
    identificadorDestino: sessao,
  };
}
