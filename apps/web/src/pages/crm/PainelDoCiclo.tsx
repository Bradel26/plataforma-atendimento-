import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Card, EmptyState, Field, Input, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import {
  AJUDA_STATUS_CICLO,
  COR_STATUS_CICLO,
  LABEL_STATUS_CICLO,
  MOTIVOS_EM_RISCO,
  MOTIVOS_INATIVO,
  dataBr,
  type CicloDetalhado,
  type StatusCiclo,
} from './cicloParceiro';

export function SeloCiclo({ status }: { status: StatusCiclo }) {
  return (
    <span
      title={AJUDA_STATUS_CICLO[status]}
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS_CICLO[status]}`}
    >
      {LABEL_STATUS_CICLO[status]}
    </span>
  );
}

/** Mudancas que dependem de julgamento do consultor, por status de partida. */
function acoesManuais(status: StatusCiclo): Array<{ para: StatusCiclo; rotulo: string; perigo?: boolean }> {
  if (status === 'EM_RISCO') {
    return [
      { para: 'REATIVADO', rotulo: 'Reativar' },
      { para: 'INATIVO', rotulo: 'Marcar como inativo', perigo: true },
    ];
  }
  if (status === 'INATIVO') return [{ para: 'REATIVADO', rotulo: 'Reativar' }];
  if (status === 'REATIVADO') {
    return [
      { para: 'EM_RISCO', rotulo: 'Marcar em risco' },
      { para: 'INATIVO', rotulo: 'Marcar como inativo', perigo: true },
    ];
  }
  return [
    { para: 'EM_RISCO', rotulo: 'Marcar em risco' },
    { para: 'INATIVO', rotulo: 'Marcar como inativo', perigo: true },
  ];
}

/**
 * Card do ciclo de vida de UM credenciamento: status atual, implantacao,
 * mudancas manuais e historico. Usado na aba do CRM e na ficha do parceiro.
 *
 * `aoMudar` avisa a lista que o status mudou (os totais dela ficariam velhos).
 */
export function PainelDoCiclo({ credenciamentoId, aoMudar }: { credenciamentoId: string; aoMudar?: () => void }) {
  const mostrarToast = useToast();
  const [ciclo, setCiclo] = useState<CicloDetalhado | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [alterando, setAlterando] = useState<StatusCiclo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [outroMotivo, setOutroMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<{ ciclo: CicloDetalhado | null }>(`/ciclo-parceiro/credenciamento/${credenciamentoId}`);
      setCiclo(r.ciclo);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o ciclo de vida');
    }
  }, [credenciamentoId]);

  useEffect(() => {
    setCiclo(undefined);
    setAlterando(null);
    void carregar();
  }, [carregar]);

  const alternarEtapa = async (chave: string, concluida: boolean) => {
    setErro(null);
    try {
      const r = await api.put<{ ciclo: CicloDetalhado }>(
        `/ciclo-parceiro/credenciamento/${credenciamentoId}/etapas/${chave}`,
        { concluida },
      );
      setCiclo(r.ciclo);
      aoMudar?.();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao atualizar a etapa');
    }
  };

  const abrirMudanca = (para: StatusCiclo) => {
    setAlterando(para);
    setMotivo('');
    setOutroMotivo('');
    setObservacao('');
    setErro(null);
  };

  const exigeMotivo = alterando === 'EM_RISCO' || alterando === 'INATIVO';
  const motivoFinal = motivo === 'Outro' ? outroMotivo.trim() : motivo;

  const confirmar = async () => {
    if (!alterando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<{ ciclo: CicloDetalhado }>(`/ciclo-parceiro/credenciamento/${credenciamentoId}/status`, {
        status: alterando,
        ...(motivoFinal ? { motivo: motivoFinal } : {}),
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
      });
      setCiclo(r.ciclo);
      setAlterando(null);
      mostrarToast('sucesso', `Status alterado para ${LABEL_STATUS_CICLO[alterando]}.`);
      aoMudar?.();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao alterar o status');
    } finally {
      setEnviando(false);
    }
  };

  if (ciclo === undefined) {
    return (
      <Card titulo="Ciclo de vida">
        {erro ? <Alerta>{erro}</Alerta> : <p className="text-sm text-slate-500">Carregando...</p>}
      </Card>
    );
  }

  if (ciclo === null) {
    return (
      <Card titulo="Ciclo de vida">
        <EmptyState
          titulo="O ciclo ainda nao comecou"
          descricao="Ele comeca quando o credenciamento chega ao estagio Ativo da esteira."
        />
      </Card>
    );
  }

  const feitas = ciclo.etapas.filter((e) => e.concluida).length;
  const motivos = alterando === 'INATIVO' ? MOTIVOS_INATIVO : MOTIVOS_EM_RISCO;

  return (
    <Card
      titulo="Ciclo de vida"
      descricao={`${ciclo.contato.nome} · ${ciclo.funil.nome}`}
      acao={<SeloCiclo status={ciclo.status} />}
    >
      <div className="space-y-5">
        {erro && <Alerta>{erro}</Alerta>}

        {ciclo.status === 'SEM_ACOMPANHAMENTO' && (
          <Alerta tipo="aviso">Parceiro ha {ciclo.diasSemInteracao} dias sem acompanhamento.</Alerta>
        )}
        {ciclo.implantacaoAtrasada && (
          <Alerta tipo="aviso">
            Credenciado ha {ciclo.diasComoParceiro} dias e nenhuma etapa da implantacao foi concluida.
          </Alerta>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Parceiro desde</dt>
            <dd className="text-slate-800">
              {dataBr(ciclo.credenciadoEm)} <span className="text-slate-500">· ha {ciclo.diasComoParceiro} dias</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Consultor responsavel</dt>
            <dd className="text-slate-800">{ciclo.responsavel?.nome ?? 'Sem responsavel'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">No status atual</dt>
            <dd className="text-slate-800">
              {ciclo.diasNoStatus} dia{ciclo.diasNoStatus === 1 ? '' : 's'}
              <span className="text-slate-500"> · desde {dataBr(ciclo.statusDesde)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Ultima interacao</dt>
            <dd className="text-slate-800">
              {ciclo.ultimaInteracaoEm ? (
                <>
                  {dataBr(ciclo.ultimaInteracaoEm)}
                  <span className="text-slate-500"> · ha {ciclo.diasSemInteracao} dias</span>
                </>
              ) : (
                'Nenhuma registrada'
              )}
            </dd>
          </div>
        </dl>

        <section aria-labelledby={`impl-${ciclo.id}`}>
          <div className="mb-2 flex items-center justify-between">
            <h3 id={`impl-${ciclo.id}`} className="text-sm font-medium text-slate-700">
              Implantacao
            </h3>
            <span className="text-xs text-slate-500">
              {feitas} de {ciclo.etapas.length} etapas
            </span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[var(--brand-primary)] transition-all"
              style={{ width: `${(feitas / Math.max(1, ciclo.etapas.length)) * 100}%` }}
            />
          </div>
          <ul className="space-y-1.5">
            {ciclo.etapas.map((e) => (
              <li key={e.chave}>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={e.concluida}
                    onChange={(ev) => void alternarEtapa(e.chave, ev.target.checked)}
                  />
                  <span>
                    {e.rotulo}
                    {e.concluida && e.concluidaEm && (
                      <span className="block text-xs text-slate-500">
                        Concluida em {dataBr(e.concluidaEm)}
                        {e.concluidaPor ? ` por ${e.concluidaPor}` : ''}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            A primeira etapa concluida coloca o parceiro em implantacao; com todas concluidas ele passa a Ativo.
          </p>
        </section>

        <section aria-label="Mudar status">
          {alterando ? (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-800">
                {alterando === 'REATIVADO'
                  ? 'Reativar parceiro'
                  : `Alterar para ${LABEL_STATUS_CICLO[alterando]}`}
              </p>
              {exigeMotivo && (
                <Field label="Motivo *">
                  <Select required value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    <option value="">Selecione...</option>
                    {motivos.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {exigeMotivo && motivo === 'Outro' && (
                <Field label="Descreva o motivo *">
                  <Input value={outroMotivo} maxLength={300} onChange={(e) => setOutroMotivo(e.target.value)} />
                </Field>
              )}
              <Field label="Observacao" hint="Opcional. Fica registrada no historico.">
                <Textarea rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button
                  onClick={() => void confirmar()}
                  disabled={enviando || (exigeMotivo && !motivoFinal)}
                  variante={alterando === 'INATIVO' ? 'perigo' : 'primario'}
                >
                  {enviando ? 'Salvando...' : 'Confirmar'}
                </Button>
                <Button variante="neutro" onClick={() => setAlterando(null)} disabled={enviando}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {acoesManuais(ciclo.status).map((a) => (
                <Button
                  key={a.para}
                  tamanho="sm"
                  variante={a.perigo ? 'perigo' : 'neutro'}
                  onClick={() => abrirMudanca(a.para)}
                >
                  {a.rotulo}
                </Button>
              ))}
            </div>
          )}
        </section>

        <section>
          <button
            type="button"
            aria-expanded={verHistorico}
            onClick={() => setVerHistorico((v) => !v)}
            className="text-sm text-[var(--brand-primary)] hover:underline"
          >
            {verHistorico ? 'Ocultar historico do ciclo de vida' : 'Ver historico do ciclo de vida'}
          </button>
          {verHistorico && (
            <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
              {ciclo.historico.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300"
                  />
                  <p className="text-slate-800">
                    <span className="text-slate-500">{dataBr(h.criadoEm)} — </span>
                    {h.deStatus ? (
                      <>
                        {LABEL_STATUS_CICLO[h.deStatus]} <span aria-hidden="true">→</span> <SeloCiclo status={h.paraStatus} />
                      </>
                    ) : (
                      <>
                        {h.motivo ?? 'Inicio'} <span aria-hidden="true">→</span> <SeloCiclo status={h.paraStatus} />
                      </>
                    )}
                  </p>
                  {h.deStatus && h.motivo && <p className="text-xs text-slate-600">{h.motivo}</p>}
                  {h.observacao && <p className="text-xs text-slate-500">Obs.: {h.observacao}</p>}
                  <p className="text-xs text-slate-400">
                    {h.regra === 'MANUAL' ? `Manual · ${h.usuario?.nome ?? 'usuario removido'}` : 'Automatico'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Card>
  );
}
