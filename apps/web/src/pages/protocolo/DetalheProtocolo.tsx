import { useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  LABEL_PRIORIDADE,
  LABEL_STATUS_PROTOCOLO,
  PRIORIDADES_PROTOCOLO,
  STATUS_PROTOCOLO,
  type Protocolo,
  type TicketPrioridade,
  type TicketStatus,
  type Usuario,
} from '../../lib/types';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export function DetalheProtocolo({
  protocolo,
  agentes,
  onMudou,
}: {
  protocolo: Protocolo;
  agentes: Usuario[];
  onMudou: (p: Protocolo) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [interno, setInterno] = useState(true);
  const [anexo, setAnexo] = useState({ nome: '', url: '' });
  const [agenda, setAgenda] = useState({ titulo: '', inicio: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const executar = async (acao: () => Promise<{ protocolo: Protocolo }>) => {
    setErro(null);
    setOcupado(true);
    try {
      const { protocolo: novo } = await acao();
      onMudou(novo);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha na operacao');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card
        titulo={`#${protocolo.numero} · ${protocolo.titulo}`}
        descricao={`Aberto em ${dataHora(protocolo.criadoEm)}`}
        acao={
          protocolo.slaVencido ? <Badge tom="alerta">SLA vencido</Badge> : <Badge tom="neutro">No prazo</Badge>
        }
      >
        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}

        <p className="whitespace-pre-wrap text-sm text-slate-700">{protocolo.descricao}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select
              disabled={ocupado}
              value={protocolo.status}
              onChange={(e) =>
                void executar(() =>
                  api.patch(`/protocolos/${protocolo.id}`, { status: e.target.value as TicketStatus }),
                )
              }
            >
              {STATUS_PROTOCOLO.map((s) => (
                <option key={s} value={s}>{LABEL_STATUS_PROTOCOLO[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select
              disabled={ocupado}
              value={protocolo.prioridade}
              onChange={(e) =>
                void executar(() =>
                  api.patch(`/protocolos/${protocolo.id}`, { prioridade: e.target.value as TicketPrioridade }),
                )
              }
            >
              {PRIORIDADES_PROTOCOLO.map((p) => (
                <option key={p} value={p}>{LABEL_PRIORIDADE[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsavel">
            <Select
              disabled={ocupado}
              value={protocolo.responsavel?.id ?? ''}
              onChange={(e) =>
                void executar(() =>
                  api.patch(`/protocolos/${protocolo.id}`, { responsavelId: e.target.value || null }),
                )
              }
            >
              <option value="">Sem responsavel</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </Select>
          </Field>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Contato</dt>
            <dd className="text-slate-800">{protocolo.contato?.nome ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Conta</dt>
            <dd className="text-slate-800">{protocolo.conta?.nome ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Prazo de SLA</dt>
            <dd className="text-slate-800">{protocolo.prazoSla ? dataHora(protocolo.prazoSla) : '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card titulo="Historico" descricao="Notas internas nao sao visiveis ao cliente">
        <ul className="space-y-3">
          {protocolo.comentarios.map((c) => (
            <li
              key={c.id}
              className={`rounded-lg border p-3 ${
                c.interno ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">{c.autor?.nome ?? 'Sistema'}</span>
                <span className="flex items-center gap-2">
                  <Badge tom={c.interno ? 'alerta' : 'sucesso'}>{c.interno ? 'Interno' : 'Cliente'}</Badge>
                  <span className="text-xs text-slate-400">{dataHora(c.criadoEm)}</span>
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{c.conteudo}</p>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const conteudo = comentario.trim();
            if (!conteudo) return;
            void executar(async () => {
              const r = await api.post<{ protocolo: Protocolo }>(`/protocolos/${protocolo.id}/comentarios`, {
                conteudo,
                interno,
              });
              setComentario('');
              return r;
            });
          }}
        >
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            placeholder="Escreva um comentario"
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand-primary)]"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />
              Nota interna
            </label>
            <Button type="submit" disabled={ocupado || !comentario.trim()}>Comentar</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Anexos" descricao="Registro por URL — upload direto depende do storage de midia">
          {protocolo.anexos.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum anexo.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {protocolo.anexos.map((a) => (
                <li key={a.id} className="py-2">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--brand-primary)] underline"
                  >
                    {a.nome}
                  </a>
                  <p className="text-xs text-slate-400">{dataHora(a.criadoEm)}</p>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void executar(async () => {
                const r = await api.post<{ protocolo: Protocolo }>(`/protocolos/${protocolo.id}/anexos`, anexo);
                setAnexo({ nome: '', url: '' });
                return r;
              });
            }}
          >
            <Field label="Nome">
              <Input required value={anexo.nome} onChange={(e) => setAnexo({ ...anexo, nome: e.target.value })} />
            </Field>
            <Field label="URL">
              <Input
                required
                type="url"
                placeholder="https://..."
                value={anexo.url}
                onChange={(e) => setAnexo({ ...anexo, url: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={ocupado}>Anexar</Button>
          </form>
        </Card>

        <Card titulo="Agendamentos">
          {protocolo.agendamentos.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum agendamento.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {protocolo.agendamentos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className={`truncate text-sm ${a.concluido ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {a.titulo}
                    </p>
                    <p className="text-xs text-slate-500">
                      {dataHora(a.inicio)}
                      {a.responsavel ? ` · ${a.responsavel.nome}` : ''}
                    </p>
                  </div>
                  {!a.concluido && (
                    <Button
                      variante="neutro"
                      disabled={ocupado}
                      onClick={() =>
                        void executar(() =>
                          api.post(`/protocolos/${protocolo.id}/agendamentos/${a.id}/concluir`),
                        )
                      }
                    >
                      Concluir
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void executar(async () => {
                const r = await api.post<{ protocolo: Protocolo }>(
                  `/protocolos/${protocolo.id}/agendamentos`,
                  agenda,
                );
                setAgenda({ titulo: '', inicio: '' });
                return r;
              });
            }}
          >
            <Field label="Titulo">
              <Input required value={agenda.titulo} onChange={(e) => setAgenda({ ...agenda, titulo: e.target.value })} />
            </Field>
            <Field label="Inicio">
              <Input
                required
                type="datetime-local"
                value={agenda.inicio}
                onChange={(e) => setAgenda({ ...agenda, inicio: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={ocupado}>Agendar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
