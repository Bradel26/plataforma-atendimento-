import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alerta, Button, EmptyState } from '../../components/ui';
import { Dropdown } from '../../components/ui/Dropdown';
import { CabecalhoPagina, Segmentado } from '../../components/ui/Pagina';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../features/auth/AuthProvider';
import { ApiError, api, baixarArquivo } from '../../lib/api';
import type { EstruturaEsteira, FiltrosEsteira, Operacao, VinculoResumo } from '../../lib/esteiraTypes';
import { BarraDeFiltros } from './BarraDeFiltros';
import { ROTULO_OPERACAO } from './cadastroEsteira';
import { DetalheVinculo } from './DetalheVinculo';
import {
  CHAVE_ULTIMA_OPERACAO,
  estadoDaUrl,
  normalizarFiltros,
  operacaoDoParametro,
  operacaoInicial,
  operacoesPermitidas,
  parametroDaOperacao,
  queryDosFiltros,
  urlDoEstado,
  type FavoritoEsteira,
  type PropsDaVisao,
  type Visao,
} from './estadoEsteira';
import { diaDeHoje } from './funilEsteira';
import { FunilView } from './FunilView';
import { ImportarPlanilha } from './ImportarPlanilha';
import { KanbanView } from './KanbanView';
import { chavesParaExportar } from './listaEsteira';
import { ListaView } from './ListaView';
import { NovoParceiro } from './NovoParceiro';
import { carregarPreferenciasEsteira, lembrarUltimaOperacao, usePreferenciaEsteira } from './usePreferenciaEsteira';

const OPCOES_VISAO: ReadonlyArray<{ valor: Visao; rotulo: string }> = [
  { valor: 'kanban', rotulo: 'Kanban' },
  { valor: 'funil', rotulo: 'Funil' },
  { valor: 'lista', rotulo: 'Lista' },
];
const VISOES: Record<Visao, (p: PropsDaVisao) => JSX.Element> = { kanban: KanbanView, funil: FunilView, lista: ListaView };

/**
 * Esteira de parceiros por operação (spec 6): `/esteira/:operacao` com a visão
 * e os filtros na URL. Esta página é a casca — cabeçalho, filtros e
 * preferências; cada visão vive no próprio componente.
 *
 * `/esteira` sozinho vai para a última operação usada (preferência
 * `esteira:ultimaOperacao`) ou a primeira permitida; operação sem acesso cai
 * na primeira permitida.
 */
export function EsteiraPage() {
  const { operacoes } = useAuth();
  const { operacao: parametro } = useParams();
  const { search } = useLocation();
  const permitidas = operacoesPermitidas(operacoes);

  if (!permitidas.length) {
    return (
      <div className="flex flex-col gap-4">
        <CabecalhoPagina titulo="Esteira de parceiros" />
        <EmptyState
          titulo="Você não tem acesso a nenhuma operação"
          descricao="Peça a um administrador para liberar a TIM ou a Starlink no seu usuário."
        />
      </div>
    );
  }
  if (parametro === undefined) return <IrParaOperacaoInicial permitidas={permitidas} search={search} />;

  const operacao = operacaoDoParametro(parametro);
  if (!operacao || !permitidas.includes(operacao)) {
    return <Navigate to={`/esteira/${parametroDaOperacao(permitidas[0]!)}`} replace />;
  }
  // `key`: trocar de operação recomeça o estado (estrutura e preferência são outras).
  return <EsteiraDaOperacao key={operacao} operacao={operacao} permitidas={permitidas} />;
}

/** `/esteira` → `/esteira/<última usada ou primeira permitida>`, mantendo a query. */
function IrParaOperacaoInicial({ permitidas, search }: { permitidas: Operacao[]; search: string }) {
  const { usuario } = useAuth();
  const [destino, setDestino] = useState<Operacao | null>(null);
  const chavePermitidas = permitidas.join(',');

  useEffect(() => {
    let ativo = true;
    const lista = chavePermitidas.split(',') as Operacao[];
    carregarPreferenciasEsteira(usuario?.id ?? '')
      .then((v) => ativo && setDestino(operacaoInicial(lista, v[CHAVE_ULTIMA_OPERACAO])))
      .catch(() => ativo && setDestino(lista[0] ?? null));
    return () => {
      ativo = false;
    };
  }, [chavePermitidas, usuario?.id]);

  if (!destino) return <SkeletonBloco className="h-40" />;
  return <Navigate to={{ pathname: `/esteira/${parametroDaOperacao(destino)}`, search }} replace />;
}

function EsteiraDaOperacao({ operacao, permitidas }: { operacao: Operacao; permitidas: Operacao[] }) {
  const { usuario, temPerfil } = useAuth();
  const mostrar = useToast();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [estrutura, setEstrutura] = useState<EstruturaEsteira | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [dialogo, setDialogo] = useState<'novo' | 'importar' | null>(null);
  /** Cartão aberto pela casca (Novo parceiro: o criado ou o que já estava na esteira). */
  const [cartao, setCartao] = useState<VinculoResumo | null>(null);
  /** Muda depois de criar/importar/editar pela casca: remonta a visão, que recarrega os dados. */
  const [versao, setVersao] = useState(0);
  const [exportando, setExportando] = useState(false);
  const { pref, atualizar } = usePreferenciaEsteira(operacao, estrutura);

  useEffect(() => {
    let ativo = true;
    setErro(null);
    api
      .get<EstruturaEsteira>(`/esteiras/${parametroDaOperacao(operacao)}/estrutura`)
      .then((e) => ativo && setEstrutura(e))
      .catch((e) => ativo && setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a esteira'));
    return () => {
      ativo = false;
    };
  }, [operacao, tentativa]);

  useEffect(() => {
    if (usuario) lembrarUltimaOperacao(usuario.id, operacao);
  }, [usuario, operacao]);

  // Precedência: URL > preferência > padrão (cada parte por si).
  const daUrl = useMemo(() => estadoDaUrl(search), [search]);
  const visao: Visao = daUrl.visao ?? pref?.visao ?? 'kanban';
  const filtros: FiltrosEsteira = useMemo(() => daUrl.filtros ?? pref?.filtros ?? {}, [daUrl.filtros, pref?.filtros]);

  // Sem nada na URL: reflete a preferência nela, para o endereço poder ser compartilhado.
  useEffect(() => {
    if (pref && !search) navigate({ search: urlDoEstado(pref.visao, pref.filtros) }, { replace: true });
  }, [pref, search, navigate]);

  const mudarVisao = (nova: Visao) => {
    // Trocar de visão mantém os filtros (spec 6); entra no histórico do navegador.
    navigate({ search: urlDoEstado(nova, filtros) });
    atualizar({ visao: nova });
  };

  const mudarFiltros = useCallback(
    (novos: FiltrosEsteira) => {
      const limpos = normalizarFiltros(novos);
      navigate({ search: urlDoEstado(visao, limpos) }, { replace: true });
      atualizar({ filtros: limpos });
    },
    [navigate, visao, atualizar],
  );

  const irPara = useCallback(
    (nova: Visao, novos: FiltrosEsteira) => {
      const limpos = normalizarFiltros(novos);
      navigate({ search: urlDoEstado(nova, limpos) });
      atualizar({ visao: nova, filtros: limpos });
    },
    [navigate, atualizar],
  );

  const mudarFavoritos = useCallback((lista: FavoritoEsteira[]) => atualizar({ favoritos: lista }), [atualizar]);

  const ComponenteDaVisao = VISOES[visao];
  const recarregarVisao = useCallback(() => setVersao((v) => v + 1), []);
  const fecharDialogo = useCallback(() => setDialogo(null), []);
  const fecharCartao = useCallback(() => setCartao(null), []);

  const podeEditar = estrutura?.nivel === 'EDICAO';
  // Mesmos perfis da API: importar exige ADMIN/SUPERVISOR com EDICAO; exportar, ADMIN/SUPERVISOR.
  const podeImportar = podeEditar && temPerfil('ADMIN', 'SUPERVISOR');
  const podeExportar = temPerfil('ADMIN', 'SUPERVISOR');

  /** Exporta com os filtros em vigor e as colunas escolhidas na Lista (a Lista tem a própria, com a ordenação dela). */
  const exportar = async (formato: 'csv' | 'xlsx') => {
    if (!estrutura || !pref) return;
    const q = queryDosFiltros(filtros);
    q.set('formato', formato);
    q.set('colunas', chavesParaExportar(pref.lista.colunas, estrutura.colunas).join(','));
    setExportando(true);
    try {
      await baixarArquivo(
        `/esteiras/${parametroDaOperacao(operacao)}/exportar?${q.toString()}`,
        `esteira-${parametroDaOperacao(operacao)}-${diaDeHoje()}.${formato}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) mostrar('erro', 'Seu perfil não pode exportar');
      else mostrar('erro', e instanceof ApiError ? e.message : 'Não foi possível exportar');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina
        titulo="Esteira de parceiros"
        descricao={
          estrutura?.nivel === 'LEITURA'
            ? 'Você tem acesso somente leitura a esta operação.'
            : 'Credenciamento de parceiros por operação: cada uma com as próprias etapas e regras.'
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-slate-500">Operação:</span>
            <Segmentado
              rotulo="Operação"
              opcoes={permitidas.map((o) => ({ valor: o, rotulo: ROTULO_OPERACAO[o] }))}
              valor={operacao}
              aoMudar={(o) => o !== operacao && navigate(`/esteira/${parametroDaOperacao(o)}`)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-slate-500">Visualização:</span>
            <Segmentado rotulo="Visualização" opcoes={OPCOES_VISAO} valor={visao} aoMudar={mudarVisao} />
          </div>
          {estrutura && (
            <div className="flex flex-wrap items-center gap-2">
              {podeExportar && visao !== 'lista' && (
                <Dropdown
                  rotulo={exportando ? 'Exportando…' : 'Exportar'}
                  itens={[
                    { chave: 'csv', rotulo: 'CSV', aoSelecionar: () => void exportar('csv'), desabilitado: exportando },
                    { chave: 'xlsx', rotulo: 'XLSX (Excel)', aoSelecionar: () => void exportar('xlsx'), desabilitado: exportando },
                  ]}
                />
              )}
              {podeImportar && (
                <Button variante="neutro" onClick={() => setDialogo('importar')}>
                  Importar
                </Button>
              )}
              {podeEditar && <Button onClick={() => setDialogo('novo')}>Novo parceiro</Button>}
            </div>
          )}
        </div>
      </CabecalhoPagina>

      {erro ? (
        <Alerta>
          <span className="flex flex-wrap items-center justify-between gap-2">
            {erro}
            <Button variante="neutro" tamanho="sm" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </Button>
          </span>
        </Alerta>
      ) : !estrutura || !pref ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonBloco className="h-10" />
          <SkeletonBloco className="h-64" />
        </div>
      ) : (
        <>
          <BarraDeFiltros
            estrutura={estrutura}
            filtros={filtros}
            aoMudar={mudarFiltros}
            favoritos={pref.favoritos}
            aoMudarFavoritos={mudarFavoritos}
          />
          <ComponenteDaVisao
            key={versao}
            operacao={operacao}
            estrutura={estrutura}
            filtros={filtros}
            pref={pref}
            atualizarPref={atualizar}
            irPara={irPara}
          />
          <NovoParceiro
            aberto={dialogo === 'novo'}
            operacao={operacao}
            permitidas={permitidas}
            aoFechar={fecharDialogo}
            aoCriar={(v) => {
              setDialogo(null);
              recarregarVisao();
              setCartao(v);
            }}
            aoAbrirCartao={(v) => {
              setDialogo(null);
              setCartao(v);
            }}
          />
          {podeImportar && (
            <ImportarPlanilha
              aberto={dialogo === 'importar'}
              operacao={operacao}
              estrutura={estrutura}
              aoFechar={fecharDialogo}
              aoImportar={recarregarVisao}
            />
          )}
          <DetalheVinculo vinculo={cartao} operacao={operacao} estrutura={estrutura} aoFechar={fecharCartao} aoMudar={recarregarVisao} />
        </>
      )}
    </div>
  );
}
