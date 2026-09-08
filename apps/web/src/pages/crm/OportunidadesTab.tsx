import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { MotivoPerdaDialog } from '../../components/ui/MotivoPerdaDialog';
import { ApiError, api } from '../../lib/api';
import {
  LABEL_MOTIVO_PERDA,
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
import { useFaixaDeLargura } from '../../lib/useFaixaDeLargura';
import { CamposCustomizadosCampos } from './CamposCustomizados';
import { FichaOportunidade } from './ficha/FichaOportunidade';
import { sinalDeAcao } from './sinalDeAcao';
import { discordanciaDaTemperatura, etiquetasDoCartao } from './temperatura';
import { VisoesSalvas } from './VisoesSalvas';

const MOTIVOS: MotivoPerda[] = ['PRECO', 'SEM_INTERESSE', 'CONCORRENTE', 'SEM_BUDGET', 'SEM_RESPOSTA', 'OUTRO'];

type Kanban = { funil: { id: string; nome: string }; colunas: ColunaFunil[] };

/**
 * O cartao da oportunidade — usado nas duas disposicoes (colunas lado a lado
 * em desktop/notebook, lista agrupada por etapa abaixo disso). Extraido para
 * nao duplicar seis campos e dois botoes de acao entre os dois layouts.
 */
function CartaoOportunidade({
  o,
  kanban,
  probabilidadesDoFunil,
  aoArrastar,
  aoAbrir,
  aoMover,
  aoFechar,
}: {
  o: Oportunidade;
  kanban: Kanban | null;
  probabilidadesDoFunil: number[];
  aoArrastar: (id: string) => void;
  aoAbrir: (id: string) => void;
  aoMover: (id: string, estagioId: string) => void;
  aoFechar: (id: string, status: 'GANHA' | 'PERDIDA') => void;
}) {
  const etiquetas = etiquetasDoCartao(o);
  const discordancia = discordanciaDaTemperatura(o.temperatura, o.estagio.probabilidade, probabilidadesDoFunil);
  const sinal = sinalDeAcao(o);

  return (
    <li
      draggable
      onDragStart={() => aoArrastar(o.id)}
      className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
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
      {/*
        Alternativa ao arraste (item 1 da Fase 7): teclado, tela
        estreita e mobile precisam de um jeito de mudar de etapa
        sem arrastar. Mesma chamada do drop (`moverPara`) — a
        regra de etapa obrigatoria continua sendo aplicada pela
        API do mesmo jeito.
      */}
      {kanban && kanban.colunas.length > 1 && (
        <Select
          aria-label={`Mover ${o.titulo} para outra etapa`}
          value=""
          onChange={(e) => {
            const estagioId = e.target.value;
            if (estagioId) aoMover(o.id, estagioId);
            e.target.value = '';
          }}
          className="mt-1.5 !py-1 !text-xs"
        >
          <option value="">Mover para...</option>
          {kanban.colunas
            .filter((c) => c.estagio.id !== o.estagio.id)
            .map((c) => (
              <option key={c.estagio.id} value={c.estagio.id}>
                {c.estagio.nome}
              </option>
            ))}
        </Select>
      )}
      {/* Temperatura e origem (item esquecido do plano).
          Ficam logo abaixo da conta, antes do dinheiro: sao a
          leitura *qualitativa* do cartao, e quem varre o quadro le
          "quem e / como esta / quanto vale" nessa ordem.

          Cartao sem leitura nao mostra etiqueta nenhuma — nao
          mostra "Fria". Ausencia e "ninguem leu", e pintar de frio
          seria inventar uma leitura em nome do vendedor. */}
      {etiquetas.length > 0 && (
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
            <span title={discordancia} className="text-xs text-slate-500">
              discorda da etapa
            </span>
          )}
        </p>
      )}
      <p className="mt-1 text-sm font-semibold text-slate-700">{moeda(o.valor)}</p>
      {o.itens.length > 0 && (
        <p className="mt-0.5 text-xs text-slate-500">
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
      {sinal && (
        <p className="mt-1.5">
          {/* O `title` diz *qual* tarefa falta. A etiqueta e curta
              para caber no cartao; o detalhe fica no hover em vez
              de virar um segundo clique. */}
          <span title={o.tarefaDaEtapaPendente?.join('; ') || undefined}>
            <Badge tom={sinal.tom}>{sinal.texto}</Badge>
          </span>
        </p>
      )}
      {/* Dono do cartao: mesma leitura de "de quem e isto" que a
          ficha do contato ja da, so que sem abrir nada. Ausente
          quando ninguem foi atribuido — sem circulo vazio no lugar. */}
      <div
        className={
          o.responsavel
            ? 'mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2'
            : 'mt-2 flex gap-1.5'
        }
      >
        {o.responsavel && (
          <span
            title={o.responsavel.nome}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600"
          >
            {o.responsavel.nome.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => aoFechar(o.id, 'GANHA')}
            className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
          >
            Ganhou
          </button>
          <button
            type="button"
            onClick={() => aoFechar(o.id, 'PERDIDA')}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Perdeu
          </button>
        </div>
      </div>
    </li>
  );
}

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
  /** Oportunidade pendente de motivo antes de fechar como PERDIDA. */
  const [pedidoMotivo, setPedidoMotivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ titulo: '', contaId: '', valor: '' });
  /** Campos customizados (item 6.4) da "Nova oportunidade". */
  const [camposDef, setCamposDef] = useState<CampoCustomizadoDef[]>([]);
  const [novosCampos, setNovosCampos] = useState<Record<string, unknown>>({});
  /** Rascunho do processo por etapa (item 3.1), so para quem pode editar. */
  const [exigencia, setExigencia] = useState<Record<string, string>>({});
  const [salvandoEtapa, setSalvandoEtapa] = useState<string | null>(null);
  const { temPerfil } = useAuth();
  /**
   * Busca por titulo ou conta (Fase 7, item 3): Contatos, Contas e Leads ja
   * tem busca; Oportunidades so tinha o seletor de funil. `/oportunidades/kanban`
   * nao aceita `busca` — nao dava pra inventar o parametro sem mexer na API.
   * Mas o quadro inteiro do funil ja chega de uma vez, e filtrar o que ja
   * esta em memoria fecha a lacuna sem round-trip novo nenhum.
   */
  const [buscaCartao, setBuscaCartao] = useState('');

  /**
   * Mesmo problema de Leads (Fase 7, item 2): colunas de 288px rolando na
   * horizontal so mostram uma coluna por vez abaixo de notebook — sem visao
   * geral do funil. Container real, mesmo hook de Contatos/Contas/Atendimento.
   */
  const { ref: containerRef, faixa } = useFaixaDeLargura<HTMLDivElement>();
  const emColunas = faixa === 'desktop' || faixa === 'notebook';

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

  /**
   * Move uma oportunidade para outro estagio — usada pelo soltar do arraste
   * E pelo seletor "Mover para" do cartao (alternativa por teclado/tela
   * estreita/mobile, item 1 da Fase 7). Mesma chamada dos dois jeitos: a
   * regra de etapa obrigatoria e quem barra, nao esta funcao.
   */
  const moverPara = async (id: string, estagioId: string) => {
    try {
      await api.patch(`/oportunidades/${id}`, { estagioId });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover a oportunidade');
    }
  };

  const mover = async (estagioId: string) => {
    const id = arrastando;
    setArrastando(null);
    if (!id) return;
    await moverPara(id, estagioId);
  };

  const enviarFechamento = async (id: string, status: 'GANHA' | 'PERDIDA', motivoPerda?: MotivoPerda) => {
    try {
      await api.post(`/oportunidades/${id}/fechar`, { status, ...(motivoPerda ? { motivoPerda } : {}) });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao fechar a oportunidade');
    }
  };

  /**
   * Fecha como ganha ou perdida. Perdida exige motivo: abre `MotivoPerdaDialog`
   * (Fase 9 — substitui o `window.prompt` que nao seguia tema escuro nem
   * white-label) e so envia depois de confirmado.
   */
  const fechar = async (id: string, status: 'GANHA' | 'PERDIDA') => {
    if (status === 'PERDIDA') {
      setPedidoMotivo(id);
      return;
    }
    await enviarFechamento(id, status);
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

  /**
   * Colunas com a busca aplicada. O total e o valor de cada coluna, exibidos
   * no cabecalho, sao recalculados sobre o filtrado — mostrar "5 op" com 2
   * cartoes na tela seria a mesma inconsistencia que a Fase 6 corrigiu com
   * "N encontrado(s)" em Contatos e Contas.
   */
  const termo = buscaCartao.trim().toLocaleLowerCase('pt-BR');
  const colunasFiltradas =
    kanban?.colunas.map((coluna) => {
      const oportunidades = termo
        ? coluna.oportunidades.filter(
            (o) =>
              o.titulo.toLocaleLowerCase('pt-BR').includes(termo) ||
              o.conta.nome.toLocaleLowerCase('pt-BR').includes(termo),
          )
        : coluna.oportunidades;
      return {
        ...coluna,
        oportunidades,
        total: termo ? oportunidades.length : coluna.total,
        valorTotal: termo ? oportunidades.reduce((acc, o) => acc + o.valor, 0) : coluna.valorTotal,
      };
    }) ?? [];

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
    <div ref={containerRef} className="space-y-4">
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
        <div className="mt-3">
          <Field label="Busca" hint="Filtra os cartoes ja carregados — titulo ou conta">
            <Input
              placeholder="Titulo ou conta"
              value={buscaCartao}
              onChange={(e) => setBuscaCartao(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      {emColunas ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {colunasFiltradas.map((coluna) => (
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
                  <p className="mt-0.5 truncate text-xs text-slate-500" title={coluna.estagio.tarefaObrigatoria}>
                    Exige: {coluna.estagio.tarefaObrigatoria}
                  </p>
                )}
              </header>
              <ul className="min-h-24 flex-1 space-y-2 p-2">
                {coluna.oportunidades.map((o: Oportunidade) => (
                  <CartaoOportunidade
                    key={o.id}
                    o={o}
                    kanban={kanban}
                    probabilidadesDoFunil={probabilidadesDoFunil}
                    aoArrastar={setArrastando}
                    aoAbrir={aoAbrir}
                    aoMover={(id, estagioId) => void moverPara(id, estagioId)}
                    aoFechar={(id, status) => void fechar(id, status)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        /*
         * Mesma solucao de Leads (Fase 7, item 2): abaixo de notebook, uma
         * lista agrupada por etapa em vez de colunas de 288px rolando na
         * horizontal. `<details>` comeca aberto so quando ha oportunidade —
         * com um funil de 6+ etapas, abrir todas de largura cheia empurraria
         * a etapa que importa para fora da primeira tela.
         */
        <div className="space-y-3">
          {colunasFiltradas.map((coluna) => (
            <details
              key={coluna.estagio.id}
              open={coluna.oportunidades.length > 0}
              className="rounded-xl border border-slate-200 bg-slate-50"
            >
              <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">{coluna.estagio.nome}</span>
                  <Badge tom="neutro">{coluna.estagio.probabilidade}%</Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {coluna.total} op · {moeda(coluna.valorTotal)}
                </p>
                {coluna.estagio.tarefaObrigatoria && (
                  <p className="mt-0.5 truncate text-xs text-slate-500" title={coluna.estagio.tarefaObrigatoria}>
                    Exige: {coluna.estagio.tarefaObrigatoria}
                  </p>
                )}
              </summary>
              {coluna.oportunidades.length > 0 && (
                <ul className="space-y-2 border-t border-slate-200 p-2">
                  {coluna.oportunidades.map((o: Oportunidade) => (
                    <CartaoOportunidade
                      key={o.id}
                      o={o}
                      kanban={kanban}
                      probabilidadesDoFunil={probabilidadesDoFunil}
                      aoArrastar={setArrastando}
                      aoAbrir={aoAbrir}
                      aoMover={(id, estagioId) => void moverPara(id, estagioId)}
                      aoFechar={(id, status) => void fechar(id, status)}
                    />
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
      )}

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

      <MotivoPerdaDialog
        aberto={pedidoMotivo !== null}
        motivos={MOTIVOS}
        labelMotivo={LABEL_MOTIVO_PERDA}
        aoCancelar={() => setPedidoMotivo(null)}
        aoConfirmar={(motivo) => {
          if (!pedidoMotivo) return;
          void enviarFechamento(pedidoMotivo, 'PERDIDA', motivo);
          setPedidoMotivo(null);
        }}
      />
    </div>
  );
}
