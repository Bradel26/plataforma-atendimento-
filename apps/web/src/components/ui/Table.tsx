import type { ReactNode } from 'react';
import { EmptyState } from './index';
import { SkeletonLinhaTabela } from './Skeleton';

export type ColunaTabela<T> = {
  chave: string;
  cabecalho: ReactNode;
  render: (item: T) => ReactNode;
  ordenavel?: boolean;
  alinhamento?: 'esquerda' | 'direita';
  /** 1 = sempre visivel. 2 some primeiro (abaixo de `md`). 3 some depois (abaixo de `lg`). */
  prioridade?: 1 | 2 | 3;
};

export type OrdenacaoTabela = { chave: string; direcao: 'asc' | 'desc' } | null;

type Props<T> = {
  colunas: ColunaTabela<T>[];
  linhas: T[];
  chaveLinha: (item: T) => string;
  carregando?: boolean;
  vazio: { titulo: string; descricao: string };
  ordenacao?: OrdenacaoTabela;
  aoOrdenar?: (chave: string) => void;
  /** Icones de acao — renderizados sempre visiveis, nunca so-no-hover (hover nao existe em toque). */
  acoesLinha?: (item: T) => ReactNode;
  selecao?: {
    selecionados: Set<string>;
    aoAlternar: (chave: string) => void;
    aoAlternarTodos: (marcado: boolean) => void;
  };
  /** Alternativa em cartao pra tela muito estreita. Sem isso, so a rolagem horizontal cobre o caso. */
  cardMobile?: (item: T) => ReactNode;
};

function classeDePrioridade(prioridade?: 1 | 2 | 3) {
  if (prioridade === 2) return 'hidden md:table-cell';
  if (prioridade === 3) return 'hidden lg:table-cell';
  return '';
}

/**
 * Tabela unica pra parar de reimplementar `<table>` em cada tela.
 *
 * Sem paginacao embutida de proposito — o padrao de cursor + "carregar mais"
 * que ja existe em 4 telas continua funcionando do lado de fora, renderizado
 * pela propria pagina; a tabela so mostra as linhas que recebeu.
 */
export function Table<T>({
  colunas,
  linhas,
  chaveLinha,
  carregando,
  vazio,
  ordenacao,
  aoOrdenar,
  acoesLinha,
  selecao,
  cardMobile,
}: Props<T>) {
  const numeroDeColunas = colunas.length + (selecao ? 1 : 0) + (acoesLinha ? 1 : 0);
  // So mostra skeleton na carga inicial (sem linha nenhuma ainda). Numa
  // atualizacao com dado na tela, trocar tudo por skeleton pisca a tela por
  // nada — os dados antigos continuam validos ate os novos chegarem.
  const mostrarSkeleton = carregando && linhas.length === 0;
  const mostrarVazio = !carregando && linhas.length === 0;
  const todosSelecionados = selecao ? linhas.length > 0 && linhas.every((l) => selecao.selecionados.has(chaveLinha(l))) : false;

  const tabela = (
    <div className={cardMobile ? 'hidden overflow-x-auto sm:block' : 'overflow-x-auto'}>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-white text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {selecao && (
              <th className="w-8 py-2">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={todosSelecionados}
                  onChange={(e) => selecao.aoAlternarTodos(e.target.checked)}
                />
              </th>
            )}
            {colunas.map((coluna) => (
              <th
                key={coluna.chave}
                aria-sort={
                  coluna.ordenavel
                    ? ordenacao?.chave === coluna.chave
                      ? ordenacao.direcao === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
                className={`py-2 font-medium ${coluna.alinhamento === 'direita' ? 'text-right' : 'text-left'} ${classeDePrioridade(coluna.prioridade)}`}
              >
                {coluna.ordenavel ? (
                  <button
                    type="button"
                    onClick={() => aoOrdenar?.(coluna.chave)}
                    className="anel-de-foco inline-flex items-center gap-1 font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
                  >
                    {coluna.cabecalho}
                    <span aria-hidden="true" className="text-[10px]">
                      {ordenacao?.chave === coluna.chave ? (ordenacao.direcao === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                ) : (
                  coluna.cabecalho
                )}
              </th>
            ))}
            {acoesLinha && <th className="py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {mostrarSkeleton &&
            Array.from({ length: 5 }, (_, i) => <SkeletonLinhaTabela key={i} colunas={numeroDeColunas} />)}

          {mostrarVazio && (
            <tr>
              {/* Cabecalho continua na tela durante o vazio — some a tabela
                  inteira tiraria o contexto de quais colunas existem. */}
              <td colSpan={numeroDeColunas} className="py-6">
                <EmptyState titulo={vazio.titulo} descricao={vazio.descricao} />
              </td>
            </tr>
          )}

          {!mostrarSkeleton &&
            linhas.map((item) => {
              const chave = chaveLinha(item);
              return (
                <tr key={chave} className="hover:bg-slate-50">
                  {selecao && (
                    <td className="py-3">
                      <input
                        type="checkbox"
                        aria-label="Selecionar linha"
                        checked={selecao.selecionados.has(chave)}
                        onChange={() => selecao.aoAlternar(chave)}
                      />
                    </td>
                  )}
                  {colunas.map((coluna) => (
                    <td
                      key={coluna.chave}
                      className={`py-3 ${coluna.alinhamento === 'direita' ? 'text-right' : ''} ${classeDePrioridade(coluna.prioridade)}`}
                    >
                      {coluna.render(item)}
                    </td>
                  ))}
                  {acoesLinha && (
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center gap-1.5">{acoesLinha(item)}</span>
                    </td>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );

  if (!cardMobile) return tabela;

  return (
    <>
      {tabela}
      <div className="space-y-2 sm:hidden">
        {mostrarVazio ? (
          <EmptyState titulo={vazio.titulo} descricao={vazio.descricao} />
        ) : (
          linhas.map((item) => <div key={chaveLinha(item)}>{cardMobile(item)}</div>)
        )}
      </div>
    </>
  );
}
