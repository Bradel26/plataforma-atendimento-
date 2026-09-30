import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Card, EmptyState, Input, Select } from '../../components/ui';
import { SkeletonBloco } from '../../components/ui/Skeleton';
import { ApiError, api } from '../../lib/api';
import {
  AJUDA_STATUS_CICLO,
  LABEL_STATUS_CICLO,
  ORDEM_STATUS,
  type ItemCiclo,
  type ListaCiclos,
} from './cicloParceiro';
import { PainelDoCiclo, SeloCiclo } from './PainelDoCiclo';

/**
 * Jornadas: a etapa atual de cada parceiro na relacao com a empresa
 * (Novo parceiro -> Em implantacao -> Ativo -> ... -> Reativado).
 *
 * Jornada e relacionamento, nao resultado financeiro: nada aqui mostra valor,
 * faturamento, ticket ou previsao. Quando existirem dados financeiros, ficam em
 * um campo proprio (Produtividade/Financeiro), separado da jornada.
 */
export function JornadasTab() {
  const [dados, setDados] = useState<ListaCiclos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [funilId, setFunilId] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.get<ListaCiclos>('/ciclo-parceiro'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar as jornadas');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const operacoes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const i of dados?.itens ?? []) mapa.set(i.funil.id, i.funil.nome);
    return [...mapa.entries()];
  }, [dados]);

  const colunas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const itens = (dados?.itens ?? []).filter(
      (i) =>
        (!funilId || i.funil.id === funilId) &&
        (!termo || i.contato.nome.toLocaleLowerCase('pt-BR').includes(termo)),
    );
    return ORDEM_STATUS.map((status) => ({ status, itens: itens.filter((i) => i.status === status) }));
  }, [dados, funilId, busca]);

  const abrir = (id: string) => {
    setAberto(id);
    // O painel abre abaixo do quadro: sem rolar, o clique pareceria nao fazer nada.
    setTimeout(() => painelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (erro && !dados) return <Alerta>{erro}</Alerta>;
  if (!dados) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <SkeletonBloco className="h-20 w-full" />
        <SkeletonBloco className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}

      <Card
        titulo="Jornadas"
        descricao="Em que etapa da relacao com a empresa cada parceiro esta. Clique num parceiro para ver a implantacao e o historico."
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr]">
          <Select aria-label="Filtrar por operacao" value={funilId} onChange={(e) => setFunilId(e.target.value)}>
            <option value="">Todas as operacoes</option>
            {operacoes.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Buscar parceiro pelo nome"
            aria-label="Buscar parceiro pelo nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </Card>

      {dados.resumo.total === 0 ? (
        <Card>
          <EmptyState
            titulo="Nenhum parceiro em jornada ainda"
            descricao="O parceiro entra aqui, como Novo parceiro, quando o credenciamento chega ao estagio Ativo da esteira."
            acao={
              <Link to="/esteira" className="text-sm text-[var(--brand-primary)] hover:underline">
                Abrir esteira
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {colunas.map(({ status, itens }) => (
            <section
              key={status}
              aria-label={LABEL_STATUS_CICLO[status]}
              className="w-[260px] shrink-0 rounded-xl border border-slate-200 bg-white"
            >
              <header className="border-b border-slate-100 px-3 py-3" title={AJUDA_STATUS_CICLO[status]}>
                <div className="flex items-center justify-between gap-2">
                  <SeloCiclo status={status} />
                  <span className="text-sm font-semibold text-slate-700">{itens.length}</span>
                </div>
              </header>
              <ul className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
                {itens.length === 0 && <li className="px-1 py-3 text-center text-xs text-slate-400">Nenhum parceiro</li>}
                {itens.map((i) => (
                  <li key={i.id}>
                    <CartaoDaJornada item={i} ativo={aberto === i.credenciamentoId} aoAbrir={() => abrir(i.credenciamentoId)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div ref={painelRef}>
        {aberto && <PainelDoCiclo credenciamentoId={aberto} aoMudar={() => void carregar()} />}
      </div>
    </div>
  );
}

/** Cartao sem valor: nome, operacao, ha quanto tempo e quem cuida. */
function CartaoDaJornada({ item, ativo, aoAbrir }: { item: ItemCiclo; ativo: boolean; aoAbrir: () => void }) {
  const parado = item.status === 'SEM_ACOMPANHAMENTO' ? `${item.diasSemInteracao} dias sem acompanhamento` : null;
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-current={ativo || undefined}
      className={`w-full rounded-lg border p-2.5 text-left transition hover:bg-slate-50 ${
        ativo ? 'border-[var(--brand-primary)] bg-slate-50' : 'border-slate-200'
      }`}
    >
      <span className="block truncate text-sm font-medium text-slate-800">{item.contato.nome}</span>
      <span className="block truncate text-xs text-slate-500">{item.funil.nome}</span>
      <span className="mt-1 block text-xs text-slate-500">
        Parceiro ha {item.diasComoParceiro} dia{item.diasComoParceiro === 1 ? '' : 's'}
      </span>
      {item.status === 'EM_IMPLANTACAO' && (
        <span className="block text-xs text-slate-500">
          Implantacao: {item.etapasConcluidas.length} de {item.totalEtapas} etapas
        </span>
      )}
      {parado && <span className="block text-xs text-amber-700">{parado}</span>}
      <span className="mt-1 block truncate text-xs text-slate-400">{item.responsavel?.nome ?? 'sem responsavel'}</span>
    </button>
  );
}
