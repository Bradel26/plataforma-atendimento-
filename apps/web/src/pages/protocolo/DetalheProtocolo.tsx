import { useState, type ReactNode } from 'react';
import { Alerta, Button, Field, Input, Select } from '../../components/ui';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ApiError, api } from '../../lib/api';
import {
  COR_PRIORIDADE,
  LABEL_PRIORIDADE,
  LABEL_STATUS_PROTOCOLO,
  LABEL_TIPO_TI,
  STATUS_PROTOCOLO,
  type Protocolo,
  type TicketStatus,
} from '../../lib/types';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');

/** Espelha UPLOAD_MAX_MB da API; quem recusa de fato e o servidor. */
const LIMITE_MB = 10;
const STATUS_TI: TicketStatus[] = ['ABERTO', 'EM_ANDAMENTO', 'RESOLVIDO', 'FECHADO'];

const tamanhoLegivel = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-slate-100 pt-5">
      <div>
        <h3 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-slate-500">{titulo}</h3>
        {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Detalhe do chamado, pensado para a gaveta lateral: uma coluna so, com as
 * secoes empilhadas (descricao, historico, anexos, agendamentos).
 */
export function DetalheProtocolo({
  protocolo,
  onMudou,
}: {
  protocolo: Protocolo;
  onMudou: (p: Protocolo) => void;
}) {
  const confirmar = useConfirm();
  const [comentario, setComentario] = useState('');
  const [interno, setInterno] = useState(true);
  const [anexo, setAnexo] = useState({ nome: '', url: '' });
  const [agenda, setAgenda] = useState({ titulo: '', inicio: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ehTi = protocolo.categoria === 'TI_INTERNO';

  const executar = async (acao: () => Promise<{ protocolo: Protocolo }>) => {
    setErro(null);
    setOcupado(true);
    try {
      const { protocolo: novo } = await acao();
      onMudou(novo);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível concluir a operação.');
    } finally {
      setOcupado(false);
    }
  };

  const fecharChamado = () => {
    confirmar({
      titulo: `Fechar o chamado #${protocolo.numero}?`,
      descricao: 'Ele será movido para Concluídos e continuará no histórico.',
      variante: 'perigo',
      rotuloConfirmar: 'Fechar chamado',
      aoConfirmar: async () => {
        setErro(null);
        try {
          const { protocolo: fechado } = await api.patch<{ protocolo: Protocolo }>(
            `/protocolos/${protocolo.id}`,
            { status: 'FECHADO' },
          );
          onMudou(fechado);
        } catch (e) {
          setErro(e instanceof ApiError ? e.message : 'Falha ao fechar o chamado');
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {protocolo.tipoTi && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${protocolo.tipoTi === 'ERRO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
            {LABEL_TIPO_TI[protocolo.tipoTi]}
          </span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR_PRIORIDADE[protocolo.prioridade]}`}>
          Prioridade {LABEL_PRIORIDADE[protocolo.prioridade].toLowerCase()}
        </span>
        {protocolo.slaVencido ? (
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">SLA vencido</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">No prazo</span>
        )}
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
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
            {(ehTi ? STATUS_TI : STATUS_PROTOCOLO).map((s) => (
              <option key={s} value={s}>
                {ehTi && s === 'FECHADO' ? 'Concluído' : LABEL_STATUS_PROTOCOLO[s]}
              </option>
            ))}
          </Select>
        </Field>
        {ehTi && protocolo.status !== 'FECHADO' && (
          <Button type="button" variante="perigo" onClick={fecharChamado} disabled={ocupado}>
            Fechar chamado
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-slate-500">Solicitante</dt>
        <dd className="text-slate-800">{protocolo.solicitante?.nome ?? 'Não identificado'}</dd>
        <dt className="text-slate-500">Responsável</dt>
        <dd className="text-slate-800">{protocolo.responsavel?.nome ?? 'Sem responsável'}</dd>
        {protocolo.contato && (
          <>
            <dt className="text-slate-500">Contato</dt>
            <dd className="text-slate-800">{protocolo.contato.nome}</dd>
          </>
        )}
        <dt className="text-slate-500">Aberto em</dt>
        <dd className="tabular-nums text-slate-800">{dataHora(protocolo.criadoEm)}</dd>
      </dl>

      <Secao titulo="Descrição">
        <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{protocolo.descricao}</p>
      </Secao>

      <Secao titulo="Histórico" descricao="Notas internas não são visíveis ao cliente">
        {protocolo.comentarios.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum comentário ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {protocolo.comentarios.map((c) => (
              <li
                key={c.id}
                className={`rounded-xl border p-3 ${c.interno ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">{c.autor?.nome ?? 'Sistema'}</span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.interno ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {c.interno ? 'Interno' : 'Cliente'}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">{dataHora(c.criadoEm)}</span>
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{c.conteudo}</p>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-2"
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
            aria-label="Comentário"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            placeholder="Escreva um comentário"
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
      </Secao>

      <Secao titulo="Anexos" descricao={`Arquivo de até ${LIMITE_MB} MB ou link de outro sistema`}>
        {protocolo.anexos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum anexo.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {protocolo.anexos.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-slate-500">
                  <path d="m21.4 11.6-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
                </svg>
                <span className="min-w-0 flex-1">
                  <a href={a.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-[var(--brand-primary)] underline">
                    {a.nome}
                  </a>
                  <span className="text-xs tabular-nums text-slate-500">
                    {dataHora(a.criadoEm)}
                    {a.tamanho ? ` · ${tamanhoLegivel(a.tamanho)}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Enviar arquivo do computador</span>
          <input
            type="file"
            disabled={ocupado}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              // Limpa o input antes de enviar: sem isso, escolher o mesmo
              // arquivo de novo nao dispara change e o reenvio parece travado.
              e.target.value = '';
              if (arquivo) {
                void executar(() =>
                  api.upload<{ protocolo: Protocolo }>(`/protocolos/${protocolo.id}/anexos`, arquivo),
                );
              }
            }}
            className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:text-slate-700 hover:file:bg-slate-200"
          />
        </label>

        <form
          className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
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
          <Button type="submit" variante="neutro" disabled={ocupado}>Anexar</Button>
        </form>
      </Secao>

      <Secao titulo="Agendamentos">
        {protocolo.agendamentos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum agendamento.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {protocolo.agendamentos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className={`truncate text-sm ${a.concluido ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}`}>
                    {a.titulo}
                  </p>
                  <p className="text-xs tabular-nums text-slate-500">
                    {dataHora(a.inicio)}
                    {a.responsavel ? ` · ${a.responsavel.nome}` : ''}
                  </p>
                </div>
                {!a.concluido && (
                  <Button
                    variante="neutro"
                    tamanho="sm"
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
          className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
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
          <Field label="Título">
            <Input required value={agenda.titulo} onChange={(e) => setAgenda({ ...agenda, titulo: e.target.value })} />
          </Field>
          <Field label="Início">
            <Input
              required
              type="datetime-local"
              value={agenda.inicio}
              onChange={(e) => setAgenda({ ...agenda, inicio: e.target.value })}
            />
          </Field>
          <Button type="submit" variante="neutro" disabled={ocupado}>Agendar</Button>
        </form>
      </Secao>
    </div>
  );
}
