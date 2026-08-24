import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { moeda, type Catalogo, type Produto } from '../../lib/types';

/** Produtos e catalogo de precos (Fase 2). O preco alimenta os itens da oportunidade. */
export function ProdutosTab() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogo[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState({ nome: '', sku: '' });
  const [preco, setPreco] = useState({ catalogoId: '', produtoId: '', preco: '' });

  const carregar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api.get<{ produtos: Produto[] }>(`/produtos${busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : ''}`),
        api.get<{ catalogos: Catalogo[] }>('/catalogos'),
      ]);
      setProdutos(p.produtos);
      setCatalogos(c.catalogos);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o catalogo');
    }
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const criarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/produtos', novo);
      setNovo({ nome: '', sku: '' });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar produto');
    }
  };

  const definirPreco = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/catalogos/${preco.catalogoId}/precos`, {
        produtoId: preco.produtoId,
        preco: Number(preco.preco),
      });
      setPreco({ ...preco, produtoId: '', preco: '' });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao definir o preco');
    }
  };

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}

      <Card titulo="Produtos" descricao={`${produtos.length} cadastrado(s)`}>
        <Input placeholder="Buscar por nome ou SKU" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="mt-3">
          {produtos.length === 0 ? (
            <EmptyState titulo="Nenhum produto" descricao="Cadastre um produto no formulario abaixo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="pb-2 font-medium">SKU</th>
                    <th className="pb-2 font-medium">Produto</th>
                    <th className="pb-2 font-medium">Precos</th>
                    <th className="pb-2 font-medium">Situacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {produtos.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 font-mono text-xs text-slate-600">{p.sku}</td>
                      <td className="py-2.5 text-slate-800">{p.nome}</td>
                      <td className="py-2.5">
                        {p.precos.length === 0 ? (
                          <span className="text-xs text-amber-600">sem preco</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {p.precos.map((x) => (
                              <Badge key={x.catalogo.id} tom="neutro">
                                {x.catalogo.nome}: {moeda(x.preco, x.catalogo.moeda)}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {p.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge>Inativo</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card titulo="Novo produto">
          <form onSubmit={criarProduto} className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Field label="Nome">
              <Input required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            </Field>
            <Field label="SKU" hint="Convertido para maiusculas">
              <Input required value={novo.sku} onChange={(e) => setNovo({ ...novo, sku: e.target.value })} />
            </Field>
            <Button type="submit" className="sm:col-span-2">Cadastrar produto</Button>
          </form>
        </Card>

        <Card titulo="Preco no catalogo" descricao={`${catalogos.length} catalogo(s)`}>
          <form onSubmit={definirPreco} className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Field label="Catalogo">
              <Select
                required
                value={preco.catalogoId}
                onChange={(e) => setPreco({ ...preco, catalogoId: e.target.value })}
              >
                <option value="">Selecione</option>
                {catalogos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.moeda})</option>
                ))}
              </Select>
            </Field>
            <Field label="Produto">
              <Select
                required
                value={preco.produtoId}
                onChange={(e) => setPreco({ ...preco, produtoId: e.target.value })}
              >
                <option value="">Selecione</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} - {p.nome}</option>
                ))}
              </Select>
            </Field>
            <Field label="Preco">
              <Input
                required
                type="number"
                min={0}
                step="0.01"
                value={preco.preco}
                onChange={(e) => setPreco({ ...preco, preco: e.target.value })}
              />
            </Field>
            <Button type="submit">Definir preco</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
