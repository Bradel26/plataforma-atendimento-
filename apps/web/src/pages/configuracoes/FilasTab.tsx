import { useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { Canal, Fila } from '../../lib/types';

const CANAIS: Array<{ valor: Canal; label: string; disponivel: boolean }> = [
  { valor: 'WEBCHAT', label: 'Webchat', disponivel: true },
  { valor: 'WHATSAPP', label: 'WhatsApp (Fase 2)', disponivel: false },
  { valor: 'INSTAGRAM', label: 'Instagram (Fase 2)', disponivel: false },
  { valor: 'FACEBOOK', label: 'Facebook (Fase 2)', disponivel: false },
  { valor: 'EMAIL', label: 'E-mail (Fase 2)', disponivel: false },
  { valor: 'VOZ', label: 'Voz (Fase 4)', disponivel: false },
];

export function FilasTab() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [form, setForm] = useState({ nome: '', descricao: '', canalPadrao: 'WEBCHAT' as Canal });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    const { filas: lista } = await api.get<{ filas: Fila[] }>('/filas');
    setFilas(lista);
  };

  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar filas'));
  }, []);

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
      setForm({ nome: '', descricao: '', canalPadrao: 'WEBCHAT' });
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
              <li key={fila.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{fila.nome}</p>
                  <p className="truncate text-xs text-slate-500">{fila.descricao ?? 'Sem descricao'}</p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {fila.agentes.length === 0
                      ? 'Nenhum agente vinculado'
                      : `Agentes: ${fila.agentes.map((a) => a.nome).join(', ')}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tom="marca">{fila.canalPadrao}</Badge>
                  {fila.ativa ? <Badge tom="sucesso">Ativa</Badge> : <Badge>Inativa</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo="Nova fila">
        <form onSubmit={criar} className="space-y-4">
          <Field label="Nome">
            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Descricao">
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </Field>
          <Field label="Canal padrao" hint="Somente Webchat esta disponivel na Fase 1">
            <Select
              value={form.canalPadrao}
              onChange={(e) => setForm({ ...form, canalPadrao: e.target.value as Canal })}
            >
              {CANAIS.map((c) => (
                <option key={c.valor} value={c.valor} disabled={!c.disponivel}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Salvando...' : 'Criar fila'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
