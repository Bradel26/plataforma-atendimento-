import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Select } from '../../components/ui';
import { CampoBusca } from '../../components/ui/Pagina';
import { useAuth } from '../../features/auth/AuthProvider';
import { api } from '../../lib/api';
import type { ChaveEtapa, EstruturaEsteira, FiltrosEsteira, Opcao, Situacao } from '../../lib/esteiraTypes';
import {
  LIMITE_FAVORITOS,
  TAMANHO_NOME_FAVORITO,
  apagarFavorito,
  quantosFiltros,
  salvarFavorito,
  type FavoritoEsteira,
} from './estadoEsteira';
import { UFS } from './ufs';

const ESPERA_BUSCA_MS = 350;

const SITUACOES_PADRAO: Record<EstruturaEsteira['operacao'], Opcao[]> = {
  TIM: [
    { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
    { valor: 'DESISTENTE', rotulo: 'Desistente' },
    { valor: 'DESCREDENCIADO', rotulo: 'Descredenciado' },
  ],
  STARLINK: [
    { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
    { valor: 'NURTURE', rotulo: 'Nurture' },
    { valor: 'DESCARTADO', rotulo: 'Descartado' },
  ],
};

/** Popover simples: fecha no Esc e no clique fora (também usado no menu do Kanban). */
export function Popover({
  rotulo,
  ativo,
  largura = 'w-64',
  children,
}: {
  rotulo: ReactNode;
  ativo?: boolean;
  largura?: string;
  children: (fechar: () => void) => ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener('mousedown', fora);
    window.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((a) => !a)}
        className={`anel-de-foco inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm transition ${
          ativo
            ? 'border-transparent bg-[var(--brand-primary)]/10 font-semibold text-[var(--brand-primary)]'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        {rotulo}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {aberto && (
        <div
          id={id}
          className={`absolute left-0 z-20 mt-1 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-lg ${largura}`}
        >
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  );
}

/** Seleção múltipla com caixas de marcar dentro de um popover. */
function MultiSelecao({
  rotulo,
  opcoes,
  valores,
  aoMudar,
}: {
  rotulo: string;
  opcoes: Opcao[];
  valores: string[] | undefined;
  aoMudar: (v: string[] | undefined) => void;
}) {
  const marcados = new Set(valores ?? []);
  const alternar = (valor: string) => {
    const novo = new Set(marcados);
    if (novo.has(valor)) novo.delete(valor);
    else novo.add(valor);
    // Mantém a ordem das opções (URL estável).
    const lista = opcoes.map((o) => o.valor).filter((v) => novo.has(v));
    aoMudar(lista.length ? lista : undefined);
  };
  return (
    <Popover rotulo={marcados.size ? `${rotulo} (${marcados.size})` : rotulo} ativo={marcados.size > 0}>
      {() => (
        <fieldset>
          <legend className="sr-only">{rotulo}</legend>
          <ul className="max-h-64 overflow-y-auto">
            {opcoes.map((o) => (
              <li key={o.valor}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" checked={marcados.has(o.valor)} onChange={() => alternar(o.valor)} />
                  {o.rotulo}
                </label>
              </li>
            ))}
          </ul>
          {marcados.size > 0 && (
            <button
              type="button"
              onClick={() => aoMudar(undefined)}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              Limpar {rotulo.toLocaleLowerCase('pt-BR')}
            </button>
          )}
        </fieldset>
      )}
    </Popover>
  );
}

/** Sim/Não/Todos para filtro booleano. */
function SelecaoBooleana({ rotulo, valor, aoMudar }: { rotulo: string; valor: boolean | undefined; aoMudar: (v: boolean | undefined) => void }) {
  return (
    <Select
      aria-label={rotulo}
      value={valor === undefined ? '' : String(valor)}
      onChange={(e) => aoMudar(e.target.value === '' ? undefined : e.target.value === 'true')}
      className="h-10 w-auto"
    >
      <option value="">{rotulo}: todos</option>
      <option value="true">{rotulo}: sim</option>
      <option value="false">{rotulo}: não</option>
    </Select>
  );
}

/** Favoritos nomeados: aplicar, salvar os filtros atuais e apagar. */
function Favoritos({
  favoritos,
  filtros,
  aoAplicar,
  aoMudarFavoritos,
}: {
  favoritos: FavoritoEsteira[];
  filtros: FiltrosEsteira;
  aoAplicar: (f: FiltrosEsteira) => void;
  aoMudarFavoritos: (lista: FavoritoEsteira[]) => void;
}) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const cheio = favoritos.length >= LIMITE_FAVORITOS;

  const salvar = () => {
    const r = salvarFavorito(favoritos, nome, filtros);
    if (r === 'SEM_NOME') return setErro('Dê um nome ao favorito.');
    if (r === 'LIMITE') return setErro(`Limite de ${LIMITE_FAVORITOS} favoritos: apague um para salvar outro.`);
    setErro(null);
    setNome('');
    aoMudarFavoritos(r);
  };

  return (
    <Popover rotulo={`Favoritos${favoritos.length ? ` (${favoritos.length})` : ''}`} largura="w-72">
      {(fechar) => (
        <div className="space-y-2">
          {favoritos.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-slate-500">Nenhum filtro favorito ainda.</p>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {favoritos.map((f) => (
                <li key={f.nome} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      aoAplicar(f.filtros);
                      fechar();
                    }}
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                    title={`Aplicar "${f.nome}" (${quantosFiltros(f.filtros)} filtro(s))`}
                  >
                    {f.nome}
                  </button>
                  <button
                    type="button"
                    aria-label={`Apagar o favorito ${f.nome}`}
                    onClick={() => aoMudarFavoritos(apagarFavorito(favoritos, f.nome))}
                    className="rounded-md px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-50 hover:text-red-600"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="border-t border-slate-100 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
          >
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="nome-favorito-esteira">
              Salvar os filtros atuais como
            </label>
            <div className="flex gap-1.5">
              <Input
                id="nome-favorito-esteira"
                value={nome}
                maxLength={TAMANHO_NOME_FAVORITO}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Goiás parados"
              />
              <Button type="submit" tamanho="sm" disabled={!nome.trim() || (cheio && !favoritos.some((f) => f.nome.toLocaleLowerCase('pt-BR') === nome.trim().toLocaleLowerCase('pt-BR')))}>
                Salvar
              </Button>
            </div>
            {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
            {cheio && !erro && <p className="mt-1 text-xs text-slate-500">Limite de {LIMITE_FAVORITOS} favoritos atingido.</p>}
          </form>
        </div>
      )}
    </Popover>
  );
}

type Usuarios = Array<{ id: string; nome: string }> | null;

/** Responsáveis que o perfil pode listar (`GET /usuarios` é só ADMIN/SUPERVISOR); nulo = esconder a lista. */
export function useResponsaveis(): Usuarios {
  const { temPerfil } = useAuth();
  const podeListar = temPerfil('ADMIN', 'SUPERVISOR');
  const [usuarios, setUsuarios] = useState<Usuarios>(null);
  useEffect(() => {
    if (!podeListar) return;
    let ativo = true;
    api
      .get<{ usuarios: Array<{ id: string; nome: string }> }>('/usuarios?ativo=true')
      .then((r) => ativo && setUsuarios(r.usuarios.map((u) => ({ id: u.id, nome: u.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
      .catch(() => ativo && setUsuarios(null));
    return () => {
      ativo = false;
    };
  }, [podeListar]);
  return usuarios;
}

/**
 * Filtros comuns às três visões (spec 6) mais os específicos da operação
 * (`estrutura.filtrosEspecificos`), favoritos e "Limpar". Controlado: quem
 * chama guarda os filtros (URL + preferência).
 */
export function BarraDeFiltros({
  estrutura,
  filtros,
  aoMudar,
  favoritos,
  aoMudarFavoritos,
}: {
  estrutura: EstruturaEsteira;
  filtros: FiltrosEsteira;
  aoMudar: (f: FiltrosEsteira) => void;
  favoritos: FavoritoEsteira[];
  aoMudarFavoritos: (lista: FavoritoEsteira[]) => void;
}) {
  const { usuario } = useAuth();
  const responsaveis = useResponsaveis();
  const [expandido, setExpandido] = useState(() => quantosFiltros({ ...filtros, busca: undefined }) > 0);
  const [busca, setBusca] = useState(filtros.busca ?? '');
  const [cidades, setCidades] = useState((filtros.cidades ?? []).join(', '));
  const idPainel = useId();

  // Mantém os campos de texto em dia quando os filtros mudam por fora (favorito, Limpar, voltar).
  useEffect(() => setBusca(filtros.busca ?? ''), [filtros.busca]);
  const cidadesAtuais = (filtros.cidades ?? []).join(', ');
  useEffect(() => setCidades(cidadesAtuais), [cidadesAtuais]);

  // A busca espera a digitação parar antes de mudar a URL e consultar.
  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;
  useEffect(() => {
    const limpa = busca.trim();
    if (limpa === (filtrosRef.current.busca ?? '')) return;
    const t = window.setTimeout(() => aoMudar({ ...filtrosRef.current, busca: limpa || undefined }), ESPERA_BUSCA_MS);
    return () => window.clearTimeout(t);
  }, [busca, aoMudar]);

  const mudar = (parcial: Partial<FiltrosEsteira>) => aoMudar({ ...filtros, ...parcial });
  const mudarTim = (parcial: NonNullable<FiltrosEsteira['tim']>) => mudar({ tim: { ...filtros.tim, ...parcial } });
  const mudarStarlink = (parcial: NonNullable<FiltrosEsteira['starlink']>) => mudar({ starlink: { ...filtros.starlink, ...parcial } });
  const aplicarCidades = () => {
    const lista = [...new Set(cidades.split(',').map((c) => c.trim()).filter(Boolean))];
    if (lista.join(', ') !== cidadesAtuais) mudar({ cidades: lista.length ? lista : undefined });
  };

  const total = quantosFiltros(filtros);
  const situacoes = estrutura.colunas.find((c) => c.chave === 'situacao')?.opcoes ?? SITUACOES_PADRAO[estrutura.operacao];
  const etapas = estrutura.etapas.filter((e) => e.ativa).map((e) => ({ valor: e.chave, rotulo: e.nome }));
  const soOsMeus = !!usuario && filtros.responsavelIds?.length === 1 && filtros.responsavelIds[0] === usuario.id;

  /** Valor de um específico: os de TIM em `tim`, os de Starlink em `starlink`. */
  const especifico = (chave: string): unknown =>
    estrutura.operacao === 'TIM'
      ? (filtros.tim as Record<string, unknown> | undefined)?.[chave]
      : (filtros.starlink as Record<string, unknown> | undefined)?.[chave];
  const mudarEspecifico = (chave: string, valor: unknown) =>
    estrutura.operacao === 'TIM' ? mudarTim({ [chave]: valor }) : mudarStarlink({ [chave]: valor });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusca
          valor={busca}
          aoMudar={setBusca}
          placeholder="Nome, CPF/CNPJ, telefone ou cidade"
          rotulo="Buscar parceiro"
          className="sm:w-80"
        />
        <button
          type="button"
          aria-expanded={expandido}
          aria-controls={idPainel}
          onClick={() => setExpandido((e) => !e)}
          className={`anel-de-foco inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm transition ${
            total > (filtros.busca ? 1 : 0)
              ? 'border-transparent bg-[var(--brand-primary)]/10 font-semibold text-[var(--brand-primary)]'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filtros{total ? ` (${total})` : ''}
        </button>
        <Favoritos favoritos={favoritos} filtros={filtros} aoAplicar={aoMudar} aoMudarFavoritos={aoMudarFavoritos} />
        <Button variante="neutro" onClick={() => aoMudar({})} disabled={total === 0} className="h-10">
          Limpar
        </Button>
      </div>

      {expandido && (
        <div id={idPainel} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
          {responsaveis ? (
            <MultiSelecao
              rotulo="Responsável"
              opcoes={responsaveis.map((u) => ({ valor: u.id, rotulo: u.nome }))}
              valores={filtros.responsavelIds}
              aoMudar={(v) => mudar({ responsavelIds: v })}
            />
          ) : (
            usuario && (
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={soOsMeus}
                  onChange={(e) => mudar({ responsavelIds: e.target.checked ? [usuario.id] : undefined })}
                />
                Só os meus
              </label>
            )
          )}
          <MultiSelecao rotulo="UF" opcoes={UFS.map((uf) => ({ valor: uf, rotulo: uf }))} valores={filtros.ufs} aoMudar={(v) => mudar({ ufs: v })} />
          <label className="w-full sm:w-52">
            <span className="sr-only">Cidades (separe por vírgula)</span>
            <Input
              value={cidades}
              onChange={(e) => setCidades(e.target.value)}
              onBlur={aplicarCidades}
              onKeyDown={(e) => {
                if (e.key === 'Enter') aplicarCidades();
              }}
              placeholder="Cidades (separe por vírgula)"
              className="h-10"
            />
          </label>
          <MultiSelecao
            rotulo="Etapa"
            opcoes={etapas}
            valores={filtros.etapas}
            aoMudar={(v) => mudar({ etapas: v as ChaveEtapa[] | undefined })}
          />
          <MultiSelecao
            rotulo="Situação"
            opcoes={situacoes}
            valores={filtros.situacoes}
            aoMudar={(v) => mudar({ situacoes: v as Situacao[] | undefined })}
          />
          <MultiSelecao rotulo="Origem" opcoes={estrutura.origens} valores={filtros.origem} aoMudar={(v) => mudar({ origem: v })} />

          <Popover rotulo={filtros.desde || filtros.ate ? 'Período (1)' : 'Período'} ativo={!!(filtros.desde || filtros.ate)}>
            {() => (
              <div className="space-y-2 p-1">
                <Select
                  aria-label="Data considerada no período"
                  value={filtros.periodoCampo ?? 'criadoEm'}
                  onChange={(e) => mudar({ periodoCampo: e.target.value === 'estagioDesde' ? 'estagioDesde' : undefined })}
                >
                  <option value="criadoEm">Entrada na esteira</option>
                  <option value="estagioDesde">Última movimentação</option>
                </Select>
                <label className="block text-xs font-medium text-slate-600">
                  De
                  <Input type="date" value={filtros.desde ?? ''} max={filtros.ate} onChange={(e) => mudar({ desde: e.target.value || undefined })} />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Até
                  <Input type="date" value={filtros.ate ?? ''} min={filtros.desde} onChange={(e) => mudar({ ate: e.target.value || undefined })} />
                </label>
              </div>
            )}
          </Popover>

          <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
            Parado há mais de
            <input
              type="number"
              min={0}
              max={3650}
              inputMode="numeric"
              value={filtros.paradoHaMaisDe ?? ''}
              onChange={(e) => {
                const n = e.target.value === '' ? undefined : Math.max(0, Math.min(3650, Math.trunc(Number(e.target.value))));
                mudar({ paradoHaMaisDe: Number.isFinite(n) ? n : undefined });
              }}
              className="w-14 bg-transparent text-right tabular-nums outline-none"
              aria-label="Parado há mais de quantos dias"
            />
            dias
          </label>

          {estrutura.filtrosEspecificos.map((f) =>
            f.tipo === 'booleano' ? (
              <SelecaoBooleana
                key={f.chave}
                rotulo={f.rotulo}
                valor={especifico(f.chave) as boolean | undefined}
                aoMudar={(v) => mudarEspecifico(f.chave, v)}
              />
            ) : f.multiplo ? (
              <MultiSelecao
                key={f.chave}
                rotulo={f.rotulo}
                opcoes={f.opcoes ?? []}
                valores={especifico(f.chave) as string[] | undefined}
                aoMudar={(v) => mudarEspecifico(f.chave, v)}
              />
            ) : (
              <Select
                key={f.chave}
                aria-label={f.rotulo}
                value={(especifico(f.chave) as string | undefined) ?? ''}
                onChange={(e) => mudarEspecifico(f.chave, e.target.value || undefined)}
                className="h-10 w-auto"
              >
                <option value="">{f.rotulo}: todos</option>
                {(f.opcoes ?? []).map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {f.rotulo}: {o.rotulo}
                  </option>
                ))}
              </Select>
            ),
          )}
        </div>
      )}
    </div>
  );
}
