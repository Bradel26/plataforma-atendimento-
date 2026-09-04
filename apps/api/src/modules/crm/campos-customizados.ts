import type { TipoCampoCustomizado } from '@prisma/client';

/**
 * Slug estavel a partir do nome, para virar `chave` na criacao (item 6.4).
 *
 * So roda uma vez, na criacao: `chave` e imutavel depois, entao mudar o nome
 * do campo nunca reescreve o identificador que a API e os valores gravados
 * usam por baixo.
 */
export function gerarChave(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type ResultadoValidacao =
  | { ok: true; valor: string }
  | { ok: false; erro: string };

/**
 * Converte e valida o valor bruto (do corpo da requisicao) para o formato de
 * armazenamento — sempre `string` na coluna, ver comentario em
 * `ValorCampoCustomizadoConta` no schema.
 *
 * Fica fora do Zod de proposito: o tipo esperado nao e estatico no schema da
 * rota, e sim um dado (`CampoCustomizado.tipo`) lido em runtime — o mesmo
 * motivo pelo qual `statusDaGarantia` e `matrizProdutividade` sao funcoes
 * puras chamadas pela rota, e nao schemas.
 */
export function validarValorCampo(
  tipo: TipoCampoCustomizado,
  opcoes: string[],
  bruto: unknown,
): ResultadoValidacao {
  switch (tipo) {
    case 'TEXTO': {
      if (typeof bruto !== 'string') return { ok: false, erro: 'Valor deve ser texto' };
      const valor = bruto.trim();
      if (!valor) return { ok: false, erro: 'Valor nao pode ser vazio' };
      return { ok: true, valor };
    }
    case 'NUMERO': {
      const n = typeof bruto === 'number' ? bruto : Number(bruto);
      if (typeof bruto === 'boolean' || bruto === '' || bruto === null || Number.isNaN(n)) {
        return { ok: false, erro: 'Valor deve ser um numero' };
      }
      return { ok: true, valor: String(n) };
    }
    case 'DATA': {
      if (typeof bruto !== 'string') return { ok: false, erro: 'Valor deve ser uma data' };
      const d = new Date(bruto);
      if (Number.isNaN(d.getTime())) return { ok: false, erro: 'Data invalida' };
      return { ok: true, valor: d.toISOString() };
    }
    case 'BOOLEANO': {
      if (typeof bruto !== 'boolean') return { ok: false, erro: 'Valor deve ser verdadeiro ou falso' };
      return { ok: true, valor: String(bruto) };
    }
    case 'SELECAO': {
      if (typeof bruto !== 'string' || !opcoes.includes(bruto)) {
        return { ok: false, erro: `Valor deve ser uma das opcoes: ${opcoes.join(', ')}` };
      }
      return { ok: true, valor: bruto };
    }
  }
}

/** Volta o valor gravado (sempre `string`) para o tipo que a API devolve. */
export function desserializarValor(tipo: TipoCampoCustomizado, valor: string): string | number | boolean {
  switch (tipo) {
    case 'NUMERO':
      return Number(valor);
    case 'BOOLEANO':
      return valor === 'true';
    default:
      return valor;
  }
}
