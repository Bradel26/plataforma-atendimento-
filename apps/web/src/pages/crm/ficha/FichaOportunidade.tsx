import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Button, Card, EmptyState } from '../../../components/ui';
import { ApiError, api, baixarCsv } from '../../../lib/api';
import {
  LABEL_MOTIVO_PERDA,
  LABEL_TIPO_ATIVIDADE,
  moeda,
  type Atividade,
  type EventoAuditoria,
  type Oportunidade,
} from '../../../lib/types';
import { useAuth } from '../../../features/auth/AuthProvider';
import { CamposCustomizadosCampos } from '../CamposCustomizados';
import { CheckinDeVisita } from './CheckinDeVisita';
import { EditorDaOportunidade } from './EditorDaOportunidade';
import { EditorDeItens } from './EditorDeItens';
import { fraseDoEvento, rotuloDoEvento } from './auditoria';
import { LABEL_CANAL_ORIGEM, LABEL_TEMPERATURA } from '../temperatura';

/**
 * A oportunidade vista de perto.
 *
 * Antes ela so existia como cartao no kanban, o que basta para arrastar e nao
 * basta para conversar sobre ela: "manda o link da proposta da Acme" nao tinha
 * resposta. Este painel e o destino de `/oportunidades/:id`.
 *
 * Nao ha rota nova na API: `GET /oportunidades/:id` ja devolvia tudo o que esta
 * aqui, inclusive os dias no estagio, que a API calcula para nao depender do
 * relogio do navegador.
 */

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

/** Percentual, ou travessao quando nao houve o que medir. */
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;

const TOM_STATUS = { ABERTA: 'marca', GANHA: 'sucesso', PERDIDA: 'alerta' } as const;

export function FichaOportunidade({ oportunidadeId }: { oportunidadeId: string }) {
  const [oportunidade, setOportunidade] = useState<Oportunidade | null>(null);
  const [editando, setEditando] = useState(false);
  /** Edicao dos campos da oportunidade — separada da edicao dos itens. */
  const [editandoCampos, setEditandoCampos] = useState(false);
  const { temPerfil } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const [decidindo, setDecidindo] = useState(false);
  /** Tarefas pendentes da oportunidade (item 3.1). */
  const [tarefas, setTarefas] = useState<Atividade[]>([]);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  /** Trilha de auditoria (item 3.2). */
  const [trilha, setTrilha] = useState<EventoAuditoria[]>([]);
  const [baixando, setBaixando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    setNaoEncontrada(false);
    try {
      const { oportunidade: o } = await api.get<{ oportunidade: Oportunidade }>(
        `/oportunidades/${oportunidadeId}`,
      );
      setOportunidade(o);
      /*
       * `situacao=pendentes`, e nao `abertas`: "aberta" na API significa "com
       * prazo e nao concluida", e a tarefa que a etapa exige nasce sem prazo.
       * Com `abertas`, a tarefa que barra o funil seria a unica que esta tela
       * nao mostraria — e nao haveria onde concluir o que trava o cartao.
       */
      const { atividades } = await api.get<{ atividades: Atividade[] }>(
        `/atividades?oportunidadeId=${oportunidadeId}&situacao=pendentes`,
      );
      setTarefas(atividades);

      const { eventos } = await api.get<{ eventos: EventoAuditoria[] }>(
        `/oportunidades/${oportunidadeId}/auditoria`,
      );
      setTrilha(eventos);
    } catch (e) {
      // 404 e o que a API responde tanto para id inexistente quanto para
      // oportunidade de outra organizacao — de proposito, para nao revelar que
      // o registro existe. As duas causas mostram a mesma tela.
      if (e instanceof ApiError && e.status === 404) {
        setNaoEncontrada(true);
        return;
      }
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a oportunidade');
    }
  }, [oportunidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Aprova ou reprova o desconto.
   *
   * Recarrega a ficha inteira em vez de remendar o estado local: a decisao muda a
   * situacao, quem decidiu e quando, e um remendo parcial deixaria a tela dizendo
   * "aprovado" sem o nome de quem aprovou.
   */
  const concluir = async (id: string) => {
    setConcluindo(id);
    try {
      await api.post(`/atividades/${id}/concluir`, {});
      // Recarrega a ficha inteira: concluir a tarefa da etapa destrava o avanco,
      // e o aviso de bloqueio tem de sair da tela junto.
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao concluir a tarefa');
    } finally {
      setConcluindo(null);
    }
  };

  /**
   * Baixa a proposta em PDF (item 2.2).
   *
   * Passa pelo mesmo helper dos relatorios porque a rota exige o cabecalho de
   * autenticacao — um `<a href>` simples baixaria uma pagina de erro, e o
   * navegador salvaria o erro como se fosse o documento.
   */
  const baixarProposta = async () => {
    setBaixando(true);
    setErro(null);
    try {
      await baixarCsv(`/oportunidades/${oportunidadeId}/proposta.pdf`, `proposta-${oportunidadeId.slice(0, 8)}.pdf`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao gerar a proposta em PDF');
    } finally {
      setBaixando(false);
    }
  };

  /** Grava um campo customizado (item 6.4) da oportunidade aberta. */
  const mudarCampoCustomizado = async (chave: string, valor: string | number | boolean | null) => {
    setErro(null);
    try {
      await api.patch(`/oportunidades/${oportunidadeId}`, { camposCustomizados: { [chave]: valor } });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar o campo customizado');
    }
  };

  const decidir = async (aprovar: boolean) => {
    setDecidindo(true);
    try {
      await api.post(`/oportunidades/${oportunidadeId}/desconto/${aprovar ? 'aprovar' : 'reprovar'}`, {});
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao decidir o desconto');
    } finally {
      setDecidindo(false);
    }
  };

  if (naoEncontrada) {
    return (
      <Card titulo="Oportunidade">
        <EmptyState
          titulo="Oportunidade nao encontrada"
          descricao="O endereco aponta para um registro que nao existe ou que voce nao pode ver."
        />
      </Card>
    );
  }
  if (erro) return <Alerta>{erro}</Alerta>;
  if (!oportunidade) {
    return (
      <Card titulo="Oportunidade">
        <p className="text-sm text-slate-500">Carregando oportunidade...</p>
      </Card>
    );
  }

  const o = oportunidade;

  return (
    <div className="space-y-5">
      <Card
        titulo={o.titulo}
        descricao={`${o.funil.nome} · ${o.estagio.nome}`}
        acao={<Badge tom={TOM_STATUS[o.status]}>{o.status}</Badge>}
      >
        {editandoCampos ? (
          <EditorDaOportunidade
            oportunidade={o}
            aoSalvar={() => {
              setEditandoCampos(false);
              void carregar();
            }}
            aoCancelar={() => setEditandoCampos(false)}
          />
        ) : (
        <>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Valor</dt>
            <dd className="font-semibold text-slate-800">{moeda(o.valor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cliente</dt>
            <dd>
              {/* O caminho de ida existe agora que o cliente tem endereco: da
                  oportunidade para a ficha da empresa sem passar pela lista. */}
              <Link
                to={`/clientes/${o.conta.id}`}
                className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                {o.conta.nome}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Responsavel</dt>
            <dd className="text-slate-800">{o.responsavel?.nome ?? 'Sem responsavel'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Previsao de fechamento</dt>
            <dd className="text-slate-800">{data(o.previsaoFechamento)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Aberta em</dt>
            <dd className="text-slate-800">
              {data(o.criadoEm)}
              {typeof o.diasAberta === 'number' && (
                <span className="text-xs text-slate-500"> · {o.diasAberta} dia(s)</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Nesta etapa</dt>
            <dd className="text-slate-800">
              {typeof o.diasNoEstagio === 'number' ? `${o.diasNoEstagio} dia(s)` : '—'}
              <span className="text-xs text-slate-500"> · {o.estagio.probabilidade}% de chance</span>
            </dd>
          </div>
          {o.status === 'PERDIDA' && (
            <div>
              <dt className="text-xs text-slate-500">Motivo da perda</dt>
              <dd className="text-slate-800">
                {o.motivoPerda ? LABEL_MOTIVO_PERDA[o.motivoPerda] : 'Nao informado'}
              </dd>
            </div>
          )}
          {o.fechadoEm && (
            <div>
              <dt className="text-xs text-slate-500">Fechada em</dt>
              <dd className="text-slate-800">{data(o.fechadoEm)}</dd>
            </div>
          )}
          {/* As condicoes so aparecem preenchidas: um rotulo com travessao ao
              lado convidaria a preencher campo que ninguem pediu. Vazio na tela
              tambem e vazio no PDF. */}
          {o.condicaoPagamento && (
            <div>
              <dt className="text-xs text-slate-500">Condicao de pagamento</dt>
              <dd className="text-slate-800">{o.condicaoPagamento}</dd>
            </div>
          )}
          {o.prazoEntrega && (
            <div>
              <dt className="text-xs text-slate-500">Prazo de entrega</dt>
              <dd className="text-slate-800">{o.prazoEntrega}</dd>
            </div>
          )}
          {/* Temperatura e origem seguem a mesma regra das condicoes: aparecem
              quando existem. Rotulo com travessao afirmaria que o campo esta
              pendente, quando na verdade ninguem precisa preencher. */}
          {o.temperatura && (
            <div>
              <dt className="text-xs text-slate-500">Temperatura</dt>
              <dd className="text-slate-800" title="Leitura de quem esta na negociacao, e nao a probabilidade da etapa">
                {LABEL_TEMPERATURA[o.temperatura]}
              </dd>
            </div>
          )}
          {o.canalOrigem && (
            <div>
              <dt className="text-xs text-slate-500">Origem</dt>
              <dd className="text-slate-800">{LABEL_CANAL_ORIGEM[o.canalOrigem]}</dd>
            </div>
          )}
        </dl>

        {/* Editar campos e coisa de oportunidade aberta: mexer em titulo ou
            responsavel de negocio fechado reescreveria o historico que a trilha
            de auditoria existe para preservar. */}
        {o.status === 'ABERTA' && (
          <div className="mt-4">
            <Button variante="neutro" onClick={() => setEditandoCampos(true)}>
              Editar dados
            </Button>
          </div>
        )}
        </>
        )}
      </Card>

      {o.camposCustomizados && o.camposCustomizados.length > 0 && (
        <Card titulo="Campos customizados">
          <CamposCustomizadosCampos
            campos={o.camposCustomizados}
            valores={Object.fromEntries(o.camposCustomizados.map((c) => [c.chave, c.valor]))}
            aoMudar={mudarCampoCustomizado}
          />
        </Card>
      )}

      {/* Tarefas pendentes (item 3.1).
          O card so aparece havendo tarefa, mas a exigencia da etapa vem em
          primeiro lugar e com o aviso do bloqueio: sem lugar para concluir, a
          exigencia travaria o funil sem saida. */}
      {tarefas.length > 0 && (
        <Card
          titulo="Tarefas pendentes"
          descricao={
            tarefas.some((t) => t.obrigatoria)
              ? 'A etapa exige concluir a tarefa marcada antes de o negocio avancar'
              : `${tarefas.length} em aberto`
          }
        >
          <ul className="divide-y divide-slate-100">
            {[...tarefas]
              // A obrigatoria primeiro: e a que decide se o cartao anda.
              .sort((a, b) => Number(Boolean(b.obrigatoria)) - Number(Boolean(a.obrigatoria)))
              .map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{LABEL_TIPO_ATIVIDADE[t.tipo]}</Badge>
                      {t.obrigatoria && <Badge tom="alerta">Exigida pela etapa</Badge>}
                      {t.prazo && <Badge tom="neutro">{data(t.prazo)}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{t.titulo}</p>
                    {t.responsavel && <p className="text-xs text-slate-500">{t.responsavel.nome}</p>}
                    {/* Visita ganha check-in aqui, na propria linha: um segundo
                        lugar para registrar a mesma coisa seria um segundo lugar
                        para esquecer. */}
                    <CheckinDeVisita
                      atividade={t}
                      aoMudar={(atualizada) =>
                        setTarefas((atual) => atual.map((x) => (x.id === atualizada.id ? atualizada : x)))
                      }
                      aoErrar={setErro}
                    />
                  </div>
                  <Button variante="neutro" onClick={() => void concluir(t.id)} disabled={concluindo === t.id}>
                    {concluindo === t.id ? 'Concluindo...' : 'Concluir'}
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Card
        titulo="Proposta"
        descricao={
          o.itens.length > 0
            ? `${o.itens.length} item(ns) · ${moeda(o.totalItens)}${o.valorMensal ? ' com parte mensal' : ''}`
            : undefined
        }
      >
        {/* A alcada vem antes de tudo: e a unica coisa neste cartao que impede a
            venda de ser registrada, e quem abre a proposta precisa ver isso antes
            de gastar tempo lendo linha por linha. */}
        {o.aprovacaoDesconto === 'PENDENTE' && (
          <div className="mb-3 space-y-2">
            <Alerta>
              O desconto desta proposta passa da alcada de quem a montou e espera aprovacao. Enquanto isso, ela
              nao pode ser marcada como ganha.
            </Alerta>
            {/* Os botoes so aparecem para quem pode decidir. Mostrar desabilitado
                a quem nao tem alcada convida a pedir permissao a quem tambem nao
                tem; ausente, a pessoa procura o gestor. */}
            {temPerfil('ADMIN', 'SUPERVISOR', 'GESTOR') && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void decidir(true)} disabled={decidindo}>
                  Aprovar desconto
                </Button>
                <Button variante="perigo" onClick={() => void decidir(false)} disabled={decidindo}>
                  Reprovar
                </Button>
              </div>
            )}
          </div>
        )}

        {o.aprovacaoDesconto === 'REPROVADA' && (
          <div className="mb-3">
            <Alerta>
              O desconto foi reprovado{o.aprovadoPor ? ` por ${o.aprovadoPor.nome}` : ''}. Reduza o desconto para
              poder fechar — reprovar nao apagou o valor negociado.
            </Alerta>
          </div>
        )}

        {o.aprovacaoDesconto === 'APROVADA' && (
          <p className="mb-3 text-xs text-slate-500">
            Desconto acima da alcada, aprovado{o.aprovadoPor ? ` por ${o.aprovadoPor.nome}` : ''}
            {o.aprovadoEm ? ` em ${data(o.aprovadoEm)}` : ''}. Editar a proposta pede nova aprovacao.
          </p>
        )}

        {/* Divergencia primeiro: quem digitou 5.000 e ve 3.400 no funil precisa
            saber por que antes de olhar a tabela — sem isso parece defeito. */}
        {o.divergeDoInformado && (
          <div className="mb-3">
            <Alerta>
              O valor digitado a mao ({moeda(o.valorInformado ?? 0)}) discorda do que os itens somam (
              {moeda(o.valor)}). Os itens mandam: e o que a proposta impressa vai dizer.
            </Alerta>
          </div>
        )}

        {editando ? (
          <EditorDeItens
            oportunidade={o}
            aoSalvar={() => {
              setEditando(false);
              void carregar();
            }}
            aoCancelar={() => setEditando(false)}
          />
        ) : o.itens.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              titulo="Sem itens"
              descricao="O valor desta oportunidade foi informado direto, sem produtos do catalogo."
            />
            {o.status === 'ABERTA' && <Button onClick={() => setEditando(true)}>Montar proposta</Button>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] text-sm">
                <caption className="sr-only">Itens da proposta, com desconto e margem</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th scope="col" className="pb-2">Produto</th>
                    <th scope="col" className="pb-2 text-right">Qtd.</th>
                    <th scope="col" className="pb-2 text-right">Preco</th>
                    <th scope="col" className="pb-2 text-right">Desc.</th>
                    <th scope="col" className="pb-2 text-right">Total</th>
                    <th scope="col" className="pb-2 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {o.itens.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 text-slate-800">
                        {item.produto.nome}
                        <span className="block text-xs text-slate-500">
                          {item.produto.sku}
                          {item.recorrencia === 'MENSAL' && ' · cobrado por mes'}
                        </span>
                      </td>
                      {/* tabular-nums: coluna de numero que nao dança conforme o digito. */}
                      <td className="py-2 text-right tabular-nums text-slate-700">{item.quantidade}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700">{moeda(item.precoUnitario)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {item.desconto > 0 ? `-${moeda(item.desconto)}` : '—'}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums text-slate-800">
                        {moeda(item.total)}
                        {item.recorrencia === 'MENSAL' && (
                          <span className="block text-xs font-normal text-slate-500">/mes</span>
                        )}
                      </td>
                      {/* Travessao, e nao 0%, quando o custo nao foi informado:
                          zero afirmaria "vendeu sem lucro". */}
                      <td className="py-2 text-right tabular-nums text-slate-600">{pct(item.margemPercentual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="grid gap-x-6 gap-y-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Uma vez</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{moeda(o.valorUnico ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Por mes</dt>
                <dd className="font-semibold tabular-nums text-slate-800">
                  {moeda(o.valorMensal ?? 0)}
                  {(o.valorMensal ?? 0) > 0 && (
                    <span className="block text-xs font-normal text-slate-500">
                      por {o.mesesRecorrencia ?? 12} meses
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Desconto concedido</dt>
                <dd className="tabular-nums text-slate-700">
                  {(o.totais?.descontoTotal ?? 0) > 0 ? `-${moeda(o.totais?.descontoTotal ?? 0)}` : '—'}
                  {(o.totais?.bruto ?? 0) > 0 && (o.totais?.descontoTotal ?? 0) > 0 && (
                    <span className="block text-xs text-slate-500">de {moeda(o.totais?.bruto ?? 0)} de tabela</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Margem</dt>
                <dd className="tabular-nums text-slate-700">
                  {o.totais?.margem === null || o.totais?.margem === undefined
                    ? '—'
                    : `${moeda(o.totais.margem)} · ${pct(o.totais.margemPercentual)}`}
                  {/* A margem e parcial quando so parte dos itens tem custo, e
                      sem dizer isso ela pareceria ser do todo. */}
                  {o.totais && o.totais.itensComCusto > 0 && o.totais.itensComCusto < o.itens.length && (
                    <span className="block text-xs text-slate-500">
                      de {o.totais.itensComCusto} de {o.itens.length} itens com custo informado
                    </span>
                  )}
                  {o.totais && o.totais.itensComCusto === 0 && (
                    <span className="block text-xs text-slate-500">nenhum item tem custo informado</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              {o.status === 'ABERTA' && (
                <Button variante="neutro" onClick={() => setEditando(true)}>
                  Editar proposta
                </Button>
              )}
              {/* O PDF nao aparece quando o desconto esta pendente ou reprovado.
                  A API tambem recusa, mas oferecer o botao seria convidar ao
                  erro: quem clica ja abriu a proposta na cabeca e vai mandar ao
                  cliente. Proposta fechada CONTINUA imprimivel — segunda via do
                  que ja foi negociado e uso legitimo. */}
              {o.aprovacaoDesconto !== 'PENDENTE' && o.aprovacaoDesconto !== 'REPROVADA' && (
                <Button variante="neutro" onClick={() => void baixarProposta()} disabled={baixando}>
                  {baixando ? 'Gerando...' : 'Baixar proposta (PDF)'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Historico (item 3.2).
          Ultimo card de proposito: e leitura de conferencia, nao operacao. Vem
          depois da proposta porque quem abre a oportunidade quer negociar; quem
          desconfia de um numero desce ate aqui. */}
      {trilha.length > 0 && (
        <Card titulo="Historico" descricao={`${trilha.length} alteracao(oes) registrada(s)`}>
          <ul className="divide-y divide-slate-100">
            {trilha.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">
                    <span className="text-slate-500">{rotuloDoEvento(e)}:</span> {fraseDoEvento(e)}
                  </p>
                  {/* Autor nulo e mudanca de rotina automatica, nao "nao sei":
                      escrever um nome ali seria atribuir a alguem o que a
                      plataforma fez sozinha. */}
                  <p className="text-xs text-slate-500">{e.autor ?? 'automatico'}</p>
                </div>
                <p className="text-xs text-slate-500">{new Date(e.ocorridoEm).toLocaleString('pt-BR')}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
