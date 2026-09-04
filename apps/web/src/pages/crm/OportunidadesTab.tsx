import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  moeda,
  type CampoCustomizadoDef,
  type ColunaFunil,
  type Conta,
  type FiltroOportunidadeSalvo,
  type Funil,
  type MotivoPerda,
  type Oportunidade,
} from '../../lib/types';
import { useAuth } from '../../features/auth/AuthProvider';
import { CamposCustomizadosCampos } from './CamposCustomizados';
import { FichaOportunidade } from './ficha/FichaOportunidade';
import { sinalDeAcao } from './sinalDeAcao';
import { discordanciaDaTemperatura, etiquetasDoCartao } from './temperatura';
import { VisoesSalvas } from './VisoesSalvas';

const MOTIVOS: MotivoPerda[] = ['PRECO', 'SEM_INTERESSE', 'CONCORRENTE', 'SEM_BUDGET', 'SEM_RESPOSTA', 'OUTRO'];

type Kanban = { funil: { id: string; nome: string }; colunas: ColunaFunil[] };

type Props = {
  /** Registro aberto, vindo da URL (`/oportunidades/:id`). Nulo em `/crm`. */
  selecionadoId: string | null;
  aoAbrir: (id: string) => void;
  aoFechar: () => void;
};

export function OportunidadesTab({ selecionadoId, aoAbrir, aoFechar }: Props) {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [funilId, setFunilId] = useState('');
  const [kanban, setKanban] = useState<Kanban | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ titulo: '', contaId: '', valor: '' });
  /** Campos customizados (item 6.4) da "Nova oportunidade". */
  const [camposDef, setCamposDef] = useState<CampoCustomizadoDef[]>([]);
  const [novosCampos, setNovosCampos] = useState<Record<string, unknown>>({});
  /** Rascunho do processo por etapa (item 3.1), so para quem pode editar. */
  const [exigencia, setExigencia] = useState<Record<string, string>>({});
  const [salvandoEtapa, setSalvandoEtapa] = useState<string | null>(null);
  const { temPerfil } = useAuth();

  const carregarFunis = useCallback(async () => {
    const f = await api.get<{ funis: Funil[] }>('/funis');
    setFunis(f.funis);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const qs = funilId ? `?funilId=${funilId}` : '';
      setKanban(await api.get<Kanban>(`/oportunidades/kanban${qs}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o funil');
    }
  }, [funilId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void Promise.all([carregarFunis(), api.get<{ contas: Conta[] }>('/contas')])
      .then(([, c]) => setContas(c.contas))
      .catch(() => undefined);
  }, [carregarFunis]);

  useEffect(() => {
    void api
      .get<{ campos: CampoCustomizadoDef[] }>('/campos-customizados?entidade=OPORTUNIDADE')
      .then(({ campos }) => setCamposDef(campos))
      .catch(() => undefined);
  }, []);

  const salvarExigencia = async (funil: string, estagioId: string) => {
    setSalvandoEtapa(estagioId);
    try {
      await api.patch(`/funis/${funil}/estagios/${estagioId}`, {
        // Texto vazio vira nulo, que e "etapa sem exigencia". String vazia
        // gravada seria uma exigencia de titulo vazio — tarefa sem nome.
        tarefaObrigatoria: exigencia[estagioId]?.trim() ? exigencia[estagioId]!.trim() : null,
      });
      /*
       * Recarrega os DOIS: os funis (que alimentam este card) e o quadro (que
       * alimenta o cabecalho da coluna). O primeiro rascunho recarregava so os
       * funis, e o efeito era a coluna continuar sem o "Exige: ..." ate alguem
       * recarregar a pagina — a configuracao parecia nao ter pegado.
       */
      await Promise.all([carregarFunis(), carregar()]);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar a exigencia da etapa');
    } finally {
      setSalvandoEtapa(null);
    }
  };

  const mover = async (estagioId: string) => {
    const id = arrastando;
    setArrastando(null);
    if (!id) return;
    try {
      await api.patch(`/oportunidades/${id}`, { estagioId });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover a oportunidade');
    }
  };

  const fechar = async (id: string, status: 'GANHA' | 'PERDIDA') => {
    try {
      if (status === 'PERDIDA') {
        const motivo = window.prompt(`Motivo da perda (${MOTIVOS.join(', ')})`, 'CONCORRENTE');
        if (!motivo) return;
        await api.post(`/oportunidades/${id}/fechar`, { status, motivoPerda: motivo });
      } else {
        await api.post(`/oportunidades/${id}/fechar`, { status });
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao fechar a oportunidade');
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/oportunidades', {
        titulo: nova.titulo,
        contaId: nova.contaId,
        ...(funilId ? { funilId } : {}),
        ...(nova.valor ? { valor: Number(nova.valor) } : {}),
        ...(Object.keys(novosCampos).length ? { camposCustomizados: novosCampos } : {}),
      });
      setNova({ titulo: '', contaId: '', valor: '' });
      setNovosCampos({});
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar oportunidade');
    }
  };

  // O funil mostrado: o escolhido no seletor, ou o que o kanban resolveu como
  // padrao. Sem o segundo caso, o card de processo desapareceria justamente na
  // situacao mais comum — ninguem escolheu funil nenhum.
  const funilAtual = funis.find((f) => f.id === (funilId || kanban?.funil.id));

  /*
   * As probabilidades das etapas DESTE funil, para o cartao saber o que e
   * "etapa mais avancada" sem eu escolher um limiar.
   *
   * Vem das colunas do quadro, e nao de um numero fixo: 60% e a ponta de um
   * funil que para em 60 e nao e a ponta de outro que vai a 90, e qualquer
   * limiar meu estaria errado num dos dois.
   */
  const probabilidadesDoFunil = kanban?.colunas.map((c) => c.estagio.probabilidade) ?? [];
  const previsao = kanban?.colunas.reduce((acc, c) => acc + c.valorPonderado, 0) ?? 0;
  const emAberto = kanban?.colunas.reduce((acc, c) => acc + c.valorTotal, 0) ?? 0;

  /*
   * Com registro na URL, o painel substitui o kanban em vez de dividir a tela.
   *
   * O kanban tem largura propria — rola na horizontal e cada coluna tem 288px —
   * e apertar um painel de detalhe ao lado dele deixaria os dois ruins. Quem
   * abriu uma oportunidade especifica quer ela, nao o quadro inteiro.
   */
  if (selecionadoId) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={aoFechar}
          className="text-xs text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline"
        >
          &larr; Todo o funil
        </button>
        <FichaOportunidade key={selecionadoId} oportunidadeId={selecionadoId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card titulo="Funil" descricao={kanban ? kanban.funil.nome : 'Carregando...'}>
        <div className="mb-3">
          <VisoesSalvas<FiltroOportunidadeSalvo>
            entidade="OPORTUNIDADE"
            filtroAtual={funilId ? { funilId } : {}}
            filtroVazio={!funilId}
            aoAplicar={(filtro) => setFunilId(filtro.funilId ?? '')}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Funil">
            <Select value={funilId} onChange={(e) => setFunilId(e.target.value)}>
              <option value="">Padrao (primeiro ativo)</option>
              {funis.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Em aberto</p>
            <p className="text-sm font-semibold text-slate-800">{moeda(emAberto)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Previsao ponderada</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--brand-accent)' }}>{moeda(previsao)}</p>
          </div>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {kanban?.colunas.map((coluna) => (
          <div
            key={coluna.estagio.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void mover(coluna.estagio.id)}
            className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50"
          >
            <header className="border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">{coluna.estagio.nome}</p>
                <Badge tom="neutro">{coluna.estagio.probabilidade}%</Badge>
              </div>
              <p className="text-xs text-slate-500">
                {coluna.total} op · {moeda(coluna.valorTotal)}
              </p>
              {/* A exigencia aparece no cabecalho da coluna, antes de o cartao
                  chegar nela: descobrir o bloqueio ao arrastar e o que faz a
                  regra parecer defeito. */}
              {coluna.estagio.tarefaObrigatoria && (
                <p className="mt-0.5 truncate text-xs text-slate-400" title={coluna.estagio.tarefaObrigatoria}>
                  Exige: {coluna.estagio.tarefaObrigatoria}
                </p>
              )}
            </header>
            <ul className="min-h-24 flex-1 space-y-2 p-2">
              {coluna.oportunidades.map((o: Oportunidade) => (
                <li
                  key={o.id}
                  draggable
                  onDragStart={() => setArrastando(o.id)}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing"
                >
                  {/* Titulo como botao, e nao o cartao inteiro: o cartao e
                      arrastavel, e clique em area de arraste erra com facilidade
                      — abrir a oportunidade por acidente ao mover o cartao
                      seria pior do que precisar acertar o texto. */}
                  <button
                    type="button"
                    onClick={() => aoAbrir(o.id)}
                    className="block w-full truncate text-left text-sm font-medium text-slate-800 underline-offset-2 hover:underline"
                  >
                    {o.titulo}
                  </button>
                  <p className="truncate text-xs text-slate-500">{o.conta.nome}</p>
                  {/* Temperatura e origem (item esquecido do plano).
                      Ficam logo abaixo da conta, antes do dinheiro: sao a
                      leitura *qualitativa* do cartao, e quem varre o quadro le
                      "quem e / como esta / quanto vale" nessa ordem.

                      Cartao sem leitura nao mostra etiqueta nenhuma — nao
                      mostra "Fria". Ausencia e "ninguem leu", e pintar de frio
                      seria inventar uma leitura em nome do vendedor. */}
                  {(() => {
                    const etiquetas = etiquetasDoCartao(o);
                    const discordancia = discordanciaDaTemperatura(
                      o.temperatura,
                      o.estagio.probabilidade,
                      probabilidadesDoFunil,
                    );
                    if (etiquetas.length === 0) return null;
                    return (
                      <p className="mt-1 flex flex-wrap items-center gap-1">
                        {etiquetas.map((etiqueta) => (
                          <span key={etiqueta.texto} title={etiqueta.titulo}>
                            <Badge tom={etiqueta.tom}>{etiqueta.texto}</Badge>
                          </span>
                        ))}
                        {/* A discordancia entre a leitura e a etapa e o motivo de
                            os dois numeros existirem separados: a etapa diz que
                            esta quase fechando, e quem esta na negociacao diz que
                            esfriou. E esse cartao que infla a previsao. */}
                        {discordancia && (
                          <span title={discordancia} className="text-xs text-slate-400">
                            discorda da etapa
                          </span>
                        )}
                      </p>
                    );
                  })()}
                  <p className="mt-1 text-sm font-semibold text-slate-700">{moeda(o.valor)}</p>
                  {o.itens.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {o.itens.length} item(ns) · {moeda(o.totalItens)}
                    </p>
                  )}
                  {/* Os dois cronometros e o sinal de proximo passo. Ficam no
                      cartao, e nao so na ficha, porque o vendedor varre o quadro
                      — nao abre um por um — e "parado" so vira acao se aparecer
                      sem clique. Os dias vem contados da API para os dois numeros
                      saírem do mesmo relogio. */}
                  {typeof o.diasNoEstagio === 'number' && typeof o.diasAberta === 'number' && (
                    <p
                      className="mt-1.5 text-xs text-slate-500"
                      title={`${o.diasNoEstagio} dia(s) nesta etapa · ${o.diasAberta} dia(s) desde a abertura`}
                    >
                      {o.diasNoEstagio}d na etapa · {o.diasAberta}d total
                    </p>
                  )}
                  {(() => {
                    const sinal = sinalDeAcao(o);
                    return sinal ? (
                      <p className="mt-1.5">
                        {/* O `title` diz *qual* tarefa falta. A etiqueta e curta
                            para caber no cartao; o detalhe fica no hover em vez
                            de virar um segundo clique. */}
                        <span title={o.tarefaDaEtapaPendente?.join('; ') || undefined}>
                          <Badge tom={sinal.tom}>{sinal.texto}</Badge>
                        </span>
                      </p>
                    ) : null;
                  })()}
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void fechar(o.id, 'GANHA')}
                      className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                    >
                      Ganhou
                    </button>
                    <button
                      type="button"
                      onClick={() => void fechar(o.id, 'PERDIDA')}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Perdeu
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Processo do funil (item 3.1).
          Fica junto do quadro, e nao numa tela de configuracao distante, porque
          quem define o processo e quem olha o funil — e porque ver a coluna ao
          lado do campo evita exigir tarefa na etapa errada. */}
      {temPerfil('ADMIN', 'SUPERVISOR') && funilAtual && (
        <Card
          titulo="Processo do funil"
          descricao="Tarefa que cada etapa exige antes de o negocio avancar. Em branco = etapa sem exigencia."
        >
          <ul className="space-y-2">
            {funilAtual.estagios.map((e) => {
              const valor = exigencia[e.id] ?? e.tarefaObrigatoria ?? '';
              const mudou = valor.trim() !== (e.tarefaObrigatoria ?? '').trim();
              return (
                <li key={e.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
                  <p className="truncate text-sm text-slate-600" title={e.nome}>
                    {e.ordem}. {e.nome}
                  </p>
                  <Input
                    aria-label={`Tarefa obrigatoria da etapa ${e.nome}`}
                    placeholder="Sem exigencia"
                    value={valor}
                    onChange={(ev) => setExigencia({ ...exigencia, [e.id]: ev.target.value })}
                  />
                  <Button
                    variante="neutro"
                    onClick={() => void salvarExigencia(funilAtual.id, e.id)}
                    disabled={!mudou || salvandoEtapa === e.id}
                  >
                    {salvandoEtapa === e.id ? 'Salvando...' : 'Salvar'}
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            A tarefa e criada quando o negocio entra na etapa, com o responsavel da oportunidade, e o cartao nao
            avanca enquanto ela estiver aberta. Voltar o cartao para tras continua livre. Desligar a exigencia nao
            apaga tarefa ja criada — ela foi combinada com alguem.
          </p>
        </Card>
      )}

      <Card titulo="Nova oportunidade" descricao="Arraste os cartoes entre os estagios do funil">
        <form onSubmit={criar} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Titulo">
            <Input required value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} />
          </Field>
          <Field label="Conta">
            <Select required value={nova.contaId} onChange={(e) => setNova({ ...nova, contaId: e.target.value })}>
              <option value="">Selecione</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Valor" hint="Sem itens, informe o valor">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={nova.valor}
              onChange={(e) => setNova({ ...nova, valor: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={!nova.titulo || !nova.contaId}>Criar</Button>
        </form>
        {camposDef.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <CamposCustomizadosCampos
              campos={camposDef}
              valores={novosCampos}
              aoMudar={(chave, valor) =>
                setNovosCampos((atuais) => {
                  if (valor === null) {
                    const { [chave]: _removido, ...resto } = atuais;
                    return resto;
                  }
                  return { ...atuais, [chave]: valor };
                })
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}
