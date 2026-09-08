import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { MotivoPerdaDialog } from '../../components/ui/MotivoPerdaDialog';
import { ApiError, api } from '../../lib/api';
import {
  FASES_LEAD,
  LABEL_FASE_LEAD,
  LABEL_MOTIVO_PERDA,
  LABEL_TIPO_LEAD,
  moeda,
  type CampoCustomizadoDef,
  type Contato,
  type FiltroLeadSalvo,
  type Lead,
  type LeadFase,
  type LeadTipo,
  type MotivoPerda,
  type Usuario,
} from '../../lib/types';
import { useFaixaDeLargura } from '../../lib/useFaixaDeLargura';
import { CamposCustomizadosCampos } from './CamposCustomizados';
import { VisoesSalvas } from './VisoesSalvas';

type Colunas = Record<LeadFase, Lead[]>;

const MOTIVOS: MotivoPerda[] = ['PRECO', 'SEM_INTERESSE', 'CONCORRENTE', 'SEM_BUDGET', 'SEM_RESPOSTA', 'OUTRO'];
const TIPOS: LeadTipo[] = ['INBOUND', 'OUTBOUND', 'INDICACAO', 'PARCEIRO'];

const vazio: Colunas = { NOVO: [], QUALIFICACAO: [], PROPOSTA: [], NEGOCIACAO: [], GANHO: [], PERDIDO: [] };

function Cartao({
  lead,
  aoArrastar,
  aoMover,
}: {
  lead: Lead;
  aoArrastar: (id: string) => void;
  /** Mesma acao do soltar do arraste, so que disparada pelo seletor. */
  aoMover: (id: string, fase: LeadFase) => void;
}) {
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
      {/*
        Alternativa ao arraste: teclado, tela estreita e quem nao usa
        drag-and-drop precisam de um jeito de mudar a fase sem arrastar nada.
        Mesmo destino do drop (mesma funcao `aoMover`), so que disparado por
        selecionar uma opcao — nao inventa uma segunda regra de movimentacao.
      */}
      <Select
        aria-label={`Mover ${lead.contato.nome} para outra fase`}
        value=""
        onChange={(e) => {
          const fase = e.target.value as LeadFase;
          if (fase) aoMover(lead.id, fase);
          e.target.value = '';
        }}
        className="mt-2 !py-1 !text-xs"
      >
        <option value="">Mover para...</option>
        {FASES_LEAD.filter((f) => f !== lead.fase).map((f) => (
          <option key={f} value={f}>
            {LABEL_FASE_LEAD[f]}
          </option>
        ))}
      </Select>
    </li>
  );
}

export function LeadsTab() {
  const [colunas, setColunas] = useState<Colunas>(vazio);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [agentes, setAgentes] = useState<Usuario[]>([]);
  const [filtros, setFiltros] = useState({ tipo: '', responsavelId: '', atrasados: '', busca: '' });
  const [arrastando, setArrastando] = useState<string | null>(null);
  /** Lead pendente de motivo antes de virar PERDIDO — abre `MotivoPerdaDialog`. */
  const [pedidoMotivo, setPedidoMotivo] = useState<{ id: string; fase: LeadFase } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState({ contatoId: '', tipo: 'INBOUND' as LeadTipo, valorEstimado: '', prazo: '' });
  /** Campos customizados (item 6.4) do "Novo lead". */
  const [camposDef, setCamposDef] = useState<CampoCustomizadoDef[]>([]);
  const [novosCampos, setNovosCampos] = useState<Record<string, unknown>>({});

  /**
   * Kanban horizontal com colunas de largura fixa so funciona quando sobra
   * espaco pra ver mais de uma coluna por vez — abaixo disso vira uma fita
   * de rolagem lateral sem visao geral nenhuma (Fase 7, item 2: nao aceitar
   * "desktop = kanban, mobile = rolagem" sem avaliar). Container real, mesmo
   * principio de Contatos/Contas/Atendimento.
   */
  const { ref: containerRef, faixa } = useFaixaDeLargura<HTMLDivElement>();
  const emColunas = faixa === 'desktop' || faixa === 'notebook';

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

  useEffect(() => {
    void api
      .get<{ campos: CampoCustomizadoDef[] }>('/campos-customizados?entidade=LEAD')
      .then(({ campos }) => setCamposDef(campos))
      .catch(() => undefined);
  }, []);

  const enviarMudancaDeFase = async (id: string, fase: LeadFase, motivoPerda?: MotivoPerda) => {
    try {
      await api.patch(`/leads/${id}`, { fase, ...(motivoPerda ? { motivoPerda } : {}) });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover o lead');
    }
  };

  /**
   * Move um lead para outra fase — usada pelo soltar do arraste E pelo
   * seletor "Mover para" do cartao (alternativa por teclado/tela estreita).
   * Mover para PERDIDO exige motivo: abre `MotivoPerdaDialog` (Fase 9 —
   * substitui o `window.prompt` que nao seguia tema escuro nem white-label)
   * e so envia o PATCH depois de confirmado.
   */
  const moverParaFase = async (id: string, fase: LeadFase) => {
    if (fase === 'PERDIDO') {
      setPedidoMotivo({ id, fase });
      return;
    }
    await enviarMudancaDeFase(id, fase);
  };

  const soltarEm = async (fase: LeadFase) => {
    const id = arrastando;
    setArrastando(null);
    if (!id) return;
    await moverParaFase(id, fase);
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/leads', {
        contatoId: novo.contatoId,
        tipo: novo.tipo,
        ...(novo.valorEstimado ? { valorEstimado: Number(novo.valorEstimado) } : {}),
        ...(novo.prazo ? { prazo: novo.prazo } : {}),
        ...(Object.keys(novosCampos).length ? { camposCustomizados: novosCampos } : {}),
      });
      setNovo({ contatoId: '', tipo: 'INBOUND', valorEstimado: '', prazo: '' });
      setNovosCampos({});
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar lead');
    }
  };

  return (
    <div ref={containerRef} className="space-y-4">
      <Card titulo="Filtros">
        <div className="mb-3">
          <VisoesSalvas<FiltroLeadSalvo>
            entidade="LEAD"
            filtroAtual={{
              ...(filtros.tipo ? { tipo: filtros.tipo as LeadTipo } : {}),
              ...(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
              ...(filtros.atrasados ? { atrasados: true } : {}),
              ...(filtros.busca.trim() ? { busca: filtros.busca.trim() } : {}),
            }}
            filtroVazio={!filtros.tipo && !filtros.responsavelId && !filtros.atrasados && !filtros.busca.trim()}
            aoAplicar={(filtro) =>
              setFiltros({
                tipo: filtro.tipo ?? '',
                responsavelId: filtro.responsavelId ?? '',
                atrasados: filtro.atrasados ? 'true' : '',
                busca: filtro.busca ?? '',
              })
            }
          />
        </div>
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

      {emColunas ? (
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
                    <Cartao key={lead.id} lead={lead} aoArrastar={setArrastando} aoMover={(id, f) => void moverParaFase(id, f)} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        /*
         * Abaixo de notebook, colunas de largura fixa rolando na horizontal
         * nao dao visao geral nenhuma — so uma coluna aparece por vez. Uma
         * lista agrupada por fase, cada grupo com o proprio total e um
         * `<details>` que comeca fechado quando vazio, aproveita a largura
         * inteira da tela e continua permitindo mover pelo mesmo seletor
         * (nao existe arraste em toque de qualquer forma).
         */
        <div className="space-y-3">
          {FASES_LEAD.map((fase) => {
            const leads = colunas[fase];
            const total = leads.reduce((acc, l) => acc + (l.valorEstimado ?? 0), 0);
            return (
              <details key={fase} open={leads.length > 0} className="rounded-xl border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm font-semibold text-slate-700">{LABEL_FASE_LEAD[fase]}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {leads.length} lead{leads.length === 1 ? '' : 's'} · {moeda(total)}
                  </span>
                </summary>
                {leads.length > 0 && (
                  <ul className="space-y-2 border-t border-slate-200 p-2">
                    {leads.map((lead) => (
                      <Cartao key={lead.id} lead={lead} aoArrastar={setArrastando} aoMover={(id, f) => void moverParaFase(id, f)} />
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      )}

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
        {camposDef.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <CamposCustomizadosCampos
              campos={camposDef}
              valores={novosCampos}
              aoMudar={(chave, valor) =>
                setNovosCampos((atuais) => {
                  if (valor === null) {
                    const { [chave]: _removido, ...resto } = atuais;
                    return resto;
                  }
                  return { ...atuais, [chave]: valor };
                })
              }
            />
          </div>
        )}
      </Card>

      <MotivoPerdaDialog
        aberto={pedidoMotivo !== null}
        motivos={MOTIVOS}
        labelMotivo={LABEL_MOTIVO_PERDA}
        aoCancelar={() => setPedidoMotivo(null)}
        aoConfirmar={(motivo) => {
          if (!pedidoMotivo) return;
          void enviarMudancaDeFase(pedidoMotivo.id, pedidoMotivo.fase, motivo);
          setPedidoMotivo(null);
        }}
      />
    </div>
  );
}
