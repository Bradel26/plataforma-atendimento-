import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { EditorEtiquetas, Etiquetas, FiltroEtiquetas } from './Etiquetas';
import {
  LABEL_CAMPO_CONTA,
  LABEL_FASE_LEAD,
  LABEL_PAPEL_NA_CONTA,
  PAPEIS_NA_CONTA,
  moeda,
  type CampoCustomizadoDef,
  type PapelNaConta,
  type PreviaEnriquecimento,
  type Conta,
  type Filial,
  type IndicadoresFicha,
  type Lead,
  type Oportunidade,
  type ProdutoInstalado,
  type FiltroContaSalvo,
  type ValorCampoCustomizado,
} from '../../lib/types';
import { CamposCustomizadosCampos } from './CamposCustomizados';
import { BaseInstalada } from './ficha/BaseInstalada';
import { VisoesSalvas } from './VisoesSalvas';
import { Indicadores } from './ficha/Indicadores';
import { LinhaDoTempo } from './ficha/LinhaDoTempo';
import { RegistrarAtividade } from './ficha/RegistrarAtividade';

type Ficha = {
  conta: Conta;
  leads: Lead[];
  oportunidades: Oportunidade[];
  produtosInstalados: ProdutoInstalado[];
  camposCustomizados: ValorCampoCustomizado[];
};

const mascararCnpj = (cnpj: string | null) =>
  cnpj && cnpj.length === 14
    ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : (cnpj ?? '—');

type Props = {
  /** Registro aberto, vindo da URL (`/clientes/:id`). Nulo em `/crm`. */
  selecionadoId: string | null;
  aoAbrir: (id: string) => void;
  aoFechar: () => void;
};

export function ContasTab({ selecionadoId, aoAbrir, aoFechar }: Props) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [busca, setBusca] = useState('');
  /** Etiquetas ligadas no filtro. Semantica E, igual a aba de contatos. */
  const [tags, setTags] = useState<string[]>([]);
  /** Muda quando a ficha grava etiquetas: e o sinal para o filtro rebuscar. */
  const [versaoTags, setVersaoTags] = useState(0);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ nome: '', cnpj: '', segmento: '', filialId: '' });
  /** Campos customizados (item 6.4) da "Nova conta". */
  const [camposDef, setCamposDef] = useState<CampoCustomizadoDef[]>([]);
  const [novosCampos, setNovosCampos] = useState<Record<string, unknown>>({});
  const [indicadores, setIndicadores] = useState<IndicadoresFicha | null>(null);
  /** Enriquecimento por CNPJ (item 5.2): previa antes de aplicar. */
  const [previa, setPrevia] = useState<PreviaEnriquecimento | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [avisoCnpj, setAvisoCnpj] = useState<string | null>(null);
  /** Sinal para a linha do tempo rebuscar depois de um registro novo. */
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const params = new URLSearchParams();
    if (busca.trim()) params.set('busca', busca.trim());
    for (const tag of tags) params.append('tags', tag);
    const qs = params.size ? `?${params}` : '';
    try {
      const { contas: lista } = await api.get<{ contas: Conta[] }>(`/contas${qs}`);
      setContas(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar contas');
    }
  }, [busca, tags]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    void api
      .get<{ filiais: Filial[] }>('/filiais')
      .then(({ filiais: lista }) => setFiliais(lista))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void api
      .get<{ campos: CampoCustomizadoDef[] }>('/campos-customizados?entidade=CONTA')
      .then(({ campos }) => setCamposDef(campos))
      .catch(() => undefined);
  }, []);

  const abrir = useCallback(async (id: string) => {
    try {
      // Duas chamadas em paralelo: `/contas/:id` traz contatos, leads e
      // oportunidades; `/ficha/conta/:id` traz os contadores, que somam coisas
      // que aquela rota nao conta.
      const [detalhe, resumo] = await Promise.all([
        api.get<Ficha>(`/contas/${id}`),
        api.get<{ indicadores: IndicadoresFicha }>(`/ficha/conta/${id}`),
      ]);
      setFicha(detalhe);
      setIndicadores(resumo.indicadores);
      // A previa e de UMA conta: mantida ao trocar de cliente, ela ofereceria
      // aplicar no cliente errado os dados do anterior.
      setPrevia(null);
      setAvisoCnpj(null);
      setErro(null);
    } catch (e) {
      setFicha(null);
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir a conta');
    }
  }, []);

  /**
   * Consulta o cadastro publico. **Nao escreve nada** — devolve a previa.
   *
   * Duas etapas de proposito: enriquecimento e a unica operacao em que dado de
   * fora entra no cadastro do cliente, e ver antes de aplicar e o que transforma
   * varinha magica em decisao.
   */
  const consultarCnpj = async () => {
    if (!ficha) return;
    setConsultando(true);
    setErro(null);
    setAvisoCnpj(null);
    try {
      const resposta = await api.get<PreviaEnriquecimento>(`/contas/${ficha.conta.id}/enriquecimento`);
      setPrevia(resposta);
      const p = resposta.plano;
      const nada =
        Object.keys(p.camposParaPreencher).length === 0 &&
        p.contatosParaCriar.length === 0 &&
        p.contatosParaClassificar.length === 0;
      // "Nada a preencher" e um resultado, nao uma falha: o cadastro ja esta
      // completo. Sem essa frase, a tela pareceria nao ter respondido.
      if (nada) setAvisoCnpj('O cadastro publico nao traz nada que esteja faltando aqui.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao consultar o cadastro publico');
    } finally {
      setConsultando(false);
    }
  };

  const aplicarCnpj = async () => {
    if (!ficha) return;
    setAplicando(true);
    setErro(null);
    try {
      await api.post(`/contas/${ficha.conta.id}/enriquecimento`);
      setPrevia(null);
      setAvisoCnpj('Cadastro publico aplicado no que estava em branco.');
      await abrir(ficha.conta.id);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao aplicar o cadastro publico');
    } finally {
      setAplicando(false);
    }
  };

  /** Define ou limpa a filial que atende esta conta (item 6.5). So classificacao. */
  const definirFilial = async (filialId: string) => {
    if (!ficha) return;
    setErro(null);
    try {
      await api.patch(`/contas/${ficha.conta.id}`, { filialId: filialId || null });
      await abrir(ficha.conta.id);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao definir a filial');
    }
  };

  /** Grava um campo customizado (item 6.4) da conta aberta. */
  const mudarCampoCustomizado = async (chave: string, valor: string | number | boolean | null) => {
    if (!ficha) return;
    setErro(null);
    try {
      await api.patch(`/contas/${ficha.conta.id}`, { camposCustomizados: { [chave]: valor } });
      await abrir(ficha.conta.id);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar o campo customizado');
    }
  };

  /** Define ou limpa o papel de uma pessoa na conta. */
  const definirPapel = async (contatoId: string, valor: string) => {
    if (!ficha) return;
    setErro(null);
    try {
      await api.patch(`/contas/${ficha.conta.id}/contatos/${contatoId}/papel`, {
        // Vazio significa "sem papel", e vai como nulo: string vazia nao e um
        // valor do enum e seria recusada pelo schema.
        papelNaConta: valor === '' ? null : (valor as PapelNaConta),
      });
      await abrir(ficha.conta.id);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao definir o papel');
    }
  };

  /**
   * Carrega a ficha do registro que a URL pede.
   *
   * Antes, `abrir` era chamado no clique da lista e o registro morava aqui.
   * Agora quem manda e a rota: acesso direto por URL e F5 entram por este
   * efeito, e o clique so navega. Um unico caminho para carregar significa que
   * o link colado no chat mostra exatamente o que o clique mostraria.
   */
  useEffect(() => {
    if (!selecionadoId) {
      setFicha(null);
      setIndicadores(null);
      return;
    }
    void abrir(selecionadoId);
  }, [selecionadoId, abrir]);

  const atualizarFicha = () => {
    if (ficha) void abrir(ficha.conta.id);
    setVersao((v) => v + 1);
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/contas', {
        nome: nova.nome,
        ...(nova.cnpj.trim() ? { cnpj: nova.cnpj } : {}),
        ...(nova.segmento.trim() ? { segmento: nova.segmento } : {}),
        ...(nova.filialId ? { filialId: nova.filialId } : {}),
        ...(Object.keys(novosCampos).length ? { camposCustomizados: novosCampos } : {}),
      });
      setNova({ nome: '', cnpj: '', segmento: '', filialId: '' });
      setNovosCampos({});
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar conta');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="space-y-5">
        <Card titulo="Contas" descricao={`${contas.length} encontrada(s)`}>
          <div className="mb-3">
            <VisoesSalvas<FiltroContaSalvo>
              entidade="CONTA"
              filtroAtual={{ ...(busca.trim() ? { busca: busca.trim() } : {}), ...(tags.length ? { tags } : {}) }}
              filtroVazio={!busca.trim() && tags.length === 0}
              aoAplicar={(filtro) => {
                setBusca(filtro.busca ?? '');
                setTags(filtro.tags ?? []);
              }}
            />
          </div>
          <Input
            placeholder="Buscar por nome, CNPJ ou segmento"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <div className="mt-2">
            <FiltroEtiquetas
              ativas={tags}
              versao={versaoTags}
              campo="contas"
              aoAlternar={(tag) =>
                setTags((atuais) =>
                  atuais.includes(tag) ? atuais.filter((t) => t !== tag) : [...atuais, tag],
                )
              }
            />
          </div>
          {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}
          <div className="mt-3 max-h-[45vh] overflow-y-auto">
            {contas.length === 0 ? (
              <EmptyState
                titulo="Nenhuma conta"
                descricao={
                  tags.length > 0 || busca.trim()
                    ? 'Nenhum cliente com esse filtro. Desligue uma etiqueta ou limpe a busca.'
                    : 'Cadastre a primeira empresa no formulario abaixo.'
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {contas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => aoAbrir(c.id)}
                      className={`w-full py-2.5 text-left transition hover:bg-slate-50 ${
                        selecionadoId === c.id ? 'bg-slate-50' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-800">{c.nome}</p>
                      <p className="text-xs text-slate-500">{mascararCnpj(c.cnpj)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {c.totalContatos ?? 0} contato(s) · {c.totalLeads ?? 0} lead(s) ·{' '}
                        {c.totalOportunidades ?? 0} oportunidade(s)
                      </p>
                      {c.tags && c.tags.length > 0 && (
                        <div className="mt-1.5">
                          <Etiquetas tags={c.tags} />
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card titulo="Nova conta">
          <form onSubmit={criar} className="space-y-3">
            <Field label="Nome">
              <Input required value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
            </Field>
            <Field label="CNPJ" hint="Com ou sem mascara">
              <Input value={nova.cnpj} onChange={(e) => setNova({ ...nova, cnpj: e.target.value })} />
            </Field>
            <Field label="Segmento">
              <Input value={nova.segmento} onChange={(e) => setNova({ ...nova, segmento: e.target.value })} />
            </Field>
            <Field label="Filial">
              <Select value={nova.filialId} onChange={(e) => setNova({ ...nova, filialId: e.target.value })}>
                <option value="">Sem filial</option>
                {filiais.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit" className="w-full">Criar conta</Button>
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

      {ficha ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={aoFechar}
            className="text-xs text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline"
          >
            &larr; Todos os clientes
          </button>
          <Card titulo={ficha.conta.nome} descricao={mascararCnpj(ficha.conta.cnpj)}>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Segmento</dt>
                <dd className="text-slate-800">{ficha.conta.segmento ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Site</dt>
                <dd className="truncate text-slate-800">{ficha.conta.site ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Telefone</dt>
                <dd className="text-slate-800">{ficha.conta.telefone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Filial</dt>
                <dd>
                  <Select
                    aria-label="Filial desta conta"
                    value={ficha.conta.filialId ?? ''}
                    onChange={(e) => void definirFilial(e.target.value)}
                  >
                    <option value="">Sem filial</option>
                    {filiais.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </Select>
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <dt className="mb-1.5 text-xs text-slate-500">Etiquetas</dt>
              <EditorEtiquetas
                tags={ficha.conta.tags ?? []}
                aoSalvar={async (tags) => {
                  await api.patch(`/contas/${ficha.conta.id}`, { tags });
                  setVersaoTags((v) => v + 1);
                  // Recarrega a ficha E a lista: a etiqueta nova precisa
                  // aparecer no cartao da esquerda e no filtro tambem.
                  await abrir(ficha.conta.id);
                  await carregar();
                }}
              />
            </div>

            {/* Conversa e ligacao pertencem a pessoa, nao a empresa: por isso a
                ficha da conta mostra quatro cartoes, e nao seis. */}
            {indicadores && (
              <div className="mt-4">
                <Indicadores dados={indicadores} escopo="CONTA" />
              </div>
            )}
          </Card>

          {/* Enriquecimento por CNPJ (item 5.2).
              Duas etapas — consultar e aplicar — porque esta e a unica operacao
              em que dado de fora entra no cadastro do cliente. Ver antes e o que
              transforma "varinha magica" em decisao. */}
          {ficha.conta.cnpj && (
            <Card
              titulo="Cadastro publico (CNPJ)"
              descricao={
                ficha.conta.enriquecidoEm
                  ? `Consultado em ${new Date(ficha.conta.enriquecidoEm).toLocaleString('pt-BR')}`
                  : 'Nunca consultado'
              }
            >
              <div className="flex flex-wrap gap-2">
                <Button variante="neutro" onClick={() => void consultarCnpj()} disabled={consultando}>
                  {consultando ? 'Consultando...' : 'Consultar cadastro publico'}
                </Button>
                {previa && (
                  <Button onClick={() => void aplicarCnpj()} disabled={aplicando}>
                    {aplicando ? 'Aplicando...' : 'Aplicar o que esta em branco'}
                  </Button>
                )}
              </div>

              {avisoCnpj && <p className="mt-3 text-sm text-slate-600">{avisoCnpj}</p>}

              {previa && (
                <div className="mt-4 space-y-4 text-sm">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Razao social</dt>
                      <dd className="text-slate-800">{previa.dados.razaoSocial ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Situacao cadastral</dt>
                      <dd className="text-slate-800">{previa.dados.situacaoCadastral ?? '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">Atividade principal</dt>
                      <dd className="text-slate-800">{previa.dados.atividadePrincipal ?? '—'}</dd>
                    </div>
                  </dl>

                  {Object.keys(previa.plano.camposParaPreencher).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500">Vai preencher</p>
                      <ul className="mt-1 space-y-0.5">
                        {Object.entries(previa.plano.camposParaPreencher).map(([campo, valor]) => (
                          <li key={campo} className="text-slate-700">
                            {LABEL_CAMPO_CONTA[campo] ?? campo}: <strong>{valor}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {previa.plano.contatosParaCriar.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Vai criar {previa.plano.contatosParaCriar.length} contato(s) do quadro societario
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {previa.plano.contatosParaCriar.map((c) => (
                          <li key={c.nome} className="text-slate-700">
                            {c.nome} &mdash; {LABEL_PAPEL_NA_CONTA[c.papelNaConta]}
                            {c.qualificacaoQsa && (
                              <span className="text-xs text-slate-400"> ({c.qualificacaoQsa})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Os conflitos aparecem e NAO sao aplicados. O telefone que o
                      vendedor digitou e provavelmente o celular de quem atende; o
                      do cadastro publico e frequentemente o do contador. */}
                  {previa.plano.conflitos.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-medium text-amber-800">Divergencias &mdash; nao serao sobrescritas</p>
                      <ul className="mt-1 space-y-0.5 text-amber-900">
                        {previa.plano.conflitos.map((c) => (
                          <li key={c.campo}>
                            {c.campo}: aqui <strong>{c.atual}</strong>, no cadastro publico{' '}
                            <strong>{c.publico}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card titulo="Contatos vinculados" descricao={`${ficha.conta.contatos?.length ?? 0} contato(s)`}>
            {!ficha.conta.contatos || ficha.conta.contatos.length === 0 ? (
              <EmptyState
                titulo="Sem contatos"
                descricao="Abra o contato na aba Contatos e use Vincular empresa."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ficha.conta.contatos.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{c.nome}</p>
                      <p className="text-xs text-slate-500">{c.email ?? c.telefone ?? 'Sem contato'}</p>
                      {/* A qualificacao da Receita fica ao lado do papel, e nao no
                          lugar dele: uma coisa e o que o registro publico diz,
                          outra e como a plataforma classificou. */}
                      {c.qualificacaoQsa && <p className="text-xs text-slate-400">{c.qualificacaoQsa}</p>}
                    </div>
                    <div className="w-40 shrink-0">
                      <Select
                        aria-label={`Papel de ${c.nome} na conta`}
                        value={c.papelNaConta ?? ''}
                        onChange={(e) => void definirPapel(c.id, e.target.value)}
                      >
                        <option value="">Sem papel</option>
                        {PAPEIS_NA_CONTA.map((papel) => (
                          <option key={papel} value={papel}>
                            {LABEL_PAPEL_NA_CONTA[papel]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Base instalada" descricao={`${ficha.produtosInstalados.length} equipamento(s)`}>
            <BaseInstalada
              contaId={ficha.conta.id}
              produtos={ficha.produtosInstalados}
              aoMudar={() => void abrir(ficha.conta.id)}
            />
          </Card>

          {ficha.camposCustomizados.length > 0 && (
            <Card titulo="Campos customizados">
              <CamposCustomizadosCampos
                campos={ficha.camposCustomizados}
                valores={Object.fromEntries(ficha.camposCustomizados.map((c) => [c.chave, c.valor]))}
                aoMudar={mudarCampoCustomizado}
              />
            </Card>
          )}

          <Card titulo="Leads" descricao={`${ficha.leads.length} registro(s)`}>
            {ficha.leads.length === 0 ? (
              <EmptyState titulo="Sem leads" descricao="Nenhum lead vinculado a esta conta." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ficha.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">{l.contato.nome}</p>
                      <p className="text-xs text-slate-500">{moeda(l.valorEstimado)}</p>
                    </div>
                    <Badge tom={l.fase === 'GANHO' ? 'sucesso' : l.fase === 'PERDIDO' ? 'neutro' : 'marca'}>
                      {LABEL_FASE_LEAD[l.fase]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Oportunidades" descricao={`${ficha.oportunidades.length} registro(s)`}>
            {ficha.oportunidades.length === 0 ? (
              <EmptyState titulo="Sem oportunidades" descricao="Abra uma oportunidade na aba Oportunidades." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ficha.oportunidades.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">{o.titulo}</p>
                      <p className="text-xs text-slate-500">
                        {o.estagio.nome} · {moeda(o.valor)}
                      </p>
                    </div>
                    <Badge tom={o.status === 'GANHA' ? 'sucesso' : o.status === 'PERDIDA' ? 'neutro' : 'marca'}>
                      {o.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Registrar" descricao="Fica na linha do tempo na hora">
            <RegistrarAtividade contaId={ficha.conta.id} aoRegistrar={atualizarFicha} />
          </Card>

          <Card titulo="Linha do tempo" descricao="Tudo que aconteceu com esta empresa">
            {/* `raizId` na conta: trocar de empresa zera a lista e o cursor. */}
            <LinhaDoTempo
              base={`/ficha/conta/${ficha.conta.id}`}
              raizId={ficha.conta.id}
              recarregar={versao}
            />
          </Card>
        </div>
      ) : (
        <Card titulo="Ficha da conta">
          {/* URL com id que nao existe — ou que e de outra organizacao, caso em
              que a API responde 404 justamente para nao revelar que existe. Os
              dois chegam aqui iguais, e e assim que deve ser. */}
          {selecionadoId ? (
            <EmptyState
              titulo="Cliente nao encontrado"
              descricao="O endereco aponta para um registro que nao existe ou que voce nao pode ver."
            />
          ) : (
            <EmptyState
              titulo="Selecione uma conta"
              descricao="Contatos, leads, oportunidades e a linha do tempo da empresa aparecem aqui."
            />
          )}
        </Card>
      )}
    </div>
  );
}
