/**
 * DDD -> UF (tabela da Anatel). Base do preenchimento automatico de estado do
 * contato: quem nasce de uma conversa (webchat, WhatsApp) so tem telefone, e o
 * DDD e a unica pista de onde essa pessoa esta.
 */
export const UF_POR_DDD: Readonly<Record<string, string>> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
};

export const DDDS = Object.keys(UF_POR_DDD).sort();

/**
 * Extrai o DDD de um telefone em qualquer formato que a plataforma guarda
 * (com mascara, com ou sem `+55`, so digitos).
 *
 * O numero nacional tem 10 ou 11 digitos (DDD + 8 ou 9); com o codigo do pais
 * na frente sobe para 12 ou 13 — e por isso o corte e por TAMANHO, e nao por
 * `startsWith('55')`: um numero de Santa Maria (DDD 55) sem codigo do pais e
 * de 10/11 digitos, e cortar pelo prefixo textual apagaria o DDD dele.
 */
export function dddDoTelefone(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  let digitos = telefone.replace(/\D/g, '');
  if (digitos.length === 12 || digitos.length === 13) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) return null;
  return digitos.slice(0, 2);
}

/** UF inferida do DDD do telefone, ou nulo quando o numero nao da para reconhecer. */
export function ufDoTelefone(telefone: string | null | undefined): string | null {
  const ddd = dddDoTelefone(telefone);
  return ddd ? (UF_POR_DDD[ddd] ?? null) : null;
}
