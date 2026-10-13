import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { ApiError, api } from '../../lib/api';

type Solicitacao = { id: string; motivo: string; status: string; solicitadoEm: string; solicitadoPor: { nome: string }; aprovadoPor: { nome: string } | null; contato: { id: string; nome: string; telefone: string | null } };
export function SolicitacoesExclusaoContatos() {
  const { temPerfil } = useAuth();
  const podeAprovar = temPerfil('ADMIN', 'SUPERVISOR');
  const [items, setItems] = useState<Solicitacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    if (!podeAprovar) return;
    try { setItems((await api.get<{ solicitacoes: Solicitacao[] }>('/contatos/solicitacoes-exclusao')).solicitacoes); setErro(null); }
    catch (e) { setErro(e instanceof ApiError ? e.message : 'Falha ao carregar solicitações'); }
  }, [podeAprovar]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (!podeAprovar || (!erro && items.length === 0)) return null;
  const decidir = async (item: Solicitacao, aprovar: boolean) => {
    const justificativa = window.prompt(aprovar ? 'Motivo da aprovação:' : 'Motivo da rejeição:');
    if (!justificativa?.trim()) return;
    try { await api.post(`/contatos/${item.id}/exclusao/${aprovar ? 'aprovar' : 'rejeitar'}`, { justificativa }); await carregar(); }
    catch (e) { setErro(e instanceof ApiError ? e.message : 'Falha ao registrar a decisão'); }
  };
  return <Card titulo="Aprovação de remoção de contatos" descricao="A pessoa que pediu a remoção não pode aprová-la.">
    {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}
    <ul className="divide-y divide-slate-100">{items.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div><div className="flex items-center gap-2"><strong className="text-sm">{x.contato.nome}</strong><Badge tom={x.status === 'PENDENTE' ? 'alerta' : x.status === 'APROVADA' ? 'sucesso' : 'neutro'}>{x.status}</Badge></div><p className="text-xs text-slate-600">Pedido de {x.solicitadoPor.nome}: {x.motivo}</p></div>
      {x.status === 'PENDENTE' && <div className="flex gap-2"><Button variante="neutro" onClick={() => void decidir(x, false)}>Rejeitar</Button><Button variante="perigo" onClick={() => void decidir(x, true)}>Aprovar remoção</Button></div>}
    </li>)}</ul>
  </Card>;
}
