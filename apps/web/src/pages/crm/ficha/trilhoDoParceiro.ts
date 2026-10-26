/**
 * Trilho do parceiro na ficha do contato — puro, sem React.
 *
 * Mostra as etapas do trilho principal da operação (nomes vindos da API) e
 * onde o parceiro está. Desvio e saída não têm posição no trilho: a etapa
 * aparece à parte (`fora`) e nenhuma do trilho fica marcada como atual.
 */
import type { ChaveEtapa, EtapaEsteira, TipoEtapa } from '../../../lib/esteiraTypes';

export type PassoDoTrilho = { chave: ChaveEtapa; nome: string; estado: 'feito' | 'atual' | 'futuro' };

export function trilhoDoParceiro(
  etapas: ReadonlyArray<Pick<EtapaEsteira, 'chave' | 'nome' | 'tipo' | 'trilho'>>,
  chaveAtual: ChaveEtapa | null,
): { passos: PassoDoTrilho[]; fora: { nome: string; tipo: TipoEtapa } | null } {
  const atual = chaveAtual ? etapas.find((e) => e.chave === chaveAtual) : undefined;
  const posicao = atual?.trilho ?? null;
  const passos = etapas
    .filter((e): e is typeof e & { trilho: number } => e.trilho !== null)
    .sort((a, b) => a.trilho - b.trilho)
    .map((e) => ({
      chave: e.chave,
      nome: e.nome,
      estado:
        posicao === null ? ('futuro' as const) : e.trilho < posicao ? ('feito' as const) : e.trilho === posicao ? ('atual' as const) : ('futuro' as const),
    }));
  return { passos, fora: atual && posicao === null ? { nome: atual.nome, tipo: atual.tipo } : null };
}
