import { useEffect, useState } from 'react';
import { Alerta, Button, Card, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../features/auth/AuthProvider';

type MensagemRapida = { id: string; titulo: string; atalho: string | null; conteudo: string; categoria: string; ativo: boolean };
const vazio = { titulo: '', atalho: '', conteudo: '', categoria: 'Geral', ativo: true };

export function MensagensRapidasTab() {
  const { temPerfil } = useAuth();
  const podeGerir = temPerfil('ADMIN', 'SUPERVISOR');
  const [itens, setItens] = useState<MensagemRapida[]>([]);
  const [form, setForm] = useState(vazio);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const carregar = async () => {
    try { setItens((await api.get<{ mensagens: MensagemRapida[] }>('/mensagens-rapidas')).mensagens); }
    catch (e) { setErro(e instanceof ApiError ? e.message : 'Falha ao carregar mensagens rápidas'); }
  };
  useEffect(() => { void carregar(); }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault(); setErro(null); setOk(null);
    try {
      const dados = { ...form, atalho: form.atalho.trim() || null };
      if (editando) await api.put(`/mensagens-rapidas/${editando}`, dados);
      else await api.post('/mensagens-rapidas', dados);
      setForm(vazio); setEditando(null); setOk('Mensagem rápida salva.'); await carregar();
    } catch (err) { setErro(err instanceof ApiError ? err.message : 'Falha ao salvar'); }
  };

  const editar = (item: MensagemRapida) => {
    setEditando(item.id); setForm({ titulo: item.titulo, atalho: item.atalho ?? '', conteudo: item.conteudo, categoria: item.categoria, ativo: true });
  };
  const duplicar = async (item: MensagemRapida) => {
    setErro(null); setOk(null);
    try {
      await api.post('/mensagens-rapidas', {
        titulo: `${item.titulo} (cópia)`.slice(0, 80), atalho: null,
        conteudo: item.conteudo, categoria: item.categoria, ativo: true,
      });
      setOk('Cópia criada para toda a equipe.');
      await carregar();
    } catch (err) { setErro(err instanceof ApiError ? err.message : 'Falha ao duplicar'); }
  };
  const desativar = async (item: MensagemRapida) => {
    if (!window.confirm(`Desativar “${item.titulo}”? Ela deixará de aparecer para toda a equipe.`)) return;
    try { await api.patch(`/mensagens-rapidas/${item.id}/desativar`, {}); await carregar(); }
    catch (err) { setErro(err instanceof ApiError ? err.message : 'Falha ao desativar'); }
  };

  return <div className="w-full min-w-0 max-w-5xl space-y-4">
    {erro && <Alerta>{erro}</Alerta>}{ok && <p className="text-sm text-emerald-700">{ok}</p>}
    {podeGerir && <Card titulo={editando ? 'Editar mensagem rápida' : 'Nova mensagem rápida'} descricao="Compartilhada com todos os usuários da organização.">
      <form onSubmit={salvar} className="grid w-full min-w-0 gap-3 md:grid-cols-2">
        <label className="min-w-0 space-y-1 text-sm">Título<Input className="min-w-0" required maxLength={80} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} /></label>
        <label className="min-w-0 space-y-1 text-sm">Categoria<Input className="min-w-0" required maxLength={40} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} /></label>
        <label className="min-w-0 space-y-1 text-sm">Atalho (opcional)<Input className="min-w-0" maxLength={30} placeholder="saudacao" value={form.atalho} onChange={e => setForm({ ...form, atalho: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} /></label>
        <label className="min-w-0 space-y-1 text-sm md:col-span-2">Texto<textarea required maxLength={2000} rows={4} value={form.conteudo} onChange={e => setForm({ ...form, conteudo: e.target.value })} className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><span className="block text-xs text-slate-500">Variáveis disponíveis: {'{{nome_contato}}'}, {'{{atendente}}'} e {'{{protocolo}}'}.</span></label>
        <div className="flex gap-2 md:col-span-2"><Button type="submit">{editando ? 'Salvar alterações' : 'Criar mensagem'}</Button>{editando && <Button type="button" variante="neutro" onClick={() => { setEditando(null); setForm(vazio); }}>Cancelar</Button>}</div>
      </form>
    </Card>}
    <Card titulo="Mensagens disponíveis" descricao="As mensagens são inseridas no campo para revisão antes do envio.">
      {itens.length === 0 ? <p className="text-sm text-slate-500">Nenhuma mensagem rápida cadastrada.</p> : <div className="divide-y divide-slate-100">
        {itens.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.titulo}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.categoria}</span>{item.atalho && <code className="text-xs text-slate-500">/{item.atalho}</code>}</div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.conteudo}</p></div>
          {podeGerir && <div className="flex gap-2"><Button tamanho="sm" variante="neutro" onClick={() => editar(item)}>Editar</Button><Button tamanho="sm" variante="neutro" onClick={() => void duplicar(item)}>Duplicar</Button><Button tamanho="sm" variante="perigo" onClick={() => void desativar(item)}>Desativar</Button></div>}
        </div>)}
      </div>}
    </Card>
  </div>;
}
