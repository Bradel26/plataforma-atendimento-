import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { useAuth } from '../../../features/auth/AuthProvider';
import { mascararTelefoneBr } from '../../../lib/telefone';
import { UFS } from '../../esteira/ufs';
import { CicloDoParceiro } from './CicloDoParceiro';
import {
  LABEL_TIPO_ATIVIDADE,
  type Atividade,
  type Conta,
  type FichaContato as Ficha,
} from '../../../lib/types';
import { Indicadores } from './Indicadores';
import { LinhaDoTempo } from './LinhaDoTempo';
import { CheckinDeVisita } from './CheckinDeVisita';
import { RegistrarAtividade } from './RegistrarAtividade';
import { RegistroManual } from './RegistroManual';
import { EditorEtiquetas, ETIQUETAS_CONTATO } from '../Etiquetas';
import { Modal } from '../../../components/ui/Modal';

/**
 * A vida do cliente numa tela: quem e, o que esta em aberto, o que ficou
 * marcado e tudo que ja aconteceu.
 *
 * O cabecalho e a linha do tempo trazem tambem o que e da *empresa* do contato,
 * nao so dele: proposta e oportunidade vivem na conta, e uma ficha que para no
 * atendimento nao responde "quanto esse cliente ja comprou".
 */

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

type FichaProps = {
  contatoId: string;
  aoVoltar?: () => void;
  /**
   * Avisa a aba que as etiquetas mudaram.
   *
   * A ficha nao conhece a lista da esquerda nem o filtro por etiqueta, e nao
   * deveria: quem hospeda decide o que recarregar. Sem este aviso, a etiqueta
   * gravada aqui nao aparecia no cartao da lista nem no filtro ate a pessoa
   * recarregar a pagina.
   */
  aoMudarEtiquetas?: () => void;
  /**
   * Avisa quem hospeda que o contato foi excluido — a ficha nao sabe fechar a
   * si mesma nem recarregar a lista da esquerda, quem hospeda decide.
   */
  aoExcluir?: () => void;
};

export function FichaContato({ contatoId, aoMudarEtiquetas, aoVoltar }: FichaProps) {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoSolicitacao, setAvisoSolicitacao] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [edicao, setEdicao] = useState({ nome: '', email: '', telefone: '', observacoes: '', uf: '', cidade: '', segmentoParceiro: '' as '' | 'TIM' | 'STARLINK', operacoes: [] as Array<'TIM' | 'STARLINK'> });
  // Contador de recargas: mudar este numero e o sinal para a linha do tempo
  // buscar de novo. Guardar a lista aqui para repassar seria duplicar o estado
  // dela — e a paginacao por cursor mora la dentro.
  const [versao, setVersao] = useState(0);
  /**
   * Contas para vincular. Carregadas so quando alguem abre o seletor: e uma
   * lista que a maioria das visitas a ficha nao usa.
   */
  const [contas, setContas] = useState<Conta[] | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [registroManualAberto, setRegistroManualAberto] = useState(false);
  const [maisDadosAberto, setMaisDadosAberto] = useState(false);

  /** 404 tem tela propria; qualquer outra falha vira alerta. */
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    setNaoEncontrado(false);
    try {
      setFicha(await api.get<Ficha>(`/ficha/contato/${contatoId}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNaoEncontrado(true);
        return;
      }
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a ficha');
    }
  }, [contatoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizar = () => {
    void carregar();
    setVersao((v) => v + 1);
  };

  const abrirSeletor = async () => {
    setVinculando(true);
    if (contas) return;
    try {
      const { contas: lista } = await api.get<{ contas: Conta[] }>('/contas?limite=200');
      setContas(lista);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as empresas');
    }
  };

  const vincular = async (contaId: string) => {
    if (!contaId) return;
    try {
      // O vinculo mora do lado da conta: e ela que ganha um contato, e a rota
      // confere que as duas pontas existem antes de gravar.
      await api.post(`/contas/${contaId}/contatos`, { contatoId });
      setVinculando(false);
      atualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao vincular');
    }
  };

  const desvincular = async (contaId: string) => {
    try {
      await api.del(`/contas/${contaId}/contatos/${contatoId}`);
      atualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao desvincular');
    }
  };

  const ehAdmin = usuario?.perfil === 'ADMIN';

  const excluir = async () => {
    const motivo = window.prompt(
      ehAdmin
        ? 'Explique por que este cadastro deve ser removido. Como Administrador, a remoção acontece na hora:'
        : 'Explique por que este cadastro deve ser removido. A solicitação precisa da aprovação de outra pessoa:',
    );
    if (!motivo?.trim()) return;
    setExcluindo(true); setErro(null); setAvisoSolicitacao(null);
    try {
      const { excluidoImediatamente } = await api.post<{ excluidoImediatamente: boolean }>(`/contatos/${contatoId}/exclusao`, { motivo: motivo.trim() });
      setAvisoSolicitacao(
        excluidoImediatamente
          ? 'Cadastro removido. O histórico será preservado.'
          : 'Solicitação enviada. O cadastro será removido após aprovação de outra pessoa; o histórico será preservado.',
      );
      await carregar();
    } catch (e) { setErro(e instanceof ApiError ? e.message : 'Falha ao solicitar a remoção'); }
    finally { setExcluindo(false); }
  };

  const cancelarSolicitacao = async (id: string) => {
    const justificativa = window.prompt('Por que deseja cancelar esta solicitação?');
    if (!justificativa?.trim()) return;
    try {
      await api.post(`/contatos/solicitacoes-exclusao/${id}/cancelar`, { justificativa: justificativa.trim() });
      setAvisoSolicitacao('Solicitação cancelada.');
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao cancelar a solicitação');
    }
  };

  /** Abre o formulario de edicao com os dados atuais do contato. */
  const abrirEdicao = (c: Ficha['contato']) => {
    setEdicao({
      nome: c.nome,
      email: c.email ?? '',
      telefone: c.telefone ? mascararTelefoneBr(c.telefone) : '',
      observacoes: c.observacoes ?? '',
      uf: c.uf ?? '',
      cidade: c.cidade ?? '',
      segmentoParceiro: c.segmentoParceiro ?? '',
      operacoes: c.operacoes?.map((x) => x.operacao) ?? (c.segmentoParceiro ? [c.segmentoParceiro] : []),
    });
    setEditando(true);
  };

  /**
   * Salva a edicao via `PATCH /contatos/:id` — mesmo endpoint que o editor de
   * etiquetas ja usa, so que com os campos basicos (nome, email, telefone,
   * observacoes). Ausente e diferente de vazio no backend: manda `null`
   * explicito para limpar e-mail/telefone/observacoes, nunca `undefined` (que
   * o PATCH trata como "nao mexer neste campo").
   */
  const salvarEdicao = async () => {
    setSalvandoEdicao(true);
    setErro(null);
    try {
      await api.patch(`/contatos/${contatoId}`, {
        nome: edicao.nome.trim(),
        email: edicao.email.trim() || null,
        telefone: edicao.telefone.replace(/\D/g, '').length >= 10 ? edicao.telefone.replace(/\D/g, '') : null,
        observacoes: edicao.observacoes.trim() || null,
        uf: edicao.uf || null,
        cidade: edicao.cidade.trim() || null,
        segmentoParceiro: edicao.operacoes.length === 1 ? edicao.operacoes[0] : null,
      });
      await api.put(`/contatos/${contatoId}/operacoes`, { operacoes: edicao.operacoes });
      setEditando(false);
      atualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar o contato');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  /** Botao "Iniciar conversa": abre uma conversa de WhatsApp vazia e leva direto para o Atendimento. */
  const iniciarConversa = async () => {
    setIniciando(true);
    setErro(null);
    try {
      const { conversa } = await api.post<{ conversa: { id: string } }>('/conversas', { contatoId });
      navigate(`/atendimento?conversa=${conversa.id}`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível iniciar a conversa');
      setIniciando(false);
    }
  };

  const concluir = async (atividade: Atividade) => {
    const justificativa = window.prompt('Justificativa para concluir esta atividade:');
    if (!justificativa?.trim()) return;
    const resultado = window.prompt('Qual foi o resultado?');
    if (!resultado?.trim()) return;
    try {
      await api.post(`/atividades/${atividade.id}/concluir`, { justificativa: justificativa.trim(), resultado: resultado.trim() });
      atualizar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao concluir a tarefa');
    }
  };

  /*
   * Registro que nao carrega tem duas causas indistinguiveis de proposito: id
   * que nao existe e id de outra organizacao — a API responde 404 nos dois
   * casos, para nao confirmar a existencia do que nao e seu. Com endereco
   * proprio (`/contatos/:id`), isto virou uma tela que da para alcancar
   * digitando, e nao so um erro de bastidor.
   */
  if (naoEncontrado) {
    return (
      <Card titulo="Ficha do contato">
        <EmptyState
          titulo="Contato não encontrado"
          descricao="O endereço aponta para um registro que não existe ou que você não pode ver."
        />
      </Card>
    );
  }
  if (erro && !ficha) return <Alerta>{erro}</Alerta>;
  if (!ficha) return <Card titulo="Ficha do contato"><p className="text-sm text-slate-500">Carregando ficha...</p></Card>;

  const { contato, indicadores: i, atividadesAbertas } = ficha;
  const agora = Date.now();
  // Fixture estritamente local para a ficha fictícia usada na revisão visual.
  // Em build de produção este contato não recebe dados de demonstração.
  const demonstracaoLocal = import.meta.env.DEV && contatoId === '89a13a02-9b77-4e67-a574-8f723da7b93e';
  const indicadoresExibidos = demonstracaoLocal
    ? { ...i, conversas: 0, chamadas: 0, atividadesAbertas: atividadesAbertas.length }
    : i;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <div className="text-xs text-slate-500">CRM <span className="mx-2">/</span><button type="button" onClick={aoVoltar} className="hover:text-blue-600 hover:underline">Contatos</button></div>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">Visão completa do cliente</h1>
      </div>
      <Card
        titulo={(
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
              {contato.nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toLocaleUpperCase('pt-BR')}
            </span>
            <div className="min-w-0">
              <span className="block truncate text-[15px]">{contato.nome}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-slate-500">
                {contato.conta?.nome ?? 'Sem empresa vinculada'}
                {contato.cidade && <> · {contato.cidade}{contato.uf ? ` · ${contato.uf}` : ''}</>}
                {contato.criadoEm && <> · Cadastrado em {new Date(contato.criadoEm).toLocaleDateString('pt-BR')}</>}
              </span>
            </div>
            {contato.operacoes?.length ? contato.operacoes.map((op) => <Badge key={op.operacao} tom="marca">{op.operacao === 'STARLINK' ? 'Starlink' : op.operacao}</Badge>) : null}
            {demonstracaoLocal && <Badge tom="alerta">Dados fictícios</Badge>}
          </div>
        )}
        acao={
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variante="primario" onClick={() => setRegistroManualAberto(true)}>+ Registrar interação</Button>
            {contato.telefone && (
              <Button variante="neutro" onClick={() => void iniciarConversa()} disabled={iniciando}>
                {iniciando ? 'Iniciando...' : 'Abrir conversa'}
              </Button>
            )}
            <details className="relative">
              <summary aria-label="Mais ações do contato" className="grid size-10 cursor-pointer list-none place-items-center rounded-lg border border-slate-200 text-lg text-slate-600 hover:bg-slate-50">…</summary>
              <div className="absolute right-0 top-12 z-20 grid min-w-52 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {contato.conta ? <Button variante="neutro" onClick={() => void desvincular(contato.conta!.id)}>Desvincular empresa</Button> : vinculando ? (
                  <Select autoFocus defaultValue="" onChange={(e) => void vincular(e.target.value)} onBlur={() => setVinculando(false)} aria-label="Empresa">
                    <option value="">{contas ? 'Escolha a empresa...' : 'Carregando...'}</option>
                    {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Select>
                ) : <Button variante="neutro" onClick={() => void abrirSeletor()}>Vincular empresa</Button>}
                <Button variante="neutro" onClick={() => abrirEdicao(contato)}>Editar contato</Button>
                <Button variante="perigo" onClick={() => void excluir()} disabled={excluindo || Boolean(contato.excluidoEm)}>{excluindo ? 'Solicitando...' : 'Solicitar remoção'}</Button>
              </div>
            </details>
          </div>
        }
      >
        {editando ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <Input
                  autoFocus
                  value={edicao.nome}
                  onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Telefone" hint="Com DDD. E o que liga o contato ao WhatsApp.">
                <Input
                  value={edicao.telefone}
                  onChange={(e) => setEdicao({ ...edicao, telefone: mascararTelefoneBr(e.target.value) })}
                  placeholder="+55 62 99288-5001"
                  maxLength={20}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={edicao.email}
                  onChange={(e) => setEdicao({ ...edicao, email: e.target.value })}
                  maxLength={160}
                />
              </Field>
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <Field label="UF">
                  <Select value={edicao.uf} onChange={(e) => setEdicao({ ...edicao, uf: e.target.value })}>
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cidade">
                  <Input
                    value={edicao.cidade}
                    onChange={(e) => setEdicao({ ...edicao, cidade: e.target.value })}
                    maxLength={80}
                  />
                </Field>
              </div>
            </div>
            <Field label="Observações">
              <Textarea
                value={edicao.observacoes}
                onChange={(e) => setEdicao({ ...edicao, observacoes: e.target.value })}
                rows={3}
                maxLength={2000}
              />
            </Field>
            <fieldset className="space-y-2 text-sm"><legend className="mb-1 text-xs text-slate-500">Operações do parceiro</legend>{(['TIM', 'STARLINK'] as const).map((op) => <label key={op} className="mr-4 inline-flex items-center gap-2"><input type="checkbox" checked={edicao.operacoes.includes(op)} onChange={(e) => setEdicao({ ...edicao, operacoes: e.target.checked ? [...edicao.operacoes, op] : edicao.operacoes.filter((x) => x !== op) })} />{op === 'STARLINK' ? 'Starlink' : op}</label>)}</fieldset>
            <div className="flex gap-2">
              <Button onClick={() => void salvarEdicao()} disabled={salvandoEdicao || !edicao.nome.trim()}>
                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variante="neutro" onClick={() => setEditando(false)} disabled={salvandoEdicao}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}
        {avisoSolicitacao && <div className="mt-3"><Alerta>{avisoSolicitacao}</Alerta></div>}
        {ficha.solicitacoesExclusao.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">Histórico de solicitações de exclusão</p>
            <ul className="mt-2 space-y-2">
              {ficha.solicitacoesExclusao.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  <span className="text-slate-600">
                    <Badge tom={s.status === 'PENDENTE' ? 'alerta' : s.status === 'APROVADA' ? 'sucesso' : 'neutro'}>{s.status}</Badge>
                    {' '}{new Date(s.solicitadoEm).toLocaleString('pt-BR')} · por {s.solicitadoPor.nome} · {s.motivo}
                    {s.aprovadoPor && <> · decisão de {s.aprovadoPor.nome}</>}
                    {s.motivoDecisao && <> · justificativa: {s.motivoDecisao}</>}
                  </span>
                  {s.status === 'PENDENTE' && s.solicitadoPor.id === usuario?.id && (
                    <Button tamanho="sm" variante="neutro" onClick={() => void cancelarSolicitacao(s.id)}>Cancelar pedido</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <section aria-label="Resumo do relacionamento com o cliente" className="grid shrink-0 grid-cols-2 gap-2 xl:grid-cols-4">
        {[
          { label: 'Conversas', value: indicadoresExibidos.conversas, descricao: indicadoresExibidos.conversas ? 'registradas' : 'nenhuma registrada', tone: 'bg-blue-500', text: 'text-sky-600' },
          { label: 'Ligações', value: indicadoresExibidos.chamadas, descricao: indicadoresExibidos.chamadas ? 'registradas' : 'nenhuma registrada', tone: 'bg-violet-500', text: 'text-violet-600' },
          { label: 'Atividades', value: demonstracaoLocal ? 1 : indicadoresExibidos.atividadesAbertas, descricao: demonstracaoLocal ? '1 Nota no histórico' : 'em aberto', tone: 'bg-amber-600', text: 'text-amber-700' },
          { label: 'Protocolos', value: i.protocolosAbertos, descricao: 'nenhum aberto', tone: 'bg-emerald-500', text: 'text-emerald-600' },
        ].map((item) => (
          <div key={item.label} className="min-h-[62px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-slate-500"><span aria-hidden className={`size-1.5 rounded-full ${item.tone}`} />{item.label}</p>
            <div className="mt-1 flex items-baseline gap-3"><span className={`text-xl font-semibold tabular-nums ${item.text}`}>{item.value}</span><span className="text-[10px] text-slate-500">{item.descricao}</span></div>
          </div>
        ))}
      </section>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgb(15_23_42/0.05)]">
          <header className="shrink-0 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">Linha do tempo completa</h2>
            <p className="mt-1 text-xs text-slate-500">Conversas, ligações, atividades e protocolos em ordem cronológica</p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <LinhaDoTempo base={`/ficha/contato/${contatoId}`} raizId={contatoId} recarregar={versao} eventosDemonstracao={demonstracaoLocal} />
          </div>
        </section>
        <aside className="min-h-0 space-y-3 overflow-y-auto pr-1">
          <Card compact titulo="Antes de falar com o cliente" acao={demonstracaoLocal ? <Badge tom="marca">1 evento</Badge> : undefined}>
            <div className="space-y-2 text-xs">
              <p className="leading-relaxed text-slate-700">{contato.observacoes ?? (demonstracaoLocal ? 'Tem interesse em conhecer os serviços. Na nota de ontem, ficou combinado enviar informações e retornar em dois dias.' : 'Confira o histórico e os registros recentes antes de iniciar o contato.')}</p>
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-medium leading-relaxed text-amber-800">● &nbsp;{demonstracaoLocal ? 'Confirmar o envio das informações e agendar o retorno combinado.' : atividadesAbertas[0]?.titulo ?? 'Nenhuma próxima ação registrada.'}</div>
              {atividadesAbertas[0]?.prazo && <p className="text-[10px] text-slate-500">Prazo: {dataHora(atividadesAbertas[0].prazo)}</p>}
            </div>
          </Card>
          <Card compact titulo="Dados do cliente">
            <dl className="grid grid-cols-[68px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[10px]">
              <dt className="text-slate-500">E-mail</dt><dd className="break-words text-slate-900">{contato.email ?? 'Não cadastrado'}</dd>
              <dt className="text-slate-500">Telefone</dt><dd className="text-slate-900">{contato.telefone ? mascararTelefoneBr(contato.telefone) : 'Não cadastrado'}</dd>
              <dt className="text-slate-500">Empresa</dt><dd className="text-slate-900">{contato.conta?.nome ?? 'Sem vínculo'}</dd>
              <dt className="text-slate-500">Localização</dt><dd className="text-slate-900">{[contato.cidade, contato.uf].filter(Boolean).join(' · ') || '—'}</dd>
              <dt className="text-slate-500">Segmento</dt><dd className="text-slate-900">{(contato.operacoes?.map((x) => x.operacao) ?? []).join(', ') || contato.segmentoParceiro || '—'}</dd>
              <dt className="border-t border-slate-100 pt-2 text-slate-500">Etiquetas</dt><dd className="border-t border-slate-100 pt-2"><EditorEtiquetas tags={contato.tags ?? []} opcoes={ETIQUETAS_CONTATO} aoSalvar={async (tags) => { await api.patch(`/contatos/${contatoId}`, { tags }); aoMudarEtiquetas?.(); atualizar(); }} /></dd>
            </dl>
          </Card>
          <Card compact titulo="Tudo no mesmo histórico">
            <p className="mb-2 text-[10px] leading-relaxed text-slate-500">Cada item mostra conteúdo, data, canal, responsável e estado. Anexos e detalhes ficam acessíveis no registro.</p>
            <ul className="space-y-1.5 text-[10px]">
              {[['bg-blue-600', 'Conversas', 'Mensagens completas e anexos'], ['bg-violet-600', 'Ligações', 'Gravação e transcrição quando disponíveis'], ['bg-amber-600', 'Notas e tarefas', 'Quem registrou e o que ficou combinado'], ['bg-emerald-500', 'Protocolos e etapas', 'Mudanças ao longo do tempo']].map(([cor, titulo, texto]) => <li key={titulo} className="grid grid-cols-[8px_82px_1fr] items-center gap-2"><span className={`size-1.5 rounded-full ${cor}`} /><span className="font-medium text-slate-800">{titulo}</span><span className="text-slate-500">{texto}</span></li>)}
            </ul>
          </Card>
          <button
            type="button"
            onClick={() => setMaisDadosAberto(true)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-slate-50"
          >
            <span>Mais dados, tarefas e ciclo</span>
            <span aria-hidden className="text-base leading-none text-slate-400">＋</span>
          </button>
        </aside>
      </div>

      <Modal
        aberto={maisDadosAberto}
        titulo="Dados, tarefas e ciclo do cliente"
        aoFechar={() => setMaisDadosAberto(false)}
        largura="max-w-6xl"
      >
        <div className="space-y-4">
          <Card titulo="Relacionamento e resultados" descricao="Indicadores consolidados deste contato e da empresa vinculada.">
            <Indicadores dados={indicadoresExibidos} escopo="CONTATO" />
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <CicloDoParceiro contatoId={contatoId} segmentoParceiro={ficha?.contato.segmentoParceiro ?? null} />
            <Card titulo="Tarefas em aberto" descricao={`${atividadesAbertas.length} ${atividadesAbertas.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'}`}>
              {atividadesAbertas.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {atividadesAbertas.map((a) => {
                    const atrasada = Boolean(a.prazo && new Date(a.prazo).getTime() < agora);
                    return <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge>{LABEL_TIPO_ATIVIDADE[a.tipo]}</Badge>{a.prazo && <Badge tom={atrasada ? 'alerta' : 'neutro'}>{atrasada ? 'Atrasada · ' : ''}{dataHora(a.prazo)}</Badge>}</div><p className="mt-2 text-sm font-medium text-slate-800">{a.titulo}</p>{a.responsavel && <p className="mt-1 text-xs text-slate-500">Responsável: {a.responsavel.nome}</p>}<CheckinDeVisita atividade={a} aoMudar={atualizar} aoErrar={setErro} /></div><Button variante="neutro" tamanho="sm" onClick={() => void concluir(a)}>Concluir</Button></li>;
                  })}
                </ul>
              ) : <EmptyState titulo="Nenhuma tarefa em aberto" descricao="Quando houver um próximo passo combinado, ele aparecerá aqui." />}
            </Card>
          </div>

          <Card titulo="Registrar interação" descricao="Anote o que aconteceu ou agende o próximo contato.">
            <RegistrarAtividade contatoId={contatoId} aoRegistrar={atualizar} />
          </Card>
        </div>
      </Modal>

      <RegistroManual
        contatoId={contatoId}
        contatoNome={contato.nome}
        empresa={contato.conta?.nome}
        aberto={registroManualAberto}
        aoFechar={() => setRegistroManualAberto(false)}
        aoSalvar={atualizar}
      />

    </div>
  );
}

/** Reaproveitado pela aba de contas: mesma linha do tempo, outra raiz. */
export function FichaVazia() {
  return (
    <Card titulo="Ficha do contato">
      <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-gradient-to-br from-slate-50/80 to-white px-6 py-8 text-center">
        <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
            <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3.75 19c.35-3.15 2.2-4.75 5.25-4.75 1.35 0 2.45.32 3.28.95M16.25 8.25h4M18.25 6.25v4M15.4 14.55a3 3 0 1 0 4.24 4.24 3 3 0 0 0-4.24-4.24Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-sm font-semibold text-slate-800">Escolha um contato para começar</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          A ficha reúne os dados, conversas e atividades do cliente em um só lugar.
        </p>
      </div>
    </Card>
  );
}
