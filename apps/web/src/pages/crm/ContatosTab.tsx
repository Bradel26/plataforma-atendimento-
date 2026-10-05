import { useCallback, useEffect, useRef, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { BarraDeSelecao } from '../../components/ui/BarraDeSelecao';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ApiError, api } from '../../lib/api';
import { semWebchat } from '../../lib/recursos';
import { mascararTelefoneBr } from '../../lib/telefone';
import {
  AJUDA_CICLO_DE_VIDA,
  LABEL_CICLO_DE_VIDA,
  type Canal,
  type CicloDeVida,
  type Contato,
} from '../../lib/types';
import { useFaixaDeLargura } from '../../lib/useFaixaDeLargura';
import { FichaContato, FichaVazia } from './ficha/FichaContato';
import { LABEL_CANAL_ORIGEM } from './temperatura';
import { CidadeInput } from './CidadeInput';
import { EmpresaInput, type EmpresaEscolhida } from './EmpresaInput';
import { Etiquetas, FiltroEtiquetas } from './Etiquetas';
import { FunilDeCicloDeVida } from './FunilDeCicloDeVida';
import { UFS_ATENDIDAS } from '../esteira/ufs';
import { AvatarConversa } from '../../features/atendimento/AvatarConversa';

const ORIGENS: Canal[] = semWebchat<Canal>(
  ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'PROSPECCAO_ATIVA', 'INDICACAO'],
  (c) => c,
);

const VAZIO = {
  nome: '',
  email: '',
  telefone: '',
  uf: '',
  cidade: '',
  canalOrigem: 'WHATSAPP' as Canal,
  empresa: { nome: '', cnpj: '', contaId: null } as EmpresaEscolhida,
};

/** Campos que o cadastro manual exige antes de seguir. Devolve o que falta, em ordem de tela. */
const camposFaltando = (n: typeof VAZIO) => {
  const falta: string[] = [];
  if (n.nome.trim().length < 2) falta.push('Nome');
  if (n.telefone.replace(/\D/g, '').length < 10) falta.push('Telefone (com DDD)');
  if (!/^\S+@\S+\.\S+$/.test(n.email.trim())) falta.push('E-mail');
  if (!n.uf) falta.push('UF');
  if (!n.cidade.trim()) falta.push('Cidade');
  if (!n.canalOrigem) falta.push('Origem');
  return falta;
};

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

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
  const [proximoCursor, setProximoCursor] = useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
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
  const [uf, setUf] = useState('');
  /** Filtro por DDD, alternativa ao UF para quem pensa no telefone e nao na sigla do estado. */
  const [ddd, setDdd] = useState('');
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
  const versaoDaLista = useRef(0);

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
    if (uf) params.set('uf', uf);
    if (ddd.length === 2) params.set('ddd', ddd);
    const qs = params.size ? `?${params}` : '';
    const versao = ++versaoDaLista.current;
    setErro(null);
    setProximoCursor(null);
    setCarregandoMais(false);
    setCarregando(true);
    try {
      const { contatos: lista, proximoCursor: proximo } = await api.get<{
        contatos: Contato[];
        proximoCursor: string | null;
      }>(`/contatos${qs}`);
      if (versao !== versaoDaLista.current) return;
      setContatos(lista);
      setProximoCursor(proximo);
      // A selecao pertence a este resultado: um filtro novo pode nao conter
      // mais quem estava marcado, e agir em cima de quem sumiu da tela seria
      // silencioso demais para uma acao em lote.
      setSelecionados(new Set());
    } catch (e) {
      if (versao !== versaoDaLista.current) return;
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar contatos');
    } finally {
      if (versao === versaoDaLista.current) setCarregando(false);
    }
  }, [busca, tags, ciclos, uf, ddd]);

  useEffect(() => {
    // Um filtro novo invalida qualquer pagina que ainda esteja chegando.
    versaoDaLista.current += 1;
    setProximoCursor(null);
    setCarregandoMais(false);
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const carregarMais = async () => {
    if (!proximoCursor || carregandoMais) return;

    const params = new URLSearchParams({ limite: '50', cursor: proximoCursor });
    if (busca.trim()) params.set('busca', busca.trim());
    for (const tag of tags) params.append('tags', tag);
    for (const c of ciclos) params.append('ciclo', c);
    if (uf) params.set('uf', uf);
    if (ddd.length === 2) params.set('ddd', ddd);

    const versao = versaoDaLista.current;
    setCarregandoMais(true);
    setErro(null);
    try {
      const { contatos: mais, proximoCursor: proximo } = await api.get<{
        contatos: Contato[];
        proximoCursor: string | null;
      }>(`/contatos?${params}`);
      if (versao !== versaoDaLista.current) return;
      setContatos((atuais) => [...atuais, ...mais.filter((contato) => !atuais.some((atual) => atual.id === contato.id))]);
      setProximoCursor(proximo);
    } catch (e) {
      if (versao !== versaoDaLista.current) return;
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar mais contatos');
    } finally {
      if (versao === versaoDaLista.current) setCarregandoMais(false);
    }
  };

  const criar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setDuplicado(null);
    const falta = camposFaltando(novo);
    if (falta.length > 0) {
      setErro(`Preencha os campos obrigatórios: ${falta.join(', ')}.`);
      return;
    }
    setSalvando(true);
    try {
      const { contato, possivelDuplicado, contaCriada } = await api.post<{
        contato: Contato;
        contaCriada?: boolean;
        possivelDuplicado: { id: string; nome: string } | null;
      }>('/contatos', {
        nome: novo.nome.trim(),
        email: novo.email.trim(),
        telefone: mascararTelefoneBr(novo.telefone.trim()),
        uf: novo.uf,
        cidade: novo.cidade.trim(),
        canalOrigem: novo.canalOrigem,
        ...(novo.empresa.contaId
          ? { contaId: novo.empresa.contaId }
          : novo.empresa.nome.trim()
            ? { empresa: { nome: novo.empresa.nome.trim(), ...(novo.empresa.cnpj ? { cnpj: novo.empresa.cnpj } : {}) } }
            : {}),
      });

      setNovo(VAZIO);
      setCadastrando(false);
      await carregar();
      mostrarToast(
        'sucesso',
        contaCriada ? `${contato.nome} cadastrado e empresa criada em Empresas.` : `${contato.nome} cadastrado.`,
      );
      // Abre a ficha do contato novo: quem cadastrou quer registrar algo nele
      // em seguida, e nao procurar o nome de volta na lista.
      aoAbrir(contato.id);
      if (possivelDuplicado) {
        setDuplicado(
          `Já existe "${possivelDuplicado.nome}" com este e-mail ou telefone. ` +
            'O cadastro foi feito de qualquer forma — confira se não são a mesma pessoa.',
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
        descricao={`${contatos.length} exibido(s)${proximoCursor ? ' · há mais contatos' : ''}`}
        acao={
          <Button variante={cadastrando ? 'neutro' : 'primario'} onClick={() => setCadastrando((v) => !v)} aria-expanded={cadastrando}>
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
          <form className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={criar} noValidate>
            <Field label="Nome *">
              <Input
                autoFocus
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Telefone *" hint="Com DDD. E o que liga o contato ao WhatsApp.">
              <div className="flex overflow-hidden rounded-lg border border-slate-300 transition focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/20">
                <span aria-hidden="true" className="flex items-center border-r border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">
                  +55
                </span>
                <Input
                  className="min-w-0 rounded-none border-0 focus:border-transparent focus:ring-0"
                  value={novo.telefone}
                  onChange={(e) => {
                    let telefone = e.target.value.replace(/\D/g, '');
                    // Ao colar um numero completo com o DDI, mantemos o +55 fixo visual.
                    if (telefone.length > 11 && telefone.startsWith('55')) telefone = telefone.slice(2);
                    setNovo({ ...novo, telefone: telefone.slice(0, 11) });
                  }}
                  placeholder="00 00000-0000"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={11}
                  required
                />
              </div>
            </Field>
            <Field label="E-mail *">
              <Input
                required
                type="email"
                value={novo.email}
                onChange={(e) => setNovo({ ...novo, email: e.target.value })}
              />
            </Field>
            <EmpresaInput value={novo.empresa} onChange={(empresa) => setNovo({ ...novo, empresa })} />
            <div className="space-y-3">
              <Field label="UF *">
                <Select required value={novo.uf} onChange={(e) => setNovo({ ...novo, uf: e.target.value, cidade: '' })}>
                  <option value="">—</option>
                  {UFS_ATENDIDAS.map((u) => (
                    <option key={u.sigla} value={u.sigla}>{u.sigla} — {u.nome}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Cidade *">
                <CidadeInput required uf={novo.uf} value={novo.cidade} onChange={(cidade) => setNovo({ ...novo, cidade })} />
              </Field>
            </div>
            <Field label="Origem *" hint="Por onde essa pessoa chegou.">
              <Select
                value={novo.canalOrigem}
                onChange={(e) => setNovo({ ...novo, canalOrigem: e.target.value as Canal })}
              >
                {ORIGENS.map((c) => (
                  <option key={c} value={c}>
                    {LABEL_CANAL_ORIGEM[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" className="w-full" disabled={salvando || camposFaltando(novo).length > 0}>
              {salvando ? 'Cadastrando...' : 'Cadastrar contato'}
            </Button>
            {camposFaltando(novo).length > 0 && (
              <p className="text-xs text-slate-500">Faltam: {camposFaltando(novo).join(', ')}.</p>
            )}
          </form>
        )}

        <div className="space-y-2">
          <Input
            ref={buscaRef}
            placeholder="Buscar por nome, e-mail ou telefone"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Select aria-label="Filtrar por UF" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Todas as UFs</option>
              {UFS_ATENDIDAS.map((u) => (
                <option key={u.sigla} value={u.sigla}>{u.sigla} — {u.nome}</option>
              ))}
            </Select>
            <Input
              aria-label="Filtrar por DDD"
              placeholder="DDD"
              value={ddd}
              inputMode="numeric"
              maxLength={2}
              onChange={(e) => setDdd(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </div>
          <div className="flex justify-end">
            <Button
              tamanho="sm"
              variante="neutro"
              disabled={!busca.trim() && !uf && !ddd && tags.length === 0 && ciclos.length === 0}
              onClick={() => {
                setBusca('');
                setUf('');
                setDdd('');
                setTags([]);
                setCiclos([]);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
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

        <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
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
                tags.length > 0 || ciclos.length > 0 || busca.trim() || uf || ddd
                  ? 'Nenhum contato com esse filtro. Desligue uma etiqueta, um degrau do ciclo de vida, ou limpe a busca/UF/DDD.'
                  : 'Contatos nascem sozinhos quando alguém fala pela primeira vez. Use Novo contato para cadastrar a mão.'
              }
              acao={
                // So quando a base esta vazia de verdade: com filtro ativo, a
                // acao certa e limpar o filtro, nao cadastrar quem ja existe.
                tags.length === 0 && ciclos.length === 0 && !busca.trim() && !uf && !ddd && !cadastrando ? (
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
                  aria-label="Selecionar todos os contatos visíveis"
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
                      className={`group flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition hover:bg-slate-50 ${
                        selecionado === c.id
                          ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-200'
                          : 'border border-transparent'
                      }`}
                    >
                      <AvatarConversa
                        conversaId={c.id}
                        nome={c.nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toLocaleUpperCase('pt-BR')}
                        className="mt-0.5 size-9 text-[11px] ring-1 ring-inset ring-blue-200/70"
                        avatarPath={`/contatos/${c.id}/avatar`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-slate-800 group-hover:text-blue-700">{c.nome}</span>
                          {c.cicloDeVida && (
                            <span title={AJUDA_CICLO_DE_VIDA[c.cicloDeVida]}>
                              <Badge tom={c.cicloDeVida === 'CLIENTE' ? 'sucesso' : 'neutro'}>
                                {LABEL_CICLO_DE_VIDA[c.cicloDeVida]}
                              </Badge>
                            </span>
                          )}
                        </span>
                        {c.conta && <span className="block truncate text-[11px] font-medium text-slate-600">{c.conta.nome}</span>}
                        {/* Resumo de agenda: telefone, estado, responsavel e atividade sem abrir a ficha. */}
                        <span className="mt-1 block truncate text-[11px] text-slate-500">
                          {[c.telefone ?? c.email ?? 'Sem contato', c.uf].filter(Boolean).join(' · ')}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                          {c.responsavel ? c.responsavel.nome : 'Sem responsável'}
                          {c.ultimaInteracaoEm ? ` · Último contato ${dataCurta(c.ultimaInteracaoEm)}` : ''}
                        </span>
                        {c.proximoRetorno && (
                          <span className={`mt-0.5 block truncate text-[10px] font-medium ${
                            new Date(c.proximoRetorno.prazo) < new Date() ? 'text-red-700' : 'text-[var(--brand-primary)]'
                          }`}>
                            Próximo retorno {dataCurta(c.proximoRetorno.prazo)} · {c.proximoRetorno.titulo}
                          </span>
                        )}
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {typeof c.totalConversas === 'number' && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                              {c.totalConversas} conversa{c.totalConversas === 1 ? '' : 's'}
                            </span>
                          )}
                          {c.tags && c.tags.length > 0 && <Etiquetas tags={c.tags} />}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {proximoCursor && (
                <div className="flex justify-center border-t border-slate-100 px-2 py-3">
                  <Button variante="neutro" disabled={carregandoMais} onClick={() => void carregarMais()}>
                    {carregandoMais ? 'Carregando...' : 'Carregar mais contatos'}
                  </Button>
                </div>
              )}
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
          aoExcluir={() => {
            aoFechar();
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
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
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
