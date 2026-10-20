import { useCallback, useEffect, useState } from 'react';
import { Alerta } from '../components/ui';
import { SkeletonCard } from '../components/ui/Skeleton';
import { PainelOperacoes } from './dashboard/PainelOperacoes';
import { BarraComAlvo, BarraEmpilhada, Barras, Indicador, Painel, Selo, TituloSecao, type Tom } from './dashboard/blocos';
import { useAuth } from '../features/auth/AuthProvider';
import { ApiError, api, getAccessToken } from '../lib/api';
import { EVENTOS, conectar } from '../lib/realtime';
import { COR_STATUS_AGENTE, ESTADO, SERIES, duracao } from '../lib/viz';
import {
  LABEL_STATUS,
  LABEL_STATUS_PROTOCOLO,
  LABEL_SITUACAO_META,
  moeda,
  type AgentStatus,
  type Indicadores,
  type MinhaMeta,
  type RelatorioAssuntos,
  type SituacaoMeta,
} from '../lib/types';

const JANELAS = [
  { valor: '1', label: 'Última hora', curto: 'última hora' },
  { valor: '24', label: '24 horas', curto: 'últimas 24 horas' },
  { valor: '168', label: '7 dias', curto: 'últimos 7 dias' },
  { valor: '720', label: '30 dias', curto: 'últimos 30 dias' },
] as const;

/** Abaixo disto a operacao esta perdendo chamada — o numero vira estado, nao dado. */
const TAXA_ATENDIMENTO_ALVO = 90;
const TAXA_ATENDIMENTO_CRITICA = 80;

const NOME_CANAL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  WEBCHAT: 'Webchat',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  EMAIL: 'E-mail',
  VOZ: 'Voz',
  PROSPECCAO_ATIVA: 'Prospecção ativa',
  INDICACAO: 'Indicação',
};

/** Ordem fixa: a cor segue o status, nunca a posicao no ranking. */
const ORDEM_STATUS_AGENTE: AgentStatus[] = ['DISPONIVEL', 'EM_ATENDIMENTO', 'PAUSA', 'OFFLINE'];

const TOM_META: Record<SituacaoMeta, Tom | null> = { ATINGIDA: 'bom', NO_RITMO: 'bom', ABAIXO: 'atencao', SEM_META: null };

function estadoDaTaxa(taxa: number | null): { tom: Tom; texto: string } | null {
  if (taxa === null) return null;
  if (taxa < TAXA_ATENDIMENTO_CRITICA) return { tom: 'grave', texto: 'Crítico' };
  if (taxa < TAXA_ATENDIMENTO_ALVO) return { tom: 'atencao', texto: 'Abaixo do alvo' };
  return { tom: 'bom', texto: 'No alvo' };
}

const mesPorExtenso = (mes: string) =>
  new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

export function DashboardsPage() {
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [assuntos, setAssuntos] = useState<RelatorioAssuntos | null>(null);
  const [horas, setHoras] = useState('24');
  const [erro, setErro] = useState<string | null>(null);
  const { temPerfil } = useAuth();
  /** Meta e processo comercial: mesmo corte de perfil das abas Leads/Oportunidades do CRM. */
  const participaDoComercial = temPerfil('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL');
  const [minhaMeta, setMinhaMeta] = useState<MinhaMeta | null>(null);

  const carregar = useCallback(async () => {
    try {
      const desde = new Date(Date.now() - Number(horas) * 60 * 60 * 1000).toISOString();
      // As duas consultas em paralelo e com a mesma janela: assunto que aparece
      // num periodo diferente do resto da tela seria comparado por engano com os
      // outros cartoes.
      const [{ indicadores }, relatorio] = await Promise.all([
        api.get<{ indicadores: Indicadores }>(`/metricas/indicadores?desde=${desde}`),
        api.get<RelatorioAssuntos>(`/metricas/assuntos?desde=${desde}&limite=8`),
      ]);
      setDados(indicadores);
      setAssuntos(relatorio);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar indicadores');
    }
  }, [horas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Meta e mensal, e nao depende da janela de horas escolhida acima — por isso
  // e uma chamada a parte, e nao entra no `Promise.all` de cima.
  useEffect(() => {
    if (!participaDoComercial) return;
    void api
      .get<MinhaMeta>(`/metas/minha?mes=${new Date().toISOString().slice(0, 7)}`)
      .then(setMinhaMeta)
      .catch(() => undefined);
  }, [participaDoComercial]);

  // Recarrega quando algo muda de verdade, em vez de consultar em loop.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = conectar({ token });
    const recarregar = () => void carregar();

    for (const evento of [
      EVENTOS.conversaNova,
      EVENTOS.conversaAtualizada,
      EVENTOS.agenteStatus,
      EVENTOS.protocoloAtualizado,
      EVENTOS.chamadaAtualizada,
    ]) {
      socket.on(evento, recarregar);
    }
    return () => {
      socket.disconnect();
    };
  }, [carregar]);

  const janela = JANELAS.find((j) => j.valor === horas) ?? JANELAS[1];

  const canais = Object.entries(dados?.conversas.porCanal ?? {})
    .map(([canal, valor]) => ({ rotulo: NOME_CANAL[canal] ?? canal, valor }))
    .sort((a, b) => b.valor - a.valor);

  const equipe = ORDEM_STATUS_AGENTE.map((status) => ({
    rotulo: LABEL_STATUS[status],
    valor: dados?.agentes.porStatus[status] ?? 0,
    cor: COR_STATUS_AGENTE[status]!,
  }));

  const protocolos = Object.entries(dados?.protocolos.porStatus ?? {})
    .map(([status, valor]) => ({
      rotulo: LABEL_STATUS_PROTOCOLO[status as keyof typeof LABEL_STATUS_PROTOCOLO] ?? status,
      valor,
    }))
    .sort((a, b) => b.valor - a.valor);
  const totalProtocolos = protocolos.reduce((soma, p) => soma + p.valor, 0);

  const listaAssuntos = assuntos?.assuntos ?? [];
  const maiorAssunto = Math.max(...listaAssuntos.map((a) => a.conversas), 0);
  const maiorTma = Math.max(...listaAssuntos.map((a) => a.tmaSegundos ?? 0), 0);
  const coberturaAssuntos =
    assuntos && assuntos.total > 0 ? Math.round(((assuntos.total - assuntos.semEtiqueta) / assuntos.total) * 100) : null;

  const voz = dados?.voz;
  const estadoVoz = estadoDaTaxa(voz?.taxaAtendimento ?? null);

  // So antes da primeira resposta: "sem dados ainda" nao e o mesmo que "zero
  // dados". Depois da primeira carga, `dados` nunca volta a `null` — o
  // recarregamento por socket so troca o conteudo, sem reativar o skeleton.
  const carregando = dados === null && !erro;
  // Arredondado ao minuto: um `new Date()` a cada render recarregaria o painel
  // de parceiros em loop.
  const desdeDaJanela = new Date(
    Math.floor((Date.now() - Number(horas) * 3_600_000) / 60_000) * 60_000,
  ).toISOString();

  const esqueleto = (n: number, classes: string) => (
    <div className={classes} aria-busy="true">
      <span className="sr-only">Carregando indicadores...</span>
      {Array.from({ length: n }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-900">Visão geral</h1>
          <p className="mt-1.5 flex items-center gap-2 text-[13px] text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50" aria-hidden="true" />
            Ao vivo · atualiza conforme os atendimentos mudam
          </p>
        </div>
        <div role="group" aria-label="Período" className="flex flex-wrap gap-1 rounded-xl bg-slate-200 p-1">
          {JANELAS.map((j) => {
            const ativa = j.valor === horas;
            return (
              <button
                key={j.valor}
                type="button"
                aria-pressed={ativa}
                onClick={() => setHoras(j.valor)}
                className={`h-[34px] rounded-lg px-3.5 text-[13px] transition ${
                  ativa ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'font-medium text-slate-700 hover:text-slate-900'
                }`}
              >
                {j.label}
              </button>
            );
          })}
        </div>
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      <section aria-labelledby="sec-agora" className="flex flex-col gap-3">
        <TituloSecao id="sec-agora">Agora</TituloSecao>
        {carregando ? (
          esqueleto(4, 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4')
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              grande
              rotulo="Em espera"
              valor={dados?.conversas.emEspera ?? '—'}
              detalhe="aguardando atendente"
              selo={dados && dados.conversas.emEspera > 0 ? <Selo tom="atencao">Fila com espera</Selo> : undefined}
            />
            <Indicador grande rotulo="Em atendimento" valor={dados?.conversas.emAtendimento ?? '—'} detalhe="conversas ativas agora" />
            <Indicador
              grande
              rotulo="SLA vencido"
              valor={dados?.protocolos.slaVencidos ?? '—'}
              detalhe="chamados fora do prazo"
              selo={dados && dados.protocolos.slaVencidos > 0 ? <Selo tom="grave">Ação necessária</Selo> : undefined}
            />
            <div className="flex min-h-[140px] flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-[18px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-700">Equipe</span>
                <span className="text-[12.5px] text-slate-500">
                  <span className="font-bold tabular-nums text-slate-900">{dados?.agentes.total ?? 0}</span> agente(s) ativo(s)
                </span>
              </div>
              <div className="mt-1">
                <BarraEmpilhada
                  legendaEmDuasColunas
                  partes={equipe}
                  rotuloAcessivel={`Agentes por status: ${equipe.map((e) => `${e.valor} ${e.rotulo.toLowerCase()}`).join(', ')}`}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="sec-qualidade" className="flex flex-col gap-3">
        <TituloSecao id="sec-qualidade">Qualidade · {janela.curto}</TituloSecao>
        {carregando ? (
          esqueleto(4, 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4')
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Indicador rotulo="TME" valor={duracao(dados?.tempos.tmeSegundos ?? null)} detalhe="tempo médio de espera" />
              <Indicador rotulo="TMA" valor={duracao(dados?.tempos.tmaSegundos ?? null)} detalhe="tempo médio de atendimento" />
              <Indicador
                rotulo="CSAT"
                valor={
                  dados && dados.satisfacao.csat !== null ? (
                    <>
                      {dados.satisfacao.csat.toLocaleString('pt-BR')}
                      <span className="text-[15px] font-semibold text-slate-500"> /5</span>
                    </>
                  ) : (
                    '—'
                  )
                }
                detalhe={`${dados?.satisfacao.csatRespostas ?? 0} resposta(s)`}
              />
              <Indicador
                rotulo="NPS"
                valor={dados?.satisfacao.nps ?? '—'}
                detalhe={`${dados?.satisfacao.npsRespostas ?? 0} resposta(s)`}
              />
            </div>
            <dl className="grid grid-cols-2 gap-y-4 rounded-2xl border border-slate-200 bg-white py-4 lg:grid-cols-4">
              {[
                { rotulo: 'Novas conversas', valor: dados?.conversas.novasNoPeriodo },
                { rotulo: 'Mensagens trocadas', valor: dados?.conversas.mensagensNoPeriodo },
                { rotulo: 'Atribuídas', valor: dados?.conversas.atribuidas },
                { rotulo: 'Finalizadas', valor: dados?.conversas.finalizadas },
              ].map((v, i) => (
                <div key={v.rotulo} className={`flex flex-col gap-0.5 px-5 ${i % 2 === 1 ? 'border-l border-slate-200' : ''} ${i === 2 ? 'lg:border-l lg:border-slate-200' : ''}`}>
                  <dt className="text-[12.5px] text-slate-500">{v.rotulo}</dt>
                  <dd className="text-xl font-bold tracking-[-0.01em] text-slate-900">{v.valor?.toLocaleString('pt-BR') ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      {carregando ? (
        esqueleto(3, 'grid gap-4 lg:grid-cols-3')
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Painel titulo="Conversas por canal" descricao={`${dados?.conversas.novasNoPeriodo ?? 0} nova(s) no período`}>
            <Barras larguraRotulo={88} itens={canais} vazio="Nenhuma conversa no período" />
          </Painel>

          <Painel
            titulo="Telefonia"
            descricao={`${voz?.total ?? 0} chamada(s) no período`}
            acao={estadoVoz ? <Selo tom={estadoVoz.tom}>{estadoVoz.texto}</Selo> : undefined}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold leading-none tracking-[-0.03em] text-slate-900">
                {voz?.taxaAtendimento != null ? `${voz.taxaAtendimento}%` : '—'}
              </span>
              <span className="text-[13px] text-slate-500">das entrantes atendidas</span>
            </div>
            {voz?.taxaAtendimento != null && (
              <BarraComAlvo
                valor={voz.taxaAtendimento}
                alvo={TAXA_ATENDIMENTO_ALVO}
                rotuloAlvo={`alvo ${TAXA_ATENDIMENTO_ALVO}%`}
                cor={estadoVoz?.tom === 'bom' ? ESTADO.bom : estadoVoz?.tom === 'grave' ? ESTADO.grave : ESTADO.atencao}
              />
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <dt className="text-xs text-slate-500">Entrantes</dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{voz?.entrantes ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Saintes</dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{voz?.saintes ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Perdidas</dt>
                <dd className={`mt-0.5 text-base font-bold tabular-nums ${voz && voz.naoAtendidas > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {voz?.naoAtendidas ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">TMA de voz</dt>
                <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{duracao(voz?.tma ?? null)}</dd>
              </div>
            </dl>
          </Painel>

          <Painel
            titulo="Protocolos por status"
            descricao={`${totalProtocolos} chamado(s) · ${dados?.protocolos.slaVencidos ?? 0} com SLA vencido`}
          >
            <Barras larguraRotulo={124} itens={protocolos} vazio="Nenhum chamado registrado" />
          </Painel>
        </div>
      )}

      {!carregando && (
        <div className={`grid gap-4 ${participaDoComercial ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
          {/*
            Volume e tempo por assunto na mesma tabela, mas so o volume vira
            barra: escalas diferentes (40 atendimentos e 900 segundos) nao dividem
            eixo. O tempo fica como numero, com destaque no maior.
          */}
          <Painel
            titulo="Atendimentos por assunto"
            descricao="Etiquetas das conversas no período"
            acao={
              coberturaAssuntos !== null ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  {coberturaAssuntos}% classificados · {assuntos!.semEtiqueta} sem etiqueta
                </span>
              ) : undefined
            }
          >
            {listaAssuntos.length === 0 || maiorAssunto === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma conversa etiquetada no período. Etiquete no painel de atendimento.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11.5px] font-semibold text-slate-500">
                        <th scope="col" className="pb-2 font-semibold">Assunto</th>
                        <th scope="col" className="pb-2 pl-3 font-semibold">Atendimentos</th>
                        <th scope="col" className="pb-2 pl-3 text-right font-semibold">Tempo médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaAssuntos.map((a) => {
                        const maisLento = a.tmaSegundos !== null && a.tmaSegundos === maiorTma && maiorTma > 0;
                        return (
                          <tr key={a.tag} className="border-b border-slate-100 last:border-0">
                            <th scope="row" className="whitespace-nowrap py-2.5 pr-3 text-left font-normal text-slate-700">{a.tag}</th>
                            <td className="w-[55%] py-2.5 pl-3">
                              <span className="flex items-center gap-2.5">
                                <span className="block h-2 flex-1" aria-hidden="true">
                                  <span
                                    className="block h-full rounded-r"
                                    style={{ width: `${Math.max((a.conversas / maiorAssunto) * 100, 1.5)}%`, backgroundColor: SERIES[0] }}
                                  />
                                </span>
                                <span className="w-7 text-right font-semibold tabular-nums text-slate-800">{a.conversas}</span>
                              </span>
                            </td>
                            <td className={`py-2.5 pl-3 text-right tabular-nums ${maisLento ? 'font-bold text-amber-700' : 'text-slate-700'}`}>
                              {a.tmaSegundos === null ? '—' : `${Math.round(a.tmaSegundos / 60)} min`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500">
                  Barras descrevem só os atendimentos etiquetados. Em destaque, o assunto que mais consome tempo por atendimento
                  (da atribuição ao encerramento, nas conversas finalizadas).
                </p>
              </>
            )}
          </Painel>

          {/*
            Meta no dashboard (item 4.2): so para quem participa do processo
            comercial. Uma pessoa de atendimento nao tem meta de venda, e mostrar
            "sem meta" para ela acusaria uma ausencia que nao e dela.
          */}
          {participaDoComercial && (
            <Painel
              titulo="Minha meta do mês"
              descricao={minhaMeta ? mesPorExtenso(minhaMeta.mes) : undefined}
              acao={
                minhaMeta?.definida && TOM_META[minhaMeta.situacao] ? (
                  <Selo tom={TOM_META[minhaMeta.situacao]!}>{LABEL_SITUACAO_META[minhaMeta.situacao]}</Selo>
                ) : undefined
              }
            >
              {minhaMeta === null ? (
                <p className="text-sm text-slate-500">Carregando...</p>
              ) : !minhaMeta.definida ? (
                <p className="text-sm text-slate-500">Ninguém definiu uma meta para você neste mês.</p>
              ) : (
                <MetaDoMes meta={minhaMeta} />
              )}
            </Painel>
          )}
        </div>
      )}

      {/* Visao geral dos parceiros, uma metade por operacao (TIM | Starlink).
          A janela de "novos no periodo" e a mesma do seletor acima. */}
      <PainelOperacoes desde={desdeDaJanela} />
    </div>
  );
}

function MetaDoMes({ meta }: { meta: MinhaMeta }) {
  const pct = (valor: number) => (meta.meta > 0 ? (valor / meta.meta) * 100 : 0);
  const percentual = meta.percentual ?? pct(meta.realizado);
  const projecaoPct = meta.projecao === null ? null : pct(meta.projecao);
  // A barra cabe o maior entre meta, realizado e projecao, com folga para o circulo.
  const escala = Math.max(100, percentual, projecaoPct ?? 0) * 1.08;
  return (
    <>
      <div>
        <span className="text-3xl font-bold tracking-[-0.02em] text-slate-900">{moeda(meta.realizado)}</span>
        <p className="mt-0.5 text-[13px] text-slate-500">
          de {moeda(meta.meta)} · <strong className="text-slate-900">{Math.round(percentual)}%</strong>
        </p>
      </div>
      <BarraComAlvo valor={percentual} alvo={100} rotuloAlvo="meta" escala={escala} projecao={projecaoPct} cor={SERIES[0]} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-xs text-slate-500">Projeção</dt>
          {/* Nula em mes futuro (nada a extrapolar ainda). */}
          <dd className="mt-0.5 text-[15px] font-bold text-slate-900">{meta.projecao === null ? '—' : moeda(meta.projecao)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Variação</dt>
          <dd
            className={`mt-0.5 text-[15px] font-bold ${
              meta.variacao === null ? 'text-slate-900' : meta.variacao >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {meta.variacao === null ? '—' : `${meta.variacao >= 0 ? '+ ' : ''}${moeda(meta.variacao)}`}
          </dd>
        </div>
      </dl>
      {projecaoPct !== null && <p className="text-xs text-slate-500">O círculo marca a projeção para o fim do mês.</p>}
    </>
  );
}
