import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Card, Field, Input, Select } from '../components/ui';
import { BarList } from '../components/viz/BarList';
import { StatTile } from '../components/viz/StatTile';
import { ApiError, api } from '../lib/api';
import { ESTADO, SERIES } from '../lib/viz';
import type { GestaoOperacao, OperacaoEsteira, Semaforo } from '../lib/types';
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

function Farol({ s }: { s: Semaforo }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_SEMAFORO[s] }} aria-hidden />
      {LABEL_SEMAFORO[s]}
    </span>
  );
}

const dias = (n: number | null) => (n === null ? '—' : `${String(n).replace('.', ',')} dia${n === 1 ? '' : 's'}`);

/**
 * Area da Gestao — tempo, produtividade e gargalos da operacao.
 *
 * Nao repete o Dashboard: la esta "quantos parceiros temos"; aqui esta "quanto
 * tempo levam, onde param e quem esta parado". Tres perguntas, na ordem do
 * documento: quantos entram, em que etapa estao, onde travam.
 */
export function GestaoPage() {
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
    cor: SERIES[1],
  }));

  return (
    <div className="space-y-5">
      <Card titulo="Filtros" descricao="O período vale para os tempos medios; parados e sem interação são a foto de agora">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="De">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Até">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Field>
          <Field label="Operação">
            <Select value={funilId} onChange={(e) => setFunilId(e.target.value)}>
              <option value="">Todas</option>
              {operacoes.map((o) => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Parado a partir de" hint="dias sem avançar">
            <Input
              type="number"
              min={1}
              max={90}
              value={limiteDias}
              onChange={(e) => setLimiteDias(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
          <Field label="Sem interação há" hint="horas">
            <Input
              type="number"
              min={1}
              max={720}
              value={horas}
              onChange={(e) => setHoras(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          rotulo="Tempo médio de credenciamento"
          valor={dias(dados?.tempoMedioCredenciamentoDias ?? null)}
          detalhe={`do cadastro ao credenciado · ${dados?.credenciadosNoPeriodo ?? 0} no período`}
        />
        <StatTile
          rotulo="Parceiros parados"
          valor={dados?.parceirosParados ?? '—'}
          detalhe={`${limiteDias}+ dias sem avançar na esteira`}
          estado={dados && dados.parceirosParados > 0 ? ESTADO.grave : undefined}
        />
        <StatTile
          rotulo="Maior tempo parado"
          valor={dados?.maiorTempoParado ? dias(dados.maiorTempoParado.dias) : '—'}
          detalhe={
            dados?.maiorTempoParado
              ? `${dados.maiorTempoParado.parceiro} · ${dados.maiorTempoParado.etapa}`
              : 'ninguém parado'
          }
        />
        <StatTile
          rotulo="Etapa mais lenta"
          valor={(() => {
            const lenta = [...(dados?.tempoMedioPorEtapa ?? [])].sort((a, b) => (b.mediaDias ?? 0) - (a.mediaDias ?? 0))[0];
            return lenta ? dias(lenta.mediaDias) : '—';
          })()}
          detalhe={
            [...(dados?.tempoMedioPorEtapa ?? [])].sort((a, b) => (b.mediaDias ?? 0) - (a.mediaDias ?? 0))[0]?.etapa ??
            'sem passagens no período'
          }
        />
        <StatTile
          rotulo="Atendimentos sem interação"
          valor={dados?.atendimentosSemInteracao.total ?? '—'}
          detalhe={`abertos e sem mensagem há ${horas}h+`}
          estado={dados && dados.atendimentosSemInteracao.total > 0 ? ESTADO.atencao : undefined}
        />
      </div>

      {dados && (
        <p className="flex flex-wrap gap-4 text-xs text-slate-600">
          <span>
            <Farol s="NORMAL" /> dentro do tempo esperado ({dados.semaforoContagem.NORMAL})
          </span>
          <span>
            <Farol s="ATENCAO" /> próximo do limite ({dados.semaforoContagem.ATENCAO})
          </span>
          <span>
            <Farol s="CRITICO" /> acima do tempo esperado ({dados.semaforoContagem.CRITICO})
          </span>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Onde a esteira acumula" descricao="Parceiros em cada etapa agora; entre parenteses, os parados">
          {(dados?.volumePorEtapa ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma esteira configurada.</p>
          ) : (
            <div className="space-y-4">
              {dados!.volumePorEtapa.map((v) => (
                <div key={v.funil.id}>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">{v.funil.nome}</p>
                  <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                    {v.etapas.map((e, i) => (
                      <li key={e.id} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-slate-400" aria-hidden>→</span>}
                        <span
                          className={`rounded-lg border px-2.5 py-1 ${
                            e.parados > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <span className="text-slate-600">{e.nome}</span>{' '}
                          <span className="font-semibold tabular-nums text-slate-800">{e.total}</span>
                          {e.parados > 0 && <span className="text-xs text-red-700"> ({e.parados})</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card titulo="Leadtime" descricao="Média das saídas de cada etapa no período, em dias (passagens)">
          <BarList itens={tempoEtapa} unidade="dias" vazio="Nenhum parceiro mudou de etapa no período" />
        </Card>
      </div>

      <Card
        titulo="Parceiros sem movimentação"
        descricao={`Os ${dados?.semMovimentacao.length ?? 0} parados há mais tempo, fora da etapa Ativo`}
      >
        {!dados || dados.semMovimentacao.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum parceiro na esteira.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Parceiro</th>
                  <th className="pb-2 pr-3 font-medium">Responsável</th>
                  <th className="pb-2 pr-3 font-medium">Operação</th>
                  <th className="pb-2 pr-3 font-medium">Etapa</th>
                  <th className="pb-2 pr-3 font-medium">Última movimentação</th>
                  <th className="pb-2 pr-3 font-medium">Tempo parado</th>
                  <th className="pb-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dados.semMovimentacao.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3">
                      <Link to={`/contatos/${p.contato.id}`} className="font-medium text-slate-800 hover:underline">
                        {p.parceiro}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{p.responsavel?.nome ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{p.operacao.nome}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{p.etapa}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600">
                      {new Date(p.ultimaMovimentacao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-800">{dias(p.diasParado)}</td>
                    <td className="py-2.5">
                      <Farol s={p.semaforo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        titulo="Atendimentos sem interação"
        descricao={`Conversas abertas sem nenhuma mensagem há ${horas} hora(s) ou mais`}
      >
        {!dados || dados.atendimentosSemInteracao.lista.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum atendimento parado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dados.atendimentosSemInteracao.lista.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-800">{c.contato.nome}</span>{' '}
                  <Badge>{c.canal}</Badge>{' '}
                  <span className="text-xs text-slate-500">{c.agente?.nome ?? 'sem consultor'}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-slate-600">
                    {c.horasSemInteracao >= 48
                      ? `${Math.floor(c.horasSemInteracao / 24)} dias`
                      : `${c.horasSemInteracao} h`}
                  </span>
                  <Farol s={c.semaforo} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Leitura do funil de Vendas/Jornadas do CRM — funil diferente da esteira
          acima (ver spec 2026-09-29-leitura-do-credenciamento-design.md).
          Convivem na mesma pagina de proposito: cada uma le um funil. */}
      <ComercialTab />

      {/* Consumo de IA (item 6.8): custo da instalacao, lido por quem administra. */}
      <ConsumoDeIaCard />
    </div>
  );
}
