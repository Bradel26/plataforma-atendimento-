import { Fragment, useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input } from '../components/ui';
import { StatTile } from '../components/viz/StatTile';
import { AssistenteDaLigacao } from './telefonia/AssistenteDaLigacao';
import { ApiError, api } from '../lib/api';
import { ESTADO } from '../lib/viz';
import { LABEL_CHAMADA_STATUS, type Chamada, type IndicadoresVoz } from '../lib/types';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const duracaoCurta = (segundos: number | null) => {
  if (segundos === null) return '—';
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

/**
 * Custo da ligacao, ou travessao (item 6.6).
 *
 * Quatro casas porque tarifa de voz e cobrada em fracao de centavo, e arredondar
 * para dois zeraria o custo de chamada curta — a coluna passaria a dizer que
 * ligar e de graca.
 */
const custoCurto = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `R$ ${v.toFixed(4).replace('.', ',')}`;

/** Chamada perdida e problema de operacao, entao ganha tom de alerta. */
const TOM: Partial<Record<string, 'sucesso' | 'alerta' | 'neutro'>> = {
  COMPLETADA: 'sucesso',
  EM_ANDAMENTO: 'sucesso',
  NAO_ATENDIDA: 'alerta',
  OCUPADA: 'alerta',
  FALHOU: 'alerta',
};

export function TelefoniaPage() {
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  /*
   * Qual ligacao esta com o assistente aberto.
   *
   * Uma so por vez, e expandindo a propria linha em vez de abrir outra tela: o
   * resumo so serve comparado ao custo e a duracao que estao na mesma linha, e
   * uma navegacao a parte faria perder esse contexto no caminho.
   */
  const [assistente, setAssistente] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresVoz | null>(null);
  const [destino, setDestino] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [lista, ind] = await Promise.all([
        api.get<{ chamadas: Chamada[]; proximoCursor: string | null }>('/voz/chamadas?limite=25'),
        api
          .get<{ indicadores: IndicadoresVoz }>('/voz/indicadores')
          .catch(() => ({ indicadores: null as IndicadoresVoz | null })),
      ]);
      setChamadas(lista.chamadas);
      setCursor(lista.proximoCursor);
      setIndicadores(ind.indicadores);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as chamadas');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ligar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await api.post('/voz/chamadas', { destino: destino.trim() });
      setAviso(`Chamando ${destino.trim()}...`);
      setDestino('');
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao originar a chamada');
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Classifica a ligacao, ou retira a nota.
   *
   * Atualiza a linha com o que o servidor devolveu, em vez de remendar o estado
   * local: a resposta traz tambem quem classificou e quando, e um remendo
   * parcial deixaria o `title` do seletor dizendo "nao classificada" numa linha
   * que acabou de receber nota.
   */
  const classificar = async (id: string, valor: string) => {
    try {
      const { chamada } = await api.patch<{ chamada: Chamada }>(`/voz/chamadas/${id}/classificacao`, {
        classificacao: valor === '' ? null : Number(valor),
      });
      setChamadas((atual) => atual.map((c) => (c.id === id ? chamada : c)));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao classificar a ligacao');
    }
  };

  const carregarMais = async () => {
    if (!cursor) return;
    const { chamadas: mais, proximoCursor } = await api.get<{
      chamadas: Chamada[];
      proximoCursor: string | null;
    }>(`/voz/chamadas?limite=25&cursor=${encodeURIComponent(cursor)}`);
    setChamadas((atual) => [...atual, ...mais.filter((c) => !atual.some((a) => a.id === c.id))]);
    setCursor(proximoCursor);
  };

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          rotulo="Chamadas (24h)"
          valor={indicadores?.total ?? '—'}
          detalhe={`${indicadores?.entrantes ?? 0} entrantes · ${indicadores?.saintes ?? 0} saintes`}
        />
        <StatTile rotulo="Atendidas" valor={indicadores?.atendidas ?? '—'} detalhe="chamadas que conversaram" />
        <StatTile
          rotulo="Taxa de atendimento"
          valor={indicadores?.taxaAtendimento == null ? '—' : `${indicadores.taxaAtendimento}%`}
          detalhe="abaixo de 80% a operacao esta perdendo chamada"
          estado={
            indicadores?.taxaAtendimento != null && indicadores.taxaAtendimento < 80 ? ESTADO.atencao : undefined
          }
        />
        <StatTile rotulo="TMA de voz" valor={duracaoCurta(indicadores?.tma ?? null)} detalhe="media das atendidas" />
      </div>

      {/* Custo e qualidade (item 6.6). Ficam numa segunda faixa porque respondem
          outra pergunta: a primeira e "estamos perdendo chamada?", esta e "o que
          isso custou, e valeu?". */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          rotulo="Custo (24h)"
          valor={custoCurto(indicadores?.custoTotal)}
          detalhe={
            indicadores?.chamadasComCusto
              ? `${indicadores.chamadasComCusto} chamada(s) com custo informado`
              : 'o provedor nao informou custo'
          }
        />
        <StatTile
          rotulo="Custo medio"
          valor={custoCurto(indicadores?.custoMedio)}
          detalhe="por chamada com custo informado"
        />
        <StatTile
          rotulo="Nota media"
          valor={indicadores?.notaMedia == null ? '—' : indicadores.notaMedia.toFixed(2).replace('.', ',')}
          detalhe={
            indicadores?.semNota
              ? `${indicadores.semNota} ligacao(oes) sem classificacao`
              : 'todas as ligacoes classificadas'
          }
        />
        {/* Sentimento (item E.2).
            O detalhe diz sobre QUANTAS chamadas o numero fala: sem isso, "1
            negativa" pode sair de duas analisadas ou de duzentas, e as duas
            frases pedem decisoes opostas. Chamada sem analise nao entra em
            NEUTRO — ela entra no contador de nao analisadas. */}
        <StatTile
          rotulo="Ligacoes negativas"
          valor={
            indicadores?.sentimento?.fracaoNegativa == null
              ? '—'
              : `${Math.round(indicadores.sentimento.fracaoNegativa * 100)}%`
          }
          detalhe={
            indicadores?.sentimento == null || indicadores.sentimento.analisadas === 0
              ? 'nenhuma ligacao analisada por motor de IA'
              : `${indicadores.sentimento.negativo} de ${indicadores.sentimento.analisadas} analisada(s)` +
                (indicadores.sentimento.semAnalise > 0
                  ? ` · ${indicadores.sentimento.semAnalise} sem analise`
                  : '')
          }
          /*
           * Sem tom de alerta por limiar aqui, ao contrario da taxa de
           * atendimento. "Acima de 20% de negativas e ruim" seria um numero que
           * eu escolheria sozinho, sem base nenhuma — e um mostrador ambar
           * inventado ensina a ignorar o ambar dos outros indicadores.
           */
        />
      </div>

      <Card titulo="Ligar" descricao="Clique-para-ligar pelo numero configurado na plataforma">
        <form onSubmit={ligar} className="flex flex-wrap items-end gap-2">
          <Field label="Numero de destino">
            <Input required placeholder="+5511988887777" value={destino} onChange={(e) => setDestino(e.target.value)} />
          </Field>
          <Button type="submit" disabled={ocupado || destino.trim().length < 8}>
            Ligar
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Softphone no navegador, ramais e URA dependem do provedor contratado — ver "Voz" no SCOPE.md.
        </p>
      </Card>

      <Card titulo="Chamadas" descricao={`${chamadas.length} registro(s)`}>
        {chamadas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma chamada registrada. Configure o provedor em Configuracoes &rarr; Voz.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">Inicio</th>
                  <th className="py-2 pr-3">Direcao</th>
                  <th className="py-2 pr-3">Numero</th>
                  <th className="py-2 pr-3">Contato</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Duracao</th>
                  <th className="py-2 pr-3 text-right">Custo</th>
                  <th className="py-2 pr-3">Audio</th>
                  <th className="py-2 pr-3">Gravacao</th>
                  <th className="py-2">Assistente</th>
                </tr>
              </thead>
              <tbody>
                {chamadas.map((c) => (
                  // `Fragment` com chave: cada chamada rende DUAS linhas quando o
                  // assistente esta aberto, e sem a chave no fragmento o React
                  // remontaria a lista inteira a cada abertura.
                  <Fragment key={c.id}>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{dataHora(c.iniciadoEm)}</td>
                    <td className="py-2 pr-3">
                      <Badge tom="neutro">{c.direcao === 'ENTRANTE' ? 'Entrante' : 'Sainte'}</Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {c.direcao === 'ENTRANTE' ? c.numeroOrigem : c.numeroDestino}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{c.contato?.nome ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tom={TOM[c.status] ?? 'neutro'}>{LABEL_CHAMADA_STATUS[c.status]}</Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{duracaoCurta(c.duracao)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-right text-slate-600">{custoCurto(c.custo)}</td>
                    <td className="py-2 pr-3">
                      {/* A nota fica ao lado do custo de proposito: a pergunta que
                          a gestao faz ao olhar esta lista e "o que a gente pagou
                          por isso valeu?", e as duas colunas juntas respondem. */}
                      <select
                        aria-label={`Classificacao da ligacao de ${dataHora(c.iniciadoEm)}`}
                        value={c.classificacao ?? ''}
                        onChange={(e) => void classificar(c.id, e.target.value)}
                        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700"
                        title={
                          c.classificadoPor
                            ? `Classificada por ${c.classificadoPor.nome}`
                            : 'Nao classificada'
                        }
                      >
                        {/* Vazio e "nao classificada", e continua disponivel: nota
                            lancada por engano tem de poder ser retirada, e nao
                            existe numero que signifique "retiro o que eu disse". */}
                        <option value="">&mdash;</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      {c.gravacaoUrl?.startsWith('/api/arquivos/') ? (
                        <audio controls src={c.gravacaoUrl} className="h-8 w-44" />
                      ) : (
                        <span className="text-xs text-slate-500">{c.gravacaoUrl ? 'no provedor' : '—'}</span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {/* O rotulo diz o que existe ANTES do clique: chamada sem
                          analise mostra "sem analise" no lugar do botao, e nao um
                          botao que abre um painel vazio. */}
                      {c.analisadoEm || c.resumo || c.sentimento || c.transcricao ? (
                        <button
                          type="button"
                          onClick={() => setAssistente((a) => (a === c.id ? null : c.id))}
                          className="text-xs text-slate-600 underline-offset-2 hover:underline"
                        >
                          {assistente === c.id ? 'Fechar' : 'Abrir'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500" title="Nenhum motor analisou esta ligacao">
                          sem analise
                        </span>
                      )}
                    </td>
                  </tr>
                    {assistente === c.id && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={10} className="px-1 py-2">
                          <AssistenteDaLigacao chamadaId={c.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cursor && (
          <Button variante="neutro" className="mt-3" onClick={() => void carregarMais()}>
            Carregar chamadas anteriores
          </Button>
        )}
      </Card>
    </div>
  );
}
