import { useCallback, useEffect, useState } from 'react';
import { Alerta, Badge, Button, Card, Field, Input, Select } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { duracao } from '../lib/viz';
import { DIAS_SEMANA, type Escala, type Jornada, type Usuario } from '../lib/types';

const hoje = () => new Date().toISOString().slice(0, 10);
const seteDias = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Escalas semanais e horas efetivamente trabalhadas (log de presenca). */
export function EscalasPage() {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [agentes, setAgentes] = useState<Usuario[]>([]);
  const [jornada, setJornada] = useState<Jornada[]>([]);
  const [desde, setDesde] = useState(seteDias());
  const [ate, setAte] = useState(hoje());
  const [form, setForm] = useState({ agenteId: '', diaSemana: '1', inicio: '08:00', fim: '17:00' });
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [e, u] = await Promise.all([
        api.get<{ escalas: Escala[] }>('/escalas'),
        api.get<{ usuarios: Usuario[] }>('/usuarios'),
      ]);
      setEscalas(e.escalas);
      setAgentes(u.usuarios.filter((x) => x.ativo && x.perfil !== 'ADMIN'));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao carregar escalas');
    }
  }, []);

  const carregarJornada = useCallback(async () => {
    try {
      const { jornada: j } = await api.get<{ jornada: Jornada[] }>(
        `/escalas/jornada?desde=${desde}&ate=${ate}T23:59:59`,
      );
      setJornada(j);
    } catch {
      // Jornada e complementar: falha aqui nao deve esconder as escalas.
    }
  }, [desde, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void carregarJornada();
  }, [carregarJornada]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    try {
      await api.put('/escalas', {
        agenteId: form.agenteId,
        diaSemana: Number(form.diaSemana),
        inicio: form.inicio,
        fim: form.fim,
      });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao salvar a escala');
    }
  };

  const remover = async (id: string) => {
    try {
      await api.del(`/escalas/${id}`);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Falha ao remover');
    }
  };

  // Uma linha por agente, uma coluna por dia — a grade que o supervisor le.
  const porAgente = new Map<string, { nome: string; dias: Record<number, Escala> }>();
  for (const escala of escalas) {
    const atual = porAgente.get(escala.agenteId) ?? { nome: escala.agente.nome, dias: {} };
    atual.dias[escala.diaSemana] = escala;
    porAgente.set(escala.agenteId, atual);
  }

  return (
    <div className="space-y-5">
      {erro && <Alerta>{erro}</Alerta>}

      <Card titulo="Grade semanal" descricao={`${porAgente.size} agente(s) com escala definida`}>
        {porAgente.size === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma escala cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Agente</th>
                  {DIAS_SEMANA.map((d) => (
                    <th key={d} className="pb-2 pr-3 font-medium">{d.slice(0, 3)}</th>
                  ))}
                  <th className="pb-2 font-medium">Carga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...porAgente.entries()].map(([id, dados]) => {
                  const total = Object.values(dados.dias).reduce((acc, e) => acc + e.cargaMinutos, 0);
                  return (
                    <tr key={id}>
                      <td className="py-3 pr-4 font-medium text-slate-800">{dados.nome}</td>
                      {DIAS_SEMANA.map((_, dia) => {
                        const escala = dados.dias[dia];
                        return (
                          <td key={dia} className="py-3 pr-3">
                            {escala ? (
                              <button
                                type="button"
                                onClick={() => void remover(escala.id)}
                                title="Clique para remover este turno"
                                className="rounded bg-slate-100 px-1.5 py-1 text-xs tabular-nums text-slate-700 hover:bg-red-50 hover:text-red-700"
                              >
                                {escala.inicio}–{escala.fim}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-3 tabular-nums text-slate-600">{Math.round((total / 60) * 10) / 10}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={salvar} className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5 sm:items-end">
          <Field label="Agente">
            <Select required value={form.agenteId} onChange={(e) => setForm({ ...form, agenteId: e.target.value })}>
              <option value="">Selecione</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Dia">
            <Select value={form.diaSemana} onChange={(e) => setForm({ ...form, diaSemana: e.target.value })}>
              {DIAS_SEMANA.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field label="Inicio">
            <Input type="time" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
          </Field>
          <Field label="Fim">
            <Input type="time" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
          </Field>
          <Button type="submit" disabled={!form.agenteId}>Salvar turno</Button>
        </form>
      </Card>

      <Card titulo="Horas efetivas" descricao="Calculado pelo historico de presenca, nao pela escala">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="De">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Ate">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Field>
        </div>

        {jornada.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Sem registros de presenca no periodo. O historico comeca quando o agente entra na
            plataforma ou muda o status no cabecalho.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Agente</th>
                  <th className="pb-2 pr-4 font-medium">Disponivel</th>
                  <th className="pb-2 pr-4 font-medium">Em atendimento</th>
                  <th className="pb-2 pr-4 font-medium">Pausa</th>
                  <th className="pb-2 font-medium">Jornada produtiva</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jornada.map((j) => (
                  <tr key={j.id}>
                    <td className="py-2.5 pr-4 text-slate-800">{j.nome}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-600">{duracao(j.disponivel)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-600">{duracao(j.emAtendimento)}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-600">{duracao(j.pausa)}</td>
                    <td className="py-2.5">
                      <Badge tom="marca">{duracao(j.trabalhado)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
