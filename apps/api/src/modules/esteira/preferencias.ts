/**
 * Preferências do usuário (chave/valor): regras puras de validação.
 * A preferência é do usuário — não exige acesso à operação citada na chave.
 */
import { operacaoDaUrl } from './catalogo';

export const PADRAO_CHAVE = /^[a-z0-9:_-]{1,80}$/i;
export const LIMITE_VALOR_BYTES = 32 * 1024;
export const LIMITE_CHAVES_POR_USUARIO = 200;

/** `null` quando válida; senão a mensagem. `tamanho` sinaliza o caso que a rota devolve como 413. */
export type ResultadoPreferencia = { mensagem: string; status: 400 | 413 } | null;

export function validarPreferencia(chave: string, valor: unknown): ResultadoPreferencia {
  if (!PADRAO_CHAVE.test(chave)) {
    return { status: 400, mensagem: 'Chave inválida: use 1 a 80 caracteres entre letras, números, ":", "_" e "-"' };
  }
  if (chave.toLowerCase().startsWith('esteira:')) {
    const operacao = chave.slice('esteira:'.length).split(':')[0] ?? '';
    if (!operacaoDaUrl(operacao)) {
      return { status: 400, mensagem: 'Chave de esteira com operação inválida (use TIM ou STARLINK)' };
    }
  }
  if (valor === undefined) return { status: 400, mensagem: 'Informe o valor da preferência' };
  let json: string | undefined;
  try {
    json = JSON.stringify(valor);
  } catch {
    return { status: 400, mensagem: 'O valor não pode ser serializado' };
  }
  if (json === undefined) return { status: 400, mensagem: 'O valor não pode ser serializado' };
  if (Buffer.byteLength(json, 'utf8') > LIMITE_VALOR_BYTES) {
    return { status: 413, mensagem: 'Valor grande demais (máximo 32 KB)' };
  }
  return null;
}
