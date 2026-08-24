import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  FASES_LEAD,
  LABEL_FASE_LEAD,
  LABEL_MOTIVO_PERDA,
  LABEL_TIPO_LEAD,
  moeda,
  type Contato,
  type Lead,
  type LeadFase,
  type LeadTipo,
  type MotivoPerda,
  type Usuario,
} from '../../lib/types';

type Colunas = Record<LeadFase, Lead[]>;

const MOTIVOS: MotivoPerda[] = ['PRECO', 'SEM_INTERESSE', 'CONCORRENTE', 'SEM_BUDGET', 'SEM_RESPOSTA', 'OUTRO'];
const TIPOS: LeadTipo[] = ['INBOUND', 'OUTBOUND', 'INDICACAO', 'PARCEIRO'];

const vazio: Colunas = { NOVO: [], QUALIFICACAO: [], PROPOSTA: [], NEGOCIACAO: [], GANHO: [], PERDIDO: [] };

function Cartao({ lead, aoArrastar }: { lead: Lead; aoArrastar: (id: string) => void }) {
  const atrasado =
    lead.prazo && !['GANHO', 'PERDIDO'].includes(lead.fase) && new Date(lead.prazo) < new Date();

  return (
    <li
      draggable
      onDragStart={() => aoArrastar(lead.id)}
      className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing"
    >
      <p className="truncate text-sm font-medium text-slate-800">{lead.contato.nome}</p>
      {lead.conta && <p className="truncate text-xs text-slate-500">{lead.conta.nome}</p>}
      <p className="mt-1 text-xs font-medium text-slate-700">{moeda(lead.valorEstimado)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Badge tom="neutro">{LABEL_TIPO_LEAD[lead.tipo]}</Badge>
        {lead.responsavel && <Badge tom="marca">{lead.responsavel.nome}</Badge>}
        {atrasado && <Badge tom="alerta">Atrasado</Badge>}
        {lead.motivoPerda && <Badge tom="neutro">{LABEL_MOTIVO_PERDA[lead.motivoPerda]}</Badge>}
      </div>
    </li>
  );
}

export function LeadsTab() {
  const [colunas, setColunas] = useState<Colunas>(vazio);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [agentes, setAgentes] = useState<Usuario[]>([]);
  const [filtros, setFiltros] = useState({ tipo: '', responsavelId: '', atrasados: '', busca: '' });
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState({ contatoId: '', tipo: 'INBOUND' as LeadTipo, valorEstimado: '', prazo: '' });

  const carregar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filtros.tipo) qs.set('tipo', filtros.tipo);
    if (filtros.responsavelId) qs.set('responsavelId', filtros.responsavelId);
    if (filtros.atrasados) qs.set('atrasados', filtros.atrasados);
    if (filtros.busca.trim()) qs.set('busca', filtros.busca.trim());

    try {
      const { colunas: c } = await api.get<{ colunas: Colunas }>(`/leads/kanban?${qs}`);
      setColunas({ ...vazio, ...c });
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar leads');
    }
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    void Promise.all([
      api.get<{ contatos: Contato[] }>('/contatos'),
      api.get<{ usuarios: Usuario[] }>('/usuarios'),
    ])
      .then(([c, u]) => {
        setContatos(c.contatos);
        setAgentes(u.usuarios.filter((x) => x.perfil !== 'ADMIN'));
      })
      .catch(() => undefined);
  }, []);

  /** Arrastar para PERDIDO exige motivo — pedimos antes de enviar. */
  const soltarEm = async (fase: LeadFase) => {
    const id = arrastando;
    setArrastando(null);
    if (!id) return;

    const corpo: { fase: LeadFase; motivoPerda?: MotivoPerda } = { fase };
    if (fase === 'PERDIDO') {
      const escolha = window.prompt(`Motivo da perda (${MOTIVOS.join(', ')})`, 'SEM_RESPOSTA');
      if (!escolha) return;
      if (!MOTIVOS.includes(escolha as MotivoPerda)) {
        setErro(`Motivo invalido: ${escolha}`);
        return;
      }
      corpo.motivoPerda = escolha as MotivoPerda;
    }

    try {
      await api.patch(`/leads/${id}`, corpo);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover o lead');
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/leads', {
        contatoId: novo.contatoId,
        tipo: novo.tipo,
        ...(novo.valorEstimado ? { valorEstimado: Number(novo.valorEstimado) } : {}),
        ...(novo.prazo ? { prazo: novo.prazo } : {}),
      });
      setNovo({ contatoId: '', tipo: 'INBOUND', valorEstimado: '', prazo: '' });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar lead');
    }
  };

  return (
    <div className="space-y-4">
      <Card titulo="Filtros">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Tipo">
            <Select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{LABEL_TIPO_LEAD[t]}</option>
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
          <Field label="Prazo">
            <Select value={filtros.atrasados} onChange={(e) => setFiltros({ ...filtros, atrasados: e.target.value })}>
              <option value="">Todos</option>
              <option value="true">Somente atrasados</option>
            </Select>
          </Field>
          <Field label="Busca">
            <Input
              placeholder="Contato, conta ou observacao"
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {FASES_LEAD.map((fase) => {
          const leads = colunas[fase];
          const total = leads.reduce((acc, l) => acc + (l.valorEstimado ?? 0), 0);
          return (
            <div
              key={fase}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void soltarEm(fase)}
              className="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50"
            >
              <header className="border-b border-slate-200 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-700">{LABEL_FASE_LEAD[fase]}</p>
                <p className="text-xs text-slate-500">
                  {leads.length} lead{leads.length === 1 ? '' : 's'} · {moeda(total)}
                </p>
              </header>
              <ul className="min-h-24 flex-1 space-y-2 p-2">
                {leads.map((lead) => (
                  <Cartao key={lead.id} lead={lead} aoArrastar={setArrastando} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <Card titulo="Novo lead" descricao="Arraste os cartoes entre as colunas para mudar a fase">
        <form onSubmit={criar} className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <Field label="Contato">
            <Select required value={novo.contatoId} onChange={(e) => setNovo({ ...novo, contatoId: e.target.value })}>
              <option value="">Selecione</option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as LeadTipo })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{LABEL_TIPO_LEAD[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Valor estimado">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={novo.valorEstimado}
              onChange={(e) => setNovo({ ...novo, valorEstimado: e.target.value })}
            />
          </Field>
          <Field label="Prazo">
            <Input type="date" value={novo.prazo} onChange={(e) => setNovo({ ...novo, prazo: e.target.value })} />
          </Field>
          <Button type="submit" disabled={!novo.contatoId}>Criar lead</Button>
        </form>
      </Card>
    </div>
  );
}
