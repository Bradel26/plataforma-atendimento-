import { useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { WEBCHAT_ATIVO, semWebchat } from '../../lib/recursos';
import { useAuth } from '../../features/auth/AuthProvider';
import type { Canal, Fila, Usuario } from '../../lib/types';

const CANAIS: Array<{ valor: Canal; label: string; disponivel: boolean }> = semWebchat(
  [
    { valor: 'WEBCHAT', label: 'Webchat', disponivel: true },
    { valor: 'WHATSAPP', label: 'WhatsApp', disponivel: true },
    { valor: 'INSTAGRAM', label: 'Instagram', disponivel: false },
    { valor: 'FACEBOOK', label: 'Facebook', disponivel: false },
    { valor: 'EMAIL', label: 'E-mail', disponivel: false },
    { valor: 'VOZ', label: 'Voz', disponivel: false },
  ],
  (c) => c.valor,
);

const CANAL_PADRAO: Canal = WEBCHAT_ATIVO ? 'WEBCHAT' : 'WHATSAPP';

export function FilasTab() {
  const { temPerfil } = useAuth();
  const podeGerirMembros = temPerfil('ADMIN', 'SUPERVISOR');
  const podeCriarFila = temPerfil('ADMIN');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [selecionados, setSelecionados] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ nome: '', descricao: '', canalPadrao: CANAL_PADRAO });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [alterandoMembro, setAlterandoMembro] = useState<string | null>(null);

  const carregar = async () => {
    const { filas: lista } = await api.get<{ filas: Fila[] }>('/filas');
    setFilas(lista);
  };

  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar filas'));
    if (podeGerirMembros) {
      void api.get<{ usuarios: Usuario[] }>('/usuarios?ativo=true')
        .then(({ usuarios: lista }) => setUsuarios(lista.filter((u) => u.perfil !== 'ADMIN')))
        .catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar usuarios'));
    }
  }, []);

  const alterarMembro = async (fila: Fila, usuarioId: string, adicionar: boolean) => {
    setErro(null);
    setAlterandoMembro(`${fila.id}:${usuarioId}`);
    try {
      if (adicionar) await api.post(`/filas/${fila.id}/agentes`, { usuarioId });
      else await api.del(`/filas/${fila.id}/agentes/${usuarioId}`);
      await carregar();
      if (adicionar) setSelecionados((atual) => ({ ...atual, [fila.id]: '' }));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao atualizar os membros da fila');
    } finally {
      setAlterandoMembro(null);
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post('/filas', {
        nome: form.nome,
        canalPadrao: form.canalPadrao,
        ...(form.descricao ? { descricao: form.descricao } : {}),
      });
      setForm({ nome: '', descricao: '', canalPadrao: CANAL_PADRAO });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar fila');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card titulo="Filas de atendimento" descricao={`${filas.length} fila(s)`}>
        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}
        {filas.length === 0 ? (
          <EmptyState titulo="Nenhuma fila" descricao="Crie a primeira fila para distribuir os atendimentos." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filas.map((fila) => (
              <li key={fila.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{fila.nome}</p>
                    <p className="truncate text-xs text-slate-500">{fila.descricao ?? 'Sem descricao'}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tom="marca">{fila.canalPadrao}</Badge>
                    {fila.ativa ? <Badge tom="sucesso">Ativa</Badge> : <Badge>Inativa</Badge>}
                  </div>
                </div>
                <p className="mt-2 text-xs font-medium text-slate-600">Pessoas na fila</p>
                {fila.agentes.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Ninguem foi incluido ainda.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {fila.agentes.map((membro) => (
                      <li key={membro.id} className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs text-slate-700">
                        <span>{membro.nome}</span>
                        {podeGerirMembros && (
                          <Button type="button" variante="neutro" disabled={alterandoMembro === `${fila.id}:${membro.id}`} onClick={() => void alterarMembro(fila, membro.id, false)} className="!min-h-0 !px-2 !py-0.5">
                            Remover
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {podeGerirMembros && (
                  <div className="mt-3 flex gap-2">
                    <Select value={selecionados[fila.id] ?? ''} onChange={(e) => setSelecionados((atual) => ({ ...atual, [fila.id]: e.target.value }))}>
                      <option value="">Selecionar usuario para incluir...</option>
                      {usuarios.filter((u) => !fila.agentes.some((membro) => membro.id === u.id)).map((u) => (
                        <option key={u.id} value={u.id}>{u.nome} - {u.perfil}</option>
                      ))}
                    </Select>
                    <Button type="button" disabled={!selecionados[fila.id] || alterandoMembro === `${fila.id}:${selecionados[fila.id]}`} onClick={() => { const usuarioId = selecionados[fila.id]; if (usuarioId) void alterarMembro(fila, usuarioId, true); }}>
                      Incluir
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo="Nova fila" descricao={podeCriarFila ? undefined : 'Somente administradores podem criar filas.'}>
        {podeCriarFila ? (
          <form onSubmit={criar} className="space-y-4">
            <Field label="Nome">
              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Field>
            <Field label="Descricao">
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </Field>
            <Field label="Canal padrao" hint="Canal em que a fila recebe conversas">
              <Select value={form.canalPadrao} onChange={(e) => setForm({ ...form, canalPadrao: e.target.value as Canal })}>
                {CANAIS.map((c) => <option key={c.valor} value={c.valor} disabled={!c.disponivel}>{c.label}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={enviando} className="w-full">{enviando ? 'Salvando...' : 'Criar fila'}</Button>
          </form>
        ) : <p className="text-sm text-slate-500">Peca a um administrador para criar uma fila.</p>}
      </Card>
    </div>
  );
}
