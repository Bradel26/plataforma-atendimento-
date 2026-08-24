import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api, getAccessToken } from '../../lib/api';
import { EVENTOS, conectar } from '../../lib/realtime';
import {
  COR_PRIORIDADE,
  LABEL_PRIORIDADE,
  LABEL_STATUS_PROTOCOLO,
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

export function ProtocoloPage() {
  const [colunas, setColunas] = useState<Colunas>(vazio);
  const [aberto, setAberto] = useState<Protocolo | null>(null);
  const [agentes, setAgentes] = useState<Usuario[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [filtros, setFiltros] = useState({ prioridade: '', responsavelId: '', slaVencido: '', busca: '' });
  const [arrastando, setArrastando] = useState<string | null>(null);
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
  }, []);

  const mover = async (status: TicketStatus) => {
    const id = arrastando;
    setArrastando(null);
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

  return (
    <div className="space-y-5">
      <Card titulo="Filtros">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Prioridade">
            <Select
              value={filtros.prioridade}
              onChange={(e) => setFiltros({ ...filtros, prioridade: e.target.value })}
            >
              <option value="">Todas</option>
              {PRIORIDADES_PROTOCOLO.map((p) => (
                <option key={p} value={p}>{LABEL_PRIORIDADE[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsavel">
            <Select
              value={filtros.responsavelId}
              onChange={(e) => setFiltros({ ...filtros, responsavelId: e.target.value })}
            >
              <option value="">Todos</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="SLA">
            <Select value={filtros.slaVencido} onChange={(e) => setFiltros({ ...filtros, slaVencido: e.target.value })}>
              <option value="">Todos</option>
              <option value="true">Somente vencidos</option>
            </Select>
          </Field>
          <Field label="Busca" hint="Titulo, descricao, contato ou numero">
            <Input value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUS_PROTOCOLO.map((status) => {
          const lista = colunas[status];
          const vencidos = lista.filter((p) => p.slaVencido).length;
          return (
            <div
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void mover(status)}
              className="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50"
            >
              <header className="border-b border-slate-200 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-700">{LABEL_STATUS_PROTOCOLO[status]}</p>
                <p className="text-xs text-slate-500">
                  {lista.length} chamado{lista.length === 1 ? '' : 's'}
                  {vencidos > 0 ? ` · ${vencidos} com SLA vencido` : ''}
                </p>
              </header>
              <ul className="min-h-24 flex-1 space-y-2 p-2">
                {lista.map((p) => (
                  <li
                    key={p.id}
                    draggable
                    onDragStart={() => setArrastando(p.id)}
                    onClick={() => setAberto(p)}
                    className={`cursor-grab rounded-lg border bg-white p-2.5 shadow-sm active:cursor-grabbing ${
                      aberto?.id === p.id ? 'border-[var(--brand-primary)]' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400">#{p.numero}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_PRIORIDADE[p.prioridade]}`}>
                        {LABEL_PRIORIDADE[p.prioridade]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-slate-800">{p.titulo}</p>
                    <p className="truncate text-xs text-slate-500">{p.contato?.nome ?? 'Sem contato'}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.responsavel && <Badge tom="marca">{p.responsavel.nome}</Badge>}
                      {p.slaVencido && <Badge tom="alerta">SLA</Badge>}
                      {p.agendamentos.some((a) => !a.concluido) && <Badge tom="neutro">agendado</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {aberto ? (
        <>
          <Button variante="neutro" onClick={() => setAberto(null)}>
            Fechar detalhe e abrir novo chamado
          </Button>
          <DetalheProtocolo
            protocolo={aberto}
            agentes={agentes}
            onMudou={(p) => {
              setAberto(p);
              void carregar();
            }}
          />
        </>
      ) : (
        <Card titulo="Novo chamado" descricao="Clique num cartao para abrir o detalhe">
          <form onSubmit={criar} className="grid gap-3 sm:grid-cols-2">
            <Field label="Titulo">
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
              <Field label="Descricao">
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
    </div>
  );
}
