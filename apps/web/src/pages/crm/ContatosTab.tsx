import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { BarraDeSelecao } from '../../components/ui/BarraDeSelecao';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import {
  AJUDA_CICLO_DE_VIDA,
  LABEL_CICLO_DE_VIDA,
  type Canal,
  type CicloDeVida,
  type Contato,
} from '../../lib/types';
import { useFaixaDeLargura } from '../../lib/useFaixaDeLargura';
import { FichaContato, FichaVazia } from './ficha/FichaContato';
import { Etiquetas, FiltroEtiquetas } from './Etiquetas';
import { FunilDeCicloDeVida } from './FunilDeCicloDeVida';

const ORIGENS: Canal[] = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ'];

const VAZIO = { nome: '', email: '', telefone: '', canalOrigem: 'WHATSAPP' as Canal };

type Props = {
  /** Registro aberto, vindo da URL (`/contatos/:id`). Nulo em `/crm`. */
  selecionadoId: string | null;
  /** Abrir e navegar: a selecao vive na URL, nao aqui dentro. */
  aoAbrir: (id: string) => void;
  /** Voltar para a lista sem registro aberto. */
  aoFechar: () => void;
};

/**
 * Aba de contatos: lista a esquerda, a vida do cliente a direita.
 *
 * A lista carrega so o resumo e o painel busca a ficha ao abrir. Trazer tudo de
 * uma vez seria oito consultas por contato listado para mostrar uma.
 */
export function ContatosTab({ selecionadoId, aoAbrir, aoFechar }: Props) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState('');
  /** Etiquetas ligadas no filtro. Semantica E: cada uma estreita a lista. */
  const [tags, setTags] = useState<string[]>([]);
  /*
   * Degraus de ciclo de vida ligados no filtro (item E.4).
   *
   * Semantica OU, ao contrario das etiquetas: um contato esta em UM degrau, e
   * exigir dois ao mesmo tempo nunca traria ninguem. Clicar no degrau do funil e
   * o mesmo que ligar o filtro — o grafico e o controle.
   */
  const [ciclos, setCiclos] = useState<CicloDeVida[]>([]);
  /** Muda quando a ficha grava etiquetas: e o sinal para lista e filtro. */
  const [versaoTags, setVersaoTags] = useState(0);
  const selecionado = selecionadoId;
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(VAZIO);
  /**
   * O cadastro comeca fechado, atras de um botao no cabecalho da lista.
   *
   * Como cartao proprio abaixo da lista ele caia fora da tela — a lista ocupa
   * 70% da altura — e a acao mais comum aqui e achar alguem, nao cadastrar.
   */
  const [cadastrando, setCadastrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  /** Aviso de duplicidade: nunca bloqueia o cadastro, so avisa. */
  const [duplicado, setDuplicado] = useState<string | null>(null);
  const mostrarToast = useToast();

  /** So mostra skeleton na carga inicial — trocar tudo por skeleton a cada filtro pisca a tela por nada. */
  const [carregando, setCarregando] = useState(true);
  /**
   * Selecao em massa (Fase 6). Vive presa a lista carregada, nao a URL: e um
   * gesto de trabalho em cima de "estes resultados agora", nao um estado que
   * faca sentido sobreviver a um F5 ou virar link.
   */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [tagEmLote, setTagEmLote] = useState('');
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const selecionarTodosRef = useRef<HTMLInputElement>(null);

  /**
   * Largura real do container, nao do viewport (mesmo principio do
   * Atendimento, Fase 3). Abaixo de `notebook`, o grid lista+ficha lado a
   * lado aperta demais — a coluna da ficha herdava menos espaco do que os
   * proprios componentes dela (`sm:grid-cols-3` etc, baseados em viewport)
   * assumiam ter. Em vez disso, so um lado aparece por vez.
   */
  const { ref: containerRef, faixa } = useFaixaDeLargura<HTMLDivElement>();
  const ladoALado = faixa === 'desktop' || faixa === 'notebook';
  const buscaRef = useRef<HTMLInputElement>(null);
  const voltarRef = useRef<HTMLButtonElement>(null);
  const montado = useRef(false);

  // Foco previsivel ao alternar entre lista e ficha em modo de foco unico: ao
  // abrir um contato, o "voltar" vira o ponto de partida; ao fechar, o foco
  // pousa na busca, nao se perde no documento. So depois da primeira
  // renderizacao — chegar por link direto (`/contatos/:id`) nao deve roubar
  // o foco que o navegador ja colocou na pagina.
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    if (ladoALado) return;
    if (selecionadoId) voltarRef.current?.focus();
    else buscaRef.current?.focus();
  }, [ladoALado, selecionadoId]);

  const carregar = useCallback(async () => {
    // `URLSearchParams` em vez de concatenar: com dois filtros a montagem a mao
    // erra o `?` e o `&` na primeira mudanca.
    const params = new URLSearchParams();
    if (busca.trim()) params.set('busca', busca.trim());
    for (const tag of tags) params.append('tags', tag);
    for (const c of ciclos) params.append('ciclo', c);
    const qs = params.size ? `?${params}` : '';
    setCarregando(true);
    try {
      const { contatos: lista } = await api.get<{ contatos: Contato[] }>(`/contatos${qs}`);
      setContatos(lista);
      // A selecao pertence a este resultado: um filtro novo pode nao conter
      // mais quem estava marcado, e agir em cima de quem sumiu da tela seria
      // silencioso demais para uma acao em lote.
      setSelecionados(new Set());
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar contatos');
    } finally {
      setCarregando(false);
    }
  }, [busca, tags, ciclos]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const criar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setDuplicado(null);
    setSalvando(true);
    try {
      const { contato, possivelDuplicado } = await api.post<{
        contato: Contato;
        possivelDuplicado: { id: string; nome: string } | null;
      }>('/contatos', {
        nome: novo.nome.trim(),
        email: novo.email.trim() || null,
        telefone: novo.telefone.trim() || null,
        canalOrigem: novo.canalOrigem,
      });

      setNovo(VAZIO);
      setCadastrando(false);
      await carregar();
      mostrarToast('sucesso', `${contato.nome} cadastrado.`);
      // Abre a ficha do contato novo: quem cadastrou quer registrar algo nele
      // em seguida, e nao procurar o nome de volta na lista.
      aoAbrir(contato.id);
      if (possivelDuplicado) {
        setDuplicado(
          `Ja existe "${possivelDuplicado.nome}" com este e-mail ou telefone. ` +
            'O cadastro foi feito de qualquer forma — confira se nao sao a mesma pessoa.',
        );
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao cadastrar o contato');
    } finally {
      setSalvando(false);
    }
  };

  const alternarSelecao = (id: string) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const alternarTodos = (marcado: boolean) => {
    setSelecionados(marcado ? new Set(contatos.map((c) => c.id)) : new Set());
  };

  // Indeterminado (nem todos, nem nenhum) so da pra fazer via DOM — nao existe
  // prop React pra isso, o atributo nao aceita valor no JSX.
  useEffect(() => {
    if (!selecionarTodosRef.current) return;
    selecionarTodosRef.current.indeterminate =
      selecionados.size > 0 && selecionados.size < contatos.length;
  }, [selecionados, contatos.length]);

  /**
   * Aplica uma etiqueta a todos os contatos selecionados.
   *
   * Usa o mesmo `PATCH /contatos/:id` que a ficha ja usa (item 5.3) — nao um
   * endpoint novo. A API grava a lista inteira de etiquetas, entao cada
   * contato precisa da SUA lista atual + a nova, nao so a nova.
   */
  const aplicarEtiquetaEmLote = async () => {
    const tag = tagEmLote.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    if (!tag || selecionados.size === 0) return;
    setAplicandoLote(true);
    const alvos = contatos.filter((c) => selecionados.has(c.id));
    const resultados = await Promise.allSettled(
      alvos.map((c) => {
        const tagsAtuais = c.tags ?? [];
        if (tagsAtuais.includes(tag)) return Promise.resolve();
        return api.patch(`/contatos/${c.id}`, { tags: [...tagsAtuais, tag] });
      }),
    );
    const falhas = resultados.filter((r) => r.status === 'rejected').length;
    setAplicandoLote(false);
    setTagEmLote('');
    setVersaoTags((v) => v + 1);
    await carregar();
    if (falhas > 0) {
      mostrarToast(
        'erro',
        `Etiqueta aplicada em ${alvos.length - falhas} de ${alvos.length}. ${falhas} falharam — tente novamente.`,
      );
    } else {
      mostrarToast('sucesso', `Etiqueta aplicada em ${alvos.length} contato${alvos.length === 1 ? '' : 's'}.`);
    }
  };

  const painelLista = (
      <Card
        titulo="Contatos"
        descricao={`${contatos.length} encontrado(s)`}
        acao={
          <Button variante="neutro" onClick={() => setCadastrando((v) => !v)} aria-expanded={cadastrando}>
            {cadastrando ? 'Cancelar' : 'Novo contato'}
          </Button>
        }
      >
        {cadastrando && (
          /*
            Cadastro manual. A maioria dos contatos nasce sozinha, quando alguem
            fala pela primeira vez — mas nao todos: o vendedor volta da feira com
            cartao na mao, e sem isto a unica forma de registrar essa pessoa
            seria pedir que ela mandasse mensagem primeiro.
          */
          <form className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={criar}>
            <Field label="Nome">
              <Input
                autoFocus
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Telefone" hint="Com DDD. E o que liga o contato ao WhatsApp.">
              <Input
                value={novo.telefone}
                onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
                maxLength={20}
              />
            </Field>
            <Field label="E-mail">
              <Input
                type="email"
                value={novo.email}
                onChange={(e) => setNovo({ ...novo, email: e.target.value })}
              />
            </Field>
            <Field label="Origem" hint="Por onde essa pessoa chegou.">
              <Select
                value={novo.canalOrigem}
                onChange={(e) => setNovo({ ...novo, canalOrigem: e.target.value as Canal })}
              >
                {ORIGENS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" className="w-full" disabled={salvando || novo.nome.trim().length < 2}>
              {salvando ? 'Cadastrando...' : 'Cadastrar contato'}
            </Button>
          </form>
        )}

        <Input
          ref={buscaRef}
          placeholder="Buscar por nome, e-mail ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="mt-2">
          <FiltroEtiquetas
            ativas={tags}
            versao={versaoTags}
            campo="contatos"
            aoAlternar={(tag) =>
              setTags((atuais) =>
                atuais.includes(tag) ? atuais.filter((t) => t !== tag) : [...atuais, tag],
              )
            }
          />
        </div>
        {erro && (
          <div className="mt-3">
            <Alerta>{erro}</Alerta>
          </div>
        )}

        {contatos.length > 0 && (
          <BarraDeSelecao contagem={selecionados.size} aoLimpar={() => setSelecionados(new Set())}>
            <Input
              value={tagEmLote}
              onChange={(e) => setTagEmLote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void aplicarEtiquetaEmLote();
                }
              }}
              placeholder="Etiqueta"
              aria-label="Etiqueta para aplicar aos selecionados"
              disabled={aplicandoLote}
              className="!w-36"
            />
            <Button
              tamanho="sm"
              variante="neutro"
              onClick={() => void aplicarEtiquetaEmLote()}
              disabled={aplicandoLote || !tagEmLote.trim()}
            >
              {aplicandoLote ? 'Aplicando...' : 'Aplicar etiqueta'}
            </Button>
          </BarraDeSelecao>
        )}

        <div className="mt-3 max-h-[70vh] overflow-y-auto">
          {carregando && contatos.length === 0 ? (
            <div className="space-y-3 px-1 py-1" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBloco className="h-3.5 w-2/3" />
                  <SkeletonBloco className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : contatos.length === 0 ? (
            <EmptyState
              titulo="Nenhum contato"
              // Lista vazia por filtro nao e lista vazia por base vazia: sem
              // essa distincao a tela sugere cadastrar alguem que ja existe.
              descricao={
                tags.length > 0 || ciclos.length > 0 || busca.trim()
                  ? 'Nenhum contato com esse filtro. Desligue uma etiqueta, um degrau do ciclo de vida, ou limpe a busca.'
                  : 'Contatos nascem sozinhos quando alguem fala pela primeira vez. Use Novo contato para cadastrar a mao.'
              }
              acao={
                // So quando a base esta vazia de verdade: com filtro ativo, a
                // acao certa e limpar o filtro, nao cadastrar quem ja existe.
                tags.length === 0 && ciclos.length === 0 && !busca.trim() && !cadastrando ? (
                  <Button variante="neutro" onClick={() => setCadastrando(true)}>
                    Novo contato
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 px-1 py-1.5">
                <input
                  ref={selecionarTodosRef}
                  type="checkbox"
                  aria-label="Selecionar todos os contatos visiveis"
                  checked={selecionados.size > 0 && selecionados.size === contatos.length}
                  onChange={(e) => alternarTodos(e.target.checked)}
                />
                <span className="text-xs text-slate-500">Selecionar todos</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {contatos.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 px-1">
                    <input
                      type="checkbox"
                      className="mt-3"
                      aria-label={`Selecionar ${c.nome}`}
                      checked={selecionados.has(c.id)}
                      onChange={() => alternarSelecao(c.id)}
                    />
                    <button
                      type="button"
                      onClick={() => aoAbrir(c.id)}
                      className={`flex-1 py-2.5 text-left transition hover:bg-slate-50 ${
                        selecionado === c.id ? 'bg-slate-50' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-800">{c.nome}</p>
                      <p className="text-xs text-slate-500">{c.email ?? c.telefone ?? 'Sem contato'}</p>
                      {typeof c.totalConversas === 'number' && (
                        <p className="mt-1 text-xs text-slate-500">
                          {c.totalConversas} conversa{c.totalConversas === 1 ? '' : 's'}
                        </p>
                      )}
                      {c.cicloDeVida && (
                        // O degrau na LINHA, e nao so na ficha: ciclo de vida serve
                        // para varrer a carteira, e varrer nao se faz abrindo um
                        // contato por vez.
                        <p className="mt-1" title={AJUDA_CICLO_DE_VIDA[c.cicloDeVida]}>
                          <Badge tom={c.cicloDeVida === 'CLIENTE' ? 'sucesso' : 'neutro'}>
                            {LABEL_CICLO_DE_VIDA[c.cicloDeVida]}
                          </Badge>
                        </p>
                      )}
                      {c.tags && c.tags.length > 0 && (
                        <div className="mt-1.5">
                          <Etiquetas tags={c.tags} />
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Card>
  );

  // Filtro de ciclo de vida: acompanha a LISTA (e o que ele filtra), nao a
  // ficha — inclusive quando so um lado aparece por vez (abaixo).
  const painelFunil = (
    <FunilDeCicloDeVida
      ativos={ciclos}
      aoFiltrar={(c) =>
        setCiclos((atuais) => (atuais.includes(c) ? atuais.filter((x) => x !== c) : [...atuais, c]))
      }
    />
  );

  const painelFicha = (
    <div className="space-y-5">
      {duplicado && (
        /* Fechavel: o aviso fica acima da ficha e nao tem por que sobreviver ao
           proximo clique — quem conferiu quer a tela de volta. */
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Alerta>{duplicado}</Alerta>
          </div>
          <button
            type="button"
            onClick={() => setDuplicado(null)}
            aria-label="Fechar aviso"
            className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-600 transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      )}
      {/* Com o registro na URL, o caminho de volta precisa existir na tela: sem
          isto, sair de `/contatos/abc` para a lista limpa exigiria clicar no
          menu, que recarrega o modulo inteiro. */}
      {selecionado && (
        <button
          ref={voltarRef}
          type="button"
          onClick={aoFechar}
          className="anel-de-foco rounded text-xs text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline"
        >
          &larr; Todos os contatos
        </button>
      )}
      {/* `key` no id: trocar de contato remonta a ficha e zera o cursor da linha
          do tempo. Sem isso, a primeira pagina do contato novo viria depois dos
          eventos do anterior. */}
      {selecionado ? (
        <FichaContato
          key={selecionado}
          contatoId={selecionado}
          aoMudarEtiquetas={() => {
            setVersaoTags((v) => v + 1);
            void carregar();
          }}
        />
      ) : (
        <FichaVazia />
      )}
    </div>
  );

  return (
    <div ref={containerRef}>
      {ladoALado ? (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          {painelLista}
          <div className="space-y-5">
            {painelFunil}
            {painelFicha}
          </div>
        </div>
      ) : selecionado ? (
        // Uma coisa por vez em espaco real estreito: a lista some enquanto a
        // ficha esta aberta, em vez de empilhar as duas e obrigar a rolar por
        // uma pagina inteira para chegar no que se abriu.
        painelFicha
      ) : (
        <div className="space-y-5">
          {painelLista}
          {painelFunil}
        </div>
      )}
    </div>
  );
}
