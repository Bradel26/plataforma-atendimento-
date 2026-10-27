import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Alerta, Button } from '../../components/ui';
import { Table, type ColunaTabela } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api, baixarArquivo } from '../../lib/api';
import type {
  ColunaEsteira,
  RespostaLista,
  RespostaVinculo,
  ValorColuna,
  VinculoDetalhe,
  VinculoLinha,
  VinculoResumo,
} from '../../lib/esteiraTypes';
import { useResponsaveis } from './BarraDeFiltros';
import { BotaoTriEstado } from './BotaoTriEstado';
import { DetalheVinculo } from './DetalheVinculo';
import { useRegrasDaEsteira, type ExtrasDaRegra } from './DialogoMovimento';
import { TAMANHOS_PAGINA, parametroDaOperacao, quantosFiltros, queryDosFiltros, type PropsDaVisao } from './estadoEsteira';
import { diaDeHoje } from './funilEsteira';
import {
  LIMITE_SELECAO,
  alternarPagina,
  alternarSelecao,
  chavesParaExportar,
  colunasVisiveis,
  formatarCelula,
  larguraLimitada,
  montarPatchDeEdicao,
  pedidoDeExportacao,
  proximaOrdenacao,
} from './listaEsteira';
import type { ContextoDialogo } from './regrasMovimento';
import { SeletorDeColunas } from './SeletorDeColunas';

/** Tipos que a célula edita no lugar; data e número só pela gaveta. */
const TIPOS_EDITAVEIS = new Set<ColunaEsteira['tipo']>(['texto', 'enum', 'booleano', 'booleano3']);

const CLASSE_CONTROLE =
  'anel-de-foco h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-1.5 text-[13px] text-slate-800 disabled:opacity-50';

/** Cliques e teclas dentro do editor não abrem a gaveta da linha. */
const parar = (e: SyntheticEvent) => e.stopPropagation();

/** A gaveta abre com o resumo; a linha não traz `destinos` (o detalhe traz). */
const resumoDaLinha = (l: VinculoLinha): VinculoResumo => ({ ...l, destinos: {} });

/**
 * Lista da operação (spec 6.3): paginação no servidor, ordenação pelo
 * cabeçalho, colunas escolhidas/ordenadas/redimensionadas (salvas em
 * `pref.lista`), edição rápida das colunas editáveis (mesmas regras da gaveta:
 * recusa 409/403/400 abre o `DialogoMovimento`) e exportação CSV/XLSX com os
 * filtros e as colunas da tela — ou só das linhas selecionadas (a seleção
 * persiste entre páginas e zera ao trocar filtros). No celular, cartões.
 */
export function ListaView({ operacao, estrutura, filtros, pref, atualizarPref }: PropsDaVisao) {
  const mostrar = useToast();
  const regras = useRegrasDaEsteira();
  const responsaveis = useResponsaveis();
  const base = `/esteiras/${parametroDaOperacao(operacao)}`;
  const query = useMemo(() => queryDosFiltros(filtros).toString(), [filtros]);
  const podeEditar = estrutura.nivel === 'EDICAO';
  const ordenacao = pref.lista.ordenacao;
  const ordenarPor = ordenacao?.chave;
  const direcao = ordenacao?.direcao;
  const visiveis = useMemo(() => colunasVisiveis(pref.lista.colunas, estrutura.colunas), [pref.lista.colunas, estrutura.colunas]);

  // Tamanho da página salvo na preferência (25, 50 ou 100).
  const tamanho = pref.lista.tamanhoPagina;
  // Trocar filtros, ordenação ou tamanho volta à primeira página (sem efeito extra nem busca em dobro).
  const chaveConsulta = `${query}|${ordenacao?.chave ?? ''}|${ordenacao?.direcao ?? ''}|${tamanho}`;
  const [paginaDe, setPaginaDe] = useState({ chave: chaveConsulta, pagina: 1 });
  // Ajuste durante a renderização (padrão do React para "estado derivado de
  // prop"): ao trocar a chave, o estado guardado é zerado de fato. Só comparar
  // a chave na leitura fazia a página/seleção antiga voltar quando o usuário
  // desfazia o filtro (ex.: buscava e depois limpava a busca).
  if (paginaDe.chave !== chaveConsulta) setPaginaDe({ chave: chaveConsulta, pagina: 1 });
  const pagina = paginaDe.chave === chaveConsulta ? paginaDe.pagina : 1;
  const irParaPagina = (p: number) => setPaginaDe({ chave: chaveConsulta, pagina: Math.max(1, p) });

  // Seleção para exportar: persiste entre páginas; zera ao trocar filtros ou operação.
  const chaveSelecao = `${operacao}|${query}`;
  const [selecaoDe, setSelecaoDe] = useState<{ chave: string; ids: Set<string> }>({ chave: chaveSelecao, ids: new Set() });
  if (selecaoDe.chave !== chaveSelecao) setSelecaoDe({ chave: chaveSelecao, ids: new Set() });
  const selecionados = useMemo(
    () => (selecaoDe.chave === chaveSelecao ? selecaoDe.ids : new Set<string>()),
    [selecaoDe, chaveSelecao],
  );
  const mudarSelecao = (ids: Set<string>) => setSelecaoDe({ chave: chaveSelecao, ids });

  const [dados, setDados] = useState<RespostaLista | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [aberto, setAberto] = useState<VinculoResumo | null>(null);
  const [exportando, setExportando] = useState<'csv' | 'xlsx' | null>(null);

  useEffect(() => {
    let ativo = true;
    setErro(null);
    setCarregando(true);
    const q = new URLSearchParams(query);
    q.set('pagina', String(pagina));
    q.set('tamanho', String(tamanho));
    if (ordenarPor && direcao) {
      q.set('ordenarPor', ordenarPor);
      q.set('direcao', direcao);
    }
    api
      .get<RespostaLista>(`${base}/lista?${q.toString()}`)
      .then((r) => ativo && setDados(r))
      .catch((e) => ativo && setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a lista'))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [base, query, pagina, tamanho, ordenarPor, direcao, tentativa]);

  const total = dados?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / tamanho));

  // A página ficou além do fim (edições tiraram linhas do filtro): volta para a última.
  useEffect(() => {
    if (dados && !carregando && dados.linhas.length === 0 && pagina > 1 && pagina > paginas) irParaPagina(paginas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, carregando, pagina, paginas]);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  // ---------------------------------------------------------------------------
  // Preferências da Lista
  // ---------------------------------------------------------------------------

  const mudarLista = (parte: Partial<typeof pref.lista>) => atualizarPref({ lista: { ...pref.lista, ...parte } });
  const ordenar = (chave: string) => mudarLista({ ordenacao: proximaOrdenacao(ordenacao, chave) });
  const redimensionar = (chave: string, px: number) =>
    mudarLista({ larguras: { ...pref.lista.larguras, [chave]: larguraLimitada(px) } });

  // ---------------------------------------------------------------------------
  // Edição rápida
  // ---------------------------------------------------------------------------

  const motivosTodos = useMemo(
    () =>
      operacao === 'STARLINK'
        ? { tipo: 'perda' as const, opcoes: estrutura.motivosPerda.map((m) => ({ valor: m.valor, rotulo: m.rotulo })) }
        : null,
    [operacao, estrutura.motivosPerda],
  );

  /** Troca a linha no lugar (resposta já tem etapa e responsável) e relê a página para os calculados. */
  const aplicarNaLinha = (id: string, coluna: ColunaEsteira, valor: ValorColuna, v: VinculoDetalhe) => {
    setDados((atual) =>
      atual
        ? {
            ...atual,
            linhas: atual.linhas.map((l) =>
              l.id !== id
                ? l
                : {
                    ...l,
                    responsavel: v.responsavel,
                    etapa: v.etapa,
                    valores: {
                      ...l.valores,
                      [coluna.chave]: coluna.campo === 'responsavelId' ? (v.responsavel?.nome ?? null) : valor,
                      etapa: v.etapa.nome,
                      responsavel: v.responsavel?.nome ?? null,
                    },
                  },
            ),
          }
        : atual,
    );
    recarregar();
  };

  const salvar = (linha: VinculoLinha, coluna: ColunaEsteira, valor: ValorColuna) => {
    const corpo = montarPatchDeEdicao(coluna, valor);
    if (!corpo) return;
    const contexto: ContextoDialogo = { titulo: `Alterar ${coluna.rotulo}`, operacao, motivoSeExigido: motivosTodos };
    void regras.executar({
      contexto,
      inicial: null,
      chamar: (x: ExtrasDaRegra) =>
        api
          .patch<RespostaVinculo>(`${base}/vinculos/${linha.id}`, {
            ...corpo,
            ...(corpo.campos || x.motivoPerda
              ? { campos: { ...(corpo.campos ?? {}), ...(x.motivoPerda ? { motivoPerda: x.motivoPerda } : {}) } }
              : {}),
            ...(x.justificativa ? { justificativa: x.justificativa } : {}),
          })
          .then((r) => r.vinculo),
      aoConcluir: (v) => {
        aplicarNaLinha(linha.id, coluna, valor, v);
        if (v.etapa.chave !== linha.etapa.chave) mostrar('info', `${v.parceiro.nome}: etapa atualizada para ${v.etapa.nome}`);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Exportação
  // ---------------------------------------------------------------------------

  const exportar = async (formato: 'csv' | 'xlsx') => {
    const pedido = pedidoDeExportacao({
      query,
      formato,
      colunas: chavesParaExportar(pref.lista.colunas, estrutura.colunas),
      ordenacao,
      selecionados,
    });
    setExportando(formato);
    try {
      await baixarArquivo(
        `${base}/exportar?${pedido.query}`,
        `esteira-${parametroDaOperacao(operacao)}-${diaDeHoje()}.${formato}`,
        pedido.corpo,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) mostrar('erro', 'Seu perfil não pode exportar');
      else mostrar('erro', e instanceof ApiError ? e.message : 'Não foi possível exportar');
    } finally {
      setExportando(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Tabela
  // ---------------------------------------------------------------------------

  const fecharGaveta = useCallback(() => setAberto(null), []);
  const aposGravarNaGaveta = useCallback(() => recarregar(), [recarregar]);

  const celula = (coluna: ColunaEsteira, linha: VinculoLinha): ReactNode => {
    const valor = linha.valores[coluna.chave] ?? null;
    const editavel = podeEditar && coluna.editavel && !!coluna.campo && TIPOS_EDITAVEIS.has(coluna.tipo);
    if (!editavel) {
      const texto = formatarCelula(coluna, valor);
      return (
        <span title={texto} className={coluna.chave === 'parceiro' ? 'font-medium text-slate-900' : 'text-slate-700'}>
          {texto}
        </span>
      );
    }
    return (
      <span onClick={parar} onKeyDown={parar} className="block">
        <EditorDeCelula
          coluna={coluna}
          linha={linha}
          valor={valor}
          responsaveis={responsaveis}
          ocupado={regras.ocupado}
          aoSalvar={(v) => salvar(linha, coluna, v)}
        />
      </span>
    );
  };

  const colunasTabela: ColunaTabela<VinculoLinha>[] = visiveis.map((c) => ({
    chave: c.chave,
    cabecalho: c.rotulo,
    ordenavel: c.ordenavel,
    alinhamento: c.tipo === 'numero' ? 'direita' : undefined,
    render: (l) => celula(c, l),
  }));

  const cartao = (l: VinculoLinha) => {
    const extras = visiveis.filter((c) => !['parceiro', 'etapa', 'cidade', 'uf'].includes(c.chave)).slice(0, 4);
    return (
      <button
        type="button"
        onClick={() => setAberto(resumoDaLinha(l))}
        className="anel-de-foco w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{l.parceiro.nome}</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600">{l.etapa.nome}</span>
        </span>
        {(l.parceiro.cidade || l.parceiro.uf) && (
          <span className="mt-0.5 block text-xs text-slate-500">{[l.parceiro.cidade, l.parceiro.uf].filter(Boolean).join('/')}</span>
        )}
        {extras.length > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {extras.map((c) => (
              <div key={c.chave} className="min-w-0">
                <dt className="truncate text-slate-500">{c.rotulo}</dt>
                <dd className="truncate font-medium text-slate-700">{formatarCelula(c, l.valores[c.chave] ?? null)}</dd>
              </div>
            ))}
          </dl>
        )}
      </button>
    );
  };

  const primeiro = total === 0 ? 0 : (pagina - 1) * tamanho + 1;
  const ultimo = Math.min(total, pagina * tamanho);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <SeletorDeColunas colunas={estrutura.colunas} visiveis={visiveis.map((c) => c.chave)} aoMudar={(colunas) => mudarLista({ colunas })} />
        <span className="text-[12.5px] text-slate-500" aria-live="polite">
          {dados === null ? 'Carregando…' : `${total.toLocaleString('pt-BR')} parceiro(s)`}
          {podeEditar ? ' · clique na linha para abrir; edite as colunas editáveis no lugar' : ' · somente leitura'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selecionados.size > 0 && (
            <span className="flex items-center gap-1.5 text-[12.5px] text-slate-600" aria-live="polite">
              <span className="font-semibold tabular-nums text-slate-800">{selecionados.size.toLocaleString('pt-BR')}</span>
              {selecionados.size === 1 ? 'selecionado' : 'selecionados'}
              {selecionados.size >= LIMITE_SELECAO && ` (limite de ${LIMITE_SELECAO.toLocaleString('pt-BR')})`}
              <button
                type="button"
                onClick={() => mudarSelecao(new Set())}
                className="anel-de-foco rounded px-1 text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700"
              >
                Limpar seleção
              </button>
            </span>
          )}
          <Button variante="neutro" tamanho="sm" onClick={recarregar}>
            Atualizar
          </Button>
          <Button variante="neutro" tamanho="sm" disabled={exportando !== null || total === 0} onClick={() => void exportar('csv')}>
            {exportando === 'csv' ? 'Exportando…' : selecionados.size ? 'Exportar CSV (seleção)' : 'Exportar CSV'}
          </Button>
          <Button variante="neutro" tamanho="sm" disabled={exportando !== null || total === 0} onClick={() => void exportar('xlsx')}>
            {exportando === 'xlsx' ? 'Exportando…' : selecionados.size ? 'Exportar XLSX (seleção)' : 'Exportar XLSX'}
          </Button>
        </div>
      </div>

      {erro ? (
        <Alerta>
          <span className="flex flex-wrap items-center justify-between gap-2">
            {erro}
            <Button variante="neutro" tamanho="sm" onClick={recarregar}>
              Tentar de novo
            </Button>
          </span>
        </Alerta>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-2 sm:px-3" aria-busy={carregando}>
          <Table
            colunas={colunasTabela}
            linhas={dados?.linhas ?? []}
            chaveLinha={(l) => l.id}
            carregando={carregando}
            vazio={{
              titulo: 'Nenhum parceiro encontrado',
              descricao: quantosFiltros(filtros) > 0 ? 'Ajuste ou limpe os filtros para ver mais parceiros.' : 'Ainda não há parceiros nesta operação.',
            }}
            ordenacao={ordenacao}
            aoOrdenar={ordenar}
            aoClicarLinha={(l) => setAberto(resumoDaLinha(l))}
            selecao={{
              selecionados,
              aoAlternar: (id) => mudarSelecao(alternarSelecao(selecionados, id)),
              aoAlternarTodos: (marcado) =>
                mudarSelecao(alternarPagina(selecionados, (dados?.linhas ?? []).map((l) => l.id), marcado)),
            }}
            larguras={pref.lista.larguras}
            aoRedimensionar={redimensionar}
            aoReordenar={(colunas) => mudarLista({ colunas })}
            cardMobile={cartao}
          />
        </div>
      )}

      {!erro && total > 0 && (
        <nav aria-label="Paginação da lista" className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-slate-600">
          <span>
            {primeiro.toLocaleString('pt-BR')}–{ultimo.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5">
              Por página
              <select
                value={tamanho}
                onChange={(e) => {
                  const novo = TAMANHOS_PAGINA.find((t) => t === Number(e.target.value));
                  if (novo) mudarLista({ tamanhoPagina: novo });
                }}
                className="anel-de-foco h-8 rounded-md border border-slate-300 bg-white px-1.5 text-[13px] text-slate-800"
              >
                {TAMANHOS_PAGINA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <Button variante="neutro" tamanho="sm" disabled={pagina <= 1 || carregando} onClick={() => irParaPagina(pagina - 1)}>
              Anterior
            </Button>
            <span className="tabular-nums" aria-current="page">
              Página {pagina} de {paginas}
            </span>
            <Button variante="neutro" tamanho="sm" disabled={pagina >= paginas || carregando} onClick={() => irParaPagina(pagina + 1)}>
              Próxima
            </Button>
          </span>
        </nav>
      )}

      <DetalheVinculo vinculo={aberto} operacao={operacao} estrutura={estrutura} aoFechar={fecharGaveta} aoMudar={aposGravarNaGaveta} />

      {regras.dialogo}
    </div>
  );
}

/** Controle da célula editável: tri-estado, Sim/Não, opções, responsável ou texto (grava ao sair). */
function EditorDeCelula({
  coluna,
  linha,
  valor,
  responsaveis,
  ocupado,
  aoSalvar,
}: {
  coluna: ColunaEsteira;
  linha: VinculoLinha;
  valor: ValorColuna;
  responsaveis: Array<{ id: string; nome: string }> | null;
  ocupado: boolean;
  aoSalvar: (v: ValorColuna) => void;
}) {
  const rotulo = `${coluna.rotulo} de ${linha.parceiro.nome}`;

  if (coluna.tipo === 'booleano3') {
    return (
      <BotaoTriEstado
        compacto
        rotulo={rotulo}
        valor={typeof valor === 'boolean' ? valor : null}
        desabilitado={ocupado}
        aoMudar={(v) => aoSalvar(v)}
      />
    );
  }

  if (coluna.tipo === 'booleano') {
    return (
      <select
        aria-label={rotulo}
        value={valor === true ? 'sim' : 'nao'}
        disabled={ocupado}
        onChange={(e) => aoSalvar(e.target.value === 'sim')}
        className={CLASSE_CONTROLE}
      >
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </select>
    );
  }

  if (coluna.tipo === 'enum') {
    return (
      <select
        aria-label={rotulo}
        value={typeof valor === 'string' ? valor : ''}
        disabled={ocupado}
        onChange={(e) => aoSalvar(e.target.value || null)}
        className={CLASSE_CONTROLE}
      >
        <option value="">—</option>
        {coluna.opcoes?.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    );
  }

  if (coluna.campo === 'responsavelId') {
    // Sem a lista de usuários (perfil que não lista), o responsável só se troca pela gaveta.
    if (!responsaveis) return <span className="text-slate-700">{formatarCelula(coluna, valor)}</span>;
    const atual = linha.responsavel;
    const opcoes = atual && !responsaveis.some((r) => r.id === atual.id) ? [atual, ...responsaveis] : responsaveis;
    return (
      <select
        aria-label={rotulo}
        value={atual?.id ?? ''}
        disabled={ocupado}
        onChange={(e) => aoSalvar(e.target.value || null)}
        className={CLASSE_CONTROLE}
      >
        <option value="">Sem responsável</option>
        {opcoes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nome}
          </option>
        ))}
      </select>
    );
  }

  return <TextoDaCelula rotulo={rotulo} valor={typeof valor === 'string' ? valor : null} ocupado={ocupado} aoSalvar={aoSalvar} />;
}

/** Texto que grava ao sair do campo (ou Enter), só se mudou; Esc desfaz. */
function TextoDaCelula({
  rotulo,
  valor,
  ocupado,
  aoSalvar,
}: {
  rotulo: string;
  valor: string | null;
  ocupado: boolean;
  aoSalvar: (v: string | null) => void;
}) {
  const [texto, setTexto] = useState(valor ?? '');
  const desfazer = useRef(false);
  useEffect(() => setTexto(valor ?? ''), [valor]);
  const gravar = () => {
    if (desfazer.current) {
      // Esc: o blur vem antes do estado novo; não grava o texto descartado.
      desfazer.current = false;
      return;
    }
    const limpo = texto.trim();
    if (limpo === (valor ?? '').trim()) return;
    aoSalvar(limpo || null);
  };
  return (
    <input
      aria-label={rotulo}
      value={texto}
      maxLength={2000}
      disabled={ocupado}
      placeholder="—"
      title={texto || undefined}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          desfazer.current = true;
          setTexto(valor ?? '');
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={CLASSE_CONTROLE}
    />
  );
}
