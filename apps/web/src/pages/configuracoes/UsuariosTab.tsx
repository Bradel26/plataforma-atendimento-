import { useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { COR_STATUS, LABEL_PERFIL, LABEL_STATUS, type Perfil, type Usuario } from '../../lib/types';

const FORM_VAZIO = { nome: '', email: '', senha: '', perfil: 'AGENTE' as Perfil };

export function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    const { usuarios: lista } = await api.get<{ usuarios: Usuario[] }>('/usuarios');
    setUsuarios(lista);
  };

  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar usuarios'));
  }, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOk(null);
    setEnviando(true);
    try {
      await api.post('/usuarios', form);
      setForm(FORM_VAZIO);
      setOk('Usuario criado com sucesso.');
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao criar usuario');
    } finally {
      setEnviando(false);
    }
  };

  const alternarAtivo = async (usuario: Usuario) => {
    setErro(null);
    try {
      if (usuario.ativo) await api.del(`/usuarios/${usuario.id}`);
      else await api.patch(`/usuarios/${usuario.id}`, { ativo: true });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao atualizar usuario');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card titulo="Usuarios" descricao={`${usuarios.length} cadastrado(s)`}>
        {erro && <div className="mb-4"><Alerta>{erro}</Alerta></div>}
        {usuarios.length === 0 ? (
          <EmptyState titulo="Nenhum usuario" descricao="Cadastre o primeiro usuario no formulario ao lado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Perfil</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Situacao</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3">
                      <p className="font-medium text-slate-800">{u.nome}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3">
                      <Badge tom="marca">{LABEL_PERFIL[u.perfil]}</Badge>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2 text-slate-600">
                        <span className={`h-2 w-2 rounded-full ${COR_STATUS[u.status]}`} aria-hidden />
                        {LABEL_STATUS[u.status]}
                      </span>
                    </td>
                    <td className="py-3">
                      {u.ativo ? <Badge tom="sucesso">Ativo</Badge> : <Badge>Inativo</Badge>}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variante={u.ativo ? 'perigo' : 'neutro'}
                        onClick={() => void alternarAtivo(u)}
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo="Novo usuario" descricao="Apenas administradores">
        <form onSubmit={criar} className="space-y-4">
          {ok && <Alerta tipo="sucesso">{ok}</Alerta>}
          <Field label="Nome">
            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Senha" hint="Minimo de 8 caracteres">
            <Input
              type="password"
              required
              minLength={8}
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
          </Field>
          <Field label="Perfil">
            <Select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}>
              <option value="AGENTE">Agente</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMIN">Administrador</option>
            </Select>
          </Field>
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Salvando...' : 'Criar usuario'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
