import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  moeda,
  type ColunaFunil,
  type Conta,
  type Funil,
  type MotivoPerda,
  type Oportunidade,
} from '../../lib/types';
import { FichaOportunidade } from './ficha/FichaOportunidade';

const MOTIVOS: MotivoPerda[] = ['PRECO', 'SEM_INTERESSE', 'CONCORRENTE', 'SEM_BUDGET', 'SEM_RESPOSTA', 'OUTRO'];

type Kanban = { funil: { id: string; nome: string }; colunas: ColunaFunil[] };

type Props = {
  /** Registro aberto, vindo da URL (`/oportunidades/:id`). Nulo em `/crm`. */
  selecionadoId: string | null;
  aoAbrir: (id: string) => void;
  aoFechar: () => void;
};

export function OportunidadesTab({ selecionadoId, aoAbrir, aoFechar }: Props) {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [funilId, setFunilId] = useState('');
  const [kanban, setKanban] = useState<Kanban | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState({ titulo: '', contaId: '', valor: '' });

  const carregar = useCallback(async () => {
    try {
      const qs = funilId ? `?funilId=${funilId}` : '';
      setKanban(await api.get<Kanban>(`/oportunidades/kanban${qs}`));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o funil');
    }
  }, [funilId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void Promise.all([api.get<{ funis: Funil[] }>('/funis'), api.get<{ contas: Conta[] }>('/contas')])
      .then(([f, c]) => {
        setFunis(f.funis);
        setContas(c.contas);
      })
      .catch(() => undefined);
  }, []);

  const mover = async (estagioId: string) => {
    const id = arrastando;
    setArrastando(null);
    if (!id) return;
    try {
      await api.patch(`/oportunidades/${id}`, { estagioId });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover a oportunidade');
    }
  };

  const fechar = async (id: string, status: 'GANHA' | 'PERDIDA') => {
    try {
      if (status === 'PERDIDA') {
        const motivo = window.prompt(`Motivo da perda (${MOTIVOS.join(', ')})`, 'CONCORRENTE');
        if (!motivo) return;
        await api.post(`/oportunidades/${id}/fechar`, { status, motivoPerda: motivo });
      } else {
        await api.post(`/oportunidades/${id}/fechar`, { status });
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao fechar a oportunidade');
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/oportunidades', {
        titulo: nova.titulo,
        contaId: nova.contaId,
        ...(funilId ? { funilId } : {}),
        ...(nova.valor ? { valor: Number(nova.valor) } : {}),
      });
      setNova({ titulo: '', contaId: '', valor: '' });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar oportunidade');
    }
  };

  const previsao = kanban?.colunas.reduce((acc, c) => acc + c.valorPonderado, 0) ?? 0;
  const emAberto = kanban?.colunas.reduce((acc, c) => acc + c.valorTotal, 0) ?? 0;

  /*
   * Com registro na URL, o painel substitui o kanban em vez de dividir a tela.
   *
   * O kanban tem largura propria — rola na horizontal e cada coluna tem 288px —
   * e apertar um painel de detalhe ao lado dele deixaria os dois ruins. Quem
   * abriu uma oportunidade especifica quer ela, nao o quadro inteiro.
   */
  if (selecionadoId) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={aoFechar}
          className="text-xs text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline"
        >
          &larr; Todo o funil
        </button>
        <FichaOportunidade key={selecionadoId} oportunidadeId={selecionadoId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card titulo="Funil" descricao={kanban ? kanban.funil.nome : 'Carregando...'}>
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Funil">
            <Select value={funilId} onChange={(e) => setFunilId(e.target.value)}>
              <option value="">Padrao (primeiro ativo)</option>
              {funis.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Em aberto</p>
            <p className="text-sm font-semibold text-slate-800">{moeda(emAberto)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Previsao ponderada</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--brand-accent)' }}>{moeda(previsao)}</p>
          </div>
        </div>
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {kanban?.colunas.map((coluna) => (
          <div
            key={coluna.estagio.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void mover(coluna.estagio.id)}
            className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50"
          >
            <header className="border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">{coluna.estagio.nome}</p>
                <Badge tom="neutro">{coluna.estagio.probabilidade}%</Badge>
              </div>
              <p className="text-xs text-slate-500">
                {coluna.total} op · {moeda(coluna.valorTotal)}
              </p>
            </header>
            <ul className="min-h-24 flex-1 space-y-2 p-2">
              {coluna.oportunidades.map((o: Oportunidade) => (
                <li
                  key={o.id}
                  draggable
                  onDragStart={() => setArrastando(o.id)}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing"
                >
                  {/* Titulo como botao, e nao o cartao inteiro: o cartao e
                      arrastavel, e clique em area de arraste erra com facilidade
                      — abrir a oportunidade por acidente ao mover o cartao
                      seria pior do que precisar acertar o texto. */}
                  <button
                    type="button"
                    onClick={() => aoAbrir(o.id)}
                    className="block w-full truncate text-left text-sm font-medium text-slate-800 underline-offset-2 hover:underline"
                  >
                    {o.titulo}
                  </button>
                  <p className="truncate text-xs text-slate-500">{o.conta.nome}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{moeda(o.valor)}</p>
                  {o.itens.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {o.itens.length} item(ns) · {moeda(o.totalItens)}
                    </p>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void fechar(o.id, 'GANHA')}
                      className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                    >
                      Ganhou
                    </button>
                    <button
                      type="button"
                      onClick={() => void fechar(o.id, 'PERDIDA')}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Perdeu
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Card titulo="Nova oportunidade" descricao="Arraste os cartoes entre os estagios do funil">
        <form onSubmit={criar} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Titulo">
            <Input required value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} />
          </Field>
          <Field label="Conta">
            <Select required value={nova.contaId} onChange={(e) => setNova({ ...nova, contaId: e.target.value })}>
              <option value="">Selecione</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Valor" hint="Sem itens, informe o valor">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={nova.valor}
              onChange={(e) => setNova({ ...nova, valor: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={!nova.titulo || !nova.contaId}>Criar</Button>
        </form>
      </Card>
    </div>
  );
}
