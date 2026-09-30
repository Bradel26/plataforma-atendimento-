import { useCallback, useEffect, useState } from 'react';
import { Alerta, Card, Field, Select } from '../../components/ui';
import { BarList } from '../../components/viz/BarList';
import { StatTile } from '../../components/viz/StatTile';
import { ApiError, api } from '../../lib/api';
import { ESTADO, SERIES, duracao } from '../../lib/viz';
import { moeda, type Funil } from '../../lib/types';

/**
 * Leitura comercial do funil — itens 1.2 a 1.5 do plano em ANALISE-CRM.md.
 *
 * Aba do CRM, e nao bloco no Dashboards, pelo mesmo motivo que a API ficou fora
 * do modulo `metrics`: aquela tela mede atendimento (fila, TME, agente) e esta
 * mede venda. Quem abre uma nao esta perguntando a mesma coisa.
 *
 * Regras de grafico que valem aqui, e que a tela do Nectar quebrava:
 *
 * - **nunca dois eixos.** Contagem e tempo tem escalas diferentes; sao dois
 *   blocos, nao uma barra com uma linha em cima;
 * - **cor por entidade, nunca por posicao.** Um filtro que muda quantos estagios
 *   aparecem nao pode repintar os que sobraram — por isso um matiz so;
 * - **toda barra tem tabela**, que o `BarList` ja resolve.
 */

type LinhaFunil = {
  id: string;
  nome: string;
  ordem: number;
  probabilidade: number;
  entrou: number;
  avancou: number;
  retrocedeu: number;
  ganhas: number;
  perdidas: number;
  abertasAgora: number;
  tempoMedioSegundos: number | null;
  taxaAvanco: number | null;
  taxaPerda: number | null;
};

type Balde = { total: number; valor: number };

type Risco = {
  atrasadas: Balde;
  vencendo: Balde;
  emForecast: Balde;
  semPrevisao: Balde;
  semProximaAcao: Balde;
  aguardandoParceiro: Balde;
  aguardandoEquipe: Balde;
  abertas: Balde;
  diasDeAviso: number;
};

type Fluxo = {
  ganhas: number;
  perdidas: number;
  valorGanho: number;
  valorPerdido: number;
  ticketMedio: number | null;
  taxaConversao: number | null;
  cicloMedioDias: number | null;
};

type Indicadores = {
  periodo: { desde: string; ate: string };
  periodoAnterior: { desde: string; ate: string };
  atual: Fluxo;
  anterior: Fluxo;
  variacao: Record<keyof Fluxo, number | null>;
  agora: { abertas: number; valorEmAberto: number; previsaoPonderada: number };
};

type Perdas = {
  motivos: Array<{ motivo: string; total: number; valor: number; fatia: number }>;
  total: number;
  valor: number;
};

const JANELAS = [
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
  { dias: 180, label: '180 dias' },
  { dias: 365, label: '12 meses' },
];

/** Percentual com uma casa, ou travessao quando nao houve o que medir. */
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

/**
 * Variacao contra o periodo anterior.
 *
 * Nulo vira "sem base" e nao "0%": crescer de zero nao tem percentual, e
 * estampar um numero ali seria inventar comparacao. O sinal vem junto para o
 * leitor nao precisar deduzir a direcao da cor — cor sozinha nao serve a quem
 * nao a distingue.
 */
function Variacao({ valor, inverter = false }: { valor: number | null; inverter?: boolean }) {
  if (valor === null) return <span className="text-xs text-slate-500">sem base de comparação</span>;
  const subiu = valor > 0;
  const bom = inverter ? !subiu : subiu;
  const cor = valor === 0 ? undefined : bom ? ESTADO.bom : ESTADO.atencao;
  return (
    <span className="text-xs font-medium tabular-nums" style={{ color: cor }}>
      {subiu ? '+' : ''}
      {(valor * 100).toFixed(1)}% vs período anterior
    </span>
  );
}

/** Motivo de perda em texto legivel. O enum e do banco; a tela fala português. */
const MOTIVO: Record<string, string> = {
  PRECO: 'Preço',
  SEM_INTERESSE: 'Sem interesse',
  CONCORRENTE: 'Concorrente',
  SEM_BUDGET: 'Sem budget',
  SEM_RESPOSTA: 'Sem resposta',
  OUTRO: 'Outro',
  SEM_MOTIVO: 'Sem motivo registrado',
};

export function ComercialTab() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [funilId, setFunilId] = useState('');
  const [dias, setDias] = useState(90);
  const [funil, setFunil] = useState<{ funil: { nome: string }; estagios: LinhaFunil[] } | null>(null);
  const [risco, setRisco] = useState<Risco | null>(null);
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [perdas, setPerdas] = useState<Perdas | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const ate = new Date();
    const desde = new Date(ate.getTime() - dias * 86_400_000);
    const qs = new URLSearchParams({ desde: desde.toISOString(), ate: ate.toISOString() });
    if (funilId) qs.set('funilId', funilId);
    const doFunil = funilId ? `?funilId=${funilId}` : '';

    try {
      const [f, r, i, p] = await Promise.all([
        api.get<{ funil: { nome: string }; estagios: LinhaFunil[] }>(`/comercial/funil?${qs}`),
        api.get<Risco>(`/comercial/risco${doFunil}`),
        api.get<Indicadores>(`/comercial/indicadores?${qs}`),
        api.get<Perdas>(`/comercial/perdas?${qs}`),
      ]);
      setFunil(f);
      setRisco(r);
      setInd(i);
      setPerdas(p);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a leitura comercial');
    }
  }, [dias, funilId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void api
      .get<{ funis: Funil[] }>('/funis?tipo=COMERCIAL')
      .then((f) => setFunis(f.funis))
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      <Card titulo="Leitura do Credenciamento" descricao={funil ? funil.funil.nome : 'Carregando...'}>
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <Field label="Funil">
            <Select value={funilId} onChange={(e) => setFunilId(e.target.value)}>
              <option value="">Padrão (primeiro ativo)</option>
              {funis.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Janela">
            <Select value={String(dias)} onChange={(e) => setDias(Number(e.target.value))}>
              {JANELAS.map((j) => (
                <option key={j.dias} value={j.dias}>{j.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      {/* 1.3 — risco. Primeiro na tela de proposito: e o unico bloco acionavel
          hoje; o resto e leitura. Os baldes se sobrepoem, e o texto diz isso. */}
      {risco && (
        <Card
          titulo="Credenciamentos em Risco"
          descricao={`Foto do momento — ${risco.abertas.total} aberto(s). Um cartão pode entrar em mais de um balde.`}
        >
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              rotulo="Atrasados"
              valor={risco.atrasadas.total}
              detalhe={moeda(risco.atrasadas.valor)}
              estado={risco.atrasadas.total > 0 ? ESTADO.atencao : undefined}
            />
            <StatTile
              rotulo={`Vencem em ${risco.diasDeAviso}d`}
              valor={risco.vencendo.total}
              detalhe={moeda(risco.vencendo.valor)}
            />
            <StatTile
              rotulo="Sem previsão"
              valor={risco.semPrevisao.total}
              detalhe={moeda(risco.semPrevisao.valor)}
            />
            <StatTile
              rotulo="Sem próxima ação"
              valor={risco.semProximaAcao.total}
              detalhe={moeda(risco.semProximaAcao.valor)}
              estado={risco.semProximaAcao.total > 0 ? ESTADO.atencao : undefined}
            />
            <StatTile
              rotulo="Aguardando parceiro"
              valor={risco.aguardandoParceiro.total}
              detalhe={moeda(risco.aguardandoParceiro.valor)}
            />
            <StatTile
              rotulo="Aguardando equipe"
              valor={risco.aguardandoEquipe.total}
              detalhe={moeda(risco.aguardandoEquipe.valor)}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            &quot;Sem próxima ação&quot; usa a mesma regra do cartão do funil: conta apenas tarefa com prazo em
            aberto. Nota sem prazo e registro do que aconteceu, não próximo passo. &quot;Aguardando parceiro&quot;
            e &quot;aguardando equipe&quot; contam pela etapa atual (Pendência e Aprovação).
          </p>
        </Card>
      )}

      {/* 1.4 — indicadores. Fluxo do periodo separado da foto do momento, porque
          previsao ponderada nao tem periodo anterior com que se comparar. */}
      {ind && (
        <Card titulo="Indicadores do período" descricao={`Comparados com os ${dias} dias anteriores`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <StatTile rotulo="Credenciamentos concluídos" valor={ind.atual.ganhas} />
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.ganhas} /></div>
            </div>
            <div>
              <StatTile rotulo="Desistências" valor={ind.atual.perdidas} />
              {/* Perda subindo e ruim: a cor inverte. */}
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.perdidas} inverter /></div>
            </div>
            <div>
              <StatTile rotulo="Taxa de conversão" valor={pct(ind.atual.taxaConversao)} detalhe="das decididas no período" />
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.taxaConversao} /></div>
            </div>
            <div>
              <StatTile
                rotulo="Lead Time médio"
                valor={ind.atual.cicloMedioDias === null ? '—' : `${ind.atual.cicloMedioDias.toFixed(1)} d`}
                detalhe="abertura até credenciado"
              />
              {/* Ciclo mais longo e pior: inverte tambem. */}
              <div className="mt-1 px-4"><Variacao valor={ind.variacao.cicloMedioDias} inverter /></div>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Foto do momento — sem comparação com período anterior
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile rotulo="Parceiros em andamento" valor={ind.agora.abertas} />
              <StatTile
                rotulo="Parceiros parados"
                valor={risco?.atrasadas.total ?? 0}
                detalhe={`${risco?.diasDeAviso ?? 7} dias de aviso`}
                estado={risco && risco.atrasadas.total > 0 ? ESTADO.atencao : undefined}
              />
            </div>
          </div>
        </Card>
      )}

      {/* 1.2 — funil. Dois blocos, nunca dois eixos: contagem e tempo tem
          escalas diferentes e uma linha em cima da barra mente. */}
      {funil && (
        <>
          <Card titulo="Conversão etapa a etapa" descricao={`Passagens registradas nos últimos ${dias} dias`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <caption className="sr-only">
                  Entrada, avanço, retrocesso, fechamento e tempo médio por etapa do funil
                </caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="py-2 pr-3">Etapa</th>
                    <th scope="col" className="py-2 pr-3 text-right">Entrou</th>
                    <th scope="col" className="py-2 pr-3 text-right">Avançou</th>
                    <th scope="col" className="py-2 pr-3 text-right">Voltou</th>
                    <th scope="col" className="py-2 pr-3 text-right">Avanço</th>
                    <th scope="col" className="py-2 pr-3 text-right">Ganhas</th>
                    <th scope="col" className="py-2 pr-3 text-right">Perdidas</th>
                    <th scope="col" className="py-2 pr-3 text-right">Abertas hoje</th>
                    <th scope="col" className="py-2 text-right">Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {funil.estagios.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-700">
                        {e.nome} <span className="text-xs font-normal text-slate-500">{e.probabilidade}%</span>
                      </th>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.entrou}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.avancou}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.retrocedeu || '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(e.taxaAvanco)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.ganhas || '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.perdidas || '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.abertasAgora}</td>
                      <td className="py-2 text-right tabular-nums">
                        {e.tempoMedioSegundos === null ? '—' : duracao(e.tempoMedioSegundos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              &quot;Entrou&quot; e &quot;avançou&quot; são fluxos da janela é não se fecham entre si: um cartão pode
              ter entrado antes dela e saido dentro. &quot;Abertas hoje&quot; e foto do momento. Travessão significa
              que não houve o que medir — não zero.
            </p>
          </Card>

          <Card titulo="Tempo médio por etapa" descricao="Média das saídas da janela, em tempo até passar de etapa">
            <BarList
              itens={funil.estagios
                .filter((e) => e.tempoMedioSegundos !== null)
                .map((e) => ({ rotulo: e.nome, valor: Math.round(e.tempoMedioSegundos! / 3600), cor: SERIES[0] }))}
              unidade="h"
              vazio="Nenhuma passagem de etapa concluída na janela"
            />
          </Card>
        </>
      )}

      {/* 1.5 — Win/Loss. Contagem na barra, valor na tabela ao lado, porque as
          duas ordens sao diferentes: preco perde muitas pequenas, concorrente
          perde poucas grandes. */}
      {perdas && (
        <Card
          titulo="Motivos de desistência"
          descricao={`${perdas.total} perda(s) na janela — ${moeda(perdas.valor)} deixados na mesa`}
        >
          <BarList
            itens={perdas.motivos.map((m) => ({
              rotulo: MOTIVO[m.motivo] ?? m.motivo,
              valor: m.total,
              cor: SERIES[0],
            }))}
            vazio="Nenhuma perda registrada na janela"
          />
          {perdas.motivos.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              A barra ordena por quantidade. Por valor, o maior e{' '}
              <strong className="font-medium text-slate-600">
                {MOTIVO[[...perdas.motivos].sort((a, b) => b.valor - a.valor)[0]!.motivo] ??
                  [...perdas.motivos].sort((a, b) => b.valor - a.valor)[0]!.motivo}
              </strong>{' '}
              ({moeda([...perdas.motivos].sort((a, b) => b.valor - a.valor)[0]!.valor)}) — o motivo que mais
              aparece e o que mais custa raramente são o mesmo.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
