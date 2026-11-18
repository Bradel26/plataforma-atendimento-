import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { telefoneLegivel } from '../../lib/telefone';
import {
  LABEL_CHAMADA_STATUS,
  type CallStatus,
  type Chamada,
} from '../../lib/types';
import { AssistenteDaLigacao } from './AssistenteDaLigacao';
import { IconeBusca, IconeCheck, IconeFeita, IconeFiltro, IconeHistorico, IconeInfo, IconeRecebida, IconeTelefone } from './icones';
import { relogio } from './PainelLigacoes';

type Filtro = 'todas' | 'recebidas' | 'feitas' | 'perdidas';

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'recebidas', rotulo: 'Recebidas' },
  { id: 'feitas', rotulo: 'Feitas' },
  { id: 'perdidas', rotulo: 'Perdidas' },
];

const STATUS_PERDIDA = new Set<CallStatus>(['NAO_ATENDIDA', 'OCUPADA', 'FALHOU', 'CANCELADA']);

// Amostra somente visual: nao vem da API e nunca e salva no banco.
const CHAMADA_DEMO: Chamada = {
  id: 'demo-chamada-local',
  idExterno: 'demo-chamada-local',
  direcao: 'ENTRANTE',
  status: 'COMPLETADA',
  numeroOrigem: '5562991234567',
  numeroDestino: '556292885001',
  iniciadoEm: new Date().toISOString(),
  atendidoEm: new Date(Date.now() + 4_000).toISOString(),
  encerradoEm: new Date(Date.now() + 231_000).toISOString(),
  duracao: 227,
  gravacaoUrl: null,
  gravacaoDuracao: 227,
  transcricao: null,
  custo: null,
  motivoFalha: null,
  contato: { id: 'demo-contato-local', nome: 'Marcos Ribeiro · Demonstração' },
  agente: { id: 'demo-agente-local', nome: 'Kauã Tavares' },
  fila: null,
};

const CLASSE_STATUS: Record<CallStatus, string> = {
  INICIANDO: 'bg-blue-50 text-blue-700',
  CHAMANDO: 'bg-blue-50 text-blue-700',
  EM_ANDAMENTO: 'bg-blue-50 text-blue-700',
  COMPLETADA: 'bg-emerald-50 text-emerald-700',
  NAO_ATENDIDA: 'bg-amber-50 text-amber-700',
  OCUPADA: 'bg-amber-50 text-amber-700',
  FALHOU: 'bg-red-50 text-red-700',
  CANCELADA: 'bg-slate-100 text-slate-600',
};

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const numeroLegivel = (numero: string) => (/^\d+$/.test(numero) ? telefoneLegivel(numero) : numero);
const custoCurto = (v: number | null | undefined) => v == null ? '—' : `R$ ${v.toFixed(4).replace('.', ',')}`;

type Periodo = 'todos' | 'hoje' | '7d' | '30d';

const PERIODOS: Array<{ id: Periodo; rotulo: string }> = [
  { id: 'todos', rotulo: 'Todo o período' },
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: 'Últimos 7 dias' },
  { id: '30d', rotulo: 'Últimos 30 dias' },
];

const dentroDoPeriodo = (iso: string, periodo: Periodo) => {
  if (periodo === 'todos') return true;
  const quando = new Date(iso).getTime();
  if (periodo === 'hoje') {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    return quando >= inicio.getTime();
  }
  return quando >= Date.now() - (periodo === '7d' ? 7 : 30) * 86_400_000;
};

/** Botao de funil ao lado da busca: filtra as chamadas carregadas por periodo. */
function FiltroPeriodo({ periodo, aoMudar }: { periodo: Periodo; aoMudar: (p: Periodo) => void }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const ativo = periodo !== 'todos';
  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Filtrar por período"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Filtrar por período"
        className={`relative flex h-10 w-10 items-center justify-center rounded-lg border transition ${ativo ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
      >
        <IconeFiltro tamanho={17} />
        {ativo && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-600" />}
      </button>
      {aberto && (
        <div role="menu" aria-label="Período" className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={periodo === p.id}
              onClick={() => { aoMudar(p.id); setAberto(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${periodo === p.id ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
            >
              {p.rotulo}
              {periodo === p.id && <IconeCheck tamanho={14} className="text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ilustracao do painel vazio: cartao com telefone, mancha azul suave e seta apontando para a lista. */
function IlustracaoSelecioneChamada() {
  return (
    <svg width="260" height="128" viewBox="0 0 260 128" fill="none" aria-hidden="true" className="shrink-0 text-blue-500">
      <path d="M118 48c8-22 25-29 49-28 22 1 31-17 53-14 30 4 38 30 25 52-9 16-26 25-43 33-24 12-47 27-70 17-22-9-25-36-14-60Z" fill="currentColor" opacity=".14" />
      <path d="M55 63C41 43 24 39 4 44m9-9L3 44l12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".45" />
      <rect x="124" y="29" width="106" height="69" rx="7" fill="currentColor" opacity=".12" />
      <rect x="121" y="25" width="106" height="69" rx="7" fill="var(--color-white)" stroke="#7294c5" strokeWidth="1.6" />
      <rect x="126" y="30" width="96" height="59" rx="3" fill="var(--color-white)" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" />
      <path d="M138 72c8 7 13 10 22 8" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity=".16" />
      <path d="m145 49-4 2c-3 2 0 12 7 19s14 10 17 7l3-4-7-5-4 4c-5-2-9-6-11-11l4-4-3-7Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M177 43h34v3h-34zM177 53h34v3h-34zM177 63h23" stroke="#7294c5" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function HistoricoDeChamadas({
  chamadas,
  cursor,
  onCarregarMais,
  aoLigar,
  aoExcluir,
  aoCriarContato,
}: {
  chamadas: Chamada[];
  cursor: string | null;
  onCarregarMais: () => void;
  /** Liga de volta para o número da chamada selecionada (só quando a tela tem um painel de ligação ativo). */
  aoLigar?: (numero: string) => void;
  /** Só administrador: apaga a chamada (e a gravação) do histórico. */
  aoExcluir?: (chamada: Chamada) => Promise<void>;
  /** Número sem cadastro: cria o contato (e vincula as chamadas desse número). */
  aoCriarContato?: (chamada: Chamada, nome: string) => Promise<void>;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('todos');
  // A tela usa somente chamadas reais, inclusive no desenvolvimento.
  const somenteDemo = false;
  const registros = somenteDemo ? [CHAMADA_DEMO] : chamadas;
  // A busca age so sobre as chamadas ja carregadas: nao altera a paginacao (cursor) existente.
  const termo = busca.trim().toLowerCase();
  const termoDigitos = termo.replace(/\D/g, '');
  const bateBusca = (c: Chamada) => {
    if (!termo) return true;
    const numero = c.direcao === 'ENTRANTE' ? c.numeroOrigem : c.numeroDestino;
    return (c.contato?.nome ?? '').toLowerCase().includes(termo) || (termoDigitos.length > 0 && numero.replace(/\D/g, '').includes(termoDigitos));
  };
  const passaBase = (c: Chamada) => bateBusca(c) && dentroDoPeriodo(c.iniciadoEm, periodo);
  const passaFiltro = (c: Chamada, f: Filtro) =>
    f === 'todas' ||
    (f === 'recebidas' && c.direcao === 'ENTRANTE') ||
    (f === 'feitas' && c.direcao === 'SAINTE') ||
    (f === 'perdidas' && STATUS_PERDIDA.has(c.status));
  const visiveis = registros.filter((c) => passaBase(c) && passaFiltro(c, filtro));
  // Sem selecao automatica: o painel da direita mostra "Selecione uma chamada" ate a pessoa escolher uma.
  const chamada = visiveis.find((c) => c.id === selecionadaId) ?? null;

  return (
    <section aria-labelledby="titulo-historico" className="order-2 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)] xl:order-1">
      <div className="grid min-h-[460px] grid-cols-1 xl:grid-cols-[minmax(320px,30%)_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 px-5 pb-3 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center text-blue-600">
                  <IconeHistorico tamanho={23} />
                </span>
                <h2 id="titulo-historico" className="truncate text-base font-bold tracking-[-0.02em] text-slate-900">Histórico de chamadas</h2>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${somenteDemo ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                {somenteDemo ? '1 exemplo fictício' : cursor ? `${chamadas.length}+ chamadas` : `${chamadas.length} chamadas`}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Selecione uma ligação para ver os detalhes.</p>
            <div role="group" aria-label="Filtrar chamadas" className="mt-3 flex flex-wrap gap-1.5">
              {FILTROS.map((f) => {
                const ativo = filtro === f.id;
                const total = registros.filter((c) => passaBase(c) && passaFiltro(c, f.id)).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltro(f.id)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                      ativo ? 'border-blue-600 bg-blue-700 texto-sobre-cor-fixa' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {f.rotulo}
                    <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${ativo ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{total}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">Buscar nas chamadas carregadas por nome ou telefone</span>
                <IconeBusca tamanho={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 [&_svg]:stroke-2" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar no histórico…"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-primary)]"
                />
              </label>
              <FiltroPeriodo periodo={periodo} aoMudar={setPeriodo} />
            </div>
          </div>

          {visiveis.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-blue-600">
                <IconeTelefone tamanho={26} />
              </span>
              <p className="mt-4 text-sm font-bold text-slate-900">
                {somenteDemo ? 'Nenhum exemplo neste filtro' : 'Nenhuma chamada neste filtro'}
              </p>
              <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-slate-500">
                {somenteDemo ? 'Troque o filtro para ver o exemplo.' : 'Ainda não há registros de ligações para essa consulta.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[680px] overflow-y-auto">
                {visiveis.map((c) => {
                const recebida = c.direcao === 'ENTRANTE';
                const numero = recebida ? c.numeroOrigem : c.numeroDestino;
                const selecionada = chamada?.id === c.id;
                const perdida = recebida && STATUS_PERDIDA.has(c.status);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selecionada}
                    onClick={() => setSelecionadaId(c.id)}
                    className={`flex min-h-[88px] w-full items-start gap-3 border-b border-slate-100 px-5 py-3.5 text-left transition ${
                      selecionada ? 'bg-blue-50 shadow-[inset_3px_0_0_var(--brand-primary)]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      perdida ? 'bg-red-50 text-red-700' : recebida ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`} aria-hidden="true">
                      {recebida ? <IconeRecebida tamanho={16} /> : <IconeFeita tamanho={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{c.contato?.nome ?? numeroLegivel(numero)}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{dataHora(c.iniciadoEm)}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {somenteDemo ? 'AMOSTRA FICTÍCIA · ' : `${recebida ? 'Recebida' : 'Feita'} · `}{numeroLegivel(numero)}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CLASSE_STATUS[c.status]}`}>{LABEL_CHAMADA_STATUS[c.status]}</span>
                        <span className="text-xs tabular-nums text-slate-500">{relogio(c.duracao)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {cursor && <div className="p-3"><Button variante="neutro" tamanho="sm" onClick={onCarregarMais}>Carregar chamadas anteriores</Button></div>}
        </div>

        {chamada ? (() => {
          const recebida = chamada.direcao === 'ENTRANTE';
          const numero = recebida ? chamada.numeroOrigem : chamada.numeroDestino;
          const audioInterno = Boolean(chamada.gravacaoUrl?.startsWith('/api/arquivos/'));
          return (
            <div className="min-w-0 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-700">
                    {(chamada.contato?.nome ?? numeroLegivel(numero)).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold tracking-[-0.02em] text-slate-900">{chamada.contato?.nome ?? numeroLegivel(numero)}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {numeroLegivel(numero)}{chamada.linha ? ` · linha ${chamada.linha.nome ?? chamada.linha.donoNome ?? 'WhatsApp'}` : ''}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {aoLigar && !somenteDemo && numero && (
                    <button
                      type="button"
                      onClick={() => aoLigar(numero)}
                      className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ${recebida && STATUS_PERDIDA.has(chamada.status) ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                      Ligar para o cliente
                    </button>
                  )}
                  {aoCriarContato && !somenteDemo && !chamada.contato && numero && (
                    <button
                      type="button"
                      onClick={() => {
                        const nome = window.prompt(`Nome do contato para ${numeroLegivel(numero)}:`)?.trim();
                        if (nome) void aoCriarContato(chamada, nome);
                      }}
                      className="inline-flex h-8 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Criar contato
                    </button>
                  )}
                  {aoExcluir && !somenteDemo && (
                    <button
                      type="button"
                      disabled={excluindo}
                      onClick={async () => {
                        const quem = chamada.contato?.nome ?? numeroLegivel(numero);
                        if (!window.confirm(`Apagar esta chamada (${quem}, ${dataHora(chamada.iniciadoEm)})? A gravação, a transcrição e o resumo também serão apagados. Isso não pode ser desfeito.`)) return;
                        setExcluindo(true);
                        try { await aoExcluir(chamada); } finally { setExcluindo(false); }
                      }}
                      className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {excluindo ? 'Apagando…' : 'Apagar'}
                    </button>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${recebida ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{recebida ? 'Recebida' : 'Feita'}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${CLASSE_STATUS[chamada.status]}`}>{LABEL_CHAMADA_STATUS[chamada.status]}</span>
                </div>
              </div>

              <h3 className="mt-4 text-sm font-bold text-slate-900">Informações da chamada</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
                {[
                  ['Data e horário', dataHora(chamada.iniciadoEm)],
                  ['Duração', relogio(chamada.duracao)],
                  ['Direção', recebida ? 'Recebida' : 'Feita'],
                  ['Status', LABEL_CHAMADA_STATUS[chamada.status]],
                  ['Atendente', chamada.agente?.nome ?? '—'],
                  ['Custo', custoCurto(chamada.custo)],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <dt className="text-[11px] font-medium text-slate-500">{rotulo}</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-900">{valor}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Gravação da chamada</h3>
                </div>
                {audioInterno && <a href={chamada.gravacaoUrl!} download className="text-xs font-semibold text-blue-700 hover:underline">Baixar áudio ↓</a>}
              </div>
              {somenteDemo && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Demonstração fictícia. Não é uma chamada real e não foi salva.</div>}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:p-4">
                {somenteDemo ? (
                  <div className="flex items-center gap-3" aria-label="Prévia visual do player de áudio; sem arquivo de som">
                    <button type="button" disabled aria-label="Reprodução indisponível na amostra" className="flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-slate-300 text-white">▶</button>
                    <div className="min-w-0 flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/3 rounded-full bg-blue-500" /></div>
                      <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Prévia do player</span><span>03:47</span></div>
                    </div>
                    <span className="text-[10px] text-slate-500">Sem áudio</span>
                  </div>
                ) : audioInterno ? (
                  <audio controls preload="metadata" src={chamada.gravacaoUrl!} className="h-10 w-full" aria-label={`Ouvir gravação da chamada com ${chamada.contato?.nome ?? numeroLegivel(numero)}`} />
                ) : chamada.gravacaoUrl ? (
                  <p className="text-xs leading-relaxed text-slate-600">A gravação está hospedada no provedor e não pode ser reproduzida pelo player da plataforma.</p>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-600">Esta chamada ainda não tem uma gravação disponível.</p>
                )}
              </div>

              {somenteDemo ? <div className="mt-5 space-y-5 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Resumo da chamada</h3>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">Exemplo fictício</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">Marcos ligou para consultar a disponibilidade de um produto. O atendente confirmou o estoque e combinou enviar as opções e os valores pelo WhatsApp.</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transcrição</h4>
                  <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                    <p><strong className="text-slate-900">Marcos:</strong> Olá, vocês têm esse modelo disponível?</p>
                    <p><strong className="text-slate-900">Atendente:</strong> Temos sim. Vou confirmar as cores e te mando as opções pelo WhatsApp.</p>
                    <p><strong className="text-slate-900">Marcos:</strong> Perfeito, pode enviar também os valores?</p>
                    <p><strong className="text-slate-900">Atendente:</strong> Claro, envio tudo por mensagem ainda hoje.</p>
                  </div>
                </div>
              </div> : <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <AssistenteDaLigacao key={chamada.id} chamadaId={chamada.id} />
              </div>}
              {!somenteDemo && <p className="mt-3 text-[11px] text-slate-400">A transcrição e o resumo aparecem quando o processamento da chamada estiver concluído.</p>}
            </div>
          );
        })() : (
          <div className="flex min-h-[420px] flex-col items-center justify-center bg-gradient-to-br from-blue-50/30 via-white to-blue-50/20 px-6 text-center">
            <IlustracaoSelecioneChamada />
            <h3 className="mt-1 text-lg font-bold tracking-[-0.03em] text-slate-900">Selecione uma chamada</h3>
            <p className="mt-1.5 max-w-[580px] text-[13px] leading-relaxed text-slate-600">Os detalhes, a gravação e a análise da ligação serão exibidos aqui.</p>
          </div>
        )}
      </div>
      <div className="border-t border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <IconeInfo tamanho={15} className="shrink-0 text-blue-600" />
          Cada ligação também aparece na linha do tempo do contato no CRM.
        </p>
      </div>
    </section>
  );
}
