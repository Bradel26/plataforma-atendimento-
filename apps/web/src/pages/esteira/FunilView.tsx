import { useEffect, useId, useMemo, useState } from 'react';
import { Alerta, Badge, Button, EmptyState, Input } from '../../components/ui';
import { Segmentado } from '../../components/ui/Pagina';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { ApiError, api } from '../../lib/api';
import type { ChaveEtapa, FunilDoPeriodo, RespostaFunil } from '../../lib/esteiraTypes';
import { SERIES } from '../../lib/viz';
import { parametroDaOperacao, queryDosFiltros, type PropsDaVisao } from './estadoEsteira';
import {
  diaDeHoje,
  filtrosForaDoFunil,
  formatarDias,
  formatarPercentual,
  percentuaisDoFunil,
  periodoAnterior,
  periodoDoPreset,
  periodoExibido,
  type PeriodoDias,
} from './funilEsteira';

type Preset = '30' | '90' | '180' | '365' | 'personalizado';
const PRESETS: ReadonlyArray<{ valor: Preset; rotulo: string }> = [
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: '180', rotulo: '6 meses' },
  { valor: '365', rotulo: '12 meses' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
];
const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Série única: a cor de dado é fixa (`lib/viz`), nunca a da marca. */
const COR_BARRA = SERIES[0];

/**
 * Funil da operação (spec 6.2): coorte de quem ENTROU no período (padrão:
 * últimos 90 dias), quantos alcançaram cada etapa do trilho, conversão para a
 * próxima, saídas e mediana dos dias nas passagens concluídas; gargalo
 * destacado por forma e texto. "Comparar" põe o período anterior de mesma
 * duração ao lado. Clicar numa etapa abre a Lista filtrada por ela.
 *
 * Etapa, situação e "parado há" não se aplicam (a API os ignora para não
 * enviesar a coorte), e o período é o daqui, por data de entrada.
 */
export function FunilView({ operacao, filtros, irPara }: PropsDaVisao) {
  const hoje = useMemo(() => diaDeHoje(), []);
  const [preset, setPreset] = useState<Preset>('90');
  const [personalizado, setPersonalizado] = useState<PeriodoDias>(() => periodoDoPreset(hoje, 90));
  const [comparar, setComparar] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const invalido =
    preset === 'personalizado' &&
    (!DIA.test(personalizado.desde) || !DIA.test(personalizado.ate) || personalizado.desde > personalizado.ate);
  const periodo = preset === 'personalizado' ? personalizado : periodoDoPreset(hoje, Number(preset));

  const query = useMemo(() => {
    const q = queryDosFiltros({
      ...filtros,
      etapas: undefined,
      situacoes: undefined,
      paradoHaMaisDe: undefined,
      periodoCampo: undefined,
      desde: periodo.desde,
      ate: periodo.ate,
    });
    if (comparar) {
      const anterior = periodoAnterior(periodo);
      q.set('compararDesde', anterior.desde);
      q.set('compararAte', anterior.ate);
    }
    return q.toString();
  }, [filtros, periodo.desde, periodo.ate, comparar]); // eslint-disable-line react-hooks/exhaustive-deps

  const { dados, erro, carregando } = useFunil(`/esteiras/${parametroDaOperacao(operacao)}/funil?${query}`, invalido, tentativa);
  const fora = filtrosForaDoFunil(filtros);

  const abrirNaLista = (chave: ChaveEtapa) => irPara('lista', { ...filtros, etapas: [chave] });

  const mudarPreset = (p: Preset) => {
    if (p === 'personalizado' && preset !== 'personalizado') setPersonalizado(periodo);
    setPreset(p);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmentado rotulo="Período de entrada" tamanho="sm" opcoes={PRESETS} valor={preset} aoMudar={mudarPreset} />
        {preset === 'personalizado' && (
          <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-600">
            <label className="flex items-center gap-1.5">
              De
              <Input
                type="date"
                value={personalizado.desde}
                max={personalizado.ate || hoje}
                onChange={(e) => setPersonalizado((p) => ({ ...p, desde: e.target.value }))}
                className="py-1"
                style={{ width: '9.5rem' }}
              />
            </label>
            <label className="flex items-center gap-1.5">
              até
              <Input
                type="date"
                value={personalizado.ate}
                min={personalizado.desde}
                onChange={(e) => setPersonalizado((p) => ({ ...p, ate: e.target.value }))}
                className="py-1"
                style={{ width: '9.5rem' }}
              />
            </label>
          </span>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
          Comparar com o período anterior
        </label>
        <Button variante="neutro" tamanho="sm" className="ml-auto" onClick={() => setTentativa((t) => t + 1)}>
          Atualizar
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        Coorte: parceiros que entraram no período. Mediana: mediana dos dias nas passagens concluídas pela etapa. Clique numa
        etapa para ver os parceiros que estão nela agora.
      </p>
      {fora.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-slate-500" role="note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className="mt-px shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>
            Não se aplicam ao funil: {fora.join(', ')}. Ele conta quem entrou no período escolhido aqui; os demais filtros valem.
          </span>
        </p>
      )}

      {invalido ? (
        <Alerta tipo="aviso">Escolha as duas datas, com o início antes do fim.</Alerta>
      ) : erro ? (
        <Alerta>
          <span className="flex flex-wrap items-center justify-between gap-2">
            {erro}
            <Button variante="neutro" tamanho="sm" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </Button>
          </span>
        </Alerta>
      ) : !dados ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonBloco className="h-10" />
          <SkeletonBloco className="h-72" />
        </div>
      ) : (
        <div className={`grid gap-4 ${dados.comparado ? 'lg:grid-cols-2' : ''} ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
          <PainelFunil titulo={dados.comparado ? 'Período escolhido' : 'Funil do período'} funil={dados.atual} aoAbrir={abrirNaLista} />
          {dados.comparado && <PainelFunil titulo="Período anterior" funil={dados.comparado} aoAbrir={abrirNaLista} />}
        </div>
      )}
    </div>
  );
}

/** Busca o funil; mantém o último resultado na tela enquanto o novo chega. */
function useFunil(caminho: string, pausado: boolean, tentativa: number) {
  const [dados, setDados] = useState<RespostaFunil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (pausado) return;
    let ativo = true;
    setErro(null);
    setCarregando(true);
    api
      .get<RespostaFunil>(caminho)
      .then((r) => ativo && setDados(r))
      .catch((e) => ativo && setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o funil'))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [caminho, pausado, tentativa]);

  return { dados, erro, carregando };
}

function PainelFunil({
  titulo,
  funil,
  aoAbrir,
}: {
  titulo: string;
  funil: FunilDoPeriodo;
  aoAbrir: (chave: ChaveEtapa) => void;
}) {
  const [comoTabela, setComoTabela] = useState(false);
  const idTabela = useId();
  const periodo = periodoExibido(funil.periodo);
  const etapas = percentuaisDoFunil(funil.etapas);
  const gargalo = etapas.find((e) => e.gargalo);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label={`${titulo}: ${periodo.desde} a ${periodo.ate}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800">{titulo}</h2>
          <p className="text-xs text-slate-500">
            {periodo.desde} a {periodo.ate}
          </p>
        </div>
        <p className="text-sm text-slate-600">
          <span className="text-xl font-semibold tabular-nums text-slate-900">{funil.total.toLocaleString('pt-BR')}</span>{' '}
          {funil.total === 1 ? 'parceiro entrou' : 'parceiros entraram'}
        </p>
      </header>

      {funil.total === 0 ? (
        <EmptyState titulo="Nenhum parceiro entrou neste período" descricao="Escolha outro período ou ajuste os filtros." />
      ) : comoTabela ? (
        <div className="overflow-x-auto" id={idTabela}>
          <table className="w-full text-sm">
            <caption className="sr-only">
              {titulo}, {periodo.desde} a {periodo.ate}: etapas do funil
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-1.5 pr-3 font-medium">Etapa</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Alcançaram</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">% da 1ª</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Conversão p/ próxima</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Saídas</th>
                <th scope="col" className="py-1.5 text-right font-medium">Mediana</th>
              </tr>
            </thead>
            <tbody>
              {etapas.map((e) => (
                <tr key={e.chave} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-slate-700">
                    {e.nome}
                    {e.gargalo && <span className="ml-1.5 text-xs font-semibold text-slate-600">(gargalo)</span>}
                  </th>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-slate-800">{e.alcancaram.toLocaleString('pt-BR')}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{formatarPercentual(e.daPrimeira)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{formatarPercentual(e.conversaoParaProxima)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{e.saidas.toLocaleString('pt-BR')}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">{formatarDias(e.medianaDias)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="flex flex-col">
          {etapas.map((e, i) => {
            const descricao = `${e.nome}: ${e.alcancaram.toLocaleString('pt-BR')} alcançaram (${formatarPercentual(e.daPrimeira)} da primeira etapa), ${e.saidas} saída(s), mediana ${formatarDias(e.medianaDias)}${e.gargalo ? '. Gargalo do funil' : ''}`;
            return (
              <li key={e.chave} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => aoAbrir(e.chave)}
                  aria-label={`${descricao}. Ver na Lista os parceiros nesta etapa.`}
                  className={`anel-de-foco group flex w-full flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50 ${
                    e.gargalo ? 'outline-dashed outline-2 -outline-offset-2' : ''
                  }`}
                  style={e.gargalo ? { outlineColor: 'var(--estado-atencao)' } : undefined}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 text-xs tabular-nums text-slate-400">{e.trilho}</span>
                      <span className="truncate text-[13.5px] font-semibold text-slate-800">{e.nome}</span>
                      {e.gargalo && (
                        <Badge tom="alerta">
                          <span className="inline-flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                              <path d="M12 9v4M12 17h.01" />
                            </svg>
                            Gargalo
                          </span>
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="text-sm font-semibold text-slate-900">{e.alcancaram.toLocaleString('pt-BR')}</span>
                      <span className="ml-1.5 text-xs text-slate-500">{formatarPercentual(e.daPrimeira)}</span>
                    </span>
                  </span>
                  <span className="ml-7 block h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <span
                      className="block h-full rounded-full transition-[width] group-hover:brightness-110"
                      style={{
                        width: e.alcancaram > 0 ? `max(${e.largura * 100}%, 4px)` : '0',
                        backgroundColor: COR_BARRA,
                      }}
                      title={descricao}
                    />
                  </span>
                  <span className="ml-7 flex flex-wrap gap-x-3 text-xs text-slate-500">
                    <span>
                      Saídas: <span className="tabular-nums text-slate-700">{e.saidas.toLocaleString('pt-BR')}</span>
                    </span>
                    <span>
                      Mediana: <span className="tabular-nums text-slate-700">{formatarDias(e.medianaDias)}</span>
                    </span>
                  </span>
                </button>
                {i < etapas.length - 1 && (
                  <span className="ml-[30px] flex items-center gap-1.5 py-0.5 text-xs text-slate-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                    <span>
                      <span className="font-semibold tabular-nums text-slate-700">{formatarPercentual(e.conversaoParaProxima)}</span> seguem para a
                      próxima
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {funil.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {gargalo ? (
            <p className="text-xs text-slate-500">
              Gargalo: <span className="font-semibold text-slate-700">{gargalo.nome}</span> — menor conversão para a próxima etapa
              (no empate, a maior mediana).
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setComoTabela((v) => !v)}
            aria-expanded={comoTabela}
            aria-controls={comoTabela ? idTabela : undefined}
            className="text-xs text-slate-500 underline decoration-dotted underline-offset-2 transition hover:text-slate-700"
          >
            {comoTabela ? 'Ver como gráfico' : 'Ver como tabela'}
          </button>
        </div>
      )}
    </section>
  );
}
