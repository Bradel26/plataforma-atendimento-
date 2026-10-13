import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Card, EmptyState, Input } from '../../components/ui';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { ApiError, api } from '../../lib/api';
import {
  AJUDA_STATUS_CICLO,
  LABEL_STATUS_CICLO,
  ORDEM_STATUS,
  dataBr,
  textoDeAtencao,
  type ItemCiclo,
  type ListaCiclos,
  type StatusCiclo,
} from './cicloParceiro';
import { PainelDoCiclo, SeloCiclo } from './PainelDoCiclo';

/**
 * Ciclo de Vida do Parceiro: onde cada parceiro credenciado esta na relacao com
 * a empresa. Independente do funil de credenciamento — o funil diz como o lead
 * virou parceiro; aqui e o que acontece depois.
 *
 * Nao mede producao: o CRM ainda nao tem venda por parceiro, e nenhum numero
 * desta tela e inferido de vendas.
 */
export function CicloParceiroTab() {
  const [dados, setDados] = useState<ListaCiclos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<StatusCiclo | null>(null);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.get<ListaCiclos>('/ciclo-parceiro'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o ciclo de vida dos parceiros');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return (dados?.itens ?? []).filter(
      (i) =>
        (!filtro || i.status === filtro) &&
        (!termo || i.contato.nome.toLocaleLowerCase('pt-BR').includes(termo)),
    );
  }, [dados, filtro, busca]);

  if (erro && !dados) return <Alerta>{erro}</Alerta>;
  if (!dados) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <SkeletonBloco className="h-24 w-full" />
        <SkeletonBloco className="h-64 w-full" />
      </div>
    );
  }

  const { resumo, atencao } = dados;

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}

      <Card titulo="Jornada do parceiro" descricao="Visão educativa do caminho típico. Os prazos são referências e não alteram os dados nem movimentam parceiros automaticamente.">
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[1120px] rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
              <span className="text-blue-700">1ª fase · Credenciamento TIM</span>
              <span className="text-emerald-700">2ª fase · Ativação e ciclo comercial</span>
            </div>
            <svg viewBox="0 0 1200 360" role="img" aria-label="Exemplo ilustrativo das fases de credenciamento e ciclo comercial do parceiro" className="h-[350px] w-full">
              <defs>
                <linearGradient id="jornadaCred" x1="0" x2="1"><stop stopColor="#93c5fd"/><stop offset="1" stopColor="#2563eb"/></linearGradient>
                <linearGradient id="jornadaComercial" x1="0" x2="1"><stop stopColor="#6ee7b7"/><stop offset="1" stopColor="#f59e0b"/></linearGradient>
              </defs>
              <path d="M35 290 C100 290 115 238 175 238 S260 205 310 205 S400 160 450 160 S540 110 590 110" fill="none" stroke="url(#jornadaCred)" strokeWidth="7" strokeLinecap="round"/>
              <path d="M630 110 C690 110 710 160 750 160 S820 115 870 115 S940 155 990 190 S1060 235 1100 235 S1150 195 1180 195" fill="none" stroke="url(#jornadaComercial)" strokeWidth="7" strokeLinecap="round"/>
              <path d="M610 82 V320" stroke="#94a3b8" strokeDasharray="6 7" strokeWidth="2"/>
              <text x="610" y="345" textAnchor="middle" fontSize="12" fill="#475569">Parceiro apto para vender</text>
              {[
                [45,290,'Em negociação'],[175,238,'Credenciamento em andamento'],[310,205,'Documentação'],[450,160,'Credenciamento OK'],[575,110,'Apto para venda'],
                [660,130,'Aguardando ativação operacional'],[790,150,'Primeiras vendas'],[900,115,'Parceiro ativo'],[1015,200,'Em risco · 30 dias sem vendas'],[1110,235,'Parceiro inativo'],[1170,195,'Oportunidade de reativação'],
              ].map(([x,y,label],index) => <g key={String(label)}>
                <circle cx={Number(x)} cy={Number(y)} r="8" fill={index < 5 ? '#2563eb' : index < 8 ? '#059669' : '#d97706'} stroke="white" strokeWidth="3"/>
                <text x={Number(x)} y={Number(y) + (index % 2 ? 29 : -17)} textAnchor="middle" fontSize="11" fontWeight="600" fill="#334155">
                  {String(label).split(' · ').map((line, lineIndex) => <tspan key={line} x={Number(x)} dy={lineIndex === 0 ? 0 : 14}>{line}</tspan>)}
                </text>
              </g>)}
              <text x="835" y="310" textAnchor="middle" fontSize="11" fill="#64748b">Ativação varia por operação; chip ou sistemas são exemplos</text>
              <text x="600" y="20" textAnchor="middle" fontSize="12" fontWeight="700" fill="#475569">Exemplo ilustrativo — sem dados reais</text>
            </svg>
            <p className="mt-1 text-xs text-slate-500">Diagrama estático e didático. Não representa parceiros, vendas ou status reais, nem alimenta indicadores. Risco e inatividade são estados de referência, não etapas obrigatórias.</p>
          </div>
        </div>
      </Card>

      <Card
        titulo="Ciclo de vida do parceiro"
        descricao="Como esta a relação com cada parceiro depois de credenciado. Não mede vendas: ainda não há produção por parceiro no CRM."
      >
        {resumo.total === 0 ? (
          <EmptyState
            titulo="Nenhum parceiro no ciclo ainda"
            descricao="O parceiro entra aqui, como Novo parceiro, quando o credenciamento chega ao estágio Ativo da esteira."
            acao={
              <Link to="/esteira" className="text-sm text-[var(--brand-primary)] hover:underline">
                Abrir esteira
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {ORDEM_STATUS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filtro === s}
                title={AJUDA_STATUS_CICLO[s]}
                onClick={() => setFiltro(filtro === s ? null : s)}
                className={`rounded-lg border p-3 text-left transition hover:bg-slate-50 ${
                  filtro === s ? 'border-[var(--brand-primary)] bg-slate-50' : 'border-slate-200'
                }`}
              >
                <p className="text-2xl font-semibold text-slate-800">{resumo.porStatus[s]}</p>
                <p className="mt-1">
                  <SeloCiclo status={s} />
                </p>
              </button>
            ))}
          </div>
        )}
      </Card>

      {resumo.total > 0 && (
        <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
          <div className="space-y-5">
            <Card
              titulo="Parceiros que precisam de ação"
              descricao={
                atencao.length === 0
                  ? 'Nenhum parceiro pede ação agora.'
                  : `${atencao.length} parceiro(s) — os mais urgentes primeiro`
              }
            >
              {atencao.length === 0 ? (
                <p className="text-sm text-slate-500">Tudo em dia: nenhum parceiro sem acompanhamento, em risco ou inativo.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {atencao.slice(0, 12).map((i) => (
                    <LinhaDeParceiro key={i.id} item={i} destaque aoAbrir={() => setAberto(i.credenciamentoId)} aberto={aberto === i.credenciamentoId} />
                  ))}
                </ul>
              )}
              {atencao.length > 12 && (
                <p className="mt-2 text-xs text-slate-500">Mostrando 12 de {atencao.length}. Use os filtros acima para ver o restante.</p>
              )}
            </Card>

            <Card
              titulo={filtro ? `Parceiros — ${LABEL_STATUS_CICLO[filtro]}` : 'Todos os parceiros'}
              descricao={`${visiveis.length} parceiro(s)`}
              acao={
                filtro ? (
                  <button type="button" className="text-sm text-[var(--brand-primary)] hover:underline" onClick={() => setFiltro(null)}>
                    Limpar filtro
                  </button>
                ) : undefined
              }
            >
              <div className="mb-3">
                <Input
                  placeholder="Buscar parceiro pelo nome"
                  aria-label="Buscar parceiro pelo nome"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              {visiveis.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum parceiro com esse filtro.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visiveis.map((i) => (
                    <LinhaDeParceiro key={i.id} item={i} aoAbrir={() => setAberto(i.credenciamentoId)} aberto={aberto === i.credenciamentoId} />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            {aberto ? (
              <PainelDoCiclo credenciamentoId={aberto} aoMudar={() => void carregar()} />
            ) : (
              <Card titulo="Ciclo de vida">
                <EmptyState
                  titulo="Selecione um parceiro"
                  descricao="Veja a implantação, o histórico e marque em risco, inativo ou reativado."
                />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaDeParceiro({
  item,
  aoAbrir,
  aberto,
  destaque = false,
}: {
  item: ItemCiclo;
  aoAbrir: () => void;
  aberto: boolean;
  destaque?: boolean;
}) {
  const alerta = destaque ? textoDeAtencao(item) : '';
  return (
    <li>
      <button
        type="button"
        onClick={aoAbrir}
        aria-current={aberto || undefined}
        className={`flex w-full items-start justify-between gap-3 px-1 py-2.5 text-left transition hover:bg-slate-50 ${aberto ? 'bg-slate-50' : ''}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">{item.contato.nome}</span>
          <span className="block truncate text-xs text-slate-500">
            {item.funil.nome} · parceiro desde {dataBr(item.credenciadoEm)} · {item.responsavel?.nome ?? 'sem responsável'}
          </span>
          {alerta && <span className="block text-xs text-amber-700">{alerta}</span>}
        </span>
        <span className="shrink-0">
          <SeloCiclo status={item.status} />
        </span>
      </button>
    </li>
  );
}

export type { StatusCiclo };
