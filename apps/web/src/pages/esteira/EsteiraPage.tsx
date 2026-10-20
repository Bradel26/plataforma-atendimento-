import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { Gaveta } from '../../components/ui/Gaveta';
import { Modal } from '../../components/ui/Modal';
import { ApiError, api } from '../../lib/api';
import { telefoneLegivel } from '../../lib/telefone';
import { ESTADO } from '../../lib/viz';
import {
  LABEL_SITUACAO_EXCECAO,
  type ColunaCredenciamento,
  type Contato,
  type Credenciamento,
  type OperacaoEsteira,
  type SituacaoExcecao,
} from '../../lib/types';
import { UFS_ATENDIDAS } from './ufs';
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
type FiltroExcecoes = 'incluir' | 'ocultar' | 'somente';

/** Acima disto o card fica vermelho: mesmo limite padrao da Area da Gestao. */
const LIMITE_DIAS = 5;

type TomTempo = 'bom' | 'atencao' | 'grave';
function tomDoTempo(dias: number): TomTempo {
  if (dias > LIMITE_DIAS) return 'grave';
  if (dias >= LIMITE_DIAS * 0.7) return 'atencao';
  return 'bom';
}
// So tons que o tema escuro remapeia em index.css.
const CLASSE_TEMPO: Record<TomTempo, string> = {
  bom: 'bg-emerald-50 text-emerald-700',
  atencao: 'bg-amber-50 text-amber-700',
  grave: 'bg-red-50 text-red-700',
};

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const telefoneDoContato = (t: string | null | undefined) => (t ? (/^\d+$/.test(t) ? telefoneLegivel(t) : t) : null);
const inicial = (nome: string) => nome.trim().charAt(0).toLocaleUpperCase() || '?';

function ChipTempo({ dias, longo = false }: { dias: number; longo?: boolean }) {
  const tom = tomDoTempo(dias);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1.5 pr-2 text-[11.5px] font-semibold ${CLASSE_TEMPO[tom]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ESTADO[tom] }} aria-hidden="true" />
      {longo ? `${dias} dia(s) nesta etapa` : `${dias}d nesta etapa`}
    </span>
  );
}

function CartaoCredenciamento({
  c,
  aoArrastar,
  aoSoltarArraste,
  aoAbrir,
}: {
  c: Credenciamento;
  aoArrastar: (id: string) => void;
  aoSoltarArraste: () => void;
  aoAbrir: (id: string) => void;
}) {
  const telefone = telefoneDoContato(c.contato.telefone);
  const local = [c.contato.cidade, c.contato.uf].filter(Boolean).join('/') || 'sem UF';
  return (
    <li
      draggable
      onDragStart={() => aoArrastar(c.id)}
      onDragEnd={aoSoltarArraste}
      className={`cursor-grab rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:shadow-md active:cursor-grabbing ${
        c.situacaoExcecao ? 'border-red-200' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        onClick={() => aoAbrir(c.id)}
        className="flex w-full flex-col gap-2 rounded-xl p-3 text-left"
        aria-label={`Abrir ${c.conta?.nome ?? c.contato.nome}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-bold text-slate-900">{c.conta?.nome ?? c.contato.nome}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {c.conta ? `${c.contato.nome} · ` : ''}
            {local}
            {telefone && !c.conta ? ` · ${telefone}` : ''}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <ChipTempo dias={c.diasNoEstagio} />
          {c.situacaoExcecao && (
            <span title={c.motivoExcecao ?? undefined} className="rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] font-bold text-red-700">
              {LABEL_SITUACAO_EXCECAO[c.situacaoExcecao]}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 border-t border-slate-100 pt-2">
          {c.responsavel ? (
            <>
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[10.5px] font-bold text-[var(--brand-primary)]">
                {inicial(c.responsavel.nome)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{c.responsavel.nome}</span>
            </>
          ) : (
            <span className="text-xs text-slate-500">Sem responsável</span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Situacao + motivo de uma excecao. O card continua na etapa, so ganha a marca. */
function FormExcecao({ aoConfirmar, aoCancelar }: { aoConfirmar: (s: SituacaoExcecao, motivo: string) => Promise<void>; aoCancelar: () => void }) {
  const [situacao, setSituacao] = useState<SituacaoExcecao>('CANCELADO');
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!motivo.trim()) return;
        setOcupado(true);
        try {
          await aoConfirmar(situacao, motivo.trim());
        } finally {
          setOcupado(false);
        }
      }}
      className="space-y-3"
    >
      <Field label="Situação">
        <Select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoExcecao)}>
          {(['REPROVADO', 'CANCELADO', 'INATIVADO'] as const).map((s) => (
            <option key={s} value={s}>{LABEL_SITUACAO_EXCECAO[s]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Motivo">
        <Input required value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </Field>
      <p className="text-xs text-slate-500">O cartão continua na etapa atual, marcado com a situação.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variante="neutro" onClick={aoCancelar}>Cancelar</Button>
        <Button type="submit" disabled={!motivo.trim() || ocupado}>{ocupado ? 'Salvando...' : 'Confirmar'}</Button>
      </div>
    </form>
  );
}

/** Conteudo da gaveta do card aberto: acoes, dados do parceiro e o ciclo das etapas. */
function DetalheCredenciamento({
  id,
  colunas,
  aoMudar,
}: {
  id: string;
  colunas: ColunaCredenciamento[];
  aoMudar: () => void;
}) {
  const [c, setC] = useState<Credenciamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcandoExcecao, setMarcandoExcecao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<{ credenciamento: Credenciamento }>(`/credenciamentos/${id}`);
      setC(r.credenciamento);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao abrir o credenciamento');
    }
  }, [id]);

  useEffect(() => {
    setC(null);
    setMarcandoExcecao(false);
    void carregar();
  }, [carregar]);

  const atualizar = async (dados: Record<string, unknown>, falha: string) => {
    setErro(null);
    try {
      await api.patch(`/credenciamentos/${id}`, dados);
      await carregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : falha);
    }
  };

  if (!c) return erro ? <Alerta>{erro}</Alerta> : <p className="text-sm text-slate-500">Carregando...</p>;

  const titulo = 'mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-slate-500';
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold text-slate-500">{c.funil.nome}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{c.estagio.nome}</span>
          <ChipTempo dias={c.diasNoEstagio} longo />
          {c.situacaoExcecao && <Badge tom="erro">{LABEL_SITUACAO_EXCECAO[c.situacaoExcecao]}</Badge>}
        </div>
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      {marcandoExcecao ? (
        <div className="rounded-xl border border-red-200 p-3.5">
          <p className="mb-3 text-sm font-semibold text-slate-800">Marcar exceção</p>
          <FormExcecao
            aoCancelar={() => setMarcandoExcecao(false)}
            aoConfirmar={async (situacaoExcecao, motivoExcecao) => {
              await atualizar({ situacaoExcecao, motivoExcecao }, 'Falha ao marcar exceção');
              setMarcandoExcecao(false);
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {colunas.length > 1 && (
            <Select
              aria-label={`Mover ${c.contato.nome} para outra etapa`}
              value=""
              onChange={(e) => {
                const estagioId = e.target.value;
                if (estagioId) void atualizar({ estagioId }, 'Falha ao mover o parceiro');
              }}
            >
              <option value="">Mover para...</option>
              {colunas
                .filter((col) => col.estagio.id !== c.estagio.id)
                .map((col) => (
                  <option key={col.estagio.id} value={col.estagio.id}>{col.estagio.nome}</option>
                ))}
            </Select>
          )}
          {c.situacaoExcecao ? (
            <button
              type="button"
              onClick={() => void atualizar({ situacaoExcecao: null, motivoExcecao: null }, 'Falha ao reativar')}
              className="h-10 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retirar exceção
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMarcandoExcecao(true)}
              className="h-10 rounded-lg border border-red-200 bg-white text-[13px] font-semibold text-red-700 hover:bg-red-50"
            >
              Marcar exceção
            </button>
          )}
        </div>
      )}

      <div>
        <p className={titulo}>Parceiro</p>
        <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
          {/* Contato e empresa sao registros do CRM: o nome leva para a ficha de cada um. */}
          <dt className="text-slate-500">Contato</dt>
          <dd>
            <Link to={`/contatos/${c.contato.id}`} className="text-[var(--brand-primary)] hover:underline">{c.contato.nome}</Link>
          </dd>
          <dt className="text-slate-500">Empresa</dt>
          <dd className="text-slate-800">
            {c.conta ? (
              <Link to={`/clientes/${c.conta.id}`} className="text-[var(--brand-primary)] hover:underline">{c.conta.nome}</Link>
            ) : (
              'sem empresa vinculada'
            )}
          </dd>
          {c.conta?.cnpj && (
            <>
              <dt className="text-slate-500">CNPJ</dt>
              <dd className="tabular-nums text-slate-800">{c.conta.cnpj}</dd>
            </>
          )}
          <dt className="text-slate-500">Telefone</dt>
          <dd className="tabular-nums text-slate-800">{telefoneDoContato(c.contato.telefone) ?? '—'}</dd>
          <dt className="text-slate-500">E-mail</dt>
          <dd className="truncate text-slate-800">{c.contato.email ?? '—'}</dd>
          <dt className="text-slate-500">Cidade/UF</dt>
          <dd className="text-slate-800">{[c.contato.cidade, c.contato.uf].filter(Boolean).join(' / ') || '—'}</dd>
          <dt className="text-slate-500">Responsável</dt>
          <dd className="text-slate-800">{c.responsavel?.nome ?? 'sem responsável'}</dd>
          <dt className="text-slate-500">Entrou em</dt>
          <dd className="tabular-nums text-slate-800">{dataCurta(c.criadoEm)}</dd>
          {c.situacaoExcecao && c.motivoExcecao && (
            <>
              <dt className="text-slate-500">Motivo</dt>
              <dd className="text-slate-800">{c.motivoExcecao}</dd>
            </>
          )}
        </dl>
      </div>

      <div>
        <p className={titulo}>Ciclo do parceiro</p>
        <ol>
          {(c.historico ?? []).map((h, i, lista) => (
            <li key={h.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5">
              <span className="flex flex-col items-center" aria-hidden="true">
                <span
                  className={`mt-[3px] h-3 w-3 rounded-full border-2 ${
                    i === 0 ? 'border-blue-50 bg-[var(--brand-primary)] ring-2 ring-[var(--brand-primary-soft)]' : 'border-slate-400 bg-white'
                  }`}
                />
                {i < lista.length - 1 && <span className="min-h-[22px] w-0.5 flex-1 bg-slate-200" />}
              </span>
              <span className="pb-3.5">
                <span className="block text-[13.5px] font-bold text-slate-800">{h.paraEstagio.nome}</span>
                <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                  {dataCurta(h.criadoEm)}
                  {h.usuario ? ` · ${h.usuario.nome}` : ''}
                  {h.deEstagio && h.segundosNoEstagio !== null
                    ? ` · ${(Math.round(h.segundosNoEstagio / 8640) / 10).toLocaleString('pt-BR')}d em ${h.deEstagio.nome}`
                    : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Chegou a Ativo: a relacao passa a ser acompanhada no ciclo de vida do CRM. */}
      {c.estagio.papel === 'ATIVO' && !c.situacaoExcecao && <PainelDoCiclo credenciamentoId={c.id} />}
    </div>
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
    <div>
      <div role="group" aria-label="Origem do parceiro" className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {(['existente', 'novo'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            aria-pressed={modo === m}
            className={`h-8 rounded-md text-[13px] font-semibold transition ${
              modo === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {m === 'existente' ? 'Contato já cadastrado' : 'Parceiro novo'}
          </button>
        ))}
      </div>
      {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}
      <form onSubmit={criar} className="space-y-3">
        {modo === 'existente' ? (
          <Field label="Buscar contato" hint="Nome, e-mail ou telefone">
            <Input
              value={escolhido ? escolhido.nome : busca}
              onChange={(e) => {
                setEscolhido(null);
                setBusca(e.target.value);
              }}
              autoFocus
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
                {UFS_ATENDIDAS.map(({ sigla, nome }) => (
                  <option key={sigla} value={sigla}>{sigla} — {nome}</option>
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
        <p className="text-xs text-slate-500">O parceiro entra na primeira etapa da operação selecionada.</p>
        <div className="flex justify-end">
          <Button type="submit" disabled={!pronto || ocupado}>
            {ocupado ? 'Cadastrando...' : 'Adicionar à esteira'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function EsteiraPage() {
  const [operacoes, setOperacoes] = useState<OperacaoEsteira[] | null>(null);
  const [funilId, setFunilId] = useState<string>('');
  const [kanban, setKanban] = useState<Kanban | null>(null);
  const [filtro, setFiltro] = useState({ busca: '', uf: '', excecoes: 'incluir' as FiltroExcecoes });
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvoDrop, setAlvoDrop] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [importacaoAberta, setImportacaoAberta] = useState(false);
  const [processandoImportacao, setProcessandoImportacao] = useState(false);
  const [resumoLote, setResumoLote] = useState<ResumoLote | null>(null);
  // Com centenas de cards, o quadro retraido limita a altura das colunas (rolagem
  // interna) e a pagina nao vira um corredor sem fim.
  const [quadroExpandido, setQuadroExpandido] = useState(() => {
    try {
      return localStorage.getItem('esteira:quadroExpandido') === '1';
    } catch {
      return false;
    }
  });
  const alternarQuadro = () => {
    setQuadroExpandido((atual) => {
      try {
        localStorage.setItem('esteira:quadroExpandido', atual ? '0' : '1');
      } catch {
        // Sem armazenamento a preferencia vale so nesta visita.
      }
      return !atual;
    });
  };

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
    setAlvoDrop(null);
    if (!id) return;
    await moverPara(id, estagioId);
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

  const colunas = kanban?.colunas ?? [];
  const total = colunas.reduce((acc, c) => acc + c.total, 0);
  const cartaoAberto = aberto ? colunas.flatMap((col) => col.credenciamentos).find((c) => c.id === aberto) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-900">Credenciamento de parceiros</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            {total} parceiro(s) · arraste o cartão para mudar de etapa · Reprovado, Cancelado e Inativado ficam marcados no cartão, sem virar coluna.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div role="tablist" aria-label="Operação" className="flex gap-1 rounded-xl bg-slate-200 p-1">
            {operacoes.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={o.id === funilId}
                onClick={() => setFunilId(o.id)}
                className={`h-[34px] rounded-lg px-4 text-[13px] transition ${
                  o.id === funilId ? 'bg-white font-bold text-slate-900 shadow-sm' : 'font-semibold text-slate-700 hover:text-slate-900'
                }`}
              >
                {o.nome.replace(/^Credenciamento\s+/i, '')}
              </button>
            ))}
          </div>
          <Button
            variante="neutro"
            aria-expanded={importacaoAberta}
            onClick={() => {
              setImportacaoAberta((a) => !a);
              setResumoLote(null);
            }}
          >
            Importar contatos
          </Button>
          <Button onClick={() => setNovoAberto(true)} disabled={!funilId}>+ Novo parceiro</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative flex h-10 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-400 transition focus-within:border-[var(--brand-primary)] sm:w-72">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className="sr-only">Buscar parceiro</span>
          <input
            type="search"
            value={filtro.busca}
            onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
            placeholder="Parceiro, telefone ou CNPJ"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </label>
        <div className="w-40">
          <Select aria-label="Filtrar por UF" value={filtro.uf} onChange={(e) => setFiltro({ ...filtro, uf: e.target.value })}>
            <option value="">UF: todas</option>
            {UFS_ATENDIDAS.map(({ sigla, nome }) => (
              <option key={sigla} value={sigla}>{sigla} — {nome}</option>
            ))}
          </Select>
        </div>
        <div role="group" aria-label="Exceções" className="flex gap-1 rounded-lg bg-slate-200 p-1">
          {([
            ['incluir', 'Com exceções'],
            ['ocultar', 'Sem exceções'],
            ['somente', 'Só exceções'],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro.excecoes === valor}
              onClick={() => setFiltro({ ...filtro, excecoes: valor })}
              className={`h-8 rounded-md px-3 text-[12.5px] transition ${
                filtro.excecoes === valor ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'font-medium text-slate-700 hover:text-slate-900'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <ul aria-label="Tempo na etapa" className="ml-auto flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-slate-600">
          {([
            ['bom', 'até 3 dias'],
            ['atencao', '4–5 dias'],
            ['grave', 'parado há mais de 5'],
          ] as const).map(([tom, rotulo]) => (
            <li key={tom} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ESTADO[tom] }} aria-hidden="true" />
              {rotulo}
            </li>
          ))}
        </ul>
      </div>

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
              <div className="grid gap-3 md:grid-cols-2">
                {(['TIM', 'STARLINK'] as const).map((segmento) => {
                  const linha = resumoLote.porSegmento[segmento];
                  return (
                    <div key={segmento} className="rounded-xl border border-slate-200 p-3.5 text-sm">
                      <p className="font-semibold text-slate-800">{segmento === 'TIM' ? 'Credenciamento TIM' : 'Credenciamento Starlink'}</p>
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
              </div>
              {resumoLote.totalIdentificados === 0 && (
                <p className="text-sm text-slate-600">Nenhum contato com origem TIM ou Starlink foi encontrado.</p>
              )}
            </div>
          )}
        </Card>
      )}
      {erro && <Alerta>{erro}</Alerta>}

      <div className="flex gap-3.5 overflow-x-auto pb-2">
        {colunas.map((coluna, indice) => {
          const ehAlvo = arrastando !== null && alvoDrop === coluna.estagio.id;
          return (
            <section
              key={coluna.estagio.id}
              aria-label={`${coluna.estagio.nome}: ${coluna.total} parceiro(s)`}
              onDragOver={(e) => {
                e.preventDefault();
                if (alvoDrop !== coluna.estagio.id) setAlvoDrop(coluna.estagio.id);
              }}
              onDrop={() => void mover(coluna.estagio.id)}
              className={`flex min-w-[240px] flex-1 basis-0 flex-col rounded-2xl p-2.5 transition ${
                ehAlvo ? 'bg-[var(--brand-primary-soft)] ring-2 ring-[var(--brand-primary)]' : 'bg-slate-200/60'
              }`}
            >
              <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-white text-[11.5px] font-bold tabular-nums text-slate-600">
                  {indice + 1}
                </span>
                <h2 className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800" title={coluna.estagio.nome}>
                  {coluna.estagio.nome}
                </h2>
                <span className="rounded-full bg-white px-2 text-xs font-bold tabular-nums text-slate-700">{coluna.total}</span>
              </header>
              <ul className={`flex min-h-24 flex-1 flex-col gap-2 ${quadroExpandido ? '' : 'max-h-[60vh] overflow-y-auto'}`}>
                {coluna.credenciamentos.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                    Nenhum parceiro nesta etapa
                  </li>
                ) : (
                  coluna.credenciamentos.map((c) => (
                    <CartaoCredenciamento
                      key={c.id}
                      c={c}
                      aoArrastar={setArrastando}
                      aoSoltarArraste={() => {
                        setArrastando(null);
                        setAlvoDrop(null);
                      }}
                      aoAbrir={setAberto}
                    />
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
      {total > 0 && (
        <div className="flex justify-center">
          <Button variante="neutro" onClick={alternarQuadro} aria-expanded={quadroExpandido}>
            {quadroExpandido ? '▴ Retrair quadro' : '▾ Expandir quadro'}
          </Button>
        </div>
      )}

      <Gaveta
        aberta={Boolean(aberto)}
        titulo={cartaoAberto ? (cartaoAberto.conta?.nome ?? cartaoAberto.contato.nome) : 'Parceiro'}
        aoFechar={() => setAberto(null)}
      >
        {aberto && <DetalheCredenciamento id={aberto} colunas={colunas} aoMudar={() => void carregar()} />}
      </Gaveta>

      <Modal aberto={novoAberto} titulo="Novo parceiro" aoFechar={() => setNovoAberto(false)} largura="max-w-lg">
        {funilId && (
          <NovoParceiro
            funilId={funilId}
            aoCriar={() => {
              setNovoAberto(false);
              void carregar();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
