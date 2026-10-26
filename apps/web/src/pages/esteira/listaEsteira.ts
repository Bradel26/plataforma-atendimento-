/**
 * Lógica da Lista da esteira (spec 6.3) — pura, sem React (testada com vitest).
 *
 * As colunas vêm da estrutura (`colunas.ts` da API); a preferência guarda as
 * visíveis em ordem, as larguras e a ordenação (spec 4.10).
 */
import type { ColunaEsteira, EditarVinculoInput, ValorColuna } from '../../lib/esteiraTypes';

export type Ordenacao = { chave: string; direcao: 'asc' | 'desc' } | null;

const FUSO = 'America/Sao_Paulo';
export const LARGURA_MIN = 60;
export const LARGURA_MAX = 800;

/** Texto da célula (também usado no cartão do mobile). Vazio é sempre "—"; nulo nunca vira "Não". */
export function formatarCelula(coluna: Pick<ColunaEsteira, 'tipo' | 'opcoes'>, valor: ValorColuna | undefined): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'string' && !valor.trim()) return '—';
  switch (coluna.tipo) {
    case 'booleano':
    case 'booleano3':
      return valor === true ? 'Sim' : valor === false ? 'Não' : '—';
    case 'enum':
      return coluna.opcoes?.find((o) => o.valor === valor)?.rotulo ?? String(valor);
    case 'data': {
      const data = new Date(String(valor));
      return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { timeZone: FUSO });
    }
    case 'numero':
      return typeof valor === 'number' ? valor.toLocaleString('pt-BR') : String(valor);
    default:
      return String(valor);
  }
}

/** Clique no cabeçalho: crescente → decrescente → sem ordenação; outra coluna recomeça crescente. */
export function proximaOrdenacao(atual: Ordenacao, chave: string): Ordenacao {
  if (!atual || atual.chave !== chave) return { chave, direcao: 'asc' };
  return atual.direcao === 'asc' ? { chave, direcao: 'desc' } : null;
}

/** Leva a coluna `de` para a posição da coluna `para` (arrastar no cabeçalho ou subir/descer). */
export function reordenarColunas(lista: readonly string[], de: string, para: string): string[] {
  const origem = lista.indexOf(de);
  const destino = lista.indexOf(para);
  if (origem < 0 || destino < 0 || origem === destino) return [...lista];
  const nova = lista.filter((c) => c !== de);
  nova.splice(destino, 0, de);
  return nova;
}

/** Mostrar acrescenta no fim; ocultar tira — mas a Lista nunca fica sem coluna. */
export function alternarColuna(lista: readonly string[], chave: string): string[] {
  if (!lista.includes(chave)) return [...lista, chave];
  return lista.length > 1 ? lista.filter((c) => c !== chave) : [...lista];
}

const padrao = (colunas: readonly ColunaEsteira[]) => colunas.filter((c) => c.padrao);

/** Colunas visíveis na ordem da preferência; nenhuma válida → as padrão. */
export function colunasVisiveis(escolhidas: readonly string[], colunas: readonly ColunaEsteira[]): ColunaEsteira[] {
  const porChave = new Map(colunas.map((c) => [c.chave, c]));
  const vistas = [...new Set(escolhidas)].flatMap((k) => (porChave.has(k) ? [porChave.get(k)!] : []));
  return vistas.length ? vistas : padrao(colunas);
}

/** Chaves que vão no `colunas=` da exportação: as visíveis, na ordem da tela. */
export function chavesParaExportar(escolhidas: readonly string[], colunas: readonly ColunaEsteira[]): string[] {
  return colunasVisiveis(escolhidas, colunas).map((c) => c.chave);
}

/** Largura salva da coluna (mesmos limites da preferência). */
export function larguraLimitada(px: number): number {
  if (!Number.isFinite(px)) return LARGURA_MIN;
  return Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, px)));
}

/**
 * Corpo do `PATCH /vinculos/:id` para a edição rápida de uma célula, no formato
 * do schema da API (`.strict()`): `responsavelId`/`observacoes` no topo, o resto
 * em `campos.<campo>`. Nulo quando a coluna não se edita ou o valor não cabe.
 */
export function montarPatchDeEdicao(coluna: ColunaEsteira, valor: ValorColuna): EditarVinculoInput | null {
  if (!coluna.editavel || !coluna.campo) return null;
  let limpo: ValorColuna = valor;
  switch (coluna.tipo) {
    case 'texto':
      if (valor !== null && typeof valor !== 'string') return null;
      limpo = valor?.trim() || null;
      break;
    case 'enum':
      if (valor !== null && typeof valor !== 'string') return null;
      limpo = valor || null;
      if (limpo !== null && coluna.opcoes && !coluna.opcoes.some((o) => o.valor === limpo)) return null;
      break;
    case 'booleano':
      if (typeof valor !== 'boolean') return null;
      break;
    case 'booleano3':
      if (valor !== null && typeof valor !== 'boolean') return null;
      break;
    default:
      return null;
  }
  if (coluna.campo === 'responsavelId') return { responsavelId: limpo as string | null };
  if (coluna.campo === 'observacoes') return { observacoes: limpo as string | null };
  const campo = /^campos\.(.+)$/.exec(coluna.campo)?.[1];
  if (!campo) return null;
  return { campos: { [campo]: limpo } } as EditarVinculoInput;
}
