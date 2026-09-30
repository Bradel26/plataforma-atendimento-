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
