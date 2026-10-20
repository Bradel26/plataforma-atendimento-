import { useCallback, useEffect, useState } from 'react';
import { Alerta, Input, Select } from '../components/ui';
import { CabecalhoPagina } from '../components/ui/Pagina';
import { ApiError, api } from '../lib/api';
import { ESTADO, SERIES, duracao } from '../lib/viz';
import type { AgenteMonitorado, DesempenhoOperacional, OperacaoEsteira } from '../lib/types';
import { Barras, Indicador, Painel, Selo, type Tom } from './dashboard/blocos';
import { UFS_ATENDIDAS } from './esteira/ufs';
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

function tomDoSla(cumprido: number | null): Tom | undefined {
  if (cumprido === null) return undefined;
  return cumprido >= 90 ? 'bom' : cumprido >= 80 ? 'atencao' : 'grave';
}

const ROTULO_TOM: Record<Tom, string> = { bom: 'No alvo', atencao: 'Atenção', grave: 'Abaixo' };

/** Rotulo em cima, controle embaixo — o mesmo desenho da barra de filtros da Gestao. */
function Filtro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {rotulo}
      {children}
    </label>
  );
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
  const [exportarAberto, setExportarAberto] = useState(false);

  useEffect(() => {
    void api
      .get<{ funis: OperacaoEsteira[] }>('/credenciamentos/funis')
      .then((r) => setOperacoes(r.funis))
      .catch(() => undefined);
    void api
      .get<{ agentes: AgenteMonitorado[] }>('/metricas/agentes')
      .then((r) => setConsultores(r.agentes.filter((a) => a.perfil === 'COMERCIAL').map((a) => ({ id: a.id, nome: a.nome }))))
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
  const tomSla = tomDoSla(i?.slaCumpridoPct ?? null);

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Desempenho operacional"
        descricao="Quem responde e resolve mais rápido — a esteira parada fica na Gestão, o volume no Dashboard"
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <Filtro rotulo="De">
          <Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="w-[150px]" />
        </Filtro>
        <Filtro rotulo="Até">
          <Input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} className="w-[150px]" />
        </Filtro>
        <Filtro rotulo="Consultor">
          <Select value={f.consultorId} onChange={(e) => setF({ ...f, consultorId: e.target.value })} className="w-44">
            <option value="">Todos</option>
            {consultores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </Select>
        </Filtro>
        <Filtro rotulo="Estado">
          <Select value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })} className="w-40">
            <option value="">Todos</option>
            {UFS_ATENDIDAS.map((u) => (
              <option key={u.sigla} value={u.sigla}>{u.nome}</option>
            ))}
          </Select>
        </Filtro>
        <Filtro rotulo="Operação">
          <Select value={f.funilId} onChange={(e) => setF({ ...f, funilId: e.target.value, estagioId: '' })} className="w-44">
            <option value="">Todas</option>
            {operacoes.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </Select>
        </Filtro>
        <Filtro rotulo="Etapa">
          <Select value={f.estagioId} onChange={(e) => setF({ ...f, estagioId: e.target.value })} className="w-44">
            <option value="">Todas</option>
            {estagios.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </Select>
        </Filtro>
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador rotulo="1ª resposta" valor={duracao(i?.primeiraRespostaSegundos ?? null)} detalhe="média até o 1º retorno" />
        <Indicador rotulo="Tempo de atendimento" valor={duracao(i?.tempoMedioAtendimentoSegundos ?? null)} detalhe="da atribuição ao fim" />
        <Indicador rotulo="Tempo de análise" valor={dias(i?.tempoMedioAnaliseDias ?? null)} detalhe="etapas de análise/aprovação" />
        <Indicador rotulo="Tempo de credenciamento" valor={dias(i?.tempoMedioCredenciamentoDias ?? null)} detalhe="do cadastro ao credenciado" />
        <Indicador
          rotulo="SLA cumprido"
          valor={pct(i?.slaCumpridoPct ?? null)}
          detalhe={`${i?.protocolosComSla ?? 0} protocolo(s) com prazo · alvo 90%`}
          selo={tomSla ? <Selo tom={tomSla}>{ROTULO_TOM[tomSla]}</Selo> : undefined}
        />
        <Indicador
          rotulo="SLA vencido"
          valor={pct(i?.slaVencidoPct ?? null)}
          detalhe="dos protocolos com prazo"
          selo={i?.slaVencidoPct ? <Selo tom="grave">Vencido</Selo> : undefined}
        />
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="desempenho-consultores">
        <div className="px-5 py-4">
          <h2 id="desempenho-consultores" className="text-[15px] font-semibold text-slate-800">Performance por consultor</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Quem está sendo mais ágil e quem está demorando mais</p>
        </div>
        {!dados || dados.consultores.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">Nenhum atendimento no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-y border-slate-200 bg-slate-50 text-[11.5px] text-slate-500">
                <tr>
                  {['Consultor', 'Atendimentos', '1ª resposta', 'Tempo médio', 'Credenciados', 'Tempo de cred.', 'SLA cumprido', 'SLA vencido'].map((h, idx) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-2.5 font-semibold ${idx > 0 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {dados.consultores.map((c) => {
                  const tom = tomDoSla(c.slaCumpridoPct);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2.5 font-bold text-slate-900">{c.nome}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.atendimentos}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{duracao(c.primeiraRespostaSegundos)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{duracao(c.tempoMedioAtendimentoSegundos)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.credenciamentosConcluidos}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{dias(c.tempoMedioCredenciamentoDias)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {tom ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-slate-800">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: estadoDoSla(c.slaCumpridoPct) }} aria-hidden="true" />
                            {pct(c.slaCumpridoPct)}
                            <span className="sr-only"> ({ROTULO_TOM[tom]})</span>
                          </span>
                        ) : (
                          <span className="tabular-nums">{pct(c.slaCumpridoPct)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{pct(c.slaVencidoPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Tempo médio por etapa" descricao="Cadastro → Análise → Pendência → Aprovação → Credenciado → Ativo">
          <Barras
            itens={(dados?.tempoMedioPorEtapa ?? []).map((e) => ({ rotulo: e.etapa, valor: e.mediaDias ?? 0 }))}
            larguraRotulo={130}
            unidade="d"
            cor={SERIES[0]}
            formatar={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
            vazio="Nenhuma passagem de etapa no período"
          />
        </Painel>

        <Painel titulo="Evolução do tempo de credenciamento" descricao="Período atual comparado aos três anteriores de mesmo tamanho">
          {!dados ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : (
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {dados.evolucao.map((e, idx) => {
                const anterior = idx > 0 ? dados.evolucao[idx - 1]!.tempoMedioCredenciamentoDias : null;
                const atual = e.tempoMedioCredenciamentoDias;
                const melhorou = anterior !== null && atual !== null && atual < anterior;
                const piorou = anterior !== null && atual !== null && atual > anterior;
                const ultimo = idx === dados.evolucao.length - 1;
                return (
                  <li
                    key={e.desde}
                    className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 ${
                      ultimo ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-slate-200'
                    }`}
                  >
                    <span className="text-[11px] tabular-nums text-slate-500">
                      {new Date(e.desde).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}–
                      {new Date(e.ate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      {ultimo ? ' · atual' : ''}
                    </span>
                    <span className="text-lg font-bold tabular-nums text-slate-900">{dias(atual)}</span>
                    {(melhorou || piorou) && (
                      <span className={`text-xs font-semibold ${melhorou ? 'text-emerald-700' : 'text-red-700'}`}>
                        {melhorou ? '▼ mais rápido' : '▲ mais lento'}
                      </span>
                    )}
                    <span className="text-[11.5px] text-slate-500">{e.credenciados} credenciado(s)</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Painel>
      </div>

      {/* Os relatorios tabulares antigos continuam, para quem exporta CSV/PDF. */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          aria-expanded={exportarAberto}
          onClick={() => setExportarAberto((a) => !a)}
          className="flex w-full items-center gap-3 px-5 py-4 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-600">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-slate-800">Exportar relatórios (CSV/PDF)</span>
            <span className="text-[12.5px] text-slate-500">Atendimentos por agente, filas, protocolos, jornada e funil de leads</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-slate-500 transition ${exportarAberto ? 'rotate-180' : ''}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {exportarAberto && (
          <div className="border-t border-slate-100 p-5">
            <RelatoriosPage />
          </div>
        )}
      </section>
    </div>
  );
}
