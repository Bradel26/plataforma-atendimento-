import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alerta, Button } from '../../components/ui';
import { Gaveta } from '../../components/ui/Gaveta';
import { Segmentado } from '../../components/ui/Pagina';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import type {
  RespostaKanban,
  RespostaKanbanColuna,
  RespostaVinculo,
  VinculoDetalhe,
  VinculoResumo,
} from '../../lib/esteiraTypes';
import { Popover } from './BarraDeFiltros';
import { CartaoVinculo } from './CartaoVinculo';
import { useRegrasDaEsteira } from './DialogoMovimento';
import { EmConstrucao } from './EmConstrucao';
import { parametroDaOperacao, queryDosFiltros, type CampoOcultavel, type PropsDaVisao } from './estadoEsteira';
import { colunasDoKanban, decidirMovimento, podeSoltar, type ColunaDoQuadro } from './regrasMovimento';

type EstadoColuna = { total: number; itens: VinculoResumo[]; proximoCursor: string | null; carregando: boolean };

/** Página padrão da coluna (a API aceita até 100). */
const POR_COLUNA = 50;
const MAX_POR_COLUNA = 100;

const CAMPOS_DO_CARTAO: ReadonlyArray<{ valor: CampoOcultavel; rotulo: string }> = [
  { valor: 'cidade', rotulo: 'Cidade/UF' },
  { valor: 'responsavel', rotulo: 'Responsável' },
  { valor: 'etiquetas', rotulo: 'Etiquetas' },
  { valor: 'ultimaInteracao', rotulo: 'Última interação' },
];

/** Só o que o cartão usa (as escritas devolvem o detalhe inteiro). */
export function resumoDoDetalhe(v: VinculoDetalhe): VinculoResumo {
  const { id, operacao, parceiro, responsavel, etapa, diasNaEtapa, parado, ultimaInteracaoEm, etiquetas, destinos } = v;
  return { id, operacao, parceiro, responsavel, etapa, diasNaEtapa, parado, ultimaInteracaoEm, etiquetas, destinos };
}

/**
 * Kanban da operação (spec 6.1): uma coluna por etapa ativa, na ordem da
 * estrutura; desvios e saídas são colunas laterais recolhíveis. Arraste HTML5:
 * durante o arraste, as colunas que a regra não aceita ficam desabilitadas; as
 * que pedem justificativa/motivo abrem o `DialogoMovimento`. O servidor decide
 * de verdade — a recusa dele também cai no diálogo.
 */
export function KanbanView({ operacao, estrutura, filtros, pref, atualizarPref }: PropsDaVisao) {
  const mostrar = useToast();
  const regras = useRegrasDaEsteira();
  const base = `/esteiras/${parametroDaOperacao(operacao)}`;
  const query = useMemo(() => queryDosFiltros(filtros).toString(), [filtros]);
  const quadro = useMemo(() => colunasDoKanban(estrutura.etapas), [estrutura.etapas]);
  const etapas = useMemo(() => new Map(estrutura.etapas.map((e) => [e.chave as string, e])), [estrutura.etapas]);
  const podeEditar = estrutura.nivel === 'EDICAO';

  const [colunas, setColunas] = useState<Record<string, EstadoColuna> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [arrastando, setArrastando] = useState<VinculoResumo | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [aberto, setAberto] = useState<VinculoResumo | null>(null);

  useEffect(() => {
    let ativo = true;
    setErro(null);
    setColunas(null);
    const q = new URLSearchParams(query);
    q.set('porColuna', String(POR_COLUNA));
    api
      .get<RespostaKanban>(`${base}/kanban?${q.toString()}`)
      .then((r) => {
        if (!ativo) return;
        setColunas(
          Object.fromEntries(
            r.colunas.map((c) => [c.chave, { total: c.total, itens: c.itens, proximoCursor: c.proximoCursor, carregando: false }]),
          ),
        );
      })
      .catch((e) => ativo && setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o quadro'));
    return () => {
      ativo = false;
    };
  }, [base, query, tentativa]);

  const mudarColuna = (chave: string, f: (c: EstadoColuna) => EstadoColuna) =>
    setColunas((atual) => (atual?.[chave] ? { ...atual, [chave]: f(atual[chave]!) } : atual));

  const pagina = useCallback(
    (chave: string, tamanho: number, cursor?: string) => {
      const q = new URLSearchParams(query);
      q.set('porColuna', String(tamanho));
      if (cursor) q.set('cursor', cursor);
      return api.get<RespostaKanbanColuna>(`${base}/kanban/coluna/${chave}?${q.toString()}`);
    },
    [base, query],
  );

  const carregarMais = async (chave: string) => {
    const coluna = colunas?.[chave];
    if (!coluna?.proximoCursor || coluna.carregando) return;
    mudarColuna(chave, (c) => ({ ...c, carregando: true }));
    try {
      const r = await pagina(chave, POR_COLUNA, coluna.proximoCursor);
      mudarColuna(chave, (c) => {
        const vistos = new Set(c.itens.map((i) => i.id));
        return { ...c, itens: [...c.itens, ...r.itens.filter((i) => !vistos.has(i.id))], proximoCursor: r.proximoCursor, carregando: false };
      });
    } catch (e) {
      mudarColuna(chave, (c) => ({ ...c, carregando: false }));
      mostrar('erro', e instanceof ApiError ? e.message : 'Falha ao carregar mais parceiros');
    }
  };

  /** Relê a primeira página (do tamanho já carregado) das colunas afetadas e ajusta os totais. */
  const recarregarColunas = async (delta: Record<string, number>) => {
    await Promise.all(
      Object.entries(delta).map(async ([chave, diferenca]) => {
        const carregados = colunas?.[chave]?.itens.length ?? 0;
        const tamanho = Math.min(MAX_POR_COLUNA, Math.max(POR_COLUNA, carregados));
        try {
          const r = await pagina(chave, tamanho);
          mudarColuna(chave, (c) => ({ ...c, itens: r.itens, proximoCursor: r.proximoCursor, total: Math.max(0, c.total + diferenca) }));
        } catch {
          // Sem a releitura, o cartão pode ficar na coluna velha; "Atualizar" resolve.
          mudarColuna(chave, (c) => ({ ...c, total: Math.max(0, c.total + diferenca) }));
        }
      }),
    );
  };

  /** Depois de qualquer escrita no vínculo: troca o cartão no lugar ou relê as colunas de origem e destino. */
  const aposGravar = (antes: VinculoResumo, v: VinculoDetalhe) => {
    const de = antes.etapa.chave;
    const para = v.etapa.chave;
    if (de === para || !de || !para) {
      const novo = resumoDoDetalhe(v);
      if (de) mudarColuna(de, (c) => ({ ...c, itens: c.itens.map((i) => (i.id === v.id ? novo : i)) }));
      return;
    }
    void recarregarColunas({ [de]: -1, [para]: 1 });
  };

  const mover = (card: VinculoResumo, chave: string) => {
    const etapa = etapas.get(chave);
    if (!etapa) return;
    const decisao = decidirMovimento({
      operacao,
      destino: card.destinos[etapa.chave],
      etapa,
      podeForcar: estrutura.podeForcar,
      motivosPerda: estrutura.motivosPerda,
    });
    if (decisao.tipo === 'bloqueado') {
      mostrar('erro', decisao.motivo);
      return;
    }
    void regras.executar({
      contexto: decisao.contexto,
      inicial: decisao.tipo === 'dialogo' ? decisao.estado : null,
      chamar: (extras) =>
        api.post<RespostaVinculo>(`${base}/vinculos/${card.id}/mover`, { paraChave: etapa.chave, ...extras }).then((r) => r.vinculo),
      aoConcluir: (v) => {
        aposGravar(card, v);
        mostrar('sucesso', `${v.parceiro.nome} foi para ${v.etapa.nome}`);
      },
    });
  };

  const terminarArraste = () => {
    setArrastando(null);
    setAlvo(null);
  };

  const recolhidas = new Set(pref.kanban.recolhidas);
  const alternarRecolhida = (chave: string) => {
    const nova = recolhidas.has(chave) ? pref.kanban.recolhidas.filter((c) => c !== chave) : [...pref.kanban.recolhidas, chave];
    atualizarPref({ kanban: { ...pref.kanban, recolhidas: nova } });
  };
  const ocultos = new Set(pref.kanban.camposOcultos);
  const alternarCampo = (campo: CampoOcultavel) => {
    const lista = ocultos.has(campo) ? pref.kanban.camposOcultos.filter((c) => c !== campo) : [...pref.kanban.camposOcultos, campo];
    atualizarPref({ kanban: { ...pref.kanban, camposOcultos: lista } });
  };

  if (erro) {
    return (
      <Alerta>
        <span className="flex flex-wrap items-center justify-between gap-2">
          {erro}
          <Button variante="neutro" tamanho="sm" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Button>
        </span>
      </Alerta>
    );
  }

  const total = colunas ? Object.values(colunas).reduce((s, c) => s + c.total, 0) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmentado
          rotulo="Densidade dos cartões"
          tamanho="sm"
          opcoes={[
            { valor: 'detalhada', rotulo: 'Detalhada' },
            { valor: 'compacta', rotulo: 'Compacta' },
          ]}
          valor={pref.kanban.densidade}
          aoMudar={(d) => atualizarPref({ kanban: { ...pref.kanban, densidade: d } })}
        />
        <Popover rotulo="Exibir no cartão" ativo={ocultos.size > 0} largura="w-56">
          {() => (
            <fieldset className="flex flex-col gap-1">
              <legend className="px-1 pb-1 text-xs font-semibold text-slate-500">Informações secundárias</legend>
              {CAMPOS_DO_CARTAO.map((c) => (
                <label key={c.valor} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" checked={!ocultos.has(c.valor)} onChange={() => alternarCampo(c.valor)} />
                  {c.rotulo}
                </label>
              ))}
              {pref.kanban.densidade === 'compacta' && (
                <p className="px-1.5 pt-1 text-xs text-slate-500">Na densidade compacta só aparecem nome, cidade e o selo de parado.</p>
              )}
            </fieldset>
          )}
        </Popover>
        <span className="text-[12.5px] text-slate-500">
          {total === null ? 'Carregando…' : `${total} parceiro(s)`}
          {podeEditar ? ' · arraste o cartão para mudar de etapa' : ' · somente leitura'}
        </span>
        <Button variante="neutro" tamanho="sm" className="ml-auto" onClick={() => setTentativa((t) => t + 1)}>
          Atualizar
        </Button>
      </div>

      {!colunas ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBloco key={i} className="h-72 w-[85vw] shrink-0 sm:w-[272px]" />
          ))}
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:snap-none">
          {quadro.map((col) => (
            <ColunaKanban
              key={col.chave}
              coluna={col}
              estado={colunas[col.chave] ?? { total: 0, itens: [], proximoCursor: null, carregando: false }}
              recolhida={recolhidas.has(col.chave)}
              aoAlternar={() => alternarRecolhida(col.chave)}
              arrastando={arrastando}
              alvo={alvo === col.chave}
              podeForcar={estrutura.podeForcar}
              podeEditar={podeEditar}
              densidade={pref.kanban.densidade}
              ocultos={ocultos}
              aoEntrar={() => setAlvo(col.chave)}
              aoSair={() => setAlvo((a) => (a === col.chave ? null : a))}
              aoSoltar={() => {
                const card = arrastando;
                terminarArraste();
                if (card) mover(card, col.chave);
              }}
              aoIniciarArraste={setArrastando}
              aoTerminarArraste={terminarArraste}
              aoAbrir={setAberto}
              aoCarregarMais={() => void carregarMais(col.chave)}
            />
          ))}
        </div>
      )}

      <Gaveta aberta={aberto !== null} titulo={aberto?.parceiro.nome ?? 'Parceiro'} aoFechar={() => setAberto(null)} largura="max-w-xl">
        <EmConstrucao titulo="Detalhes do parceiro" descricao="A gaveta com os campos da operação chega na próxima entrega." />
      </Gaveta>

      {regras.dialogo}
    </div>
  );
}

function ColunaKanban({
  coluna,
  estado,
  recolhida,
  aoAlternar,
  arrastando,
  alvo,
  podeForcar,
  podeEditar,
  densidade,
  ocultos,
  aoEntrar,
  aoSair,
  aoSoltar,
  aoIniciarArraste,
  aoTerminarArraste,
  aoAbrir,
  aoCarregarMais,
}: {
  coluna: ColunaDoQuadro;
  estado: EstadoColuna;
  recolhida: boolean;
  aoAlternar: () => void;
  arrastando: VinculoResumo | null;
  alvo: boolean;
  podeForcar: boolean;
  podeEditar: boolean;
  densidade: 'compacta' | 'detalhada';
  ocultos: ReadonlySet<CampoOcultavel>;
  aoEntrar: () => void;
  aoSair: () => void;
  aoSoltar: () => void;
  aoIniciarArraste: (v: VinculoResumo) => void;
  aoTerminarArraste: () => void;
  aoAbrir: (v: VinculoResumo) => void;
  aoCarregarMais: () => void;
}) {
  const origem = arrastando?.etapa.chave === coluna.chave;
  const soltura = arrastando && !origem ? podeSoltar(arrastando.destinos[coluna.chave], podeForcar) : null;
  const desabilitada = soltura !== null && !soltura.permitido;
  const rotulo = `${coluna.nome}: ${estado.total} parceiro(s)${soltura?.aviso ? ` — ${soltura.aviso}` : ''}`;

  const eventos = {
    onDragOver: (e: React.DragEvent) => {
      if (!soltura?.permitido) {
        if (arrastando) e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!alvo) aoEntrar();
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) aoSair();
    },
    onDrop: (e: React.DragEvent) => {
      if (!soltura?.permitido) return;
      e.preventDefault();
      aoSoltar();
    },
  };

  const fundo = alvo
    ? 'bg-[var(--brand-primary-soft)] ring-2 ring-[var(--brand-primary)]'
    : soltura?.permitido
      ? 'bg-slate-200/60 outline-2 outline-dashed outline-[var(--brand-primary)]/40'
      : coluna.lateral
        ? 'bg-slate-100'
        : 'bg-slate-200/60';
  const apagada = desabilitada ? 'opacity-45' : '';

  if (recolhida) {
    return (
      <section aria-label={rotulo} title={soltura?.aviso ?? undefined} {...eventos} className={`flex w-12 shrink-0 snap-start flex-col items-center rounded-2xl py-2 transition ${fundo} ${apagada}`}>
        <button
          type="button"
          onClick={aoAlternar}
          aria-expanded={false}
          aria-label={`Expandir a coluna ${coluna.nome}`}
          className="anel-de-foco flex flex-1 flex-col items-center gap-2 rounded-lg px-1 py-1 text-slate-600 hover:text-slate-900"
        >
          <span className="rounded-full bg-white px-1.5 text-[11.5px] font-bold tabular-nums text-slate-700">{estado.total}</span>
          <span className="text-[12.5px] font-bold [writing-mode:vertical-rl]">{coluna.nome}</span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={rotulo}
      {...eventos}
      className={`flex w-[85vw] shrink-0 snap-start flex-col rounded-2xl p-2.5 transition sm:w-[272px] ${fundo} ${apagada}`}
    >
      <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1" title={soltura?.aviso ?? undefined}>
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800" title={coluna.nome}>
          {coluna.nome}
        </h2>
        {coluna.tipo !== 'NORMAL' && (
          <span className="rounded-full bg-white px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
            {coluna.tipo === 'SAIDA' ? 'Saída' : 'Desvio'}
          </span>
        )}
        <span className="rounded-full bg-white px-2 text-xs font-bold tabular-nums text-slate-700">{estado.total}</span>
        {coluna.lateral && (
          <button
            type="button"
            onClick={aoAlternar}
            aria-expanded
            aria-label={`Recolher a coluna ${coluna.nome}`}
            className="anel-de-foco rounded px-1 text-slate-500 hover:text-slate-800"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
      </header>
      {soltura?.aviso && (
        <p className={`mx-1 mb-2 rounded-md px-2 py-1 text-[11.5px] font-medium ${desabilitada ? 'bg-white text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
          {soltura.aviso}
        </p>
      )}
      <ul className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto">
        {estado.itens.length === 0 ? (
          <li className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
            Nenhum parceiro nesta etapa
          </li>
        ) : (
          estado.itens.map((v) => (
            <CartaoVinculo
              key={v.id}
              vinculo={v}
              densidade={densidade}
              ocultos={ocultos}
              arrastavel={podeEditar}
              arrastando={arrastando?.id === v.id}
              aoIniciarArraste={aoIniciarArraste}
              aoTerminarArraste={aoTerminarArraste}
              aoAbrir={aoAbrir}
            />
          ))
        )}
        {estado.proximoCursor && (
          <li className="pt-1">
            <Button variante="neutro" tamanho="sm" className="w-full" onClick={aoCarregarMais} disabled={estado.carregando}>
              {estado.carregando ? 'Carregando…' : `Carregar mais (${Math.max(0, estado.total - estado.itens.length)} restantes)`}
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}
