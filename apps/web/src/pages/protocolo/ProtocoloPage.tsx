import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Card, Field, Input, Select } from '../../components/ui';
import { Gaveta } from '../../components/ui/Gaveta';
import { CampoBusca, Pilula, iniciais } from '../../components/ui/Pagina';
import { ApiError, api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import {
  COR_PRIORIDADE,
  LABEL_PRIORIDADE,
  LABEL_STATUS_PROTOCOLO,
  LABEL_TIPO_TI,
  PRIORIDADES_PROTOCOLO,
  STATUS_PROTOCOLO,
  type Contato,
  type Protocolo,
  type TicketPrioridade,
  type TicketStatus,
  type Usuario,
} from '../../lib/types';
import { DetalheProtocolo } from './DetalheProtocolo';

type Colunas = Record<TicketStatus, Protocolo[]>;

const vazio: Colunas = {
  ABERTO: [],
  EM_ANDAMENTO: [],
  AGUARDANDO_CLIENTE: [],
  RESOLVIDO: [],
  FECHADO: [],
};

const STATUS_HISTORICO_TI: TicketStatus[] = ['ABERTO', 'EM_ANDAMENTO', 'RESOLVIDO', 'FECHADO'];

/** Cor de cada status: ponto no cabecalho da coluna e na pilula do historico. */
const COR_STATUS: Record<TicketStatus, string> = {
  ABERTO: '#DC2626',
  EM_ANDAMENTO: '#F59E0B',
  AGUARDANDO_CLIENTE: '#3B82F6',
  RESOLVIDO: '#10B981',
  FECHADO: '#94A3B8',
};

const diaMes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function ProtocoloPage({ somenteTi = false }: { somenteTi?: boolean }) {
  const [colunas, setColunas] = useState<Colunas>(vazio);
  const [aberto, setAberto] = useState<Protocolo | null>(null);
  const [agentes, setAgentes] = useState<Usuario[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [filtros, setFiltros] = useState({
    prioridade: '', responsavelId: '', slaVencido: '', busca: '', categoria: somenteTi ? 'TI_INTERNO' : '',
  });
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvoDrop, setAlvoDrop] = useState<TicketStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'NORMAL' as TicketPrioridade,
    contatoId: '',
    prazoSla: '',
  });

  const carregar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filtros.prioridade) qs.set('prioridade', filtros.prioridade);
    if (filtros.responsavelId) qs.set('responsavelId', filtros.responsavelId);
    if (filtros.slaVencido) qs.set('slaVencido', filtros.slaVencido);
    if (filtros.categoria) qs.set('categoria', filtros.categoria);
    if (filtros.busca.trim()) qs.set('busca', filtros.busca.trim());

    try {
      const { colunas: c } = await api.get<{ colunas: Colunas }>(`/protocolos/kanban?${qs}`);
      setColunas({ ...vazio, ...c });
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar chamados');
    }
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    void Promise.all([
      api.get<{ usuarios: Usuario[] }>('/usuarios'),
      api.get<{ contatos: Contato[] }>('/contatos'),
    ])
      .then(([u, c]) => {
        setAgentes(u.usuarios.filter((x) => x.ativo));
        setContatos(c.contatos);
      })
      .catch(() => undefined);
  }, []);

  // Chamados alterados por outros usuarios chegam por WebSocket.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });

    const aoAtualizar = (protocolo: Protocolo) => {
      setColunas((atual) => {
        const limpo = Object.fromEntries(
          STATUS_PROTOCOLO.map((s) => [s, atual[s].filter((p) => p.id !== protocolo.id)]),
        ) as Colunas;
        if (somenteTi && protocolo.categoria !== 'TI_INTERNO') return limpo;
        limpo[protocolo.status] = [protocolo, ...limpo[protocolo.status]];
        return limpo;
      });
      setAberto((atual) => (atual && atual.id === protocolo.id ? protocolo : atual));
    };

    socket.on(EVENTOS.protocoloAtualizado, aoAtualizar);
    return () => {
      socket.off(EVENTOS.protocoloAtualizado, aoAtualizar);
      socket.disconnect();
    };
  }, [somenteTi]);

  const mover = async (status: TicketStatus) => {
    const id = arrastando;
    setArrastando(null);
    setAlvoDrop(null);
    if (!id) return;
    try {
      const { protocolo } = await api.patch<{ protocolo: Protocolo }>(`/protocolos/${id}`, { status });
      if (aberto?.id === id) setAberto(protocolo);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover o chamado');
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { protocolo } = await api.post<{ protocolo: Protocolo }>('/protocolos', {
        titulo: novo.titulo,
        descricao: novo.descricao,
        prioridade: novo.prioridade,
        ...(novo.contatoId ? { contatoId: novo.contatoId } : {}),
        ...(novo.prazoSla ? { prazoSla: novo.prazoSla } : {}),
      });
      setNovo({ titulo: '', descricao: '', prioridade: 'NORMAL', contatoId: '', prazoSla: '' });
      setAberto(protocolo);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao abrir chamado');
    }
  };

  const rotuloStatus = (status: TicketStatus) =>
    somenteTi && status === 'FECHADO' ? 'Concluídos' : LABEL_STATUS_PROTOCOLO[status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <CampoBusca
          valor={filtros.busca}
          aoMudar={(busca) => setFiltros({ ...filtros, busca })}
          placeholder="Título, descrição, contato ou número"
          rotulo="Buscar chamado"
        />
        {!somenteTi && (
          <div className="w-40">
            <Select aria-label="Categoria" value={filtros.categoria} onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })}>
              <option value="">Categoria: todas</option>
              <option value="ATENDIMENTO">Atendimento</option>
              <option value="TI_INTERNO">TI interno</option>
            </Select>
          </div>
        )}
        {!somenteTi && (
          <div className="w-40">
            <Select aria-label="Prioridade" value={filtros.prioridade} onChange={(e) => setFiltros({ ...filtros, prioridade: e.target.value })}>
              <option value="">Prioridade: todas</option>
              {PRIORIDADES_PROTOCOLO.map((p) => (
                <option key={p} value={p}>{LABEL_PRIORIDADE[p]}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-full sm:w-52">
          <Select aria-label="Responsável" value={filtros.responsavelId} onChange={(e) => setFiltros({ ...filtros, responsavelId: e.target.value })}>
            <option value="">Responsável: todos</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </Select>
        </div>
        {!somenteTi && (
          <div className="w-40">
            <Select aria-label="SLA" value={filtros.slaVencido} onChange={(e) => setFiltros({ ...filtros, slaVencido: e.target.value })}>
              <option value="">SLA: todos</option>
              <option value="true">Somente vencidos</option>
            </Select>
          </div>
        )}
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="flex gap-3.5 overflow-x-auto pb-2">
        {STATUS_PROTOCOLO.filter((status) =>
          !somenteTi || status !== 'AGUARDANDO_CLIENTE',
        ).map((status) => {
          const lista = colunas[status];
          const vencidos = lista.filter((p) => p.slaVencido).length;
          const destacar = alvoDrop === status && arrastando !== null;
          return (
            <section
              key={status}
              aria-label={rotuloStatus(status)}
              onDragOver={(e) => {
                e.preventDefault();
                if (alvoDrop !== status) setAlvoDrop(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvoDrop(null);
              }}
              onDrop={() => void mover(status)}
              className={`flex h-[440px] min-w-[240px] flex-1 basis-0 flex-col rounded-2xl p-2.5 transition ${
                destacar ? 'bg-blue-50 ring-2 ring-blue-500' : 'bg-slate-200/60'
              }`}
            >
              <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_STATUS[status] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-900">{rotuloStatus(status)}</span>
                {vencidos > 0 && (
                  <span className="whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                    {vencidos} SLA
                  </span>
                )}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700">{lista.length}</span>
              </header>
              <ul className="barra-rolagem-cinza flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {lista.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">Nenhum chamado</li>
                )}
                {lista.map((p) => (
                  <li
                    key={p.id}
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={`Chamado ${p.numero}: ${p.titulo}`}
                    onDragStart={() => setArrastando(p.id)}
                    onDragEnd={() => {
                      setArrastando(null);
                      setAlvoDrop(null);
                    }}
                    onClick={() => setAberto(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setAberto(p);
                      }
                    }}
                    className={`anel-de-foco flex cursor-grab flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm transition hover:border-slate-300 active:cursor-grabbing ${
                      aberto?.id === p.id ? 'border-[var(--brand-primary)]' : 'border-slate-200'
                    } ${arrastando === p.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs tabular-nums text-slate-500">#{p.numero}</span>
                      {p.tipoTi && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.tipoTi === 'ERRO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {LABEL_TIPO_TI[p.tipoTi]}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_PRIORIDADE[p.prioridade]}`}>
                        {LABEL_PRIORIDADE[p.prioridade]}
                      </span>
                      {p.slaVencido && <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">SLA</span>}
                    </div>
                    <p className="line-clamp-2 text-[13.5px] font-bold leading-snug text-slate-900">{p.titulo}</p>
                    {!p.tipoTi && <p className="truncate text-xs text-slate-500">{p.contato?.nome ?? 'Sem contato'}</p>}
                    {(p.categoria === 'TI_INTERNO' && !somenteTi) || p.agendamentos.some((a) => !a.concluido) ? (
                      <div className="flex flex-wrap gap-1">
                        {p.categoria === 'TI_INTERNO' && !somenteTi && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">TI interno</span>
                        )}
                        {p.agendamentos.some((a) => !a.concluido) && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">agendado</span>
                        )}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10.5px] font-bold text-blue-700" aria-hidden="true">
                        {p.responsavel ? iniciais(p.responsavel.nome) : '—'}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{p.responsavel?.nome ?? 'Sem responsável'}</span>
                      <span className="tabular-nums">{diaMes(p.criadoEm)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {somenteTi && (() => {
        const historico = Object.values(colunas)
          .flat()
          .filter((p) => STATUS_HISTORICO_TI.includes(p.status))
          .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
        return (
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="historico-ti">
            <div className="flex flex-wrap items-baseline gap-2.5 px-5 py-4">
              <h2 id="historico-ti" className="text-[15px] font-bold text-slate-900">Histórico de chamados de TI</h2>
              <span className="text-[12.5px] text-slate-500">{historico.length} chamado(s), do mais recente ao mais antigo</span>
            </div>
            {historico.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-500">Nenhum chamado de TI encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-y border-slate-200 bg-slate-50 text-[11.5px] text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Chamado</th>
                      <th className="px-4 py-2.5 font-semibold">Descrição</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Aberto em</th>
                      <th className="px-4 py-2.5 font-semibold">Solicitante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historico.map((p) => (
                      <tr key={p.id} className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setAberto(p)}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-slate-500">#{p.numero}</p>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setAberto(p); }} className="mt-1 text-left font-bold text-slate-900 hover:underline">
                            {p.titulo}
                          </button>
                          <p className="mt-0.5 text-xs text-slate-500">{p.tipoTi ? LABEL_TIPO_TI[p.tipoTi] : 'Chamado de TI'}</p>
                        </td>
                        <td className="max-w-lg whitespace-pre-wrap px-4 py-3 text-slate-600">
                          <span className="line-clamp-3">{p.descricao}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Pilula cor={COR_STATUS[p.status]}>
                            {somenteTi && p.status === 'FECHADO' ? 'Concluído' : LABEL_STATUS_PROTOCOLO[p.status]}
                          </Pilula>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                          {new Date(p.criadoEm).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.solicitante?.nome ?? 'Não identificado'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })()}

      {!somenteTi && (
        <Card titulo="Novo chamado" descricao="Clique em um cartão para abrir os detalhes">
          <form onSubmit={criar} className="grid gap-3 sm:grid-cols-2">
            <Field label="Título">
              <Input required value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
            </Field>
            <Field label="Contato">
              <Select value={novo.contatoId} onChange={(e) => setNovo({ ...novo, contatoId: e.target.value })}>
                <option value="">Sem contato</option>
                {contatos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select
                value={novo.prioridade}
                onChange={(e) => setNovo({ ...novo, prioridade: e.target.value as TicketPrioridade })}
              >
                {PRIORIDADES_PROTOCOLO.map((p) => (
                  <option key={p} value={p}>{LABEL_PRIORIDADE[p]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Prazo de SLA">
              <Input
                type="datetime-local"
                value={novo.prazoSla}
                onChange={(e) => setNovo({ ...novo, prazoSla: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descrição">
                <textarea
                  required
                  rows={3}
                  value={novo.descricao}
                  onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
                />
              </Field>
            </div>
            <Button type="submit" className="sm:col-span-2">Abrir chamado</Button>
          </form>
        </Card>
      )}

      <Gaveta
        aberta={aberto !== null}
        titulo={aberto ? `#${aberto.numero} · ${aberto.titulo}` : ''}
        aoFechar={() => setAberto(null)}
        largura="max-w-xl"
      >
        {aberto && (
          <DetalheProtocolo
            protocolo={aberto}
            onMudou={(p) => {
              setAberto(p.status === 'FECHADO' ? null : p);
              void carregar();
            }}
          />
        )}
      </Gaveta>
    </div>
  );
}
