import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alerta, Input, Select } from '../components/ui';
import { CabecalhoPagina, Segmentado } from '../components/ui/Pagina';
import { ApiError, api } from '../lib/api';
import { ESTADO, SERIES } from '../lib/viz';
import type { GestaoOperacao, OperacaoEsteira, Semaforo } from '../lib/types';
import { BarraEmpilhada, Barras, Indicador, Painel, Selo } from './dashboard/blocos';
import { ConsumoDeIaCard } from './gestao/ConsumoDeIa';
import { ComercialTab } from './crm/ComercialTab';

const hoje = () => new Date().toISOString().slice(0, 10);
const trintaDias = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const COR_SEMAFORO: Record<Semaforo, string> = {
  NORMAL: ESTADO.bom,
  ATENCAO: ESTADO.atencao,
  CRITICO: ESTADO.grave,
};

export const LABEL_SEMAFORO: Record<Semaforo, string> = {
  NORMAL: 'Normal',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico',
};

// So tons que o tema escuro remapeia (index.css).
const CLASSE_SEMAFORO: Record<Semaforo, string> = {
  NORMAL: 'bg-emerald-50 text-emerald-700',
  ATENCAO: 'bg-amber-50 text-amber-700',
  CRITICO: 'bg-red-50 text-red-700',
};

function Farol({ s }: { s: Semaforo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-2.5 text-xs font-semibold ${CLASSE_SEMAFORO[s]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COR_SEMAFORO[s] }} aria-hidden />
      {LABEL_SEMAFORO[s]}
    </span>
  );
}

const dias = (n: number | null) => (n === null ? '—' : `${String(n).replace('.', ',')} dia${n === 1 ? '' : 's'}`);

const ABAS = [
  { valor: 'esteira', rotulo: 'Esteira' },
  { valor: 'comercial', rotulo: 'Funil comercial' },
  { valor: 'ia', rotulo: 'Consumo de IA' },
] as const;
type Aba = (typeof ABAS)[number]['valor'];

/**
 * Area da Gestao — tempo, produtividade e gargalos da operacao.
 *
 * Nao repete o Dashboard: la esta "quantos parceiros temos"; aqui esta "quanto
 * tempo levam, onde param e quem esta parado". Tres perguntas, na ordem do
 * documento: quantos entram, em que etapa estao, onde travam.
 *
 * O funil comercial e o consumo de IA moram em abas proprias: cada um le uma
 * coisa diferente e, empilhados, empurravam a esteira para fora da tela.
 */
export function GestaoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaDaUrl = searchParams.get('aba');
  const aba: Aba = ABAS.some((a) => a.valor === abaDaUrl) ? (abaDaUrl as Aba) : 'esteira';
  const [dados, setDados] = useState<GestaoOperacao | null>(null);
  const [operacoes, setOperacoes] = useState<OperacaoEsteira[]>([]);
  const [desde, setDesde] = useState(trintaDias());
  const [ate, setAte] = useState(hoje());
  const [funilId, setFunilId] = useState('');
  const [limiteDias, setLimiteDias] = useState(5);
  const [horas, setHoras] = useState(24);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ funis: OperacaoEsteira[] }>('/credenciamentos/funis')
      .then((r) => setOperacoes(r.funis))
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({
      desde,
      ate: `${ate}T23:59:59`,
      limiteDias: String(limiteDias),
      horasSemInteracao: String(horas),
    });
    if (funilId) q.set('funilId', funilId);
    try {
      const { gestao } = await api.get<{ gestao: GestaoOperacao }>(`/credenciamentos/gestao?${q.toString()}`);
      setDados(gestao);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a gestão da operação');
    }
  }, [desde, ate, funilId, limiteDias, horas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const tempoEtapa = (dados?.tempoMedioPorEtapa ?? []).map((e) => ({
    rotulo: `${e.etapa} (${e.passagens})`,
    valor: e.mediaDias ?? 0,
  }));
  const lenta = [...(dados?.tempoMedioPorEtapa ?? [])].sort((a, b) => (b.mediaDias ?? 0) - (a.mediaDias ?? 0))[0];

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina titulo="Gestão da operação" descricao="Quanto tempo leva, onde para e quem está parado">
        <Segmentado
          papel="tab"
          rotulo="Área da gestão"
          opcoes={ABAS}
          valor={aba}
          aoMudar={(v) => setSearchParams(v === 'esteira' ? {} : { aba: v }, { replace: true })}
        />
      </CabecalhoPagina>

      {aba === 'comercial' && <ComercialTab />}
      {aba === 'ia' && <ConsumoDeIaCard />}

      {aba === 'esteira' && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              De
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[150px]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Até
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-[150px]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Operação
              <Select value={funilId} onChange={(e) => setFunilId(e.target.value)} className="w-48">
                <option value="">Todas</option>
                {operacoes.map((o) => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </Select>
            </label>
            <span className="hidden h-9 w-px self-end bg-slate-200 sm:block" aria-hidden="true" />
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Parado a partir de (dias)
              <Input
                type="number"
                min={1}
                max={90}
                value={limiteDias}
                onChange={(e) => setLimiteDias(Math.max(1, Number(e.target.value) || 1))}
                className="w-24"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Sem interação há (horas)
              <Input
                type="number"
                min={1}
                max={720}
                value={horas}
                onChange={(e) => setHoras(Math.max(1, Number(e.target.value) || 1))}
                className="w-24"
              />
            </label>
            <p className="basis-full text-xs text-slate-500 xl:ml-auto xl:basis-auto xl:max-w-xs xl:self-center xl:text-right">
              O período vale para os tempos médios; parados e sem interação são a foto de agora
            </p>
          </div>

          {erro && <Alerta>{erro}</Alerta>}

          <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Indicador
              rotulo="Tempo de credenciamento"
              valor={dias(dados?.tempoMedioCredenciamentoDias ?? null)}
              detalhe={`do cadastro ao credenciado · ${dados?.credenciadosNoPeriodo ?? 0} no período`}
            />
            <Indicador
              rotulo="Parceiros parados"
              valor={dados?.parceirosParados ?? '—'}
              detalhe={`${limiteDias}+ dias sem avançar na esteira`}
              selo={dados && dados.parceirosParados > 0 ? <Selo tom="grave">Agir</Selo> : undefined}
            />
            <Indicador
              rotulo="Maior tempo parado"
              valor={dados?.maiorTempoParado ? dias(dados.maiorTempoParado.dias) : '—'}
              detalhe={
                dados?.maiorTempoParado
                  ? `${dados.maiorTempoParado.parceiro} · ${dados.maiorTempoParado.etapa}`
                  : 'ninguém parado'
              }
            />
            <Indicador
              rotulo="Etapa mais lenta"
              valor={lenta ? dias(lenta.mediaDias) : '—'}
              detalhe={lenta?.etapa ?? 'sem passagens no período'}
            />
            <Indicador
              rotulo="Sem interação"
              valor={dados?.atendimentosSemInteracao.total ?? '—'}
              detalhe={`abertos e sem mensagem há ${horas}h+`}
              selo={dados && dados.atendimentosSemInteracao.total > 0 ? <Selo tom="atencao">Atenção</Selo> : undefined}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Painel titulo="Onde a esteira acumula" descricao="Parceiros em cada etapa agora; em vermelho, os parados">
              {(dados?.volumePorEtapa ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma esteira configurada.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {dados!.volumePorEtapa.map((v) => (
                    <div key={v.funil.id}>
                      <p className="mb-2 text-[12.5px] font-bold text-slate-600">{v.funil.nome}</p>
                      <ol className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(118px,1fr))]">
                        {v.etapas.map((e, i) => (
                          <li
                            key={e.id}
                            className={`flex min-w-0 flex-col gap-1 rounded-xl border px-3 py-2.5 ${
                              e.parados > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            <span className="truncate text-[11.5px] text-slate-600" title={e.nome}>{i + 1}. {e.nome}</span>
                            <span className="text-xl font-bold tabular-nums text-slate-900">{e.total}</span>
                            <span className={`text-[11.5px] font-semibold tabular-nums ${e.parados > 0 ? 'text-red-700' : 'text-slate-500'}`}>
                              {e.parados > 0 ? `${e.parados} parado(s)` : 'nenhum parado'}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                  {dados && (
                    <div className="border-t border-slate-100 pt-3">
                      <p className="mb-2 text-[12.5px] font-semibold text-slate-700">Semáforo dos parceiros na esteira</p>
                      <BarraEmpilhada
                        rotuloAcessivel={`Dentro do tempo esperado ${dados.semaforoContagem.NORMAL}, próximo do limite ${dados.semaforoContagem.ATENCAO}, acima do tempo esperado ${dados.semaforoContagem.CRITICO}`}
                        partes={[
                          { rotulo: 'Dentro do tempo esperado', valor: dados.semaforoContagem.NORMAL, cor: COR_SEMAFORO.NORMAL },
                          { rotulo: 'Próximo do limite', valor: dados.semaforoContagem.ATENCAO, cor: COR_SEMAFORO.ATENCAO },
                          { rotulo: 'Acima do tempo esperado', valor: dados.semaforoContagem.CRITICO, cor: COR_SEMAFORO.CRITICO },
                        ]}
                      />
                    </div>
                  )}
                </div>
              )}
            </Painel>

            <Painel titulo="Leadtime por etapa" descricao="Média das saídas de cada etapa no período, em dias (passagens)">
              <Barras itens={tempoEtapa} larguraRotulo={190} unidade="d" cor={SERIES[0]} formatar={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} vazio="Nenhum parceiro mudou de etapa no período" />
            </Painel>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="gestao-parados">
              <div className="px-5 py-4">
                <h3 id="gestao-parados" className="text-[15px] font-semibold text-slate-800">Parceiros sem movimentação</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  Os {dados?.semMovimentacao.length ?? 0} parados há mais tempo, fora da etapa Ativo
                </p>
              </div>
              {!dados || dados.semMovimentacao.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-500">Nenhum parceiro na esteira.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="border-y border-slate-200 bg-slate-50 text-[11.5px] text-slate-500">
                      <tr>
                        {['Parceiro', 'Responsável', 'Etapa', 'Última mov.', 'Parado', 'Situação'].map((h) => (
                          <th key={h} className="whitespace-nowrap px-4 py-2.5 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {dados.semMovimentacao.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2.5">
                            <Link to={`/contatos/${p.contato.id}`} className="font-bold text-blue-700 hover:underline">
                              {p.parceiro}
                            </Link>
                            <span className="block text-xs text-slate-500">{p.operacao.nome}</span>
                          </td>
                          <td className="px-4 py-2.5">{p.responsavel?.nome ?? '—'}</td>
                          <td className="px-4 py-2.5">{p.etapa}</td>
                          <td className="px-4 py-2.5 tabular-nums">{new Date(p.ultimaMovimentacao).toLocaleDateString('pt-BR')}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 font-bold tabular-nums text-slate-900">{dias(p.diasParado)}</td>
                          <td className="px-4 py-2.5"><Farol s={p.semaforo} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="gestao-sem-interacao">
              <div className="px-5 py-4">
                <h3 id="gestao-sem-interacao" className="text-[15px] font-semibold text-slate-800">Atendimentos sem interação</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">Conversas abertas sem nenhuma mensagem há {horas} hora(s) ou mais</p>
              </div>
              {!dados || dados.atendimentosSemInteracao.lista.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-500">Nenhum atendimento parado.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 px-3 pb-3">
                  {dados.atendimentosSemInteracao.lista.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-slate-900">{c.contato.nome}</span>
                        <span className="text-xs text-slate-500">{c.canal} · {c.agente?.nome ?? 'sem consultor'}</span>
                      </span>
                      <span className="text-[13px] font-bold tabular-nums text-slate-800">
                        {c.horasSemInteracao >= 48
                          ? `${Math.floor(c.horasSemInteracao / 24)} dias`
                          : `${c.horasSemInteracao} h`}
                      </span>
                      <Farol s={c.semaforo} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
