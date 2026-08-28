import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alerta, Badge, Card, EmptyState } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { LABEL_MOTIVO_PERDA, moeda, type Oportunidade } from '../../../lib/types';

/**
 * A oportunidade vista de perto.
 *
 * Antes ela so existia como cartao no kanban, o que basta para arrastar e nao
 * basta para conversar sobre ela: "manda o link da proposta da Acme" nao tinha
 * resposta. Este painel e o destino de `/oportunidades/:id`.
 *
 * Nao ha rota nova na API: `GET /oportunidades/:id` ja devolvia tudo o que esta
 * aqui, inclusive os dias no estagio, que a API calcula para nao depender do
 * relogio do navegador.
 */

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const TOM_STATUS = { ABERTA: 'marca', GANHA: 'sucesso', PERDIDA: 'alerta' } as const;

export function FichaOportunidade({ oportunidadeId }: { oportunidadeId: string }) {
  const [oportunidade, setOportunidade] = useState<Oportunidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    setNaoEncontrada(false);
    try {
      const { oportunidade: o } = await api.get<{ oportunidade: Oportunidade }>(
        `/oportunidades/${oportunidadeId}`,
      );
      setOportunidade(o);
    } catch (e) {
      // 404 e o que a API responde tanto para id inexistente quanto para
      // oportunidade de outra organizacao — de proposito, para nao revelar que
      // o registro existe. As duas causas mostram a mesma tela.
      if (e instanceof ApiError && e.status === 404) {
        setNaoEncontrada(true);
        return;
      }
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a oportunidade');
    }
  }, [oportunidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (naoEncontrada) {
    return (
      <Card titulo="Oportunidade">
        <EmptyState
          titulo="Oportunidade nao encontrada"
          descricao="O endereco aponta para um registro que nao existe ou que voce nao pode ver."
        />
      </Card>
    );
  }
  if (erro) return <Alerta>{erro}</Alerta>;
  if (!oportunidade) {
    return (
      <Card titulo="Oportunidade">
        <p className="text-sm text-slate-500">Carregando oportunidade...</p>
      </Card>
    );
  }

  const o = oportunidade;

  return (
    <div className="space-y-5">
      <Card
        titulo={o.titulo}
        descricao={`${o.funil.nome} · ${o.estagio.nome}`}
        acao={<Badge tom={TOM_STATUS[o.status]}>{o.status}</Badge>}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Valor</dt>
            <dd className="font-semibold text-slate-800">{moeda(o.valor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cliente</dt>
            <dd>
              {/* O caminho de ida existe agora que o cliente tem endereco: da
                  oportunidade para a ficha da empresa sem passar pela lista. */}
              <Link
                to={`/clientes/${o.conta.id}`}
                className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                {o.conta.nome}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Responsavel</dt>
            <dd className="text-slate-800">{o.responsavel?.nome ?? 'Sem responsavel'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Previsao de fechamento</dt>
            <dd className="text-slate-800">{data(o.previsaoFechamento)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Aberta em</dt>
            <dd className="text-slate-800">
              {data(o.criadoEm)}
              {typeof o.diasAberta === 'number' && (
                <span className="text-xs text-slate-500"> · {o.diasAberta} dia(s)</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Nesta etapa</dt>
            <dd className="text-slate-800">
              {typeof o.diasNoEstagio === 'number' ? `${o.diasNoEstagio} dia(s)` : '—'}
              <span className="text-xs text-slate-500"> · {o.estagio.probabilidade}% de chance</span>
            </dd>
          </div>
          {o.status === 'PERDIDA' && (
            <div>
              <dt className="text-xs text-slate-500">Motivo da perda</dt>
              <dd className="text-slate-800">
                {o.motivoPerda ? LABEL_MOTIVO_PERDA[o.motivoPerda] : 'Nao informado'}
              </dd>
            </div>
          )}
          {o.fechadoEm && (
            <div>
              <dt className="text-xs text-slate-500">Fechada em</dt>
              <dd className="text-slate-800">{data(o.fechadoEm)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card
        titulo="Itens"
        descricao={o.itens.length > 0 ? `${o.itens.length} item(ns) · ${moeda(o.totalItens)}` : undefined}
      >
        {o.itens.length === 0 ? (
          <EmptyState
            titulo="Sem itens"
            descricao="O valor desta oportunidade foi informado direto, sem produtos do catalogo."
          />
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Produtos desta oportunidade</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th scope="col" className="pb-2">Produto</th>
                <th scope="col" className="pb-2 text-right">Qtd.</th>
                <th scope="col" className="pb-2 text-right">Preco</th>
                <th scope="col" className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {o.itens.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-slate-800">
                    {item.produto.nome}
                    <span className="block text-xs text-slate-400">{item.produto.sku}</span>
                  </td>
                  {/* tabular-nums: coluna de numero que nao dança conforme o digito. */}
                  <td className="py-2 text-right tabular-nums text-slate-700">{item.quantidade}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{moeda(item.precoUnitario)}</td>
                  <td className="py-2 text-right font-medium tabular-nums text-slate-800">{moeda(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
