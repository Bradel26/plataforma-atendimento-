import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, EmptyState } from '../../../components/ui';
import { ApiError, api, getAccessToken } from '../../../lib/api';
import { conectar, EVENTOS } from '../../../lib/realtime';
import {
  LABEL_TIPO_EVENTO,
  moeda,
  type EventoFicha,
  type Timeline,
  type TipoEvento,
} from '../../../lib/types';

/**
 * A vida do cliente em ordem cronologica: conversa, ligacao, atividade,
 * protocolo, oportunidade, mudanca de etapa, lead e pesquisa, num fluxo unico.
 *
 * A uniao acontece no banco (um `UNION ALL` com cursor sobre o conjunto), e nao
 * aqui: juntando na tela, o "carregar mais" traria a segunda pagina de cada
 * fonte em vez da continuacao da lista — e a ordem se desfaria no meio.
 */

/**
 * Cor por tipo de evento. Existe para o olho achar o que procura ao rolar, nao
 * para decorar: quem abre a ficha esta caçando "quando foi a ultima ligacao".
 */
const COR: Record<TipoEvento, string> = {
  CONVERSA: 'bg-sky-500',
  CHAMADA: 'bg-violet-500',
  ATIVIDADE: 'bg-amber-500',
  PROTOCOLO: 'bg-rose-500',
  OPORTUNIDADE: 'bg-emerald-500',
  ETAPA: 'bg-teal-500',
  LEAD: 'bg-indigo-500',
  PESQUISA: 'bg-fuchsia-500',
  CREDENCIAMENTO: 'bg-teal-500',
};

const LIMITE = 30;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const diaLegivel = (iso: string) => {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(data, hoje)) return 'Hoje';
  if (mesmoDia(data, ontem)) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const chave = (iso: string) => new Date(iso).toDateString();

type Props = {
  /** `/ficha/contato/:id` ou `/ficha/conta/:id`. */
  base: string;
  /** Muda quando o registro aberto muda: zera a lista e o cursor. */
  raizId: string;
  /** Recarrega quando o pai registra algo novo. */
  recarregar?: number;
  /** Eventos temporarios de demonstração, somente para ficha ficticia em dev. */
  eventosDemonstracao?: boolean;
};

export function LinhaDoTempo({ base, raizId, recarregar = 0, eventosDemonstracao = false }: Props) {
  const [eventos, setEventos] = useState<EventoFicha[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tipos, setTipos] = useState<TipoEvento[]>([]);
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<'TODOS' | 'HOJE' | '7_DIAS' | '30_DIAS'>('TODOS');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Lista vazia = sem filtro (todos os tipos). Guardar os oito selecionados
  // daria o mesmo resultado com uma URL tres vezes maior.
  const filtrando = tipos.length > 0;
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const agoraDemo = Date.now();
  const eventosDemo: EventoFicha[] = eventosDemonstracao ? [
    { tipo: 'ATIVIDADE', id: 'demo-nota-1', ocorridoEm: new Date(agoraDemo - 26 * 60 * 60_000).toISOString(), titulo: 'Primeiro contato', detalhe: 'Registro fictício para testar o resumo do histórico. O cliente demonstrou interesse em conhecer os serviços; ficou combinado enviar informações e retornar em dois dias.', canal: null, situacao: 'Nota manual', valor: null, referencia: null, escopo: 'CONTATO', usuario: 'Administrador' },
  ] : [];
  const eventosBase = [...eventosDemo, ...eventos].sort((a, b) => new Date(b.ocorridoEm).getTime() - new Date(a.ocorridoEm).getTime());
  const limitePeriodo = periodo === 'HOJE' ? 24 * 60 * 60_000 : periodo === '7_DIAS' ? 7 * 24 * 60 * 60_000 : periodo === '30_DIAS' ? 30 * 24 * 60 * 60_000 : null;
  const eventosVisiveis = eventosBase.filter((evento) =>
    (!limitePeriodo || agoraDemo - new Date(evento.ocorridoEm).getTime() <= limitePeriodo) &&
    (!termo || [evento.titulo, evento.detalhe, evento.usuario, evento.canal, evento.situacao, LABEL_TIPO_EVENTO[evento.tipo]]
      .some((valor) => valor?.toLocaleLowerCase('pt-BR').includes(termo))),
  ).filter((evento) => tipos.length === 0 || tipos.includes(evento.tipo) || (tipos.includes('ETAPA') && ['OPORTUNIDADE', 'LEAD', 'PESQUISA', 'CREDENCIAMENTO'].includes(evento.tipo)));

  const buscar = useCallback(
    async (de: string | null) => {
      setCarregando(true);
      setErro(null);
      try {
        const qs = new URLSearchParams({ limite: String(LIMITE) });
        if (filtrando) qs.set('tipos', tipos.join(','));
        if (de) qs.set('cursor', de);

        const dados = await api.get<Timeline>(`${base}/timeline?${qs}`);
        // Concatena quando e continuacao; substitui quando e a primeira pagina.
        setEventos((atuais) => (de ? [...atuais, ...dados.eventos] : dados.eventos));
        setCursor(dados.proximoCursor);
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a linha do tempo');
      } finally {
        setCarregando(false);
      }
    },
    [base, filtrando, tipos],
  );

  useEffect(() => {
    setEventos([]);
    setCursor(null);
    void buscar(null);
  }, [buscar, raizId, recarregar]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    socket.on(EVENTOS.chamadaAtualizada, (chamada: { contatoId?: string | null }) => {
      if (chamada.contatoId === raizId) void buscar(null);
    });
    return () => {
      socket.disconnect();
    };
  }, [buscar, raizId]);

  const filtros = [
    { label: 'Conversas', tipos: ['CONVERSA'] as TipoEvento[] },
    { label: 'Ligações', tipos: ['CHAMADA'] as TipoEvento[] },
    { label: 'Atividades', tipos: ['ATIVIDADE'] as TipoEvento[] },
    { label: 'Protocolos', tipos: ['PROTOCOLO'] as TipoEvento[] },
    { label: 'Etapas e leads', tipos: ['OPORTUNIDADE', 'ETAPA', 'LEAD', 'PESQUISA', 'CREDENCIAMENTO'] as TipoEvento[] },
  ];
  const alternar = (grupo: TipoEvento[]) => setTipos((atuais) => {
    const todosAtivos = grupo.every((tipo) => atuais.includes(tipo));
    return todosAtivos ? atuais.filter((tipo) => !grupo.includes(tipo)) : [...new Set([...atuais, ...grupo])];
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Buscar na linha do tempo</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="⌕  Buscar em mensagens, notas e transcrições" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="sr-only" htmlFor="periodo-linha-do-tempo">Período</label>
        <select id="periodo-linha-do-tempo" value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:border-blue-400 focus:outline-none">
          <option value="TODOS">Todo o período</option><option value="HOJE">Hoje</option><option value="7_DIAS">Últimos 7 dias</option><option value="30_DIAS">Últimos 30 dias</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTipos([])}
          className={`rounded-full border px-2.5 py-1 text-xs transition ${
            filtrando
              ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
              : 'border-blue-600 bg-blue-600 font-medium text-white'
          }`}
        >
          Tudo
        </button>
        {filtros.map((grupo) => {
          const ativo = grupo.tipos.every((tipo) => tipos.includes(tipo));
          return (
            <button
              key={grupo.label}
              type="button"
              onClick={() => alternar(grupo.tipos)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                ativo
                  ? 'border-blue-600 bg-blue-600 font-medium text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {grupo.label}
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="mt-3">
          <Alerta>{erro}</Alerta>
        </div>
      )}

      <div className="mt-4">
        {eventosVisiveis.length === 0 && !carregando ? (
          <EmptyState
            titulo={termo ? 'Nenhum resultado para esta busca' : filtrando ? 'Nada neste filtro' : 'Sem histórico'}
            descricao={
              termo
                ? 'Experimente outros termos ou carregue mais eventos para ampliar a busca.'
                : filtrando
                ? 'Nenhum evento dos tipos selecionados. Tire um filtro para ver o resto.'
                : 'Assim que houver conversa, ligação, proposta ou atividade, aparece aqui.'
            }
          />
        ) : (
          <ol className="relative">
            {eventosVisiveis.map((evento, indice) => {
              const anterior = eventosVisiveis[indice - 1];
              const novoDia = !anterior || chave(anterior.ocorridoEm) !== chave(evento.ocorridoEm);
              const notaDemo = evento.id === 'demo-nota-1';
              const dataEvento = new Date(evento.ocorridoEm);
              const dataTitulo = dataEvento.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

              return (
                <li key={`${evento.tipo}-${evento.id}`}>
                  {novoDia && (
                    <p className="pb-2 pt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500 first:pt-0">{diaLegivel(evento.ocorridoEm)} · {dataTitulo} <span className="ml-4 font-normal normal-case">{eventosVisiveis.filter((item) => chave(item.ocorridoEm) === chave(evento.ocorridoEm)).length} registro(s)</span></p>
                  )}
                  <div className="mb-2 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {/* A linha vertical liga os pontos e some no ultimo item. */}
                    <div className="flex flex-col items-center">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${notaDemo ? 'bg-amber-50 text-amber-700' : `${COR[evento.tipo]} text-white`}`} aria-hidden>{notaDemo ? 'N' : LABEL_TIPO_EVENTO[evento.tipo].slice(0, 1)}</span>
                    </div>

                    <div className="min-w-0 flex-1 pb-4">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {/* <time> e nao <span>: o horario exibido e curto (so
                            hora e minuto), e o `dateTime` guarda o instante
                            completo — leitor de tela anuncia a data inteira, e o
                            teste confere a ordem pelo valor real. */}
                        <time
                          dateTime={evento.ocorridoEm}
                          className="text-xs tabular-nums text-slate-500"
                        >
                          {hora(evento.ocorridoEm)}
                        </time>
                        <span className="text-xs text-slate-500">{evento.situacao ?? LABEL_TIPO_EVENTO[evento.tipo]}</span>
                        {/* Marca so o que vem da empresa: na ficha do contato, o
                            resto e dele, e um selo em cada linha seria ruido. */}
                        {evento.escopo === 'CONTA' && <Badge>Da empresa</Badge>}
                        {evento.canal && <Badge>{evento.canal}</Badge>}
                        {evento.situacao && <Badge tom="marca">{evento.situacao}</Badge>}
                        {evento.valor !== null && <Badge tom="sucesso">{moeda(evento.valor)}</Badge>}
                      </div>

                      <p className="mt-0.5 text-sm font-medium text-slate-800">{evento.titulo}</p>
                      {evento.detalhe && (
                        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-700">{evento.detalhe}</p>
                      )}
                      {evento.tipo === 'CHAMADA' && evento.gravacaoUrl && (
                        <audio className="mt-3 h-9 w-full max-w-md" controls preload="none" src={evento.gravacaoUrl} aria-label={`Gravação da chamada: ${evento.titulo}`} />
                      )}
                      {notaDemo && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] font-medium text-amber-800">● &nbsp;Retorno citado na nota; ainda sem tarefa agendada.</p>}
                      <div className="mt-3 flex justify-between gap-2 text-[10px]"><span className="text-slate-500">Registro manual · histórico original preservado</span><button type="button" className="font-semibold text-blue-600 hover:underline">Ver detalhes</button></div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {eventosDemonstracao && <div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="mb-1 block size-2 rounded-full bg-blue-600"/><p className="text-[11px] font-semibold text-slate-900">Conversas</p><p className="mt-1 text-[10px] text-slate-500">Nenhuma conversa registrada para este contato.</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="mb-1 block size-2 rounded-full bg-violet-600"/><p className="text-[11px] font-semibold text-slate-900">Ligações</p><p className="mt-1 text-[10px] text-slate-500">Nenhuma ligação registrada para este contato.</p></div></div>}

        <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[10px] text-slate-500"><span>Mostrando todos os registros encontrados.</span>{cursor && <button type="button" onClick={() => void buscar(cursor)} disabled={carregando} className="font-semibold text-blue-600 disabled:opacity-50">Carregar anteriores</button>}</div>

        {carregando && eventos.length === 0 && !eventosDemonstracao && <p className="text-sm text-slate-500">Carregando histórico...</p>}
      </div>
    </div>
  );
}
