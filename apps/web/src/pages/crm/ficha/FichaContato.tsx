import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '../../../components/ui';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { ApiError, api } from '../../../lib/api';
import { useAuth } from '../../../features/auth/AuthProvider';
import { mascararTelefoneBr } from '../../../lib/telefone';
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
import { EditorEtiquetas } from '../Etiquetas';

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

export function FichaContato({ contatoId, aoMudarEtiquetas, aoExcluir }: FichaProps) {
  const navigate = useNavigate();
  const confirmar = useConfirm();
  const { temPerfil } = useAuth();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [edicao, setEdicao] = useState({ nome: '', email: '', telefone: '', observacoes: '' });
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

  /**
   * Botao "Excluir contato": apaga o registro e tudo que so pertence a ele
   * (conversas, mensagens, candidaturas de campanha). Restrito a ADMIN, mesma
   * regra do backend (`DELETE /contatos/:id`) — o botao nem aparece para quem
   * nao tem perfil pra usa-lo.
   */
  const excluir = (nome: string) => {
    confirmar({
      titulo: `Excluir ${nome}?`,
      descricao: 'Nao pode ser desfeito. Conversas e mensagens deste contato tambem sao apagadas.',
      variante: 'perigo',
      rotuloConfirmar: 'Excluir',
      aoConfirmar: async () => {
        setExcluindo(true);
        try {
          await api.del(`/contatos/${contatoId}`);
          aoExcluir?.();
        } catch (e) {
          setErro(e instanceof ApiError ? e.message : 'Falha ao excluir o contato');
        } finally {
          setExcluindo(false);
        }
      },
    });
  };

  /** Abre o formulario de edicao com os dados atuais do contato. */
  const abrirEdicao = (c: Ficha['contato']) => {
    setEdicao({
      nome: c.nome,
      email: c.email ?? '',
      telefone: c.telefone ? mascararTelefoneBr(c.telefone) : '',
      observacoes: c.observacoes ?? '',
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
      });
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
      setErro(e instanceof ApiError ? e.message : 'Nao foi possivel iniciar a conversa');
      setIniciando(false);
    }
  };

  const concluir = async (atividade: Atividade) => {
    try {
      await api.post(`/atividades/${atividade.id}/concluir`, {});
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
          titulo="Contato nao encontrado"
          descricao="O endereco aponta para um registro que nao existe ou que voce nao pode ver."
        />
      </Card>
    );
  }
  if (erro && !ficha) return <Alerta>{erro}</Alerta>;
  if (!ficha) return <Card titulo="Ficha do contato"><p className="text-sm text-slate-500">Carregando ficha...</p></Card>;

  const { contato, indicadores: i, atividadesAbertas, temPreviaWhatsapp } = ficha;
  const agora = Date.now();

  return (
    <div className="space-y-5">
      <Card
        titulo={contato.nome}
        descricao={contato.conta ? `Empresa: ${contato.conta.nome}` : 'Sem empresa vinculada'}
        acao={
          <div className="flex flex-wrap items-center gap-2">
            {/* Sem telefone nao ha como abrir conversa de WhatsApp — o botao nem aparece. */}
            {contato.telefone && (
              <Button variante="primario" onClick={() => void iniciarConversa()} disabled={iniciando}>
                {iniciando ? 'Iniciando...' : 'Iniciar conversa'}
              </Button>
            )}
            {temPreviaWhatsapp && <Badge tom="marca">Já tem conversa no WhatsApp</Badge>}
            {/* Vincular fica no cabecalho porque e onde a falta aparece: sem
               empresa, metade dos numeros abaixo e sempre zero — proposta e
               oportunidade vivem na conta, nao na pessoa. */}
            {contato.conta ? (
              <Button variante="neutro" onClick={() => void desvincular(contato.conta!.id)}>
                Desvincular empresa
              </Button>
            ) : vinculando ? (
              <Select
                autoFocus
                defaultValue=""
                onChange={(e) => void vincular(e.target.value)}
                onBlur={() => setVinculando(false)}
                className="max-w-[260px]"
                aria-label="Empresa"
              >
                <option value="">{contas ? 'Escolha a empresa...' : 'Carregando...'}</option>
                {(contas ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            ) : (
              <Button variante="neutro" onClick={() => void abrirSeletor()}>
                Vincular empresa
              </Button>
            )}
            {!editando && (
              <Button variante="neutro" onClick={() => abrirEdicao(contato)}>
                Editar contato
              </Button>
            )}
            {temPerfil('ADMIN') && (
              <Button variante="perigo" onClick={() => excluir(contato.nome)} disabled={excluindo}>
                {excluindo ? 'Excluindo...' : 'Excluir contato'}
              </Button>
            )}
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
            </div>
            <Field label="Observacoes">
              <Textarea
                value={edicao.observacoes}
                onChange={(e) => setEdicao({ ...edicao, observacoes: e.target.value })}
                rows={3}
                maxLength={2000}
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void salvarEdicao()} disabled={salvandoEdicao || !edicao.nome.trim()}>
                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variante="neutro" onClick={() => setEditando(false)} disabled={salvandoEdicao}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">E-mail</dt>
            <dd className="truncate text-slate-800">{contato.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Telefone</dt>
            <dd className="text-slate-800">{contato.telefone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Origem</dt>
            <dd className="text-slate-800">{contato.canalOrigem ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cliente desde</dt>
            <dd className="text-slate-800">
              {contato.criadoEm ? new Date(contato.criadoEm).toLocaleDateString('pt-BR') : '—'}
            </dd>
          </div>
        </dl>
        )}

        <div className="mt-4">
          <dt className="mb-1.5 text-xs text-slate-500">Etiquetas</dt>
          <EditorEtiquetas
            tags={contato.tags ?? []}
            aoSalvar={async (tags) => {
              await api.patch(`/contatos/${contatoId}`, { tags });
              aoMudarEtiquetas?.();
              // Recarrega a ficha em vez de mexer no estado local: a etiqueta
              // gravada volta normalizada pelo servidor, e mostrar o que foi
              // digitado deixaria a tela diferente do banco por um instante.
              atualizar();
            }}
          />
        </div>

        <div className="mt-4">
          <Indicadores dados={i} escopo="CONTATO" />
        </div>

        {contato.observacoes && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{contato.observacoes}</p>
        )}
        {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}
      </Card>

      {atividadesAbertas.length > 0 && (
        <Card titulo="Tarefas marcadas" descricao={`${atividadesAbertas.length} em aberto`}>
          <ul className="divide-y divide-slate-100">
            {atividadesAbertas.map((a) => {
              const atrasada = Boolean(a.prazo && new Date(a.prazo).getTime() < agora);
              return (
                <li key={a.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{LABEL_TIPO_ATIVIDADE[a.tipo]}</Badge>
                      {a.prazo && (
                        <Badge tom={atrasada ? 'alerta' : 'neutro'}>
                          {atrasada ? 'Atrasada · ' : ''}
                          {dataHora(a.prazo)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-800">{a.titulo}</p>
                    {a.responsavel && <p className="text-xs text-slate-500">{a.responsavel.nome}</p>}
                    <CheckinDeVisita atividade={a} aoMudar={() => atualizar()} aoErrar={setErro} />
                  </div>
                  <Button variante="neutro" onClick={() => void concluir(a)}>
                    Concluir
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card titulo="Registrar" descricao="Fica na linha do tempo na hora">
        <RegistrarAtividade contatoId={contatoId} aoRegistrar={atualizar} />
      </Card>

      <Card titulo="Linha do tempo" descricao="Tudo que aconteceu com este cliente e com a empresa dele">
        <LinhaDoTempo base={`/ficha/contato/${contatoId}`} raizId={contatoId} recarregar={versao} />
      </Card>
    </div>
  );
}

/** Reaproveitado pela aba de contas: mesma linha do tempo, outra raiz. */
export function FichaVazia() {
  return (
    <Card titulo="Ficha do contato">
      <EmptyState titulo="Selecione um contato" descricao="A vida do cliente aparece aqui." />
    </Card>
  );
}
