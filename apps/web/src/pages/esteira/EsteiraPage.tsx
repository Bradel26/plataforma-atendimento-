import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { ESTADO } from '../../lib/viz';
import {
  LABEL_SITUACAO_EXCECAO,
  type ColunaCredenciamento,
  type Contato,
  type Credenciamento,
  type OperacaoEsteira,
  type SituacaoExcecao,
} from '../../lib/types';
import { UFS } from './ufs';
import { EmpresaInput, type EmpresaEscolhida } from '../crm/EmpresaInput';
import { PainelDoCiclo } from '../crm/PainelDoCiclo';

type Kanban = { funil: { id: string; nome: string }; colunas: ColunaCredenciamento[] };
type ResumoLote = {
  previa: boolean;
  totalIdentificados: number;
  porSegmento: Record<'TIM' | 'STARLINK', {
    identificados: number;
    paraEnviar: number;
    jaNaEsteira: number;
    emOutraEsteira: number;
    semEsteiraConfigurada: number;
    enviados: number;
    erros: Array<{ contato: string; motivo: string }>;
  }>;
};

/** Acima disto o card fica vermelho: mesmo limite padrao da Area da Gestao. */
const LIMITE_DIAS = 5;

function corDoTempo(dias: number) {
  if (dias > LIMITE_DIAS) return ESTADO.grave;
  if (dias >= LIMITE_DIAS * 0.7) return ESTADO.atencao;
  return ESTADO.bom;
}

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

function CartaoCredenciamento({
  c,
  colunas,
  aoArrastar,
  aoMover,
  aoMarcarExcecao,
  aoAbrir,
}: {
  c: Credenciamento;
  colunas: ColunaCredenciamento[];
  aoArrastar: (id: string) => void;
  aoMover: (id: string, estagioId: string) => void;
  aoMarcarExcecao: (id: string) => void;
  aoAbrir: (id: string) => void;
}) {
  return (
    <li
      draggable
      onDragStart={() => aoArrastar(c.id)}
      className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
    >
      <button type="button" onClick={() => aoAbrir(c.id)} className="block w-full text-left">
        <p className="truncate text-sm font-medium text-slate-800">{c.conta?.nome ?? c.contato.nome}</p>
        {c.conta && <p className="truncate text-xs text-slate-500">{c.contato.nome}</p>}
        <p className="truncate text-xs text-slate-500">
          {[c.contato.cidade, c.contato.uf].filter(Boolean).join(' / ') || 'sem UF'}
          {c.contato.telefone ? ` · ${c.contato.telefone}` : ''}
        </p>
      </button>

      {colunas.length > 1 && (
        <Select
          aria-label={`Mover ${c.contato.nome} para outra etapa`}
          value=""
          onChange={(e) => {
            const estagioId = e.target.value;
            if (estagioId) aoMover(c.id, estagioId);
            e.target.value = '';
          }}
          className="mt-1.5 !py-1 !text-xs"
        >
          <option value="">Mover para...</option>
          {colunas
            .filter((col) => col.estagio.id !== c.estagio.id)
            .map((col) => (
              <option key={col.estagio.id} value={col.estagio.id}>
                {col.estagio.nome}
              </option>
            ))}
        </Select>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: corDoTempo(c.diasNoEstagio) }} aria-hidden />
          {c.diasNoEstagio}d nesta etapa
        </span>
        {c.situacaoExcecao ? (
          <span title={c.motivoExcecao ?? undefined}>
            <Badge tom="erro">{LABEL_SITUACAO_EXCECAO[c.situacaoExcecao]}</Badge>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => aoMarcarExcecao(c.id)}
            className="text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700"
          >
            Exceção
          </button>
        )}
      </div>

      {c.responsavel && (
        <p className="mt-2 truncate border-t border-slate-100 pt-2 text-xs text-slate-500">
          Responsável: <span className="text-slate-700">{c.responsavel.nome}</span>
        </p>
      )}
    </li>
  );
}

/** Painel do card aberto: dados do parceiro e a linha do tempo das etapas. */
function DetalheCredenciamento({
  id,
  aoFechar,
  aoMudar,
}: {
  id: string;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const [c, setC] = useState<Credenciamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<{ credenciamento: Credenciamento }>(`/credenciamentos/${id}`);
      setC(r.credenciamento);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir o credenciamento');
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const reativar = async () => {
    try {
      await api.patch(`/credenciamentos/${id}`, { situacaoExcecao: null, motivoExcecao: null });
      await carregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao reativar');
    }
  };

  return (
    <Card
      titulo={c ? (c.conta?.nome ?? c.contato.nome) : 'Carregando...'}
      descricao={c ? `${c.funil.nome} · ${c.estagio.nome} ha ${c.diasNoEstagio} dia(s)` : undefined}
      acao={
        <Button variante="neutro" onClick={aoFechar}>
          Fechar
        </Button>
      }
    >
      {erro && <Alerta>{erro}</Alerta>}
      {c && (
        <div className="grid gap-4 md:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {/* Contato e empresa sao registros do CRM: o nome leva para a ficha de cada um. */}
            <dt className="text-slate-500">Contato</dt>
            <dd className="text-slate-800">
              <Link to={`/contatos/${c.contato.id}`} className="text-[var(--brand-primary)] hover:underline">
                {c.contato.nome}
              </Link>
            </dd>
            <dt className="text-slate-500">Empresa</dt>
            <dd className="text-slate-800">
              {c.conta ? (
                <Link to={`/clientes/${c.conta.id}`} className="text-[var(--brand-primary)] hover:underline">
                  {c.conta.nome}
                </Link>
              ) : (
                'sem empresa vinculada'
              )}
            </dd>
            {c.conta?.cnpj && (
              <>
                <dt className="text-slate-500">CNPJ</dt>
                <dd className="text-slate-800">{c.conta.cnpj}</dd>
              </>
            )}
            <dt className="text-slate-500">Telefone</dt>
            <dd className="text-slate-800">{c.contato.telefone ?? '—'}</dd>
            <dt className="text-slate-500">E-mail</dt>
            <dd className="text-slate-800">{c.contato.email ?? '—'}</dd>
            <dt className="text-slate-500">Cidade/UF</dt>
            <dd className="text-slate-800">{[c.contato.cidade, c.contato.uf].filter(Boolean).join(' / ') || '—'}</dd>
            <dt className="text-slate-500">Responsável</dt>
            <dd className="text-slate-800">{c.responsavel?.nome ?? 'sem responsável'}</dd>
            <dt className="text-slate-500">Entrou em</dt>
            <dd className="text-slate-800">{dataCurta(c.criadoEm)}</dd>
            {c.situacaoExcecao && (
              <>
                <dt className="text-slate-500">Exceção</dt>
                <dd className="text-slate-800">
                  <Badge tom="erro">{LABEL_SITUACAO_EXCECAO[c.situacaoExcecao]}</Badge> {c.motivoExcecao}
                  <button
                    type="button"
                    onClick={() => void reativar()}
                    className="ml-2 text-xs text-[var(--brand-primary)] underline"
                  >
                    Retirar exceção
                  </button>
                </dd>
              </>
            )}
          </dl>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ciclo do parceiro</p>
            <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3">
              {(c.historico ?? []).map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="font-medium text-slate-800">{h.paraEstagio.nome}</span>
                  <span className="text-xs text-slate-500">
                    {' '}
                    · {dataCurta(h.criadoEm)}
                    {h.usuario ? ` · ${h.usuario.nome}` : ''}
                    {h.deEstagio && h.segundosNoEstagio !== null
                      ? ` · ${Math.round(h.segundosNoEstagio / 8640) / 10}d em ${h.deEstagio.nome}`
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {/* Chegou a Ativo: a relacao passa a ser acompanhada no ciclo de vida do CRM. */}
      {c && c.estagio.papel === 'ATIVO' && !c.situacaoExcecao && (
        <div className="mt-4">
          <PainelDoCiclo credenciamentoId={c.id} />
        </div>
      )}
    </Card>
  );
}

/** Novo parceiro: escolher um contato existente ou cadastrar na hora. */
function NovoParceiro({ funilId, aoCriar }: { funilId: string; aoCriar: () => void }) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Contato[]>([]);
  const [escolhido, setEscolhido] = useState<Contato | null>(null);
  const [novo, setNovo] = useState({ nome: '', telefone: '', uf: '', cidade: '' });
  const [empresa, setEmpresa] = useState<EmpresaEscolhida>({ nome: '', cnpj: '', contaId: null });
  const [modo, setModo] = useState<'existente' | 'novo'>('existente');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (modo !== 'existente' || busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    const t = setTimeout(() => {
      void api
        .get<{ contatos: Contato[] }>(`/contatos?limite=10&busca=${encodeURIComponent(busca.trim())}`)
        .then((r) => setAchados(r.contatos))
        .catch(() => setAchados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca, modo]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      let contatoId = escolhido?.id;
      if (modo === 'novo') {
        const { contato } = await api.post<{ contato: Contato }>('/contatos', {
          nome: novo.nome.trim(),
          telefone: novo.telefone.trim() || null,
          uf: novo.uf || null,
          cidade: novo.cidade.trim() || null,
          canalOrigem: 'WHATSAPP',
          // A empresa nasce (ou e reaproveitada) junto com o contato, ja vinculada:
          // o card mostra a empresa e o contato, e os dois aparecem no CRM.
          ...(empresa.contaId
            ? { contaId: empresa.contaId }
            : empresa.nome.trim()
              ? { empresa: { nome: empresa.nome.trim(), ...(empresa.cnpj ? { cnpj: empresa.cnpj } : {}) } }
              : {}),
        });
        contatoId = contato.id;
      }
      if (!contatoId) return;
      await api.post('/credenciamentos', { contatoId, funilId });
      setEscolhido(null);
      setBusca('');
      setNovo({ nome: '', telefone: '', uf: '', cidade: '' });
      setEmpresa({ nome: '', cnpj: '', contaId: null });
      aoCriar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao cadastrar o parceiro');
    } finally {
      setOcupado(false);
    }
  };

  const pronto = modo === 'existente' ? Boolean(escolhido) : novo.nome.trim().length >= 2;

  return (
    <Card titulo="Novo cadastro" descricao="O parceiro entra na primeira etapa da operação selecionada">
      <div className="mb-3 flex gap-2 text-xs">
        {(['existente', 'novo'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            aria-pressed={modo === m}
            className={`rounded-full border px-2.5 py-1 ${
              modo === m
                ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            {m === 'existente' ? 'Contato já cadastrado' : 'Parceiro novo'}
          </button>
        ))}
      </div>
      {erro && <Alerta>{erro}</Alerta>}
      <form onSubmit={criar} className="space-y-3">
        {modo === 'existente' ? (
          <Field label="Buscar contato" hint="Nome, e-mail ou telefone">
            <Input
              value={escolhido ? escolhido.nome : busca}
              onChange={(e) => {
                setEscolhido(null);
                setBusca(e.target.value);
              }}
            />
            {!escolhido && achados.length > 0 && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {achados.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setEscolhido(c)}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      {c.nome} <span className="text-xs text-slate-500">{c.telefone ?? ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do contato">
              <Input required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            </Field>
            <Field label="Telefone / WhatsApp">
              <Input value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            </Field>
            <Field label="UF">
              <Select value={novo.uf} onChange={(e) => setNovo({ ...novo, uf: e.target.value })}>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cidade">
              <Input value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <EmpresaInput value={empresa} onChange={setEmpresa} />
            </div>
          </div>
        )}
        <Button type="submit" disabled={!pronto || ocupado}>
          {ocupado ? 'Cadastrando...' : 'Adicionar a esteira'}
        </Button>
      </form>
    </Card>
  );
}

export function EsteiraPage() {
  const [operacoes, setOperacoes] = useState<OperacaoEsteira[] | null>(null);
  const [funilId, setFunilId] = useState<string>('');
  const [kanban, setKanban] = useState<Kanban | null>(null);
  const [filtro, setFiltro] = useState({ busca: '', uf: '', excecoes: 'incluir' as 'incluir' | 'ocultar' | 'somente' });
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedidoExcecao, setPedidoExcecao] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [situacao, setSituacao] = useState<SituacaoExcecao>('CANCELADO');
  const [importacaoAberta, setImportacaoAberta] = useState(false);
  const [processandoImportacao, setProcessandoImportacao] = useState(false);
  const [resumoLote, setResumoLote] = useState<ResumoLote | null>(null);

  useEffect(() => {
    void api
      .get<{ funis: OperacaoEsteira[] }>('/credenciamentos/funis')
      .then((r) => {
        setOperacoes(r.funis);
        setFunilId((atual) => atual || r.funis[0]?.id || '');
      })
      .catch((e) => {
        setOperacoes([]);
        setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as operações');
      });
  }, []);

  const carregar = useCallback(async () => {
    if (!funilId) return;
    const q = new URLSearchParams({ funilId, excecoes: filtro.excecoes });
    if (filtro.busca.trim()) q.set('busca', filtro.busca.trim());
    if (filtro.uf) q.set('uf', filtro.uf);
    try {
      setKanban(await api.get<Kanban>(`/credenciamentos/kanban?${q.toString()}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a esteira');
    }
  }, [funilId, filtro]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 200);
    return () => clearTimeout(t);
  }, [carregar]);

  const moverPara = async (id: string, estagioId: string) => {
    try {
      await api.patch(`/credenciamentos/${id}`, { estagioId });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover o parceiro');
    }
  };

  const mover = async (estagioId: string) => {
    const id = arrastando;
    setArrastando(null);
    if (!id) return;
    await moverPara(id, estagioId);
  };

  const confirmarExcecao = async () => {
    if (!pedidoExcecao || !motivo.trim()) return;
    try {
      await api.patch(`/credenciamentos/${pedidoExcecao}`, { situacaoExcecao: situacao, motivoExcecao: motivo.trim() });
      setPedidoExcecao(null);
      setMotivo('');
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao marcar exceção');
    }
  };

  const importarClassificados = async (previa: boolean) => {
    setProcessandoImportacao(true);
    setErro(null);
    try {
      const resultado = await api.post<ResumoLote>('/credenciamentos/importar-contatos-classificados', { previa });
      setResumoLote(resultado);
      if (!previa) await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao processar contatos importados');
    } finally {
      setProcessandoImportacao(false);
    }
  };

  if (operacoes === null) return <p className="text-sm text-slate-500">Carregando...</p>;

  if (operacoes.length === 0) {
    return (
      <Card titulo="Esteira de Credenciamento" descricao="Nenhuma esteira configurada ainda">
        {erro && <Alerta>{erro}</Alerta>}
        <p className="text-sm text-slate-500">
          Peca a um administrador para configurar a esteira de cada operação antes de usar esta tela.
        </p>
      </Card>
    );
  }

  const total = (kanban?.colunas ?? []).reduce((acc, c) => acc + c.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="tablist" aria-label="Operação" className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {operacoes.map((o) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={o.id === funilId}
              onClick={() => setFunilId(o.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                o.id === funilId ? 'bg-[var(--brand-primary)] texto-sobre-cor-fixa' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {o.nome}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Buscar">
            <Input
              placeholder="Parceiro, telefone, CNPJ"
              value={filtro.busca}
              onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
            />
          </Field>
          <Field label="UF">
            <Select value={filtro.uf} onChange={(e) => setFiltro({ ...filtro, uf: e.target.value })}>
              <option value="">Todas</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </Select>
          </Field>
          <Field label="Exceções">
            <Select
              value={filtro.excecoes}
              onChange={(e) => setFiltro({ ...filtro, excecoes: e.target.value as typeof filtro.excecoes })}
            >
              <option value="incluir">Mostrar junto</option>
              <option value="ocultar">Ocultar</option>
              <option value="somente">Somente exceções</option>
            </Select>
          </Field>
        </div>
      </div>

      <div className="flex justify-end"><Button variante="neutro" onClick={() => { setImportacaoAberta((aberta) => !aberta); setResumoLote(null); }}>Importar contatos TIM / Starlink</Button></div>
      <p className="text-xs text-slate-500">
        {total} parceiro(s) · Novo cadastro → Pendência → Aprovação → Credenciado → Ativo · Reprovado, Cancelado e
        Inativado ficam marcados no card, sem virar coluna.
      </p>

      {importacaoAberta && (
        <Card titulo="Importar contatos identificados" descricao="A origem da observação define a esteira; telefone não é obrigatório.">
          <p className="mb-3 text-sm text-slate-600">
            Lê contatos com “Fonte: CONTATOS STARLINK”, “Fonte: ... TIM” ou origem de carteira PDV TIM. Quem já está
            na esteira correta será ignorado para evitar duplicação.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variante="neutro" onClick={() => void importarClassificados(true)} disabled={processandoImportacao}>
              {processandoImportacao ? 'Consultando...' : 'Contar contatos antes de enviar'}
            </Button>
            {resumoLote?.previa && resumoLote.porSegmento.TIM.paraEnviar + resumoLote.porSegmento.STARLINK.paraEnviar > 0 && (
              <Button
                onClick={() => void importarClassificados(false)}
                disabled={processandoImportacao || resumoLote.porSegmento.TIM.semEsteiraConfigurada + resumoLote.porSegmento.STARLINK.semEsteiraConfigurada > 0}
              >
                {processandoImportacao ? 'Enviando...' : `Enviar ${resumoLote.porSegmento.TIM.paraEnviar + resumoLote.porSegmento.STARLINK.paraEnviar} contatos às esteiras`}
              </Button>
            )}
          </div>
          {resumoLote && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium text-slate-800">
                {resumoLote.previa ? `Prévia: ${resumoLote.totalIdentificados} contatos identificados` : `Importação concluída para ${resumoLote.totalIdentificados} contatos identificados`}
              </p>
              {(['TIM', 'STARLINK'] as const).map((segmento) => {
                const linha = resumoLote.porSegmento[segmento];
                return (
                  <div key={segmento} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="font-medium text-slate-800">{segmento === 'TIM' ? 'Credenciamento TIM' : 'Credenciamento Starlink'}</p>
                    <p className="mt-1 text-slate-600">
                      {linha.identificados} identificados · {linha.paraEnviar} para enviar · {linha.jaNaEsteira} já na esteira correta
                      {linha.emOutraEsteira ? ` · ${linha.emOutraEsteira} também ${linha.emOutraEsteira === 1 ? 'está' : 'estão'} em outra esteira` : ''}
                    </p>
                    {!resumoLote.previa && (
                      <p className="mt-1 text-slate-600">{linha.enviados} enviados · {linha.erros.length} com erro · {linha.semEsteiraConfigurada} sem esteira ativa</p>
                    )}
                    {linha.erros.slice(0, 10).map((item, indice) => (
                      <p key={`${segmento}-${indice}`} className="mt-1 text-xs text-red-700">{item.contato}: {item.motivo}</p>
                    ))}
                    {linha.erros.length > 10 && (
                      <p className="mt-1 text-xs text-red-700">e mais {linha.erros.length - 10} com erro.</p>
                    )}
                  </div>
                );
              })}
              {resumoLote.totalIdentificados === 0 && (
                <p className="text-sm text-slate-600">Nenhum contato com origem TIM ou Starlink foi encontrado.</p>
              )}
            </div>
          )}
        </Card>
      )}
      {erro && <Alerta>{erro}</Alerta>}

      {aberto && <DetalheCredenciamento id={aberto} aoFechar={() => setAberto(null)} aoMudar={() => void carregar()} />}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {(kanban?.colunas ?? []).map((coluna) => (
          <div
            key={coluna.estagio.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void mover(coluna.estagio.id)}
            className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50"
          >
            <header className="border-b border-slate-200 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-700">{coluna.estagio.nome}</p>
              <p className="text-xs text-slate-500">{coluna.total} parceiro(s)</p>
            </header>
            <ul className="min-h-24 flex-1 space-y-2 p-2">
              {coluna.credenciamentos.map((c) => (
                <CartaoCredenciamento
                  key={c.id}
                  c={c}
                  colunas={kanban?.colunas ?? []}
                  aoArrastar={setArrastando}
                  aoMover={(id, estagioId) => void moverPara(id, estagioId)}
                  aoMarcarExcecao={setPedidoExcecao}
                  aoAbrir={setAberto}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {pedidoExcecao && (
        <Card titulo="Marcar exceção" descricao="O card continua na etapa atual, marcado com a situação">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <Field label="Situação">
              <Select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoExcecao)}>
                {(['REPROVADO', 'CANCELADO', 'INATIVADO'] as const).map((s) => (
                  <option key={s} value={s}>{LABEL_SITUACAO_EXCECAO[s]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Motivo">
              <Input required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void confirmarExcecao()} disabled={!motivo.trim()}>
                Confirmar
              </Button>
              <Button
                type="button"
                variante="neutro"
                onClick={() => {
                  setPedidoExcecao(null);
                  setMotivo('');
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {funilId && <NovoParceiro funilId={funilId} aoCriar={() => void carregar()} />}
    </div>
  );
}
