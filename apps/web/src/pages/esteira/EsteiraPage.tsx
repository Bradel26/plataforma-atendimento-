import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  LABEL_SITUACAO_EXCECAO,
  type ColunaCredenciamento,
  type Contato,
  type Credenciamento,
  type Funil,
  type SituacaoExcecao,
} from '../../lib/types';

type Kanban = { funil: { id: string; nome: string }; colunas: ColunaCredenciamento[] };

function CartaoCredenciamento({
  c,
  colunas,
  aoArrastar,
  aoMover,
  aoMarcarExcecao,
}: {
  c: Credenciamento;
  colunas: ColunaCredenciamento[];
  aoArrastar: (id: string) => void;
  aoMover: (id: string, estagioId: string) => void;
  aoMarcarExcecao: (id: string) => void;
}) {
  return (
    <li
      draggable
      onDragStart={() => aoArrastar(c.id)}
      className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
    >
      <p className="truncate text-sm font-medium text-slate-800">{c.contato.nome}</p>
      {c.conta && <p className="truncate text-xs text-slate-500">{c.conta.nome}</p>}

      {colunas.length > 1 && (
        <Select
          aria-label={`Mover ${c.contato.nome} para outro estagio`}
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

      {c.situacaoExcecao ? (
        <p className="mt-1.5">
          <span title={c.motivoExcecao ?? undefined}>
            <Badge tom="erro">{LABEL_SITUACAO_EXCECAO[c.situacaoExcecao]}</Badge>
          </span>
        </p>
      ) : (
        <button
          type="button"
          onClick={() => aoMarcarExcecao(c.id)}
          className="mt-1.5 text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700"
        >
          Marcar excecao
        </button>
      )}

      <p className="mt-1.5 text-xs text-slate-500">{c.diasNoEstagio}d nesta etapa</p>

      {c.responsavel && (
        <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
          <span
            title={c.responsavel.nome}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600"
          >
            {c.responsavel.nome.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </li>
  );
}

export function EsteiraPage() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [kanban, setKanban] = useState<Kanban | null>(null);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState({ contatoId: '' });
  const [pedidoExcecao, setPedidoExcecao] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [situacao, setSituacao] = useState<SituacaoExcecao>('CANCELADO');

  const carregarFunis = useCallback(async () => {
    const f = await api.get<{ funis: Funil[] }>('/funis?tipo=ESTEIRA');
    setFunis(f.funis);
  }, []);

  const carregar = useCallback(async () => {
    try {
      setKanban(await api.get<Kanban>('/credenciamentos/kanban'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar a esteira');
    }
  }, []);

  useEffect(() => {
    void carregarFunis();
    void carregar();
  }, [carregarFunis, carregar]);

  useEffect(() => {
    void api
      .get<{ contatos: Contato[] }>('/contatos')
      .then((r) => setContatos(r.contatos))
      .catch(() => undefined);
  }, []);

  const moverPara = async (id: string, estagioId: string) => {
    try {
      await api.patch(`/credenciamentos/${id}`, { estagioId });
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao mover o credenciamento');
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
      setErro(e instanceof ApiError ? e.message : 'Falha ao marcar excecao');
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/credenciamentos', { contatoId: novo.contatoId });
      setNovo({ contatoId: '' });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar credenciamento');
    }
  };

  if (funis.length === 0) {
    return (
      <Card titulo="Esteira de Credenciamento" descricao="Nenhum funil configurado ainda">
        <p className="text-sm text-slate-500">
          Peca a um administrador para configurar o funil de Esteira em Configuracoes antes de usar esta tela.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card titulo="Esteira de Credenciamento" descricao={kanban ? kanban.funil.nome : 'Carregando...'}>
        {null}
      </Card>

      {erro && <Alerta>{erro}</Alerta>}

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
              <p className="text-xs text-slate-500">{coluna.total} credenciamento(s)</p>
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
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Card titulo="Novo credenciamento" descricao="Arraste os cartoes entre os estagios">
        <form onSubmit={criar} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Contato (parceiro)">
            <Select required value={novo.contatoId} onChange={(e) => setNovo({ contatoId: e.target.value })}>
              <option value="">Selecione</option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={!novo.contatoId}>Criar</Button>
        </form>
      </Card>

      {pedidoExcecao && (
        <Card titulo="Marcar excecao" descricao="O card continua no estagio atual, marcado com a situacao">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <Field label="Situacao">
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
              <Button type="button" onClick={() => void confirmarExcecao()} disabled={!motivo.trim()}>Confirmar</Button>
              <Button type="button" variante="neutro" onClick={() => { setPedidoExcecao(null); setMotivo(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
