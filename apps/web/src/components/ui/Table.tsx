import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
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
  /** Clique (ou Enter) na linha. Controles dentro da celula devem parar a propagacao do clique. */
  aoClicarLinha?: (item: T) => void;
  /**
   * Larguras em px por chave de coluna. Com `larguras` ou `aoRedimensionar` a
   * tabela passa a layout fixo (coluna sem largura usa `larguraPadrao`).
   */
  larguras?: Record<string, number>;
  larguraPadrao?: number;
  /** Arraste da borda direita do cabecalho (ou setas no puxador); chamado ao soltar. */
  aoRedimensionar?: (chave: string, px: number) => void;
  /** Arrastar um cabecalho sobre outro reordena; recebe a nova ordem das chaves. */
  aoReordenar?: (chaves: string[]) => void;
};

const LARGURA_MINIMA = 60;
const LARGURA_MAXIMA = 800;
const limitar = (px: number) => Math.round(Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, px)));

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
 *
 * Opcionais (usados pela Lista da esteira): largura por arraste na borda do
 * cabecalho, reordenar arrastando o cabecalho e linha clicavel. Sem essas
 * props, o comportamento e o de sempre.
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
  aoClicarLinha,
  larguras,
  larguraPadrao = 160,
  aoRedimensionar,
  aoReordenar,
}: Props<T>) {
  const [provisoria, setProvisoria] = useState<{ chave: string; px: number } | null>(null);
  const [arrastada, setArrastada] = useState<string | null>(null);
  const redimensionando = useRef<{ chave: string; inicioX: number; inicioPx: number } | null>(null);

  const fixo = !!larguras || !!aoRedimensionar;
  const larguraDe = (chave: string) => (provisoria?.chave === chave ? provisoria.px : (larguras?.[chave] ?? larguraPadrao));
  const larguraTotal = fixo
    ? colunas.reduce((s, c) => s + larguraDe(c.chave), 0) + (selecao ? 40 : 0) + (acoesLinha ? 96 : 0)
    : undefined;

  const iniciarRedimensionar = (e: PointerEvent<HTMLSpanElement>, chave: string) => {
    e.preventDefault();
    e.stopPropagation();
    const atual = e.currentTarget.parentElement?.getBoundingClientRect().width || larguraDe(chave);
    redimensionando.current = { chave, inicioX: e.clientX, inicioPx: atual };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setProvisoria({ chave, px: limitar(atual) });
  };
  const moverRedimensionar = (e: PointerEvent<HTMLSpanElement>) => {
    const r = redimensionando.current;
    if (r) setProvisoria({ chave: r.chave, px: limitar(r.inicioPx + e.clientX - r.inicioX) });
  };
  const terminarRedimensionar = (e: PointerEvent<HTMLSpanElement>) => {
    const r = redimensionando.current;
    if (!r) return;
    redimensionando.current = null;
    const px = limitar(r.inicioPx + e.clientX - r.inicioX);
    setProvisoria(null);
    if (px !== limitar(r.inicioPx)) aoRedimensionar?.(r.chave, px);
  };
  const tecladoRedimensionar = (e: KeyboardEvent<HTMLSpanElement>, chave: string) => {
    const passo = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0;
    if (!passo) return;
    e.preventDefault();
    e.stopPropagation();
    aoRedimensionar?.(chave, limitar(larguraDe(chave) + passo));
  };

  const soltarCabecalho = (alvo: string) => {
    const de = arrastada;
    setArrastada(null);
    if (!de || de === alvo || !aoReordenar) return;
    const chaves = colunas.map((c) => c.chave);
    const destino = chaves.indexOf(alvo);
    const nova = chaves.filter((c) => c !== de);
    nova.splice(destino, 0, de);
    aoReordenar(nova);
  };

  const numeroDeColunas = colunas.length + (selecao ? 1 : 0) + (acoesLinha ? 1 : 0);
  // So mostra skeleton na carga inicial (sem linha nenhuma ainda). Numa
  // atualizacao com dado na tela, trocar tudo por skeleton pisca a tela por
  // nada — os dados antigos continuam validos ate os novos chegarem.
  const mostrarSkeleton = carregando && linhas.length === 0;
  const mostrarVazio = !carregando && linhas.length === 0;
  const todosSelecionados = selecao ? linhas.length > 0 && linhas.every((l) => selecao.selecionados.has(chaveLinha(l))) : false;

  const tabela = (
    <div className={cardMobile ? 'hidden overflow-x-auto sm:block' : 'overflow-x-auto'}>
      <table
        className={`text-left text-sm ${fixo ? 'min-w-full table-fixed' : 'w-full'}`}
        style={larguraTotal ? { width: larguraTotal } : undefined}
      >
        <thead className="sticky top-0 z-10 bg-white text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {selecao && (
              <th className="w-10 py-2">
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
                style={fixo ? { width: larguraDe(coluna.chave) } : undefined}
                draggable={aoReordenar ? true : undefined}
                onDragStart={
                  aoReordenar
                    ? (e) => {
                        if (redimensionando.current) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', coluna.chave);
                        setArrastada(coluna.chave);
                      }
                    : undefined
                }
                onDragOver={aoReordenar ? (e) => arrastada && e.preventDefault() : undefined}
                onDrop={
                  aoReordenar
                    ? (e) => {
                        e.preventDefault();
                        soltarCabecalho(coluna.chave);
                      }
                    : undefined
                }
                onDragEnd={aoReordenar ? () => setArrastada(null) : undefined}
                aria-sort={
                  coluna.ordenavel
                    ? ordenacao?.chave === coluna.chave
                      ? ordenacao.direcao === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
                className={`py-2 pr-3 font-medium ${coluna.alinhamento === 'direita' ? 'text-right' : 'text-left'} ${classeDePrioridade(coluna.prioridade)} ${
                  fixo ? 'relative overflow-hidden text-ellipsis whitespace-nowrap' : ''
                } ${aoReordenar ? 'cursor-grab' : ''} ${arrastada === coluna.chave ? 'opacity-50' : ''}`}
              >
                {coluna.ordenavel ? (
                  <button
                    type="button"
                    onClick={() => aoOrdenar?.(coluna.chave)}
                    className="anel-de-foco inline-flex max-w-full items-center gap-1 font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
                  >
                    <span className={fixo ? 'truncate' : undefined}>{coluna.cabecalho}</span>
                    <span aria-hidden="true" className="text-[10px]">
                      {ordenacao?.chave === coluna.chave ? (ordenacao.direcao === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                ) : (
                  coluna.cabecalho
                )}
                {aoRedimensionar && (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Redimensionar coluna (setas esquerda e direita)"
                    aria-valuenow={larguraDe(coluna.chave)}
                    aria-valuemin={LARGURA_MINIMA}
                    aria-valuemax={LARGURA_MAXIMA}
                    tabIndex={0}
                    draggable={false}
                    onPointerDown={(e) => iniciarRedimensionar(e, coluna.chave)}
                    onPointerMove={moverRedimensionar}
                    onPointerUp={terminarRedimensionar}
                    onPointerCancel={terminarRedimensionar}
                    onKeyDown={(e) => tecladoRedimensionar(e, coluna.chave)}
                    onClick={(e) => e.stopPropagation()}
                    className="anel-de-foco absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none border-r-2 border-transparent hover:border-slate-300 focus-visible:border-[var(--brand-primary)]"
                  />
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
                <tr
                  key={chave}
                  className={`hover:bg-slate-50 ${aoClicarLinha ? 'cursor-pointer' : ''}`}
                  onClick={aoClicarLinha ? () => aoClicarLinha(item) : undefined}
                  tabIndex={aoClicarLinha ? 0 : undefined}
                  onKeyDown={
                    aoClicarLinha
                      ? (e) => {
                          if (e.target === e.currentTarget && e.key === 'Enter') aoClicarLinha(item);
                        }
                      : undefined
                  }
                >
                  {selecao && (
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
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
                      className={`py-3 pr-3 ${coluna.alinhamento === 'direita' ? 'text-right' : ''} ${classeDePrioridade(coluna.prioridade)} ${
                        fixo ? 'overflow-hidden text-ellipsis whitespace-nowrap' : ''
                      }`}
                    >
                      {coluna.render(item)}
                    </td>
                  ))}
                  {acoesLinha && (
                    <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
