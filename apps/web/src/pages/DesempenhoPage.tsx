import { useCallback, useEffect, useState } from 'react';
import { Alerta, Card, Field, Input, Select } from '../components/ui';
import { BarList } from '../components/viz/BarList';
import { StatTile } from '../components/viz/StatTile';
import { ApiError, api } from '../lib/api';
import { ESTADO, SERIES, duracao } from '../lib/viz';
import type { AgenteMonitorado, DesempenhoOperacional, OperacaoEsteira } from '../lib/types';
import { UFS } from './esteira/ufs';
import { RelatoriosPage } from './RelatoriosPage';

const hoje = () => new Date().toISOString().slice(0, 10);
const trintaDias = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const dias = (n: number | null) => (n === null ? '—' : `${String(n).replace('.', ',')}d`);
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

/** Acima de 90% cumprido e bom; abaixo de 80%, grave. */
function estadoDoSla(cumprido: number | null) {
  if (cumprido === null) return undefined;
  if (cumprido >= 90) return ESTADO.bom;
  if (cumprido >= 80) return ESTADO.atencao;
  return ESTADO.grave;
}

/**
 * Desempenho Operacional (antiga aba Relatorios): compara a eficiencia dos
 * consultores sem repetir a Area da Gestao. La esta "onde a esteira trava";
 * aqui esta "quem responde e resolve mais rapido". Nenhum card de volume de
 * parceiros — isso e do Dashboard.
 */
export function DesempenhoPage() {
  const [dados, setDados] = useState<DesempenhoOperacional | null>(null);
  const [operacoes, setOperacoes] = useState<OperacaoEsteira[]>([]);
  const [consultores, setConsultores] = useState<Array<{ id: string; nome: string }>>([]);
  const [f, setF] = useState({ desde: trintaDias(), ate: hoje(), consultorId: '', uf: '', funilId: '', estagioId: '' });
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ funis: OperacaoEsteira[] }>('/credenciamentos/funis')
      .then((r) => setOperacoes(r.funis))
      .catch(() => undefined);
    void api
      .get<{ agentes: AgenteMonitorado[] }>('/metricas/agentes')
      .then((r) => setConsultores(r.agentes.map((a) => ({ id: a.id, nome: a.nome }))))
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({ desde: f.desde, ate: `${f.ate}T23:59:59` });
    for (const chave of ['consultorId', 'uf', 'funilId', 'estagioId'] as const) if (f[chave]) q.set(chave, f[chave]);
    try {
      const r = await api.get<{ desempenho: DesempenhoOperacional }>(`/credenciamentos/desempenho?${q.toString()}`);
      setDados(r.desempenho);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o desempenho');
    }
  }, [f]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const estagios = (operacoes.find((o) => o.id === f.funilId) ?? operacoes[0])?.estagios ?? [];
  const i = dados?.indicadores;

  return (
    <div className="space-y-5">
      <Card titulo="Filtros">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="De">
            <Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
          </Field>
          <Field label="Ate">
            <Input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} />
          </Field>
          <Field label="Consultor">
            <Select value={f.consultorId} onChange={(e) => setF({ ...f, consultorId: e.target.value })}>
              <option value="">Todos</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })}>
              <option value="">Todos</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </Select>
          </Field>
          <Field label="Operacao">
            <Select value={f.funilId} onChange={(e) => setF({ ...f, funilId: e.target.value, estagioId: '' })}>
              <option value="">Todas</option>
              {operacoes.map((o) => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa">
            <Select value={f.estagioId} onChange={(e) => setF({ ...f, estagioId: e.target.value })}>
              <option value="">Todas</option>
              {estagios.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile rotulo="1a resposta" valor={duracao(i?.primeiraRespostaSegundos ?? null)} detalhe="media ate o 1o retorno" />
        <StatTile
          rotulo="Tempo de atendimento"
          valor={duracao(i?.tempoMedioAtendimentoSegundos ?? null)}
          detalhe="da atribuicao ao fim"
        />
        <StatTile rotulo="Tempo de analise" valor={dias(i?.tempoMedioAnaliseDias ?? null)} detalhe="etapas de analise/aprovacao" />
        <StatTile
          rotulo="Tempo de credenciamento"
          valor={dias(i?.tempoMedioCredenciamentoDias ?? null)}
          detalhe="do cadastro ao credenciado"
        />
        <StatTile
          rotulo="SLA cumprido"
          valor={pct(i?.slaCumpridoPct ?? null)}
          detalhe={`${i?.protocolosComSla ?? 0} protocolo(s) com prazo`}
          estado={estadoDoSla(i?.slaCumpridoPct ?? null)}
        />
        <StatTile
          rotulo="SLA vencido"
          valor={pct(i?.slaVencidoPct ?? null)}
          estado={i?.slaVencidoPct ? ESTADO.grave : undefined}
        />
      </div>

      <Card titulo="Performance por consultor" descricao="Quem esta sendo mais agil e quem esta demorando mais">
        {!dados || dados.consultores.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum atendimento no periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Consultor</th>
                  <th className="pb-2 pr-3 font-medium">Atendimentos</th>
                  <th className="pb-2 pr-3 font-medium">1a resposta</th>
                  <th className="pb-2 pr-3 font-medium">Tempo medio</th>
                  <th className="pb-2 pr-3 font-medium">Credenciados</th>
                  <th className="pb-2 pr-3 font-medium">Tempo de cred.</th>
                  <th className="pb-2 pr-3 font-medium">SLA cumprido</th>
                  <th className="pb-2 font-medium">SLA vencido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dados.consultores.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3 font-medium text-slate-800">{c.nome}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600">{c.atendimentos}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600">{duracao(c.primeiraRespostaSegundos)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600">{duracao(c.tempoMedioAtendimentoSegundos)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600">{c.credenciamentosConcluidos}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600">{dias(c.tempoMedioCredenciamentoDias)}</td>
                    <td className="py-2.5 pr-3 tabular-nums" style={{ color: estadoDoSla(c.slaCumpridoPct) }}>
                      {pct(c.slaCumpridoPct)}
                    </td>
                    <td className="py-2.5 tabular-nums text-slate-600">{pct(c.slaVencidoPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Tempo medio por etapa" descricao="Cadastro → Analise → Pendencia → Aprovacao → Credenciado → Ativo">
          <BarList
            itens={(dados?.tempoMedioPorEtapa ?? []).map((e) => ({
              rotulo: e.etapa,
              valor: e.mediaDias ?? 0,
              cor: SERIES[0],
            }))}
            unidade="dias"
            vazio="Nenhuma passagem de etapa no periodo"
          />
        </Card>

        <Card titulo="Evolucao do tempo de credenciamento" descricao="Periodo atual comparado aos tres anteriores de mesmo tamanho">
          {!dados ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : (
            <ol className="flex flex-wrap items-end gap-2">
              {dados.evolucao.map((e, idx) => {
                const anterior = idx > 0 ? dados.evolucao[idx - 1]!.tempoMedioCredenciamentoDias : null;
                const atual = e.tempoMedioCredenciamentoDias;
                const melhorou = anterior !== null && atual !== null && atual < anterior;
                const piorou = anterior !== null && atual !== null && atual > anterior;
                return (
                  <li key={e.desde} className="flex items-center gap-2">
                    {idx > 0 && <span className="text-slate-400" aria-hidden>→</span>}
                    <div
                      className={`rounded-lg border px-3 py-2 text-center ${
                        idx === dados.evolucao.length - 1 ? 'border-[var(--brand-primary)]' : 'border-slate-200'
                      }`}
                    >
                      <p
                        className="text-lg font-semibold tabular-nums"
                        style={{ color: melhorou ? ESTADO.bom : piorou ? ESTADO.grave : undefined }}
                      >
                        {dias(atual)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(e.desde).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}–
                        {new Date(e.ate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ·{' '}
                        {e.credenciados}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-2 text-xs text-slate-500">Verde: mais rapido que o periodo anterior. Vermelho: mais lento.</p>
        </Card>
      </div>

      {/* Os relatorios tabulares antigos continuam, para quem exporta CSV/PDF. */}
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Exportar relatorios (CSV/PDF)</summary>
        <div className="mt-4">
          <RelatoriosPage />
        </div>
      </details>
    </div>
  );
}
