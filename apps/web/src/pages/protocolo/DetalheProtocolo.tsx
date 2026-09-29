import { useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ApiError, api } from '../../lib/api';
import {
  LABEL_STATUS_PROTOCOLO,
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
    <div className="space-y-5">
      <Card
        titulo={`#${protocolo.numero} · ${protocolo.titulo}`}
        descricao={`Aberto em ${dataHora(protocolo.criadoEm)}`}
        acao={(
          <div className="flex items-center gap-2">
            {protocolo.slaVencido ? <Badge tom="alerta">SLA vencido</Badge> : <Badge tom="neutro">No prazo</Badge>}
            {protocolo.categoria === 'TI_INTERNO' && protocolo.status !== 'FECHADO' && (
              <Button type="button" variante="perigo" tamanho="sm" onClick={fecharChamado} disabled={ocupado}>
                Fechar chamado
              </Button>
            )}
          </div>
        )}
      >
        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}

        <p className="whitespace-pre-wrap text-sm text-slate-700">{protocolo.descricao}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
              {(protocolo.categoria === 'TI_INTERNO' ? STATUS_TI : STATUS_PROTOCOLO).map((s) => (
                <option key={s} value={s}>
                  {protocolo.categoria === 'TI_INTERNO' && s === 'FECHADO' ? 'Concluído' : LABEL_STATUS_PROTOCOLO[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Solicitante</p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {protocolo.solicitante?.nome ?? 'Não identificado'}
            </p>
          </div>
        </div>

      </Card>

      <Card titulo="Histórico" descricao="Notas internas não são visíveis ao cliente">
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
                  <span className="text-xs text-slate-500">{dataHora(c.criadoEm)}</span>
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
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Anexos" descricao={`Arquivo de até ${LIMITE_MB} MB ou link de outro sistema`}>
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
                  <p className="text-xs text-slate-500">
                    {dataHora(a.criadoEm)}
                    {a.tamanho ? ` · ${tamanhoLegivel(a.tamanho)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-3 flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Enviar arquivo do computador</span>
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
            className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
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
            <Button type="submit" disabled={ocupado}>Agendar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
